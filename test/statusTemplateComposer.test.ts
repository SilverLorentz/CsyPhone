import { describe, expect, it } from 'vitest';
import {
    LAYERED_STATUS_TEMPLATE_VERSION,
    composeCustomStatusTemplateHtml,
    splitStatusTemplateHtml,
    substituteNamedPlaceholders,
    substituteStatusTemplateVariables,
} from '../utils/statusTemplateComposer';
import type { CustomStatusTemplate } from '../types/statusCard';

describe('statusTemplateComposer', () => {
    it('keeps legacy htmlTemplate behavior as a fallback', () => {
        const template: CustomStatusTemplate = {
            id: 'legacy',
            name: 'Legacy',
            systemPrompt: '',
            extractRegex: '',
            htmlTemplate: '<div>$1|$2|$3</div>',
            renderMode: 'html',
        };
        const match = ['all', 'A', 'B'] as unknown as RegExpMatchArray;

        expect(composeCustomStatusTemplateHtml(template, { matchResult: match, extracted: 'fallback' }))
            .toBe('<div>A|B|</div>');
    });

    it('composes layered HTML, CSS, and opted-in JS into one document', () => {
        const template: CustomStatusTemplate = {
            id: 'layered',
            name: 'Layered',
            systemPrompt: '',
            extractRegex: '',
            htmlBody: '<section class="status-card"><span>$1</span><b>$2</b></section>',
            cssTemplate: '.status-card { color: $2; }',
            jsTemplate: 'document.querySelector(".status-card")?.classList.add("$1");',
            templateVersion: LAYERED_STATUS_TEMPLATE_VERSION,
            allowScripts: true,
            renderMode: 'html',
        };
        const match = ['all', 'ready', '#fff'] as unknown as RegExpMatchArray;
        const html = composeCustomStatusTemplateHtml(template, { matchResult: match });

        expect(html).toContain('<meta charset="UTF-8">');
        expect(html).toContain('<main class="status-card-frame">');
        expect(html).toContain('<section class="status-card"><span>ready</span><b>#fff</b></section>');
        expect(html).toContain('.status-card { color: #fff; }');
        expect(html).toContain('classList.add("ready")');
    });

    it('omits layered JS when scripts are disabled', () => {
        const template: CustomStatusTemplate = {
            id: 'layered-no-js',
            name: 'Layered',
            systemPrompt: '',
            extractRegex: '',
            htmlBody: '<section>$1</section>',
            jsTemplate: 'document.body.dataset.ready = "yes";',
            templateVersion: LAYERED_STATUS_TEMPLATE_VERSION,
            allowScripts: false,
            renderMode: 'html',
        };

        expect(composeCustomStatusTemplateHtml(template, { previewValues: ['ready'] }))
            .not.toContain('<script>');
    });

    it('substitutes two-digit placeholders without splitting them', () => {
        const match = Array.from({ length: 12 }, (_, index) => (index === 0 ? 'all' : `G${index}`)) as unknown as RegExpMatchArray;

        expect(substituteStatusTemplateVariables('$1|$9|$10|$11|$12', match, 'fallback'))
            .toBe('G1|G9|G10|G11|');
    });

    it('does not leak unresolved placeholders when regex matching fails', () => {
        expect(substituteStatusTemplateVariables('$1|$2|$10', null, 'fallback'))
            .toBe('fallback||');
    });

    it('splits legacy full HTML into layered parts', () => {
        const split = splitStatusTemplateHtml(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>.card{color:red}</style></head><body><div class="card">$1</div><script>document.body.dataset.ready='yes'</script></body></html>`);

        expect(split.htmlBody).toBe('<div class="card">$1</div>');
        expect(split.cssTemplate).toBe('.card{color:red}');
        expect(split.jsTemplate).toBe("document.body.dataset.ready='yes'");
    });

    it('substitutes named scalar placeholders', () => {
        expect(substituteNamedPlaceholders('<div>{{时间}} {{心情}}</div>', {
            时间: '22:15',
            心情: '安静',
        })).toBe('<div>22:15 安静</div>');
    });

    it('renders list blocks with item and index placeholders', () => {
        expect(substituteNamedPlaceholders('<ul>{{#弹幕}}<li data-i="{{@index}}">{{.}}</li>{{/弹幕}}</ul>', {
            弹幕: ['第一条', '第二条'],
        })).toBe('<ul><li data-i="0">第一条</li><li data-i="1">第二条</li></ul>');
    });

    it('composes layered templates with parsed data and status data injection', () => {
        const template: CustomStatusTemplate = {
            id: 'named-layered',
            name: 'Named',
            systemPrompt: '',
            extractRegex: '',
            htmlBody: '<section class="status-card"><strong>{{心情}}</strong><ul>{{#弹幕}}<li>{{.}}</li>{{/弹幕}}</ul></section>',
            cssTemplate: '.status-card::before { content: "{{心情}}"; }',
            jsTemplate: 'document.body.dataset.count = String(window.__statusData["弹幕"].length);',
            templateVersion: LAYERED_STATUS_TEMPLATE_VERSION,
            allowScripts: true,
            renderMode: 'html',
        };

        const html = composeCustomStatusTemplateHtml(template, {
            parsedData: { 心情: '安静', 弹幕: ['第一条', '第二条'] },
            includeScripts: true,
        });

        expect(html).toContain('<strong>安静</strong>');
        expect(html).toContain('<li>第一条</li><li>第二条</li>');
        expect(html).toContain('content: "安静"');
        expect(html).toContain('window.__statusData = JSON.parse(decodeURIComponent');
        expect(html).toContain('window.__statusData["弹幕"].length');
    });

    it('substitutes named and positional placeholders together', () => {
        const template: CustomStatusTemplate = {
            id: 'mixed-layered',
            name: 'Mixed',
            systemPrompt: '',
            extractRegex: '<status>[\\s\\S]*?Mood:\\s*(.*?)<\\/status>',
            htmlBody: '<section><strong>{{心情}}</strong><span>$1</span><i>$9</i></section>',
            cssTemplate: '.status-card::before { content: "{{心情}} $1 $9"; }',
            templateVersion: LAYERED_STATUS_TEMPLATE_VERSION,
            renderMode: 'html',
        };
        const match = ['all', 'quiet'] as unknown as RegExpMatchArray;

        const html = composeCustomStatusTemplateHtml(template, {
            matchResult: match,
            parsedData: { 心情: '安静' },
        });

        expect(html).toContain('<strong>安静</strong><span>quiet</span><i></i>');
        expect(html).toContain('content: "安静 quiet "');
        expect(html).not.toContain('{{心情}}');
        expect(html).not.toContain('$9');
    });
});
