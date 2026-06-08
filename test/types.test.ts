import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db', () => ({
    DB: {
        getRecentMessagesByCharId: vi.fn(),
        saveAnniversary: vi.fn(),
        saveMessage: vi.fn(),
        saveScheduledMessage: vi.fn(),
        updateMessageMetadata: vi.fn(),
        getLatestHotNewsSnapshot: vi.fn(),
    },
}));

vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: {
        checkPermissions: vi.fn(),
        schedule: vi.fn(),
    },
}));

let typesModule: typeof import('../types');
let chatParserModule: typeof import('../utils/chatParser');
let realtimeServiceModule: typeof import('../utils/services/realtimeService');

// Test the types barrel export — ensures all type modules resolve correctly
describe('Types barrel export', () => {
    beforeAll(async () => {
        typesModule = await import('../types');
    }, 20000);

    it('should export AppID enum', () => {
        expect(typesModule.AppID).toBeDefined();
        expect(typesModule.AppID.Chat).toBe('chat');
        expect(typesModule.AppID.Launcher).toBe('launcher');
    });

    it('should export all key interfaces as importable symbols', () => {
        // These are type-only exports, but the module should resolve without error
        expect(typesModule).toBeDefined();
    });
});

describe('Hot news card IDs', () => {
    beforeAll(async () => {
        realtimeServiceModule = await import('../utils/services/realtimeService');
    }, 20000);

    it('generates stable IDs without platform or rank collisions', () => {
        const { buildHotNewsCardId } = realtimeServiceModule;
        const a = buildHotNewsCardId('B站', '2026-06-06#3', 2, '公测定档 7月！');
        const b = buildHotNewsCardId('bilibili', '2026-06-06#3', 2, '公测定档 7月！');
        const differentPlatform = buildHotNewsCardId('微博', '2026-06-06#3', 2, '公测定档 7月！');
        const differentRank = buildHotNewsCardId('B站', '2026-06-06#3', 3, '公测定档 7月！');

        expect(a).toBe(b);
        expect(a).toContain('bilibili:2026-06-06#3:2:');
        expect(differentPlatform).not.toBe(a);
        expect(differentRank).not.toBe(a);
    });
});

