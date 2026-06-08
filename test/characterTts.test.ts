import { describe,expect,it } from 'vitest';
import { DEFAULT_TTS_CONFIG,type CharacterProfile,type TtsConfig } from '../types';
import {
    resolveCharacterElevenLabsVoiceId,
    resolveCharacterVoiceId,
    withCharacterTtsVoice,
    withCharacterVoiceCallTtsConfig,
} from '../utils/characterTts';
import {
    buildVoiceCallQueuedSentence,
    buildVoiceCallTtsConfig,
    getVoiceCallPlaybackSentence,
} from '../apps/voicecall/useVoiceCallEngine';
import { isVoiceCallTtsConfigured } from '../utils/voiceCallTtsClient';

function buildTtsConfig(voiceId = 'global-voice'): TtsConfig {
    return {
        ...DEFAULT_TTS_CONFIG,
        voiceSetting: {
            ...DEFAULT_TTS_CONFIG.voiceSetting,
            voice_id: voiceId,
        },
    };
}

function buildChar(ttsVoiceId?: string, elevenLabsVoiceId?: string): CharacterProfile {
    return {
        id: 'char-test',
        name: 'Test',
        avatar: '',
        description: '',
        systemPrompt: '',
        memories: [],
        ttsVoiceId,
        elevenLabsVoiceId,
    } as CharacterProfile;
}

