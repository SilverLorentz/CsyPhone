// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NianNianApp from './NianNianApp';
import { useOS } from '../../context/OSContext';
import type { NianNianSession } from '../../types';
import { DB } from '../../utils/db';

vi.mock('../../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../../utils/db', () => ({
    DB: {
        getAllNianNianSessions: vi.fn(),
        saveNianNianSession: vi.fn(),
    },
}));

const mockedUseOS = vi.mocked(useOS);
const mockedGetAllSessions = vi.mocked(DB.getAllNianNianSessions);
const mockedSaveSession = vi.mocked(DB.saveNianNianSession);

const worldPackMarkdown = `# 念念浮生 · 世界设定包 · 测试

### genre
古代中国 · 古风

### tone
含蓄克制

### 文风
像《浮生六记》那样淡,像《红楼梦》那样会说话。

### char_identity
低调归京之人

### mc_identity
入京暂居的官宦/商贾之女

### seedStatus
\`\`\`status
<<<STATUS>>>
ta.好感: 8
me.银两: 30
world.拘束: 75
<<<END>>>
\`\`\`

### openingStep
\`\`\`json
{
  "sceneText": "上元灯节,人海重逢。",
  "options": [
    { "id": "return-token", "label": "先弯腰拾起落在脚边的那件失物,递还过去。" }
  ],
  "allowFreeInput": true
}
\`\`\`

### hiddenVarsSeed
\`\`\`json
{ "缘分": 5 }
\`\`\`

### status_schema
\`world.拘束[0-100]\`
`;

const character = {
    id: 'char-1',
    name: '念念',
    avatar: '',
    description: '',
    systemPrompt: '',
    worldview: '',
    memories: [],
    mountedWorldbooks: [],
} as any;

