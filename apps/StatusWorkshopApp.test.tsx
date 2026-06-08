// @vitest-environment jsdom

import React,{ useState } from 'react';
import { fireEvent,render,screen } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { useOS } from '../context/OSContext';
import type { CustomStatusTemplate } from '../types/statusCard';
import StatusWorkshopApp,{
    buildCssPolishPrompt,
    buildFieldsPrompt,
    buildHtmlPrompt,
    buildJsPrompt,
    buildProtocolPrompt,
    buildStatusContract,
    buildStatusSample,
    buildStatusWorkshopExportPayload,
    buildSystemPromptPrompt,
    extractTemplatePlaceholders,
    parseStatusWorkshopImportPayload,
    shouldClearLegacyExtractRegexForHtml,
    StatusWorkshopGeneratorFieldList,
    validateStatusTemplateExtraction,
} from './StatusWorkshopApp';

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

const mockedUseOS = vi.mocked(useOS);

const FieldListHarness: React.FC = () => {
    const [fields, setFields] = useState([
        { id: 'field-1', name: '时间', desc: '当前时间 HH:MM' },
    ]);

    return <StatusWorkshopGeneratorFieldList fields={fields} setFields={setFields} />;
};

describe('StatusWorkshopGeneratorFieldList', () => {
    it('keeps generator field inputs mounted while typing and avoids password mode', () => {
        render(<FieldListHarness />);

        const fieldNameInput = screen.getByPlaceholderText('字段名') as HTMLInputElement;
        expect(fieldNameInput).toHaveAttribute('type', 'text');
        expect(fieldNameInput).toHaveAttribute('autocomplete', 'new-password');
        expect(fieldNameInput).toHaveAttribute('inputmode', 'text');
        expect(fieldNameInput).toHaveAttribute('data-lpignore', 'true');
        expect(fieldNameInput).toHaveAttribute('aria-autocomplete', 'none');
        expect(fieldNameInput).not.toHaveAttribute('type', 'password');

        fireEvent.change(fieldNameInput, { target: { value: '心情' } });
        const afterFirstChange = screen.getByPlaceholderText('字段名');
        expect(afterFirstChange).toBe(fieldNameInput);

        fireEvent.change(fieldNameInput, { target: { value: '心情浓度' } });
        const afterSecondChange = screen.getByPlaceholderText('字段名');
        expect(afterSecondChange).toBe(fieldNameInput);
    });
});

