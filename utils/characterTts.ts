import type { CharacterProfile,TtsConfig } from '../types';

type CharacterVoiceSource = Pick<CharacterProfile, 'ttsVoiceId' | 'elevenLabsVoiceId'> | null | undefined;

export function resolveCharacterVoiceId(char: CharacterVoiceSource, config: TtsConfig): string {
    const characterVoiceId = char?.ttsVoiceId?.trim();
    if (characterVoiceId) return characterVoiceId;
    return config.voiceSetting.voice_id?.trim() || '';
}

export function withCharacterTtsVoice(config: TtsConfig, char: CharacterVoiceSource): TtsConfig {
    return {
        ...config,
        voiceSetting: {
            ...config.voiceSetting,
            voice_id: resolveCharacterVoiceId(char, config),
        },
    };
}

export function resolveCharacterElevenLabsVoiceId(char: CharacterVoiceSource, config: TtsConfig): string {
    const characterVoiceId = char?.elevenLabsVoiceId?.trim();
    if (characterVoiceId) return characterVoiceId;
    return config.elevenLabs.voiceId?.trim() || '';
}

export function withCharacterVoiceCallTtsConfig(config: TtsConfig, char: CharacterVoiceSource): TtsConfig {
    const minimaxVoiceId = resolveCharacterVoiceId(char, config);
    const elevenLabsVoiceId = resolveCharacterElevenLabsVoiceId(char, config);

    return {
        ...config,
        voiceSetting: {
            ...config.voiceSetting,
            voice_id: minimaxVoiceId,
        },
        elevenLabs: {
            ...config.elevenLabs,
            voiceId: elevenLabsVoiceId,
        },
    };
}

export function getCharacterVoiceIdNotExistMessage(voiceId: string): string {
    return `MiniMax 找不到角色声线「${voiceId || '未填写'}」（voice id not exist）。请在神经链接里换成可用的 Voice ID；如果你想改用全局兜底声线，请清空该角色 Voice ID。`;
}

export function isVoiceIdNotExistError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /voice id not exist/i.test(message) || /错误\s*2054|2054/.test(message);
}

export function toCharacterVoiceIdError(error: unknown, voiceId: string): Error {
    if (isVoiceIdNotExistError(error)) {
        return new Error(getCharacterVoiceIdNotExistMessage(voiceId));
    }
    return error instanceof Error ? error : new Error(String(error));
}
