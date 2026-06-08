import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { pinyin } from 'pinyin-pro';
import { DB } from '../utils/db';
import {
    createMemoryRecordDraft,
    produceMemoryRecordAudio,
    reviseMemoryRecordLyrics,
    shouldGenerateMemoryRecordMonologue,
} from '../utils/memoryRecordService';
import { DEFAULT_TTS_CONFIG,type APIConfig,type CharacterProfile,type MemoryRecord,type MemoryRecordMode,type TtsConfig,type UserProfile } from '../types';

const mocks = vi.hoisted(() => ({
    synthesizeSync: vi.fn(),
    generateWithFallback: vi.fn(),
    masterMemoryRecordAudio: vi.fn(),
}));

vi.mock('../utils/minimaxTts', () => ({
    MinimaxTts: {
        synthesizeSync: mocks.synthesizeSync,
    },
}));

vi.mock('../utils/minimaxMusic', () => ({
    MinimaxMusic: {
        generateWithFallback: mocks.generateWithFallback,
    },
}));

vi.mock('../utils/memoryRecordMastering', () => ({
    masterMemoryRecordAudio: mocks.masterMemoryRecordAudio,
}));

const char = {
    id: 'char-sully',
    name: 'Sully',
    avatar: '',
    description: '温柔克制',
    systemPrompt: '他说话像深夜的留白。',
    memories: [],
} as CharacterProfile;

const userProfile: UserProfile = {
    name: '屿屿',
    avatar: '',
    bio: '',
};

const emptyApiConfig: APIConfig = {
    baseUrl: '',
    apiKey: '',
    model: '',
};

const apiConfig: APIConfig = {
    baseUrl: 'https://llm.example.test/v1',
    apiKey: 'llm-key',
    model: 'song-model',
};

