import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
    getAllCharacters: vi.fn(),
    saveCharacter: vi.fn(),
}));

vi.mock('../utils/db', () => ({
    DB: dbMocks,
}));

vi.mock('../utils/realtimeContext', () => ({
    RealtimeContextManager: {
        getTimeContext: () => ({
            timeStr: '22:15',
            timeOfDay: '夜晚',
            dateStr: '2026-04-14',
            dayOfWeek: '星期二',
        }),
    },
}));

import { MindSnapshotExtractor, resolveAfterglowAuthorSlot, resolveRolls } from '../utils/mindSnapshotExtractor';

describe('resolveRolls', () => {
    it('replaces roll macros and avoids repeating the previous pick in each pool', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const lastPick = { A: '片刻' };

        const result = resolveRolls('{{roll:A:片刻|旁白|切面}} / {{roll:B:安静}}', lastPick);

        expect(result).toBe('旁白 / 安静');
        expect(lastPick).toEqual({ A: '旁白', B: '安静' });
        randomSpy.mockRestore();
    });

    it('allows literal double-brace text while replacing roll macros', () => {
        const result = resolveRolls('文中不得出现 {{ }}，命题是 {{roll:A:视角重播}}', {});
        expect(result).toBe('文中不得出现 {{ }}，命题是 视角重播');
        expect(result).not.toContain('{{roll:');
    });

    it('deals a shuffled deck per pool before reshuffling', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        const lastPick: Record<string, string> = {};

        const firstDeck = resolveRolls('{{roll:S:内心OS|旁白吐槽|私密记录}}/{{roll:S:内心OS|旁白吐槽|私密记录}}/{{roll:S:内心OS|旁白吐槽|私密记录}}', lastPick)
            .split('/');
        const nextDeckFirst = resolveRolls('{{roll:S:内心OS|旁白吐槽|私密记录}}', lastPick);

        expect(new Set(firstDeck).size).toBe(3);
        expect(nextDeckFirst).not.toBe(firstDeck[2]);
        randomSpy.mockRestore();
    });

    it('uses the right side of delimited roll options for prompt injection and reports the left side as label', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const picks: any[] = [];

        const result = resolveRolls(
            '{{roll:F:吃醋‖看见我和旁人说笑嘴上不认动作出卖了他|壁咚‖退无可退的一寸距离先慌的是他自己}}',
            {},
            pick => picks.push(pick),
        );

        expect(result).toBe('看见我和旁人说笑嘴上不认动作出卖了他');
        expect(picks[0]).toMatchObject({
            pool: 'F',
            rawValue: '吃醋‖看见我和旁人说笑嘴上不认动作出卖了他',
            promptValue: '看见我和旁人说笑嘴上不认动作出卖了他',
            label: '吃醋',
        });
        randomSpy.mockRestore();
    });
});

describe('resolveAfterglowAuthorSlot', () => {
    it('uses a named author from user input before random draw', () => {
        const result = resolveAfterglowAuthorSlot(['这次想要张爱玲一点，冷一点。'], false, {});

        expect(result).toBe('张爱玲—冷艳世故、苍凉俯视、以物象作反讽');
    });

    it('keeps classical Chinese anchors out of the modern random pool', () => {
        const lastPick: Record<string, string> = {};
        const slots = Array.from({ length: 25 }, () => resolveAfterglowAuthorSlot([], false, lastPick));
        const joined = slots.join('\n');

        expect(joined).not.toContain('蒲松龄—');
        expect(joined).not.toContain('沈复—');
        expect(joined).not.toContain('〔文言〕');
    });

    it('allows classical Chinese anchors when the issue is classical', () => {
        const lastPick: Record<string, string> = {};
        const slots = Array.from({ length: 25 }, () => resolveAfterglowAuthorSlot([], true, lastPick));
        const joined = slots.join('\n');

        expect(joined).toContain('蒲松龄—文言精炼、志怪幽艳、人妖情缠绵〔文言〕');
        expect(joined).toContain('沈复—文言平易、闺房日常深情〔文言〕');
    });
});

