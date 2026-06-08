import { safeResponseJson } from './safeApi';
import { safeTimeoutSignal } from './safeTimeout';
import { buildBackendUrl, buildBackendHeaders } from './backendConfig';

const DEFAULT_BASE_URL = '/minimax-music-api';
const FREE_MODEL = 'music-2.6-free';
const DEFAULT_MODEL = FREE_MODEL;
const FALLBACK_MODEL = FREE_MODEL;
const MUSIC_GENERATION_TIMEOUT_MS = 300000;
const AUDIO_DOWNLOAD_TIMEOUT_MS = 120000;

export interface MinimaxMusicGenerateOptions {
    apiKey: string;
    groupId?: string;
    baseUrl?: string;
    model?: string;
    prompt: string;
    lyrics: string;
    /** When true, generate instrumental music without vocals. */
    isInstrumental?: boolean;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface MinimaxMusicGenerateResult {
    blob: Blob;
    model: string;
    fallbackUsed: boolean;
    durationMs?: number;
    sampleRate?: number;
    channel?: number;
    bitrate?: number;
    size?: number;
}

interface MinimaxMusicResponse {
    data?: {
        audio?: string;
        status?: number;
    };
    extra_info?: {
        music_duration?: number;
        music_sample_rate?: number;
        music_channel?: number;
        bitrate?: number;
        music_size?: number;
    };
    base_resp?: {
        status_code: number;
        status_msg: string;
    };
    trace_id?: string;
}

/**
 * Resolve the base URL for MiniMax Music API requests.
 *
 * Priority:
 *   1. Explicit `url` param (e.g. from user config)
 *   2. csyos-workers backend via `/api/music` (avoids Pages Function 30s timeout)
 *   3. Pages Function proxy `/minimax-music-api` (Vite dev / legacy fallback)
 */
function resolveBaseUrl(url?: string): string {
    if (url) return url.replace(/\/+$/, '');

    // Prefer the csyos-workers backend — Workers can hold the 60-180s music gen request.
    try {
        const workersUrl = buildBackendUrl('/api/music');
        if (workersUrl) return workersUrl.replace(/\/+$/, '');
    } catch { /* fallback below */ }

    return DEFAULT_BASE_URL;
}

function makeHeaders(apiKey: string, groupId?: string, useWorkersProxy?: boolean): Record<string, string> {
    let headers: Record<string, string>;

    if (useWorkersProxy) {
        // When going through csyos-workers, the backend auth middleware consumes
        // Authorization for API_SECRET validation. Pass MiniMax key via X-MiniMax-Key
        // and the proxy handler forwards it to MiniMax as Authorization.
        headers = {
            ...buildBackendHeaders(),
            'X-MiniMax-Key': apiKey,
            'Content-Type': 'application/json',
        };
    } else {
        headers = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    if (groupId?.trim()) {
        const normalizedGroupId = groupId.trim();
        headers['Group-Id'] = normalizedGroupId;
        headers['X-Group-ID'] = normalizedGroupId;
    }
    return headers;
}

export function decodeHexAudio(hex: string): Uint8Array {
    const cleanHex = hex.trim();
    if (!cleanHex || cleanHex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(cleanHex)) {
        throw new Error('MiniMax 音频数据不是有效的 hex');
    }

    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }
    return bytes;
}

function assertBaseResp(data: MinimaxMusicResponse): void {
    const baseResp = data.base_resp;
    if (baseResp && baseResp.status_code !== 0) {
        throw new Error(formatMinimaxError(undefined, data));
    }
}

function hasSuccessfulAudio(data: MinimaxMusicResponse): boolean {
    return data.base_resp?.status_code === 0 && Boolean(data.data?.audio?.trim());
}

function formatMinimaxError(response: Response | undefined, data: MinimaxMusicResponse): string {
    const parts: string[] = [];
    if (response) parts.push(`MiniMax Music HTTP ${response.status}`);

    const baseResp = data.base_resp;
    if (baseResp) {
        parts.push(`[${baseResp.status_code}] ${baseResp.status_msg || 'MiniMax 返回错误'}`);
    }

    if (data.trace_id) {
        parts.push(`trace_id=${data.trace_id}`);
    }

    if (data.data?.status !== undefined) {
        parts.push(`data.status=${data.data.status}`);
    }

    return parts.join(' ') || 'MiniMax Music 生成失败';
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isTransportOrProxyError(error: unknown): boolean {
    const message = getErrorMessage(error);
    return message.includes('API返回了HTML而非JSON')
        || message.includes('API返回了空响应')
        || message.includes('API返回了无效JSON')
        || message.includes('Failed to fetch')
        || message.includes('NetworkError')
        || message.toLowerCase().includes('aborted');
}

async function audioToBlob(audio: string): Promise<Blob> {
    const trimmed = audio.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        const response = await fetch(trimmed, { signal: safeTimeoutSignal(AUDIO_DOWNLOAD_TIMEOUT_MS) });
        if (!response.ok) {
            throw new Error(`MiniMax 音频下载失败: HTTP ${response.status}`);
        }
        return response.blob();
    }

    const bytes = decodeHexAudio(trimmed);
    const audioBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(audioBuffer).set(bytes);
    return new Blob([audioBuffer], { type: 'audio/mpeg' });
}

export async function generateMinimaxMusic(options: MinimaxMusicGenerateOptions): Promise<MinimaxMusicGenerateResult> {
    const apiKey = options.apiKey.trim();
    const lyrics = options.lyrics.trim();
    const prompt = options.prompt.trim();
    const model = options.model || DEFAULT_MODEL;
    const isInstrumental = options.isInstrumental === true;

    if (!apiKey) throw new Error('请先配置 MiniMax API Key');
    if (!isInstrumental && !lyrics) throw new Error('歌词不能为空');

    const baseUrl = resolveBaseUrl(options.baseUrl);
    // Detect if routing through csyos-workers proxy
    const isWorkersProxy = baseUrl.includes('/api/music');
    // When going through Workers proxy, use the dedicated route
    const fetchUrl = isWorkersProxy
        ? `${baseUrl}/minimax-generate`
        : `${baseUrl}/v1/music_generation`;

    const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: makeHeaders(apiKey, options.groupId, isWorkersProxy),
        body: JSON.stringify({
            model,
            prompt: prompt.slice(0, 2000),
            ...(isInstrumental ? {} : { lyrics: lyrics.slice(0, 3500) }),
            stream: false,
            output_format: 'url',
            lyrics_optimizer: false,
            is_instrumental: isInstrumental,
            audio_setting: {
                sample_rate: 44100,
                bitrate: 256000,
                format: 'mp3',
            },
        }),
        signal: options.signal || safeTimeoutSignal(options.timeoutMs ?? MUSIC_GENERATION_TIMEOUT_MS),
    });

    const data = await safeResponseJson(response) as MinimaxMusicResponse;
    if (!response.ok && !hasSuccessfulAudio(data)) {
        throw new Error(formatMinimaxError(response, data));
    }

    assertBaseResp(data);

    const audio = data.data?.audio;
    if (!audio) {
        throw new Error('MiniMax Music 没有返回音频');
    }

    const blob = await audioToBlob(audio);
    return {
        blob,
        model,
        fallbackUsed: false,
        durationMs: data.extra_info?.music_duration,
        sampleRate: data.extra_info?.music_sample_rate,
        channel: data.extra_info?.music_channel,
        bitrate: data.extra_info?.bitrate,
        size: data.extra_info?.music_size,
    };
}

export async function generateMinimaxMusicWithFallback(
    options: MinimaxMusicGenerateOptions,
): Promise<MinimaxMusicGenerateResult> {
    const primaryModel = options.model || DEFAULT_MODEL;

    try {
        return await generateMinimaxMusic({ ...options, model: primaryModel });
    } catch (primaryError) {
        if (primaryModel === FALLBACK_MODEL || isTransportOrProxyError(primaryError)) throw primaryError;

        try {
            const fallback = await generateMinimaxMusic({ ...options, model: FALLBACK_MODEL });
            return { ...fallback, fallbackUsed: true };
        } catch (fallbackError) {
            const primaryMessage = getErrorMessage(primaryError);
            const fallbackMessage = getErrorMessage(fallbackError);
            throw new Error(`MiniMax Music 生成失败：${primaryMessage}；降级也失败：${fallbackMessage}`);
        }
    }
}

export const MinimaxMusic = {
    generate: generateMinimaxMusic,
    generateWithFallback: generateMinimaxMusicWithFallback,
};
