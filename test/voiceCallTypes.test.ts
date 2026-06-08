import { describe,expect,it } from 'vitest';
import {
    getVoiceCallModeOptions,
    isVoiceCallReplyChannel,
    MODE_LABELS,
    REPLY_CHANNEL_LABELS,
    type VoiceCallModeSelection,
} from '../apps/voicecall/voiceCallTypes';

describe('voice call mode and reply channel types', () => {
    it('keeps all four call modes available for the text reply channel', () => {
        const selections: VoiceCallModeSelection[] = getVoiceCallModeOptions('Sully').map((option) => ({
            mode: option.id,
            replyChannel: 'text',
        }));

        expect(selections).toEqual([
            { mode: 'daily', replyChannel: 'text' },
            { mode: 'confide', replyChannel: 'text' },
            { mode: 'truth', replyChannel: 'text' },
            { mode: 'sleep', replyChannel: 'text' },
        ]);
        for (const selection of selections) {
            expect(MODE_LABELS[selection.mode]).toBeTruthy();
            expect(REPLY_CHANNEL_LABELS[selection.replyChannel]).toBe('文字通道');
        }
    });

    it('validates reply channel params from app navigation', () => {
        expect(isVoiceCallReplyChannel('voice')).toBe(true);
        expect(isVoiceCallReplyChannel('text')).toBe(true);
        expect(isVoiceCallReplyChannel('audio')).toBe(false);
        expect(isVoiceCallReplyChannel(undefined)).toBe(false);
    });
});