describe('MindSnapshotExtractor.generateInnerVoice', () => {
    const apiConfig = {
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        apiKey: 'test-key',
    };

    const baseCharacter = {
        id: 'char-1',
        name: 'Marcus',
        systemPrompt: '冷静、敏感，讲话克制。',
        memories: [
            { date: '2026-04-14', mood: 'rec', summary: '他记得阿眠那天认真说过不要敷衍。' },
        ],
        refinedMemories: {
            '2026-04': '核心记忆：阿眠不怕谈难题，但很怕被轻描淡写带过。',
        },
        activeMemoryMonths: ['2026-04'],
        moodState: undefined,
    } as any;

    const currentMsgs = [
        { role: 'user', type: 'text', content: '你明天还记得那个会吗？' },
        { role: 'assistant', type: 'text', content: '记得，我会提前看材料。' },
    ] as any[];

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        dbMocks.getAllCharacters.mockResolvedValue([{ ...baseCharacter }]);
        dbMocks.saveCharacter.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    function mockFetchContent(content: string) {
        vi.mocked(global.fetch).mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content } }],
            }),
        } as Response);
    }

    it('parses and normalizes classic inner voice text beyond 40 characters', async () => {
        mockFetchContent('{"innerVoice":"  今天风有点大，\\n\\n 但我还是想先把桌上的纸收好，再去想明天那场见面。  "}');

        const result = await MindSnapshotExtractor.generateInnerVoice(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
        );

        expect(result?.innerVoice).toBe('今天风有点大，\n但我还是想先把桌上的纸收好，再去想明天那场见面。');
        expect(dbMocks.saveCharacter).toHaveBeenCalledTimes(1);
        expect(dbMocks.saveCharacter.mock.calls[0][0].moodState.innerVoice).toBe(result?.innerVoice);
    });

    it('sends the main chat mirror before the secondary task prompt when available', async () => {
        mockFetchContent('{"innerVoice":"先把上方那段完整设定吃进去。"}');

        await MindSnapshotExtractor.generateInnerVoice(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            undefined,
            true,
            '',
            {
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' },
                    { role: 'user', content: 'full db context line' },
                ],
                mirrorThinking: '角色刚刚的思考链',
                contextLimit: 1000000,
                historyMsgCount: 2,
                model: 'main-chat-model',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        expect(body.messages[0]).toEqual({ role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' });
        expect(body.messages[1]).toEqual({ role: 'user', content: 'full db context line' });
        expect(body.messages[2].role).toBe('user');
        expect(body.messages[2].content).toContain('Secondary Task Instructions');
        expect(body.messages[2].content).toContain('角色刚刚的思考链');
        expect(body.messages[2].content).toContain('请基于上方主聊天完整上下文镜像执行本任务');
    });

    it('generates afterglow cards with full max_tokens without persisting to character state', async () => {
        mockFetchContent('他把杯子往窗边推了一点，像是给沉默也留了个座位。');

        const result = await MindSnapshotExtractor.generateAfterglowCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            undefined,
            {
                userProfile: { name: '阿眠', bio: '长期关系里的对话对象。' } as any,
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' },
                    { role: 'user', content: 'full db context line' },
                ],
                contextLimit: 1,
                historyMsgCount: 2,
                model: 'main-chat-model',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        const taskPrompt = body.messages[0].content;
        expect(body.max_tokens).toBe(65536);
        expect(body.messages).toHaveLength(2);
        expect(JSON.stringify(body.messages)).not.toContain('FULL SYSTEM PROMPT WITH WORLDBOOKS');
        expect(taskPrompt).toContain('番外篇');
        expect(taskPrompt).toContain('本期形态:');
        expect(taskPrompt).toContain('## ✒ 作家笔触');
        expect(taskPrompt).toContain('本期笔触：');
        expect(taskPrompt).toContain('正文 3280~3654 中文字');
        expect(taskPrompt).toContain('运笔·〈本期作家〉风');
        expect(taskPrompt).not.toContain('番外小料');
        expect(taskPrompt).not.toContain('三则小料');
        expect(taskPrompt).not.toContain('__AFTERGLOW_SEED_ROLL_SLOT__');
        expect(taskPrompt).not.toContain('__AFTERGLOW_AUTHOR_SLOT__');
        expect([
            taskPrompt.includes('if 前提:'),
            taskPrompt.includes('本轮梗:'),
        ].filter(Boolean).length).toBeLessThanOrEqual(1);
        expect(taskPrompt).toContain('Marcus × 阿眠');
        expect(taskPrompt).not.toContain('__AFTERGLOW_CHAR_NAME__');
        expect(taskPrompt).not.toContain('__AFTERGLOW_USER_NAME__');
        expect(taskPrompt).toContain('《标题》');
        expect(taskPrompt).toContain('题记');
        expect(taskPrompt).not.toContain('{{roll:');
        expect(body.messages[1].content).toContain('### 你的身份 (Character)');
        expect(body.messages[1].content).toContain('- 名字: 阿眠');
        expect(body.messages[1].content).toContain('**你的记忆 · 脉络**');
        expect(body.messages[1].content).toContain('核心记忆：阿眠不怕谈难题');
        expect(body.messages[1].content).toContain('当前激活的详细回忆');
        expect(body.messages[1].content).toContain('他记得阿眠那天认真说过不要敷衍。');
        expect(body.messages[1].content).toContain('Marcus: 记得，我会提前看材料。');
        expect(body.messages[1].content).not.toContain('阿眠: 你明天还记得那个会吗？');
        expect(result?.cardType).toBe('freeform');
        expect(result?.body).toBe('他把杯子往窗边推了一点，像是给沉默也留了个座位。');
        expect(result?.meta?.html).toContain('番外篇');
        expect(result?.meta?.afterglowTags).toEqual(expect.arrayContaining([expect.stringMatching(/^#/)]));
        expect(result?.meta?.afterglowCover).toMatchObject({
            form: expect.any(String),
            theme: expect.any(String),
            themeSource: expect.any(String),
            tags: expect.arrayContaining([expect.stringMatching(/^#/)]),
        });
        expect(dbMocks.saveCharacter).not.toHaveBeenCalled();
    });

    it('injects only the named author anchor into the afterglow prompt', async () => {
        mockFetchContent('雨声停在门外，他却没有把那句话说完。');

        await MindSnapshotExtractor.generateAfterglowCard(
            baseCharacter,
            '我会提前看材料。',
            [
                ...currentMsgs,
                { role: 'user', type: 'text', content: '随机来一篇，但想要张爱玲式的冷艳反讽。' },
            ] as any,
            apiConfig,
            undefined,
            {
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' },
                    { role: 'user', content: 'full db context line' },
                ],
                contextLimit: 1000000,
                historyMsgCount: 2,
                model: 'main-chat-model',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        const taskPrompt = body.messages[0].content;

        expect(taskPrompt).toContain('本期笔触：张爱玲—冷艳世故、苍凉俯视、以物象作反讽');
        expect(taskPrompt).not.toContain('曹雪芹—');
        expect(taskPrompt).not.toContain('人物各有口吻、细节绵密、含蓄不点破');
        expect(taskPrompt).not.toContain('马尔克斯—');
        expect(taskPrompt).not.toContain('作家 | 笔法速写');
    });

    it('detects a named author from recent user messages', async () => {
        mockFetchContent('他把那句玩笑收回去，只留下半个漂亮的停顿。');

        await MindSnapshotExtractor.generateAfterglowCard(
            baseCharacter,
            '我会提前看材料。',
            [
                ...currentMsgs,
                { role: 'user', type: 'text', content: '这次能不能有点王尔德那种机锋？' },
            ] as any,
            apiConfig,
            undefined,
            {
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' },
                    { role: 'user', content: 'full db context line' },
                ],
                contextLimit: 1000000,
                historyMsgCount: 3,
                model: 'main-chat-model',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        const taskPrompt = body.messages[0].content;

        expect(taskPrompt).toContain('本期笔触：王尔德—机锋悖论、唯美毒舌〔译〕');
        expect(taskPrompt).not.toContain('张爱玲—冷艳世故、苍凉俯视、以物象作反讽');
    });

    it('injects user specified afterglow motifs into the secondary task instructions', async () => {
        mockFetchContent('雨声停在门外，他却没有把那句话说完。');

        await MindSnapshotExtractor.generateAfterglowCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            undefined,
            {
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH WORLDBOOKS' },
                    { role: 'user', content: 'full db context line' },
                ],
                contextLimit: 1000000,
                historyMsgCount: 2,
                model: 'main-chat-model',
            },
            {
                userMotif: '雨夜误会',
                customMotifs: ['一封没寄出的信'],
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0].content).toContain('## 用户梗要求');
        expect(body.messages[0].content).toContain('请以「Marcus 对 我 的回应」为核心');
        expect(body.messages[0].content).toContain('你就是Marcus本人，不能像任何通用角色');
        expect(body.messages[0].content).toContain('[不设固定字数。优先遵守"用户梗要求"里对长短、形式、节奏的明示要求');
        expect(body.messages[0].content).not.toContain('2268~2576');
        expect(body.messages[0].content).toContain('用户指定梗: 雨夜误会');
        expect(body.messages[0].content).not.toContain('正文 3280~3654 中文字');
        expect(body.messages[0].content).not.toContain('运笔·〈本期作家〉风');
        expect(body.messages[0].content).not.toContain('roll:FORM');
        expect(body.messages[0].content).not.toContain('{{roll:');
    });

    it('uses full clean core context for heart-talk and strips thinking from the visible afterglow body', async () => {
        const longSystemPrompt = `冷静、敏感，讲话克制。${'完整人设'.repeat(180)}`;
        const longWorldview = `雨城、旧档案馆、两个人长期共享的秘密。${'完整世界观'.repeat(120)}`;
        const heartTalkCharacter = {
            ...baseCharacter,
            systemPrompt: longSystemPrompt,
            worldview: longWorldview,
            mountedWorldbooks: [
                {
                    id: 'wb-1',
                    title: '完整世界书条目',
                    content: '这条世界书必须完整进入谈心模式，不从主聊天镜像继承。',
                    category: '关系设定',
                    position: 'after_worldview',
                },
            ],
            impression: {
                personality_core: {
                    summary: '他觉得阿眠敏感但有韧劲。',
                    interaction_style: '先试探，再认真回应。',
                    observed_traits: ['敏感', '有边界'],
                },
                value_map: {
                    likes: ['被认真听见'],
                    dislikes: ['被敷衍'],
                },
                emotion_schema: {
                    triggers: { negative: ['忽冷忽热'] },
                    comfort_zone: '安静但明确的解释。',
                },
                observed_changes: ['最近更愿意直接说不安。'],
            },
        } as any;
        mockFetchContent('<THINKING data-test="1">内部拆解和首句草稿。</THINKING>\n[[SEND_EMOJI: 亲亲]]\n[22:15] Marcus: 2026年4月14日夜里，他把椅子往后挪开半寸。');

        const result = await MindSnapshotExtractor.generateAfterglowCard(
            heartTalkCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            undefined,
            {
                userProfile: { name: '阿眠', bio: '长期关系里的对话对象。' } as any,
                mirrorMessages: [
                    { role: 'system', content: 'FULL SYSTEM PROMPT WITH [[SEND_EMOJI: 污染表情]] AND TIMESTAMP RULES' },
                    { role: 'user', content: 'full db context line' },
                ],
                mirrorThinking: '主聊天 thinking 污染',
                contextLimit: 1000000,
                historyMsgCount: 2,
                model: 'main-chat-model',
                allowMirrorLookup: true,
            },
            {
                mode: 'heartTalk',
                userMotif: '我想认真聊聊这段关系里让我不安的地方。',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        const serializedMessages = JSON.stringify(body.messages);
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0].content).toContain('## 你是谁');
        expect(body.messages[0].content).toContain('1500 字以上');
        expect(body.messages[0].content).toContain('在 <thinking></thinking> 里走');
        expect(body.messages[0].content).toContain('现在，请以「Marcus」的声音回应。');
        expect(body.messages[0].content).toContain('阿眠 刚把「我想认真聊聊这段关系里让我不安的地方。」递到你面前。');
        expect(body.messages[0].content).not.toContain('[user input]');
        expect(body.messages[0].content).not.toContain('<userinput>');
        expect(body.messages[0].content).not.toContain('__AFTERGLOW_USER_INPUT__');
        expect(body.messages[1].content).toContain('## 阿眠想跟你聊');
        expect(body.messages[1].content).toContain('我想认真聊聊这段关系里让我不安的地方。');
        expect(body.messages[1].content).toContain('请作为Marcus直接回应阿眠这段输入。');
        expect(body.messages[1].content).toContain(longSystemPrompt);
        expect(body.messages[1].content).toContain(longWorldview);
        expect(body.messages[1].content).toContain('完整世界书条目');
        expect(body.messages[1].content).toContain('这条世界书必须完整进入谈心模式');
        expect(body.messages[1].content).toContain('核心评价: 他觉得阿眠敏感但有韧劲。');
        expect(body.messages[1].content).toContain('- 名字: 阿眠');
        expect(serializedMessages).not.toContain('FULL SYSTEM PROMPT WITH');
        expect(serializedMessages).not.toContain('主聊天 thinking 污染');
        expect(result?.body).toBe('2026年4月14日夜里，他把椅子往后挪开半寸。');
        expect(result?.body).not.toContain('内部拆解');
        expect(result?.body).not.toContain('SEND_EMOJI');
        expect(result?.body).not.toContain('[22:15]');
        expect(result?.body).not.toContain('Marcus:');
        expect(String(result?.meta?.html)).not.toContain('内部拆解');
        expect(String(result?.meta?.html)).not.toContain('THINKING');
    });

    it('includes previous assistant thinking in the pre-reply state sensing prompt', async () => {
        mockFetchContent(JSON.stringify({
            excitement: 'stable',
            stability: '-low',
            pressure: '+low',
            closeness: 'stable',
            focus: '+low',
            relief: 'stable',
            energyDrain: '+low',
            goalImpact: 'none',
            scheduleSignal: 'none',
            scheduleReason: '',
        }));

        await MindSnapshotExtractor.senseBefore(
            baseCharacter,
            currentMsgs as any,
            apiConfig,
            '',
            [],
            {
                previousThinking: '上一轮他回复得很克制，但其实在担心对方是不是又熬夜了。',
            },
        );

        const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0][1]?.body));
        expect(body.max_tokens).toBe(65536);
        expect(body.messages[1].content).toContain('上一轮Marcus的内心推演');
        expect(body.messages[1].content).toContain('只用于判断Marcus的情绪惯性');
        expect(body.messages[1].content).toContain('不可把它当作用户事实');
        expect(body.messages[1].content).toContain('上一轮他回复得很克制');
    });

    it('recovers innerVoice from raw output when JSON parsing fails', async () => {
        mockFetchContent('结果如下：\ninnerVoice: "今天不想再拖了，先把这件事做完再说。"');

        const result = await MindSnapshotExtractor.generateInnerVoice(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
        );

        expect(result?.innerVoice).toBe('今天不想再拖了，先把这件事做完再说。');
        expect(dbMocks.saveCharacter).toHaveBeenCalledTimes(1);
    });

    it('truncates classic inner voice text to 120 characters', async () => {
        const overlongInnerVoice = '想把这件事想清楚'.repeat(20);
        mockFetchContent(JSON.stringify({ innerVoice: overlongInnerVoice }));

        const result = await MindSnapshotExtractor.generateInnerVoice(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
        );

        expect(result).not.toBeNull();
        expect(result!.innerVoice.length).toBe(120);
        expect(result!.innerVoice).toBe(overlongInnerVoice.slice(0, 120));
    });

    it('replaces two-digit custom status template captures as full placeholders', async () => {
        const values = Array.from({ length: 11 }, (_, index) => `G${index + 1}`);
        const statusBlock = `<status>\n${values.map((value, index) => `F${index + 1}: ${value}`).join('\n')}\n</status>`;

        mockFetchContent(statusBlock);

        const result = await MindSnapshotExtractor.generateCustomCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            {
                id: 'tpl-custom',
                name: 'custom',
                systemPrompt: '输出 status 字段。',
                extractRegex: `<status>\\s*${values.map((_, index) => `F${index + 1}:\\s*(.*?)`).join('\\s*')}\\s*<\\/status>`,
                htmlTemplate: '<div>$1|$9|$10|$11|$12</div>',
                renderMode: 'html',
            },
        );

        expect(result?.meta?.html).toBe('<div>G1|G9|G10|G11|</div>');
        expect(result?.meta?.allowScripts).not.toBe(true);
    });

    it('marks custom status cards as script-enabled only when the template opts in', async () => {
        mockFetchContent('<status>Text: ready</status>');

        const result = await MindSnapshotExtractor.generateCustomCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            {
                id: 'tpl-script',
                name: 'script template',
                systemPrompt: '输出 status 字段。',
                extractRegex: '<status>\\s*Text:\\s*(.*?)\\s*<\\/status>',
                htmlTemplate: '<div id="root">$1</div><script>document.getElementById("root").dataset.ready = "yes";</script>',
                allowScripts: true,
                renderMode: 'html',
            },
        );

        expect(result?.meta?.html).toContain('<script>');
        expect(result?.meta?.allowScripts).toBe(true);
    });

    it('generates custom status cards from layered templates', async () => {
        mockFetchContent('<status>\nMood: quiet\nPlace: library\n</status>');

        const result = await MindSnapshotExtractor.generateCustomCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            {
                id: 'tpl-layered',
                name: 'layered template',
                systemPrompt: '输出 status 字段。',
                extractRegex: '<status>\\s*Mood:\\s*(.*?)\\s*Place:\\s*(.*?)\\s*<\\/status>',
                htmlBody: '<section class="status-card"><strong>$1</strong><span>$2</span></section>',
                cssTemplate: '.status-card { color: #fff; }',
                jsTemplate: 'document.querySelector(".status-card")?.classList.add("ready");',
                templateVersion: 2,
                allowScripts: true,
                renderMode: 'html',
            },
        );

        expect(result?.meta?.html).toContain('<strong>quiet</strong>');
        expect(result?.meta?.html).toContain('<span>library</span>');
        expect(result?.meta?.html).toContain('.status-card { color: #fff; }');
        expect(result?.meta?.html).toContain('classList.add("ready")');
        expect(result?.meta?.allowScripts).toBe(true);
    });

    it('generates custom status cards from named placeholders without extractRegex', async () => {
        mockFetchContent('<status>\n心情: 安静\n弹幕:\n  - 第一条\n  - 第二条\n</status>');

        const result = await MindSnapshotExtractor.generateCustomCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            {
                id: 'tpl-named',
                name: 'named template',
                systemPrompt: '输出 status 字段。',
                extractRegex: '',
                fields: [
                    { id: 'field_1', name: '心情', description: '当前心情', required: true },
                    { id: 'field_2', name: '弹幕', description: '直播弹幕', required: true, type: 'list' },
                ],
                htmlBody: '<section class="status-card"><strong>{{心情}}</strong><ul>{{#弹幕}}<li>{{.}}</li>{{/弹幕}}</ul></section>',
                cssTemplate: '.status-card { color: #fff; }',
                jsTemplate: 'document.body.dataset.count = String(window.__statusData["弹幕"].length);',
                templateVersion: 2,
                allowScripts: true,
                renderMode: 'html',
            },
        );

        expect(result?.meta?.html).toContain('<strong>安静</strong>');
        expect(result?.meta?.html).toContain('<li>第一条</li><li>第二条</li>');
        expect(result?.meta?.html).toContain('window.__statusData');
        expect(result?.meta?.allowScripts).toBe(true);
    });

    it('uses parsed named fields even when a legacy extractRegex is present', async () => {
        mockFetchContent('<status>\n心情: 安静\nMood: quiet\n</status>');

        const result = await MindSnapshotExtractor.generateCustomCard(
            baseCharacter,
            '我会提前看材料。',
            currentMsgs as any,
            apiConfig,
            {
                id: 'tpl-mixed',
                name: 'mixed template',
                systemPrompt: '输出 status 字段。',
                extractRegex: '<status>[\\s\\S]*?Mood:\\s*(.*?)\\s*<\\/status>',
                fields: [
                    { id: 'field_1', name: '心情', description: '当前心情', required: true },
                ],
                htmlBody: '<section class="status-card"><strong>{{心情}}</strong><span>$1</span></section>',
                templateVersion: 2,
                renderMode: 'html',
            },
        );

        expect(result?.meta?.html).toContain('<strong>安静</strong><span>quiet</span>');
        expect(result?.meta?.html).not.toContain('{{心情}}');
    });
});
