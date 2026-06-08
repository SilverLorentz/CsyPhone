import { describe, expect, it } from 'vitest';
import {
    buildPersistedCallAudioEntries,
    buildPersistedCallConversation,
    buildVoiceCallAudioLookupKeys,
    filterPersistedCallHistory,
    VOICE_CALL_OPENING_PROMPT,
} from '../apps/voicecall/callLogPersistence';
import {
    getVoiceCallVisibleText,
    sanitizeVoiceCallAssistantText,
} from '../apps/voicecall/voiceCallTextSanitizer';

describe('voice call persistence', () => {
    it('filters the internal opening prompt before rendering and storage', () => {
        const history = [
            { role: 'user', content: VOICE_CALL_OPENING_PROMPT },
            { role: 'assistant', content: '喂，我在。', audioBlob: new Blob(['a'], { type: 'audio/wav' }) },
            { role: 'user', content: '你在干嘛' },
            { role: 'assistant', content: '刚刚在想你。', audioBlob: new Blob(['b'], { type: 'audio/wav' }) },
        ];

        expect(filterPersistedCallHistory(history)).toEqual([
            history[1],
            history[2],
            history[3],
        ]);

        expect(buildPersistedCallConversation(history)).toEqual([
            { role: 'assistant', content: '喂，我在。', hasAudio: true },
            { role: 'user', content: '你在干嘛' },
            { role: 'assistant', content: '刚刚在想你。', hasAudio: true },
        ]);
    });

    it('uses filtered conversation indexes when saving call audio blobs', () => {
        const firstBlob = new Blob(['a'], { type: 'audio/wav' });
        const secondBlob = new Blob(['b'], { type: 'audio/wav' });
        const history = [
            { role: 'user', content: VOICE_CALL_OPENING_PROMPT },
            { role: 'assistant', content: '第一句', audioBlob: firstBlob },
            { role: 'user', content: '第二句' },
            { role: 'assistant', content: '第三句', audioBlob: secondBlob },
        ];

        expect(buildPersistedCallAudioEntries(42, history)).toEqual([
            { key: 'call_42_0', blob: firstBlob },
            { key: 'call_42_2', blob: secondBlob },
        ]);
    });

    it('persists low-memory call history as text only without audio entries', () => {
        const history = [
            { role: 'user', content: VOICE_CALL_OPENING_PROMPT },
            { role: 'assistant', content: '第一句' },
            { role: 'user', content: '第二句' },
            { role: 'assistant', content: '第三句' },
        ];

        expect(buildPersistedCallConversation(history)).toEqual([
            { role: 'assistant', content: '第一句' },
            { role: 'user', content: '第二句' },
            { role: 'assistant', content: '第三句' },
        ]);
        expect(buildPersistedCallAudioEntries(42, history)).toEqual([]);
    });

    it('supports legacy lookup keys for cards saved before the prompt offset fix', () => {
        expect(buildVoiceCallAudioLookupKeys(42, 0)).toEqual([
            'call_42_0',
        ]);

        expect(buildVoiceCallAudioLookupKeys(42, 0, true)).toEqual([
            'call_42_0',
            'call_42_1',
        ]);
    });

    it('does not expose or save assistant audio for the text reply channel', () => {
        const firstBlob = new Blob(['a'], { type: 'audio/wav' });
        const secondBlob = new Blob(['b'], { type: 'audio/wav' });
        const history = [
            { role: 'assistant', content: '文字通道第一句', audioBlob: firstBlob },
            { role: 'user', content: '我还可以说话' },
            { role: 'assistant', content: '但我只显示文字', audioBlob: secondBlob },
        ];

        expect(buildPersistedCallConversation(history, 'text')).toEqual([
            { role: 'assistant', content: '文字通道第一句' },
            { role: 'user', content: '我还可以说话' },
            { role: 'assistant', content: '但我只显示文字' },
        ]);
        expect(buildPersistedCallAudioEntries(42, history, 'text')).toEqual([]);
    });

    it('strips assistant translation tags and emotion directions but preserves user parentheses', () => {
        expect(sanitizeVoiceCallAssistantText('(laughs softly) [[翻译:你好呀]] Hello there')).toBe('Hello there');
        expect(sanitizeVoiceCallAssistantText('（轻笑）那我继续说啦')).toBe('那我继续说啦');
        expect(getVoiceCallVisibleText('user', '我想说（先别挂）')).toBe('我想说（先别挂）');
    });

    it('sanitizes persisted assistant conversation content for cards', () => {
        const history = [
            { role: 'assistant', content: '（轻笑）那就这样吧', audioBlob: new Blob(['a'], { type: 'audio/wav' }) },
            { role: 'user', content: '我想说（先别挂）' },
            { role: 'assistant', content: '(laughs) [[翻译:你好]] Hello', audioBlob: new Blob(['b'], { type: 'audio/wav' }) },
        ];

        expect(buildPersistedCallConversation(history)).toEqual([
            { role: 'assistant', content: '那就这样吧', hasAudio: true },
            { role: 'user', content: '我想说（先别挂）' },
            { role: 'assistant', content: 'Hello', hasAudio: true },
        ]);
    });
});