function openAiResponse(content: string, finishReason = 'stop'): Response {
    return new Response(JSON.stringify({
        choices: [{ message: { content }, finish_reason: finishReason }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const ttsConfig: TtsConfig = {
    ...DEFAULT_TTS_CONFIG,
    baseUrl: '/minimax-api',
    apiKey: 'mini-key',
    groupId: 'group-id',
    model: 'speech-2.8-hd',
    voiceSetting: {
        voice_id: 'test-voice',
        speed: 1,
        vol: 1,
        pitch: 0,
    },
    audioSetting: {
        audio_sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
    },
    preprocessConfig: {
        enabled: false,
        prompt: '',
        apiBase: '',
        apiKey: '',
        model: '',
    },
};

function makeRecord(mode: MemoryRecordMode): MemoryRecord {
    return {
        id: `mrec-${mode}`,
        charId: char.id,
        charName: char.name,
        userName: userProfile.name,
        mode,
        status: 'draft',
        title: '雾中侧影',
        albumName: '回忆唱片匣',
        artistName: char.name,
        monologueText: shouldGenerateMemoryRecordMonologue(mode) ? '先听我说完这一段，再让梦继续往下走。' : '',
        lyrics: '[Verse]\n雾里有人回头',
        musicPrompt: 'dreamy cinematic mandopop, 78 bpm',
        coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
        seedMemoryIds: ['memory-a'],
        createdAt: 100,
        updatedAt: 100,
    };
}

const releaseReadyLyrics = `[Intro]
雨声落在门外
旧伞停在站牌

[Verse 1]
你把旧称翻出来
我把回复删又改
楼下风吹过站牌
那句晚安没说白

[Pre Chorus]
走廊只剩风声徘徊
折叠床被悄悄撤开
她把旧照片递过来
我忽然不敢移开

[Chorus]
靠近一点别走开
把没说完都唱出来
晚风停在旧站牌
我们还是没说拜

[Verse 2]
办公桌茶凉下来
凌晨钟声慢半拍
旧照片还没摊开
八年忽然坐回来

[Bridge]
清醒停了一秒
理智被夜色绊倒
旧账翻到最后一页
我却没能退掉

[Final Chorus]
靠近一点别走开
把没说完都唱出来
晚风停在旧站牌
我们还是没说拜

[Outro]
雨停以后
门还留着缝`;

const scatteredRhymeLyrics = `[Intro]
旧门牌还亮着
风停在楼下

[Verse 1]
时区没差十三个小时
定位径直跳回了京海
一条带着酒气的语音
停在八年前的旧称谓

[Pre Chorus]
走廊只剩风声
折叠床被撤走
她递来旧抓拍
我没找到出口

[Chorus]
熟知这座城每条向上的路
却被一句玩笑截断了退路
确实想见越过八年的空白
我也想压在三月的结尾

[Verse 2]
四月凌晨的钟表
能回答所有问号
办公桌上凉透的茶水
顺着荒诞剧本往回追

[Bridge]
清醒停在这一秒钟
理智输给深夜胡闹
旧账翻过最后一页
心事没有落点

[Final Chorus]
熟知这座城每条向上的路
却被一句玩笑截断了退路
确实想见越过八年的空白
后来在规则里认了输

[Outro]
对话框问着睡了没
那扇门后来没反锁`;

function sectionLines(lyrics: string, sectionName: string): string[] {
    const target = sectionName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
    const lines: string[] = [];
    let current = '';

    lyrics.split(/\r?\n/).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;
        const sectionMatch = line.match(/^\[([^\]\r\n]+)\]$/);
        if (sectionMatch) {
            current = sectionMatch[1].toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
            return;
        }
        if (current === target) lines.push(line);
    });

    return lines;
}

function lineRhymeKey(line: string): string {
    const chars = line.match(/[\u4e00-\u9fff]/g) || [];
    const lastChar = chars[chars.length - 1] || '';
    const finalBody = pinyin(lastChar, { toneType: 'none', pattern: 'finalBody', type: 'array', nonZh: 'removed' })[0] || '';
    const finalTail = pinyin(lastChar, { toneType: 'none', pattern: 'finalTail', type: 'array', nonZh: 'removed' })[0] || '';
    return `${finalBody}${finalTail}`;
}

function maxRhymeGroupSize(lines: string[]): number {
    const counts = new Map<string, number>();
    lines.forEach(line => {
        const key = lineRhymeKey(line);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Math.max(0, ...counts.values());
}

describe('memory record draft fallback', () => {
    beforeEach(async () => {
        Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
        Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
        Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true });
        mocks.synthesizeSync.mockReset();
        mocks.generateWithFallback.mockReset();
        mocks.masterMemoryRecordAudio.mockReset();
        vi.unstubAllGlobals();
    });

    it('uses a track-like fallback title instead of appending 留声 to raw memory titles', async () => {
        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [{
                id: 'memory-a',
                title: '与屿屿正式开启周专绑关系',
                content: '他们把一段关系郑重地放进了共同生活里。',
                importance: 7,
                createdAt: 100,
            }],
            apiConfig: emptyApiConfig,
        });

        expect(draft.title).not.toContain('与屿屿正式开启周专绑关系');
        expect(draft.title).not.toMatch(/留声$/);
        expect(draft.id).toMatch(/^(nocturne|afterglow|murmur|moonlit|echo)-\d{8}-[a-z0-9]{6}$/);
        expect(draft.coverImageUrl).toMatch(/^\/images\/music-record-covers\/cover-\d{2}\.(jpg|png)$/);
    });

    it('does not add fallback monologues for non-monologue modes', async () => {
        for (const mode of ['blind_box', 'relationship_theme', 'selected_memory'] as MemoryRecordMode[]) {
            const draft = await createMemoryRecordDraft({
                char,
                userProfile,
                mode,
                memories: [],
                apiConfig: emptyApiConfig,
            });

            expect(draft.monologueText).toBe('');
        }
    });

    it('keeps fallback monologues for char_to_user and dream_mix', async () => {
        for (const mode of ['char_to_user', 'dream_mix'] as MemoryRecordMode[]) {
            const draft = await createMemoryRecordDraft({
                char,
                userProfile,
                mode,
                memories: [],
                apiConfig: emptyApiConfig,
            });

            expect(draft.monologueText.length).toBeGreaterThan(0);
        }
    });

    it('creates and polishes a lyrics draft without calling MiniMax', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '雨停以后',
                albumName: '回忆唱片匣',
                artistName: 'Sully',
                monologueText: '',
                lyrics: '[Verse 1]\n雨停在门口\n你把伞收好\n[Chorus]\n靠近一点点\n靠近一点点',
                musicPrompt: 'soft mandopop, 76 bpm, warm male vocal',
                coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            })))
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '雨停以后',
                style_prompt: 'polished intimate mandopop, 76 bpm, warm male vocal, piano and brushed drums',
                lyrics: releaseReadyLyrics,
            })));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [],
            apiConfig,
            contextBudget: 'expanded',
            songRequest: {
                theme: '雨夜重逢',
                mood: '暧昧但克制',
                style: '抒情流行',
                perspective: '我对你唱',
                voicePreference: '温柔男声',
                extraRequirements: '副歌要有 Hook',
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mocks.generateWithFallback).not.toHaveBeenCalled();
        expect(draft.status).toBe('draft');
        expect(draft.musicPrompt).toContain('polished intimate mandopop');
        expect(draft.lyrics).toContain('[Final Chorus]');
        expect(draft.songRequest?.theme).toBe('雨夜重逢');

        const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(firstBody.messages[1].content).toContain('【用户写歌需求】');
        expect(firstBody.messages[1].content).toContain('歌曲主题：雨夜重逢');
        expect(firstBody.temperature).toBe(1.5);
        expect(firstBody.max_tokens).toBe(16000);
        const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
        expect(secondBody.temperature).toBe(0.72);
        expect(secondBody.max_tokens).toBe(16000);
    });

    it('keeps the initial draft when lyric self-check returns invalid JSON', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '旧门牌',
                albumName: '回忆唱片匣',
                artistName: 'Sully',
                monologueText: '',
                lyrics: releaseReadyLyrics,
                musicPrompt: 'lo-fi mandopop',
                coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            })))
            .mockResolvedValueOnce(openAiResponse('这次我不小心写了说明文字'));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'blind_box',
            memories: [],
            apiConfig,
            songRequest: {
                theme: '旧门牌',
                mood: '安静',
                style: 'lo-fi pop',
                perspective: '旁观者',
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(draft.title).toBe('旧门牌');
        expect(draft.musicPrompt).toBe('lo-fi mandopop');
        expect(draft.lyrics).toBe(releaseReadyLyrics);
        expect(draft.error).toContain('歌词自检/润色 JSON 解析失败');
        expect(mocks.generateWithFallback).not.toHaveBeenCalled();
    });

    it('does not replace a complete draft with truncated polished lyrics', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '雨停以后',
                albumName: '回忆唱片匣',
                artistName: 'Sully',
                monologueText: '',
                lyrics: releaseReadyLyrics,
                musicPrompt: 'soft mandopop, 76 bpm',
                coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            })))
            .mockResolvedValueOnce(openAiResponse('{"title":"半截","style_prompt":"lo-fi drums","lyrics":"[Intro]\\n嗯\\n\\n[Verse 1]\\n菜单划掉\\n带亮的选项\\n\\n[Pre Chorus]\\n没关系'));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [],
            apiConfig,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(draft.title).toBe('雨停以后');
        expect(draft.lyrics).toBe(releaseReadyLyrics);
        expect(draft.lyrics).not.toContain('菜单划掉');
        expect(draft.error).toContain('歌词自检/润色 JSON 解析失败');
    });

    it('falls back when a structurally complete lyric has scattered rhymes', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '散开的旧称',
                albumName: '回忆唱片匣',
                artistName: 'Sully',
                monologueText: '',
                lyrics: scatteredRhymeLyrics,
                musicPrompt: 'soft mandopop, 76 bpm',
                coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            })))
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '散开的旧称',
                style_prompt: 'soft mandopop, 76 bpm, close vocal, felt piano',
                lyrics: scatteredRhymeLyrics,
            })));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [],
            apiConfig,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(draft.lyrics).toContain('[Final Chorus]');
        expect(draft.lyrics).not.toContain('时区没差十三个小时');
        expect(draft.error).toContain('歌词押韵验收未通过');
        expect(maxRhymeGroupSize(sectionLines(draft.lyrics, 'Chorus'))).toBeGreaterThanOrEqual(3);
        expect(maxRhymeGroupSize(sectionLines(draft.lyrics, 'Final Chorus'))).toBeGreaterThanOrEqual(3);
    });

    it('keeps a structurally complete lyric with acceptable rhymes', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '旧伞站牌',
                albumName: '回忆唱片匣',
                artistName: 'Sully',
                monologueText: '',
                lyrics: scatteredRhymeLyrics,
                musicPrompt: 'soft mandopop, 76 bpm',
                coverGradient: 'linear-gradient(135deg, #f7d6e0, #2d3142)',
            })))
            .mockResolvedValueOnce(openAiResponse(JSON.stringify({
                title: '旧伞站牌',
                style_prompt: 'soft mandopop, 76 bpm, close vocal, felt piano',
                lyrics: releaseReadyLyrics,
            })));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [],
            apiConfig,
        });

        expect(draft.lyrics).toBe(releaseReadyLyrics);
        expect(draft.error).toBeUndefined();
        expect(maxRhymeGroupSize(sectionLines(draft.lyrics, 'Chorus'))).toBeGreaterThanOrEqual(3);
        expect(maxRhymeGroupSize(sectionLines(draft.lyrics, 'Final Chorus'))).toBeGreaterThanOrEqual(3);
    });

    it('falls back instead of saving a draft when the provider reports a token cutoff', async () => {
        const fetchMock = vi.fn().mockResolvedValue(openAiResponse(
            '{"title":"半截","albumName":"回忆唱片匣","artistName":"Sully","monologueText":"","lyrics":"[Intro]\\n嗯\\n\\n[Verse 1]\\n菜单划掉',
            'length',
        ));
        vi.stubGlobal('fetch', fetchMock);

        const draft = await createMemoryRecordDraft({
            char,
            userProfile,
            mode: 'relationship_theme',
            memories: [],
            apiConfig,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(draft.lyrics).toContain('[Final Chorus]');
        expect(draft.lyrics).not.toContain('菜单划掉');
        expect(draft.error).toContain('max_tokens');
    });

    it('revises lyrics from the current editable version and instruction', async () => {
        const fetchMock = vi.fn().mockResolvedValue(openAiResponse(JSON.stringify({
            title: '更近一点',
            style_prompt: 'sensual warm R&B, 82 bpm, breathy female vocal, late-night keys',
            lyrics: releaseReadyLyrics,
        })));
        vi.stubGlobal('fetch', fetchMock);

        const revised = await reviseMemoryRecordLyrics({
            record: {
                ...makeRecord('blind_box'),
                lyrics: '[Verse 1]\n你站在门口\n[Chorus]\n靠近我',
                musicPrompt: 'warm pop',
            },
            apiConfig,
            instruction: '副歌更暧昧一点，更适合女声',
        });

        expect(revised.title).toBe('更近一点');
        expect(revised.stylePrompt).toContain('breathy female vocal');
        expect(revised.lyrics).toContain('[Final Chorus]');
        const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(body.messages[1].content).toContain('副歌更暧昧一点');
        expect(body.messages[1].content).toContain('warm pop');
        expect(body.max_tokens).toBe(16000);
    });

    it('skips TTS and mastering for non-monologue modes', async () => {
        mocks.generateWithFallback.mockResolvedValue({
            blob: new Blob(['music'], { type: 'audio/mpeg' }),
            model: 'music-2.6',
            fallbackUsed: false,
            durationMs: 90000,
        });

        const result = await produceMemoryRecordAudio({
            record: makeRecord('blind_box'),
            char,
            ttsConfig: { ...ttsConfig, groupId: '' },
        });

        expect(result.status).toBe('ready');
        expect(result.monologueText).toBe('');
        expect(result.musicAudioId).toBe('mrec-blind_box:music');
        expect(result.monologueAudioId).toBeUndefined();
        expect(result.masterAudioId).toBeUndefined();
        expect(mocks.generateWithFallback).toHaveBeenCalledWith(expect.objectContaining({
            baseUrl: undefined,
            groupId: '',
            prompt: 'dreamy cinematic mandopop, 78 bpm',
            lyrics: '[Verse]\n雾里有人回头',
        }));
        expect(mocks.synthesizeSync).not.toHaveBeenCalled();
        expect(mocks.masterMemoryRecordAudio).not.toHaveBeenCalled();
        expect(await DB.getMemoryRecordAudio('mrec-blind_box:music')).toBeInstanceOf(Blob);
    });

    it('stores a retryable failed state when music generation is aborted', async () => {
        mocks.generateWithFallback.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

        const result = await produceMemoryRecordAudio({
            record: {
                ...makeRecord('relationship_theme'),
                error: '歌词草稿请求超时，已使用本地兜底草稿，请确认后再生成歌曲。',
            },
            char,
            ttsConfig,
        });

        expect(result.status).toBe('failed');
        expect(result.error).toContain('歌词草稿请求超时');
        expect(result.error).toContain('音频生成请求超时或被中止');
        expect(mocks.synthesizeSync).not.toHaveBeenCalled();
        expect(mocks.masterMemoryRecordAudio).not.toHaveBeenCalled();
    });

    it('creates monologue, music, and master tracks for monologue modes', async () => {
        mocks.synthesizeSync.mockResolvedValue({
            blob: new Blob(['monologue'], { type: 'audio/mpeg' }),
            url: 'blob:monologue',
        });
        mocks.generateWithFallback.mockResolvedValue({
            blob: new Blob(['music'], { type: 'audio/mpeg' }),
            model: 'music-2.6',
            fallbackUsed: false,
            durationMs: 90000,
        });
        mocks.masterMemoryRecordAudio.mockResolvedValue({
            blob: new Blob(['master'], { type: 'audio/mpeg' }),
            durationMs: 125000,
            musicOffsetMs: 35000,
        });

        const result = await produceMemoryRecordAudio({
            record: makeRecord('dream_mix'),
            char,
            ttsConfig,
        });

        expect(result.status).toBe('ready');
        expect(result.monologueAudioId).toBe('mrec-dream_mix:monologue');
        expect(result.musicAudioId).toBe('mrec-dream_mix:music');
        expect(result.masterAudioId).toBe('mrec-dream_mix:master');
        expect(result.durationMs).toBe(125000);
        expect(result.lyricsOffsetMs).toBe(35000);
        expect(mocks.synthesizeSync).toHaveBeenCalledTimes(1);
        expect(mocks.masterMemoryRecordAudio).toHaveBeenCalledTimes(1);
        expect(await DB.getMemoryRecordAudio('mrec-dream_mix:master')).toBeInstanceOf(Blob);
    });

    it('reuses existing monologue and music tracks when retrying a partial monologue record', async () => {
        const partial = {
            ...makeRecord('dream_mix'),
            status: 'failed',
            monologueAudioId: 'mrec-dream_mix:monologue',
            musicAudioId: 'mrec-dream_mix:music',
            durationMs: 90000,
            error: '最终压制失败',
        } as MemoryRecord;

        await DB.saveMemoryRecordAudio({
            id: partial.monologueAudioId!,
            recordId: partial.id,
            kind: 'monologue',
            blob: new Blob(['monologue'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            createdAt: 101,
        });
        await DB.saveMemoryRecordAudio({
            id: partial.musicAudioId!,
            recordId: partial.id,
            kind: 'music',
            blob: new Blob(['music'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 90000,
            createdAt: 102,
        });
        mocks.masterMemoryRecordAudio.mockResolvedValue({
            blob: new Blob(['master'], { type: 'audio/mpeg' }),
            durationMs: 120000,
            musicOffsetMs: 30000,
        });

        const result = await produceMemoryRecordAudio({
            record: partial,
            char,
            ttsConfig: { ...ttsConfig, apiKey: '', groupId: '' },
        });

        expect(result.status).toBe('ready');
        expect(result.masterAudioId).toBe('mrec-dream_mix:master');
        expect(result.durationMs).toBe(120000);
        expect(result.lyricsOffsetMs).toBe(30000);
        expect(mocks.synthesizeSync).not.toHaveBeenCalled();
        expect(mocks.generateWithFallback).not.toHaveBeenCalled();
        expect(mocks.masterMemoryRecordAudio).toHaveBeenCalledTimes(1);
    });

    it('falls back to the music track when browser mastering fails', async () => {
        mocks.synthesizeSync.mockResolvedValue({
            blob: new Blob(['monologue'], { type: 'audio/mpeg' }),
            url: 'blob:monologue',
        });
        mocks.generateWithFallback.mockResolvedValue({
            blob: new Blob(['music'], { type: 'audio/mpeg' }),
            model: 'music-2.6',
            fallbackUsed: false,
            durationMs: 90000,
        });
        mocks.masterMemoryRecordAudio.mockRejectedValue(new Error('decode failed'));

        const result = await produceMemoryRecordAudio({
            record: makeRecord('char_to_user'),
            char,
            ttsConfig,
        });

        expect(result.status).toBe('ready');
        expect(result.musicAudioId).toBe('mrec-char_to_user:music');
        expect(result.masterAudioId).toBeUndefined();
        expect(result.durationMs).toBe(90000);
        expect(result.lyricsOffsetMs).toBeUndefined();
        expect(result.error).toContain('已改用音乐分轨播放');
        expect(await DB.getMemoryRecordAudio('mrec-char_to_user:music')).toBeInstanceOf(Blob);
        expect(await DB.getMemoryRecordAudio('mrec-char_to_user:master')).toBeNull();
    });

    it('force remasters instead of reusing an existing broken master', async () => {
        const partial = {
            ...makeRecord('dream_mix'),
            status: 'ready',
            monologueAudioId: 'mrec-dream_mix:monologue',
            musicAudioId: 'mrec-dream_mix:music',
            masterAudioId: 'mrec-dream_mix:master',
            durationMs: 90000,
            error: '最终压制使用兜底拼接：MPEGMode is not defined',
        } as MemoryRecord;

        await DB.saveMemoryRecordAudio({
            id: partial.monologueAudioId!,
            recordId: partial.id,
            kind: 'monologue',
            blob: new Blob(['monologue'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            createdAt: 101,
        });
        await DB.saveMemoryRecordAudio({
            id: partial.musicAudioId!,
            recordId: partial.id,
            kind: 'music',
            blob: new Blob(['music'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 90000,
            createdAt: 102,
        });
        await DB.saveMemoryRecordAudio({
            id: partial.masterAudioId!,
            recordId: partial.id,
            kind: 'master',
            blob: new Blob(['old broken master'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 90000,
            createdAt: 103,
        });
        mocks.masterMemoryRecordAudio.mockResolvedValue({
            blob: new Blob(['new master'], { type: 'audio/mpeg' }),
            durationMs: 120000,
            musicOffsetMs: 30000,
        });

        const result = await produceMemoryRecordAudio({
            record: partial,
            char,
            ttsConfig: { ...ttsConfig, apiKey: '', groupId: '' },
            forceRemaster: true,
        });

        const masterBlob = await DB.getMemoryRecordAudio('mrec-dream_mix:master');
        expect(result.status).toBe('ready');
        expect(result.masterAudioId).toBe('mrec-dream_mix:master');
        expect(result.error).toBeUndefined();
        expect(result.durationMs).toBe(120000);
        expect(result.lyricsOffsetMs).toBe(30000);
        expect(mocks.masterMemoryRecordAudio).toHaveBeenCalledTimes(1);
        expect(await masterBlob?.text()).toBe('new master');
    });
});