describe('NianNianApp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            text: async () => worldPackMarkdown,
        })));
        mockedGetAllSessions.mockResolvedValue([]);
        mockedSaveSession.mockResolvedValue(undefined);
        mockedUseOS.mockReturnValue({
            activeCharacterId: 'char-1',
            addToast: vi.fn(),
            characters: [character],
            closeApp: vi.fn(),
            userProfile: {
                name: '测试用户',
                avatar: '',
                bio: '',
            },
        } as any);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shows separated speech/action inputs and a visible retry error when APIs are missing', async () => {
        render(<NianNianApp />);

        await screen.findByText('副本初始化');
        await screen.findByDisplayValue('古代中国 · 古风');
        fireEvent.click(screen.getByText('初始化 Session'));

        await screen.findByText('上元灯节,人海重逢。');
        expect(screen.queryByLabelText('念念浮生输入区')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('推进对白'));

        await screen.findByLabelText('念念浮生输入区');
        expect(screen.queryByText('上元灯节,人海重逢。')).not.toBeInTheDocument();
        expect(screen.getByText('先弯腰拾起落在脚边的那件失物,递还过去。')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('写一句要说的话...')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('写一个动作、停顿或神态...')).toBeInTheDocument();

        mockedSaveSession.mockClear();
        fireEvent.change(screen.getByPlaceholderText('写一句要说的话...'), {
            target: { value: '你还记得这里吗？' },
        });
        fireEvent.change(screen.getByPlaceholderText('写一个动作、停顿或神态...'), {
            target: { value: '抬手拂开帘子' },
        });
        fireEvent.click(screen.getByRole('button', { name: '发送回合' }));

        await screen.findByRole('alert');
        expect(screen.getByText('主模型 API 未配置完整')).toBeInTheDocument();
        expect(screen.getByText('重试本回合')).toBeInTheDocument();
        expect(screen.getByText('返回修改')).toBeInTheDocument();
        expect(screen.getAllByText(/baseUrl: 未填写/).length).toBeGreaterThan(0);
        expect(mockedSaveSession).not.toHaveBeenCalled();
    });

    it('applies real main and director replies when the player clicks an opening option', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            if (!String(url).includes('/chat/completions')) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: async () => worldPackMarkdown,
                };
            }

            const body = JSON.parse(String(init?.body || '{}'));
            const systemPrompt = body.messages?.[0]?.content || '';
            const content = systemPrompt.includes('你是「天意」')
                ? `<<<SCENE>>>
（旁白：并蒂莲灯轻轻晃了一下,你们被人潮挤到同一处灯影里。

灯影落在水面上,把旧缘照得很轻。）
<<<OPTIONS>>>
A | 问他是否也来猜灯谜 | TA 借灯谜试探旧缘
B | 先把玉扣纹样记在心里 | TA 察觉玩家留心
<<<DIRECTOR>>>
stage: 初遇
hidden.缘分_delta: +1
event_used: 公共节庆
milestone: 上元灯市相识
ending_ready: false
<<<END>>>`
                : `‹白|选项›他接过那枚旧玉扣,指尖停在半空。
‹话|选项›“多谢姑娘。”

<<<STATUS>>>
ta.好感_delta: +2
ta.心情: 微窘
ta.神态: shy
ta.暧昧度_delta: +1
ta.心声: 这枚玉扣偏在此时回来。
me.名声_delta: 0
scene.地点: 长街灯市
world.拘束_delta: 0
npc: 无
<<<END>>>`;

            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
            };
        }));
        mockedUseOS.mockReturnValue({
            activeCharacterId: 'char-1',
            addToast: vi.fn(),
            apiConfig: {
                baseUrl: 'https://api.example.test',
                apiKey: 'sk-test',
                model: 'test-model',
            },
            characters: [character],
            closeApp: vi.fn(),
            userProfile: {
                name: '测试用户',
                avatar: '',
                bio: '',
            },
        } as any);

        render(<NianNianApp />);

        await screen.findByText('副本初始化');
        fireEvent.click(screen.getByText('初始化 Session'));
        await screen.findByText('上元灯节,人海重逢。');
        fireEvent.click(screen.getByLabelText('推进对白'));

        await screen.findByText('先弯腰拾起落在脚边的那件失物,递还过去。');
        mockedSaveSession.mockClear();
        fireEvent.click(screen.getByText('先弯腰拾起落在脚边的那件失物,递还过去。'));

        await waitFor(() => expect(mockedSaveSession).toHaveBeenCalled());
        const saved = mockedSaveSession.mock.calls[0][0] as NianNianSession;
        const savedUser = saved.rawBuffer.find(item => item.role === 'user');
        const savedAssistant = saved.rawBuffer.find(item => item.role === 'assistant');

        expect(saved.rawBuffer.some(item => item.role === 'user' && item.content.includes('【选项】先弯腰拾起'))).toBe(true);
        expect(saved.rawBuffer.some(item => item.role === 'assistant' && item.content.includes('多谢姑娘'))).toBe(true);
        expect(saved.historyBuffer?.some(item => item.role === 'user' && item.content.includes('【选项】先弯腰拾起'))).toBe(true);
        expect(saved.historyBuffer?.some(item => item.role === 'assistant' && item.content.includes('多谢姑娘'))).toBe(true);
        expect(savedUser?.playerSegments).toEqual([
            { kind: 'player', anchor: '选项', text: '先弯腰拾起落在脚边的那件失物,递还过去。' },
        ]);
        expect(savedAssistant?.content).not.toContain('‹');
        expect(savedAssistant?.assistantBeats?.[1]).toEqual({
            type: '话',
            anchor: '选项',
            text: '“多谢姑娘。”',
        });
        expect(saved.rawBuffer.some(item => item.role === 'director' && item.content.includes('并蒂莲灯'))).toBe(true);
        expect(saved.status.ta.好感).toBe(10);
        expect(saved.currentStep.sceneText).toBe('并蒂莲灯轻轻晃了一下,你们被人潮挤到同一处灯影里。\n\n灯影落在水面上,把旧缘照得很轻。');
        expect(saved.currentStep.sceneText).not.toContain('旁白');
        expect(saved.currentStep.options[0].label).toBe('问他是否也来猜灯谜');

        fireEvent.click(screen.getByText('先弯腰拾起落在脚边的那件失物,递还过去。'));
        await screen.findByText('他接过那枚旧玉扣,指尖停在半空。');
        fireEvent.click(screen.getByRole('button', { name: '上一页' }));
        await screen.findByText('先弯腰拾起落在脚边的那件失物,递还过去。');
        expect(screen.queryByText('他接过那枚旧玉扣,指尖停在半空。')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        await screen.findByText('他接过那枚旧玉扣,指尖停在半空。');
        fireEvent.click(screen.getByText('他接过那枚旧玉扣,指尖停在半空。'));
        await screen.findByText('“多谢姑娘。”');
        fireEvent.click(screen.getByText('“多谢姑娘。”'));
        await screen.findByText('并蒂莲灯轻轻晃了一下,你们被人潮挤到同一处灯影里。');
        expect(screen.queryByText('灯影落在水面上,把旧缘照得很轻。')).not.toBeInTheDocument();
        expect(screen.queryByText('问他是否也来猜灯谜')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        await screen.findByText('灯影落在水面上,把旧缘照得很轻。');
        expect(screen.queryByText('问他是否也来猜灯谜')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        await screen.findByText('问他是否也来猜灯谜');

        fireEvent.click(screen.getByRole('button', { name: '展开天机之书' }));
        const fateBook = await screen.findByLabelText('天机之书');
        expect(within(fateBook).queryByText('情境')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '打开回想录' }));
        const historyPanel = await screen.findByLabelText('回想录');
        expect(within(historyPanel).getByText('序章')).toBeInTheDocument();
        expect(within(historyPanel).getAllByText('第 1 回').length).toBeGreaterThan(0);
        expect(within(historyPanel).getByText('测试用户')).toBeInTheDocument();

        fireEvent.click(within(historyPanel).getByRole('button', { name: /回放第 1 回念念.*多谢姑娘/ }));
        expect(screen.getAllByText('“多谢姑娘。”').length).toBeGreaterThan(1);
    });
});