describe('StatusWorkshop prompt helpers', () => {
    const fields = [{ id: 'field-1', name: '时间', desc: '当前时间', type: 'text' as const }];
    const templateFields = [{ id: 'field_1', name: '时间', description: '当前时间', required: true, type: 'text' as const }];
    const interaction = { mode: 'flip' as const, idea: '点击卡片翻到背面看隐藏心声' };

    it('keeps field definitions separate from status writing rules', () => {
        const fieldsPrompt = buildFieldsPrompt('做一个心情状态栏', fields);
        const statusWritingPrompt = buildSystemPromptPrompt('做一个心情状态栏', templateFields);
        const contract = buildStatusContract(fields);

        expect(fieldsPrompt).toContain('"fields"');
        expect(fieldsPrompt).toContain('"type": "text"');
        expect(fieldsPrompt).toContain('不要写状态文本规则');
        expect(fieldsPrompt).toContain('不要写 extractRegex');
        expect(fieldsPrompt).toContain(contract);
        expect(fieldsPrompt).not.toContain('"systemPrompt"');
        expect(fieldsPrompt).not.toContain('"extractRegex"');

        expect(statusWritingPrompt).toContain('"systemPrompt"');
        expect(statusWritingPrompt).toContain('字段协议');
        expect(statusWritingPrompt).toContain('时间');
        expect(statusWritingPrompt).toContain(contract);
        expect(statusWritingPrompt).toContain('字段标签必须逐字照抄');
        expect(statusWritingPrompt).toContain('必须逐一覆盖字段协议中的每个字段');
        expect(statusWritingPrompt).not.toContain('"extractRegex"');
        expect(statusWritingPrompt).not.toMatch(/角色 AI|char AI|System Prompt/);
    });

    it('does not rely on status writing rules when building field protocol prompts', () => {
        const protocolPrompt = buildProtocolPrompt('做一个心情状态栏', fields);

        expect(protocolPrompt).toContain('"fields"');
        expect(protocolPrompt).toContain('不要写 extractRegex');
        expect(protocolPrompt).not.toContain('当前状态文本规则');
        expect(protocolPrompt).not.toContain('"systemPrompt"');
    });

    it('threads interaction requirements through HTML, CSS, and JS prompts', () => {
        const htmlPrompt = buildHtmlPrompt('做一个翻卡状态栏', templateFields, interaction, '<section class="card">{{时间}}</section>');
        const cssPrompt = buildCssPolishPrompt('做一个翻卡状态栏', '<section data-action="flip">{{时间}}</section>', '.card { color: red; }', interaction, templateFields);
        const jsPrompt = buildJsPrompt(interaction, templateFields, '<button data-action="flip">flip</button>', '.is-flipped { transform: rotateY(180deg); }');

        expect(htmlPrompt).toContain('当前 HTML 骨架');
        expect(htmlPrompt).toContain('{{时间}}');
        expect(htmlPrompt).toContain('data-action');
        expect(cssPrompt).toContain('当前 CSS');
        expect(cssPrompt).toContain('在此基础上改进');
        expect(cssPrompt).toContain('.is-flipped');
        expect(jsPrompt).toContain('只能绑定已有 HTML 结构');
        expect(jsPrompt).toContain('window.__statusData');
        expect(jsPrompt).toContain('不要重写整段 HTML');
    });

    it('clears stale legacy regex when generated HTML uses named placeholders', () => {
        expect(shouldClearLegacyExtractRegexForHtml('<section>{{心情}}</section>')).toBe(true);
        expect(shouldClearLegacyExtractRegexForHtml('<ul>{{#弹幕}}<li>{{.}}</li>{{/弹幕}}</ul>')).toBe(true);
        expect(shouldClearLegacyExtractRegexForHtml('<section>$1</section>')).toBe(false);
    });

    it('validates new parser templates without extractRegex', () => {
        const fieldsWithList = [
            { id: 'field_1', name: '时间', description: '当前时间', required: true, type: 'text' as const },
            { id: 'field_2', name: '弹幕', description: '直播弹幕', required: true, type: 'list' as const },
        ];
        const template = createTemplate({
            fields: fieldsWithList,
            extractRegex: '',
            htmlBody: '<section>{{时间}}<ul>{{#弹幕}}<li>{{.}}</li>{{/弹幕}}</ul></section>',
        });
        const validation = validateStatusTemplateExtraction(template, buildStatusSample(fieldsWithList));

        expect(validation.status).toBe('ok');
        expect(validation.parsedData?.时间).toBe('时间示例值');
        expect(validation.parsedData?.弹幕).toEqual(['弹幕示例1', '弹幕示例2', '弹幕示例3']);
    });

    it('validates template placeholders against real regex capture groups', () => {
        const twoFields = [
            { id: 'field_1', name: '时间', description: '当前时间', required: true },
            { id: 'field_2', name: '心情', description: '当前心情', required: true },
        ];
        const template = createTemplate({
            fields: twoFields,
            extractRegex: '<status>[\\s\\S]*?时间:\\s*(.*?)\\s*心情:\\s*(.*?)\\s*<\\/status>',
            htmlBody: '<section>$1 $2</section>',
        });
        const sample = buildStatusSample(twoFields);
        const validation = validateStatusTemplateExtraction(template, sample);

        expect(extractTemplatePlaceholders(template.htmlBody || '')).toEqual([1, 2]);
        expect(validation.status).toBe('ok');
        expect(validation.captureCount).toBe(2);
    });

    it('reports placeholders that regex cannot capture', () => {
        const twoFields = [
            { id: 'field_1', name: '时间', description: '当前时间', required: true },
            { id: 'field_2', name: '心情', description: '当前心情', required: true },
        ];
        const template = createTemplate({
            fields: twoFields,
            extractRegex: '<status>[\\s\\S]*?时间:\\s*(.*?)\\s*<\\/status>',
            htmlBody: '<section>$1 $2</section>',
        });
        const validation = validateStatusTemplateExtraction(template, buildStatusSample(twoFields));

        expect(validation.status).toBe('missing_groups');
        expect(validation.missingPlaceholders).toEqual([2]);
        expect(validation.messages[0]).toContain('$2');
    });
});

