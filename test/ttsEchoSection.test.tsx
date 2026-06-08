// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TtsEchoSection from '../apps/settings/tts/TtsEchoSection';

const {
    addToast,
    createElevenLabsVoice,
    designElevenLabsVoice,
    generateCharacterEchoVoiceDraft,
    updateCharacter,
} = vi.hoisted(() => ({
    addToast: vi.fn(),
    createElevenLabsVoice: vi.fn(),
    designElevenLabsVoice: vi.fn(),
    generateCharacterEchoVoiceDraft: vi.fn(),
    updateCharacter: vi.fn(),
}));

vi.mock('../context/OSContext', () => ({
    useOS: () => ({
        apiConfig: { baseUrl: 'https://api.example.test/v1', apiKey: 'sk-test', model: 'test-model' },
        characters: [{ id: 'char-a', name: 'Sully', avatar: '', memories: [] }],
        activeCharacterId: 'char-a',
        userProfile: { name: 'User', avatar: '' },
        updateCharacter,
        addToast,
    }),
}));

vi.mock('../utils/echoVoiceDesign', () => ({
    createElevenLabsVoice,
    designElevenLabsVoice,
    generateCharacterEchoVoiceDraft,
}));

describe('TtsEchoSection', () => {
    beforeEach(() => {
        addToast.mockReset();
        createElevenLabsVoice.mockReset();
        designElevenLabsVoice.mockReset();
        generateCharacterEchoVoiceDraft.mockReset();
        updateCharacter.mockReset();
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        let objectUrlIndex = 0;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => `blob:echo-${++objectUrlIndex}`),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });

        vi.stubGlobal('Audio', vi.fn(function MockAudio() {
            return {
                onended: null,
                onerror: null,
                pause: vi.fn(),
                play: vi.fn().mockResolvedValue(undefined),
            };
        }));
    });

    it('shows explicit playback controls after generating echo previews', async () => {
        designElevenLabsVoice.mockResolvedValue({
            text: 'preview text',
            safetyAdjusted: false,
            enhanceDisabled: false,
            previews: [
                { generatedVoiceId: 'generated-1', audioBase64: 'AAAA', mediaType: 'audio/mpeg' },
                { generatedVoiceId: 'generated-2', audioBase64: 'BBBB', mediaType: 'audio/mpeg' },
                { generatedVoiceId: 'generated-3', audioBase64: 'CCCC', mediaType: 'audio/mpeg' },
            ],
        });

        render(<TtsEchoSection elevenLabsApiKey="eleven-key" elevenLabsModelId="eleven_flash_v2_5" set={vi.fn()} />);

        fireEvent.click(screen.getByText('回声'));
        fireEvent.change(screen.getByPlaceholderText('A warm, intimate young adult voice...'), {
            target: { value: 'A gentle adult voice with a calm conversational tone and clear pacing.' },
        });
        fireEvent.change(screen.getByPlaceholderText('写一段让这个声音开口的台词，100-1000 字符。'), {
            target: {
                value: '这是一段足够长的试听文本，用来确认这个声音是否适合角色。它需要自然、清晰、有停顿，像在屏幕另一边认真地说话，而不是机械朗读。最好还能听出一点稳定、一点靠近，以及把一句普通的话说得像日常留言的感觉。',
            },
        });
        fireEvent.click(screen.getByRole('button', { name: '生成 3 个回声预览' }));

        expect(await screen.findByText('已生成 3 条回声预览')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /播放回声 \d 试听/ })).toHaveLength(3);
        expect(screen.getAllByText('选择这条')).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', { name: '播放回声 1 试听' }));

        expect(Audio).toHaveBeenCalledWith('blob:echo-1');
    }, 10000);
});