// Test pure utility: chatParser
describe('ChatParser', () => {
    beforeAll(async () => {
        chatParserModule = await import('../utils/chatParser');
    }, 20000);

    it('should be importable', () => {
        expect(chatParserModule.ChatParser).toBeDefined();
    });

    it('cleanAiSecondPass normalises all sticker tag variants', () => {
        const { ChatParser } = chatParserModule;
        // Standard (no change needed)
        expect(ChatParser.cleanAiSecondPass('[[SEND_EMOJI: 揉脸]]')).toContain('[[SEND_EMOJI: 揉脸]]');
        // With subject (original behavior)
        expect(ChatParser.cleanAiSecondPass('[你 发送了表情包: 揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        expect(ChatParser.cleanAiSecondPass('[用户 发送了表情包: 抱抱卡]')).toContain('[[SEND_EMOJI: 抱抱卡]]');
        // Without subject (NEW — was broken)
        expect(ChatParser.cleanAiSecondPass('[发送表情包: 揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        // Full-width colon
        expect(ChatParser.cleanAiSecondPass('[发送表情包：揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        // Chinese brackets
        expect(ChatParser.cleanAiSecondPass('【发送表情包: 揉脸】')).toContain('[[SEND_EMOJI: 揉脸]]');
        // Without 包
        expect(ChatParser.cleanAiSecondPass('[发送表情: 揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        // Subject 我
        expect(ChatParser.cleanAiSecondPass('[我发送了表情包: 揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        // Degraded weak-model logs with directional/traditional wording
        expect(ChatParser.cleanAiSecondPass('[{{char}}向你發送表情包：揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        expect(ChatParser.cleanAiSecondPass('[糯米向你发送表情包：揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
        expect(ChatParser.cleanAiSecondPass('[夏以昼发送了表情包: 酷_墨镜耍帅]')).toContain('[[SEND_EMOJI: 酷_墨镜耍帅]]');
        expect(ChatParser.cleanAiSecondPass('[发送貼圖：揉脸]')).toContain('[[SEND_EMOJI: 揉脸]]');
    });

    it('normalises degraded transfer action variants', async () => {
        const { ChatParser } = chatParserModule;
        const dbModule = await import('../utils/db');
        const saveMessage = dbModule.DB.saveMessage as any;

        expect(ChatParser.cleanAiSecondPass('[{{char}}向你轉帳：¥52.00]')).toContain('[[ACTION:TRANSFER:52.00]]');
        expect(ChatParser.cleanAiSecondPass('[糯米给你转账: 52]')).toContain('[[ACTION:TRANSFER:52]]');
        expect(ChatParser.cleanAiSecondPass('[{{char}}收取了你的轉帳]')).toContain('[[ACTION:RECEIVE_TRANSFER]]');
        expect(ChatParser.cleanAiSecondPass('[{{char}}退還了你的轉帳]')).toContain('[[ACTION:RETURN_TRANSFER]]');

        saveMessage.mockClear();
        await ChatParser.parseAndExecuteActions('[{{char}}向你轉帳：¥52.00]', 'char-1', '糯米', vi.fn());
        expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'char-1',
            role: 'assistant',
            type: 'transfer',
            metadata: { amount: '52.00', status: 'pending' },
        }));
    });

    it('normalises song share tags and removes bracket-only wrappers', () => {
        const { ChatParser } = chatParserModule;

        expect(ChatParser.cleanAiSecondPass('[SHARE_SONG：晴天｜周杰伦｜0]')).toBe('[[SHARE_SONG: 晴天｜周杰伦｜0]]');
        expect(ChatParser.cleanAiSecondPass('[\n[[SHARE_SONG: 晴天 | 周杰伦 | 0]]\n]')).toBe('[[SHARE_SONG: 晴天 | 周杰伦 | 0]]');

        const parts = ChatParser.splitResponse('[\n[SHARE_SONG：歌名：晴天｜歌手：周杰伦｜歌曲ID：0]\n]') as any[];
        expect(parts).toHaveLength(1);
        expect(parts[0]).toMatchObject({
            type: 'song',
            content: {
                songName: '晴天',
                artist: '周杰伦',
                songId: 0,
            },
        });
    });

    it('turns NEWS_CARD tags into dedicated news card messages', async () => {
        const { ChatParser } = chatParserModule;
        const dbModule = await import('../utils/db');
        const saveMessage = dbModule.DB.saveMessage as any;
        const getLatestHotNewsSnapshot = dbModule.DB.getLatestHotNewsSnapshot as any;

        getLatestHotNewsSnapshot.mockResolvedValue({
            items: [
                { title: '测试热点标题', source: '微博', url: 'https://example.com/news', desc: '测试简介' },
            ],
        });
        saveMessage.mockClear();

        const cleaned = await ChatParser.parseAndExecuteActions(
            '我刚看到这个。[[NEWS_CARD: 微博|测试热点标题]] 你怎么看？',
            'char-1',
            '糯米',
            vi.fn(),
        );

        expect(cleaned).toBe('我刚看到这个。 你怎么看？');
        expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'char-1',
            role: 'assistant',
            type: 'news_card',
            metadata: expect.objectContaining({
                source: '微博',
                title: '测试热点标题',
                url: 'https://example.com/news',
                desc: '测试简介',
            }),
        }));
    });

    it('turns degraded natural hot topic shares into news card messages', async () => {
        const { ChatParser } = chatParserModule;
        const dbModule = await import('../utils/db');
        const saveMessage = dbModule.DB.saveMessage as any;
        const getLatestHotNewsSnapshot = dbModule.DB.getLatestHotNewsSnapshot as any;

        getLatestHotNewsSnapshot.mockResolvedValue({
            id: '2026-06-07#1',
            fetchedAt: 1780800000000,
            items: [
                { title: '高考', source: '微博', platform: 'weibo', rank: 1, url: 'https://weibo.com/hot/demo', desc: '高考热点' },
            ],
        });
        saveMessage.mockClear();

        const cleaned = await ChatParser.parseAndExecuteActions(
            '【你分享了一个热点：「高考」\n（来源：微博）】',
            'char-1',
            '糯米',
            vi.fn(),
        );

        expect(cleaned).toBe('');
        expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'char-1',
            role: 'assistant',
            type: 'news_card',
            metadata: expect.objectContaining({
                source: '微博',
                title: '高考',
                url: 'https://weibo.com/hot/demo',
                desc: '高考热点',
                platform: 'weibo',
                rank: 1,
            }),
        }));
    });

    it('turns NEWS_CARD_ID tags into linked news card messages', async () => {
        const { ChatParser } = chatParserModule;
        const dbModule = await import('../utils/db');
        const saveMessage = dbModule.DB.saveMessage as any;
        const getLatestHotNewsSnapshot = dbModule.DB.getLatestHotNewsSnapshot as any;
        const cardId = 'bilibili:2026-06-06#3:1:b站新番开播';

        getLatestHotNewsSnapshot.mockResolvedValue({
            id: '2026-06-06#3',
            fetchedAt: 1780740000000,
            items: [
                { id: cardId, cardId, title: 'B站新番开播', source: 'B站', platform: 'bilibili', rank: 1, url: 'https://bilibili.com/video/demo', desc: '追番提醒' },
            ],
        });
        saveMessage.mockClear();

        const cleaned = await ChatParser.parseAndExecuteActions(
            `刚刷到这个。[[NEWS_CARD_ID: ${cardId}]]\n要不要一起看？`,
            'char-1',
            '糯米',
            vi.fn(),
        );

        expect(cleaned).toBe('刚刷到这个。\n要不要一起看？');
        expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
            charId: 'char-1',
            role: 'assistant',
            type: 'news_card',
            metadata: expect.objectContaining({
                source: 'B站',
                title: 'B站新番开播',
                url: 'https://bilibili.com/video/demo',
                desc: '追番提醒',
                platform: 'bilibili',
                rank: 1,
                cardId,
            }),
        }));
    });

    it('normalises JSON-wrapped replies and escaped newlines before saving', () => {
        const { ChatParser } = chatParserModule;

        expect(ChatParser.sanitize('"早安\\n想你了"')).toBe('早安\n想你了');
        expect(ChatParser.sanitize('{"content":"[2026-02-11 13:52] Sully: 早\\n安"}')).toBe('早\n安');
        expect(ChatParser.sanitize('```json\n{"message":{"content":"[13:52] Sully: 看到啦\\n马上来"}}\n```')).toBe('看到啦\n马上来');
        expect(ChatParser.sanitize('2026/02/11 13:52 Sully：第一句\\n[下午1:53] Sully: 第二句')).toBe('第一句\n第二句');
        expect(ChatParser.sanitize('12:30 我会到')).toBe('12:30 我会到');
    });

    it('strips leaked assistant voice history labels without breaking real voice tags', () => {
        const { ChatParser } = chatParserModule;

        expect(ChatParser.sanitize('[你上一条语音] 还有，人都躺在我怀里了。')).toBe('还有，人都躺在我怀里了。');
        expect(ChatParser.sanitize('【你上一条语音】凑过来点，bb。')).toBe('凑过来点，bb。');
        expect(ChatParser.cleanAiSecondPass('[你上一条语音（6秒）] 晚安。')).toBe('晚安。');
        expect(ChatParser.sanitize('【语音消息：晚安。】')).toBe('【语音消息：晚安。】');
    });

    it('strips leaked reply context labels from visible replies', () => {
        const { ChatParser } = chatParserModule;

        expect(ChatParser.sanitize('引用回复上下文：这条消息正在回复初时峙的消息「你刚刚叫我什么？」。本条消息正文：我的错，一时嘴快。')).toBe('我的错，一时嘴快。');
        expect(ChatParser.sanitize('这条消息正在回复初时峙的消息「你刚刚叫我什么？」。本条消息正文：我的错。')).toBe('我的错。');
        expect(ChatParser.hasDisplayContent('引用回复上下文：这条消息正在回复初时峙的消息「你刚刚叫我什么？」。本条消息正文：')).toBe(false);
    });

    it('keeps chat control markers while normalising escaped formatting', () => {
        const { ChatParser } = chatParserModule;

        expect(ChatParser.sanitize('原文\\n%%BILINGUAL%%\\nTranslation')).toBe('原文\n%%BILINGUAL%%\nTranslation');
        expect(ChatParser.cleanAiSecondPass('[[SEND_EMOJI: 揉脸]]\\n[[SHARE_SONG: 晴天 | 周杰伦 | 0]]')).toBe('[[SEND_EMOJI: 揉脸]]\n[[SHARE_SONG: 晴天 | 周杰伦 | 0]]');
    });

    it('strips leaked photo director summary blocks from visible replies', () => {
        const { ChatParser } = chatParserModule;
        const leaked = [
            '等我一下。',
            '画面：蓝山巷小院温馨复古的木质中岛台。',
            '镜头：中近景，主观视角俯拍。',
            '氛围：温馨、烟火气、诱惑。',
        ].join('\n');

        expect(ChatParser.cleanAiSecondPass(leaked)).toBe('等我一下。');
        expect(ChatParser.sanitize(leaked)).toBe('等我一下。');
        expect(ChatParser.sanitize('画面：窗边自拍\n镜头：中近景\n氛围：柔和')).toBe('');
        expect(ChatParser.sanitize('这个画面：真的很像旧电影。')).toBe('这个画面：真的很像旧电影。');
    });
});