describe('StatusWorkshop import/export helpers', () => {
    it('exports versioned payloads and imports templates as new schemes', () => {
        const source = createTemplate({
            name: '雨夜状态',
            systemPrompt: '每个字段都短而具体。',
            extractRegex: '<status>[\\s\\S]*?时间:\\s*(.*?)<\\/status>',
            htmlBody: '<section>$1</section>',
            cssTemplate: '.status-card { color: red; }',
            jsTemplate: 'document.querySelector(".status-card")?.classList.toggle("is-active");',
            allowScripts: true,
            interactionMode: 'flip',
            reviewFlags: { html: true },
        });

        const payload = buildStatusWorkshopExportPayload([source]);
        const imported = parseStatusWorkshopImportPayload(payload, 4);

        expect(payload.type).toBe('sully.statusWorkshop.templates');
        expect(payload.templates).toHaveLength(1);
        expect(imported).toHaveLength(1);
        expect(imported[0].id).not.toBe(source.id);
        expect(imported[0].name).toBe('雨夜状态 导入');
        expect(imported[0].systemPrompt).toBe(source.systemPrompt);
        expect(imported[0].extractRegex).toBe(source.extractRegex);
        expect(imported[0].allowScripts).toBe(true);
        expect(imported[0].interactionMode).toBe('flip');
        expect(imported[0].reviewFlags).toEqual({});
    });

    it('accepts raw single-template imports for old hand-edited files', () => {
        const imported = parseStatusWorkshopImportPayload({
            name: '旧文件',
            systemPrompt: '状态规则',
            extractRegex: 'regex',
            fields: [{ name: '地点', description: '当前位置' }],
        });

        expect(imported).toHaveLength(1);
        expect(imported[0].name).toBe('旧文件 导入');
        expect(imported[0].fields?.[0]?.name).toBe('地点');
    });
});

const createTemplate = (overrides: Partial<CustomStatusTemplate> = {}): CustomStatusTemplate => ({
    id: 'tpl-1',
    name: '测试方案',
    systemPrompt: '',
    extractRegex: '',
    htmlBody: '',
    cssTemplate: '',
    jsTemplate: '',
    renderMode: 'html',
    fields: [{ id: 'field_1', name: '时间', description: '当前时间', required: true }],
    ...overrides,
});

function renderWorkshop(template: CustomStatusTemplate) {
    const addToast = vi.fn();
    mockedUseOS.mockReturnValue({
        closeApp: vi.fn(),
        characters: [{
            id: 'char-1',
            name: '测试角色',
            customStatusTemplates: [template],
            activeCustomTemplateId: template.id,
        }],
        activeCharacterId: 'char-1',
        addToast,
        updateCharacter: vi.fn(),
    } as any);

    render(<StatusWorkshopApp />);
    return { addToast };
}