describe('character TTS voice binding', () => {
    it('uses the character voice id before the global fallback', () => {
        const config = buildTtsConfig('global-voice');
        const char = buildChar('  character-voice  ');

        expect(resolveCharacterVoiceId(char, config)).toBe('character-voice');
        expect(withCharacterTtsVoice(config, char).voiceSetting.voice_id).toBe('character-voice');
    });

    it('falls back to the global voice id when the character has none', () => {
        const config = buildTtsConfig('  global-voice  ');

        expect(resolveCharacterVoiceId(buildChar(), config)).toBe('global-voice');
        expect(resolveCharacterVoiceId(buildChar('   '), config)).toBe('global-voice');
    });

    it('does not mutate the original TTS config', () => {
        const config = buildTtsConfig('global-voice');
        const merged = withCharacterTtsVoice(config, buildChar('character-voice'));

        expect(merged).not.toBe(config);
        expect(merged.voiceSetting).not.toBe(config.voiceSetting);
        expect(config.voiceSetting.voice_id).toBe('global-voice');
    });

    it('uses ElevenLabs character voice id only for voice-call config', () => {
        const config: TtsConfig = {
            ...buildTtsConfig('global-minimax'),
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                voiceId: 'global-eleven',
            },
        };
        const char = buildChar('character-minimax', '  character-eleven  ');
        const merged = withCharacterVoiceCallTtsConfig(config, char);

        expect(resolveCharacterElevenLabsVoiceId(char, config)).toBe('character-eleven');
        expect(merged.voiceSetting.voice_id).toBe('character-minimax');
        expect(merged.elevenLabs.voiceId).toBe('character-eleven');
        expect(config.elevenLabs.voiceId).toBe('global-eleven');
    });

    it('falls back to global ElevenLabs voice id when the character has none', () => {
        const config: TtsConfig = {
            ...buildTtsConfig('global-minimax'),
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                voiceId: '  global-eleven  ',
            },
        };

        expect(resolveCharacterElevenLabsVoiceId(buildChar(), config)).toBe('global-eleven');
        expect(resolveCharacterElevenLabsVoiceId(buildChar(undefined, '   '), config)).toBe('global-eleven');
    });

    it('keeps the character voice id when preparing voice-call PCM config', () => {
        const config = withCharacterTtsVoice(buildTtsConfig('global-voice'), buildChar('character-voice'));
        const voiceCallConfig = buildVoiceCallTtsConfig(config);
        const lowMemoryVoiceCallConfig = buildVoiceCallTtsConfig(config, undefined, 16000);

        expect(voiceCallConfig.voiceSetting.voice_id).toBe('character-voice');
        expect(voiceCallConfig.audioSetting.format).toBe('pcm');
        expect(voiceCallConfig.audioSetting.audio_sample_rate).toBe(24000);
        expect(lowMemoryVoiceCallConfig.audioSetting.format).toBe('pcm');
        expect(lowMemoryVoiceCallConfig.audioSetting.audio_sample_rate).toBe(16000);
    });

    it('temporarily overrides voice-call language boost for foreign mode only', () => {
        const base = {
            ...buildTtsConfig('global-voice'),
            languageBoost: 'Chinese',
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                languageCode: 'zh',
            },
        };

        expect(buildVoiceCallTtsConfig(base).languageBoost).toBe('Chinese');
        expect(buildVoiceCallTtsConfig(base).elevenLabs.languageCode).toBe('zh');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '日本語', targetLang: '中文' }).languageBoost).toBe('Japanese');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '日本語', targetLang: '中文' }).elevenLabs.languageCode).toBe('ja');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '中文', targetLang: 'English' }).languageBoost).toBe('Chinese');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '中文', targetLang: 'English' }).elevenLabs.languageCode).toBe('zh');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '粤语', targetLang: '中文' }).languageBoost).toBe('Chinese,Yue');
        expect(buildVoiceCallTtsConfig(base, { sourceLang: '粤语', targetLang: '中文' }).elevenLabs.languageCode).toBe('zh');
    });

    it('keeps translation paired with the sentence that is currently playing', () => {
        const first = buildVoiceCallQueuedSentence('こんにちは。[[翻译:你好。]]');
        const second = buildVoiceCallQueuedSentence('今日は何してたの？[[翻译:今天在做什么呀？]]');

        expect(first).toEqual({ spokenText: 'こんにちは。', displayText: 'こんにちは。', translationText: '你好。' });
        expect(second).toEqual({ spokenText: '今日は何してたの？', displayText: '今日は何してたの？', translationText: '今天在做什么呀？' });

        const queue = [first!, second!];
        expect(getVoiceCallPlaybackSentence(queue, 0)?.translationText).toBe('你好。');
        expect(getVoiceCallPlaybackSentence(queue, 1)?.translationText).toBe('今天在做什么呀？');
    });

    it('keeps emotion tags for supported TTS engines while hiding them from subtitles', () => {
        const minimax = buildVoiceCallQueuedSentence('(laughs softly) Alright, I am coming.');
        const elevenV3 = buildVoiceCallQueuedSentence('(sighs) Alright, I am coming.', {
            ...buildTtsConfig(),
            voiceCallProvider: 'elevenlabs',
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                modelId: 'eleven_v3',
            },
        });
        const elevenFlash = buildVoiceCallQueuedSentence('(sighs) Alright, I am coming.', {
            ...buildTtsConfig(),
            voiceCallProvider: 'elevenlabs',
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                modelId: 'eleven_flash_v2_5',
            },
        });

        expect(minimax).toMatchObject({
            spokenText: '(laughs) Alright, I am coming.',
            displayText: 'Alright, I am coming.',
        });
        expect(elevenV3).toMatchObject({
            spokenText: '[sighs] Alright, I am coming.',
            displayText: 'Alright, I am coming.',
        });
        expect(elevenFlash).toMatchObject({
            spokenText: 'Alright, I am coming.',
            displayText: 'Alright, I am coming.',
        });
    });

    it('checks required TTS credentials by voice-call provider', () => {
        const minimaxConfig: TtsConfig = {
            ...buildTtsConfig(),
            apiKey: 'mini-key',
            groupId: 'group-id',
            voiceCallProvider: 'minimax',
        };
        const elevenLabsConfig: TtsConfig = {
            ...buildTtsConfig(),
            apiKey: '',
            groupId: '',
            voiceCallProvider: 'elevenlabs',
            elevenLabs: {
                ...DEFAULT_TTS_CONFIG.elevenLabs,
                apiKey: 'eleven-key',
                voiceId: 'eleven-voice',
            },
        };

        expect(isVoiceCallTtsConfigured(minimaxConfig)).toBe(true);
        expect(isVoiceCallTtsConfigured({ ...minimaxConfig, groupId: '' })).toBe(false);
        expect(isVoiceCallTtsConfigured(elevenLabsConfig)).toBe(true);
        expect(isVoiceCallTtsConfigured({ ...elevenLabsConfig, elevenLabs: { ...elevenLabsConfig.elevenLabs, voiceId: '' } })).toBe(false);
    });
});