describe('StatusWorkshopApp workflow', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts from field definitions and allows generation before AI writing rules', () => {
        renderWorkshop(createTemplate());

        expect(screen.getByText('1 定义字段')).toBeInTheDocument();
        expect(screen.getByText('导入方案')).toBeInTheDocument();
        expect(screen.getByText('导出当前')).toBeInTheDocument();
        expect(screen.getByText('导出全部')).toBeInTheDocument();
        const generateButton = screen.getByText('✨ 生成字段').closest('button');

        expect(generateButton).not.toBeDisabled();
        expect(screen.queryByText(/先完成.*状态写法/)).not.toBeInTheDocument();
    });

    it('does not show tool-like status writing copy to users in advanced writing step', () => {
        renderWorkshop(createTemplate({ extractRegex: 'old regex' }));

        fireEvent.click(screen.getByText('4 AI 写法'));

        expect(screen.getByText('AI 写法')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/弹幕要接地气/)).toBeInTheDocument();
        expect(screen.queryByText(/System Prompt|角色 AI|char AI/)).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/System Prompt|角色 AI|char AI|告诉角色/)).not.toBeInTheDocument();
    });

    it('uses the new 4-tab structure and visual subtabs', () => {
        renderWorkshop(createTemplate());

        expect(screen.getByText('1 定义字段')).toBeInTheDocument();
        expect(screen.getByText('2 视觉设计')).toBeInTheDocument();
        expect(screen.getByText('3 互动')).toBeInTheDocument();
        expect(screen.getByText('4 AI 写法')).toBeInTheDocument();

        fireEvent.click(screen.getByText('2 视觉设计'));

        expect(screen.getAllByText('HTML 骨架').length).toBeGreaterThan(0);
        expect(screen.getAllByText('CSS 美化').length).toBeGreaterThan(0);
        expect(screen.getByText('✨ 生成 HTML')).toBeInTheDocument();
    });

    it('does not show extractRegex for new templates', () => {
        renderWorkshop(createTemplate());

        expect(screen.queryByText('提取正则')).not.toBeInTheDocument();
        expect(screen.queryByText(/旧版正则模式/)).not.toBeInTheDocument();
    });

    it('shows legacy extractRegex inside a compatibility panel', () => {
        renderWorkshop(createTemplate({
            extractRegex: 'old regex',
        }));

        expect(screen.getByText('旧版正则模式兼容设置')).toBeInTheDocument();
        expect(screen.getByDisplayValue('old regex')).toBeInTheDocument();
    });

    it('marks visual and JS for review after interaction changes without clearing content', () => {
        renderWorkshop(createTemplate({
            systemPrompt: '每次回复末尾输出状态。',
            htmlBody: '<section class="status-card">{{时间}}</section>',
            cssTemplate: '.status-card { color: red; }',
            jsTemplate: 'document.querySelector(".status-card")?.classList.toggle("is-active");',
            interactionMode: 'none',
        }));

        fireEvent.click(screen.getByText('3 互动'));
        fireEvent.click(screen.getByText('翻卡'));

        expect(screen.getAllByText('需复核').length).toBeGreaterThanOrEqual(2);
        fireEvent.click(screen.getByText('2 视觉设计'));
        expect(screen.getByDisplayValue('<section class="status-card">{{时间}}</section>')).toBeInTheDocument();
    });

    it('requires confirmation before generating over existing HTML', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        renderWorkshop(createTemplate({
            systemPrompt: '每次回复末尾输出状态。',
            htmlBody: '<section class="status-card">{{时间}}</section>',
        }));

        fireEvent.change(screen.getByPlaceholderText(/做一个角色直播间/), {
            target: { value: '做一个能显示时间的状态栏' },
        });
        fireEvent.click(screen.getByText('2 视觉设计'));
        fireEvent.click(screen.getByText('✨ 生成 HTML'));

        expect(confirmSpy).toHaveBeenCalled();
    });

    it('renders a field type selector', () => {
        renderWorkshop(createTemplate());

        const selectors = screen.getAllByRole('combobox') as HTMLSelectElement[];
        expect(selectors[0].value).toBe('text');
        fireEvent.change(selectors[0], { target: { value: 'list' } });
        expect(selectors[0].value).toBe('list');
    });
});
