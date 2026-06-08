/**
 * cloudStt.ts — 云端语音识别模块
 *
 * 统一接口调用 Groq Whisper 或 SiliconFlow SenseVoice。
 * 两家都兼容 OpenAI /v1/audio/transcriptions 格式。
 */

import type { SttConfig,SttResult } from '../types/stt';
import { STT_PROVIDER_DEFAULTS,getActiveApiKey } from '../types/stt';

// ─── 自定义错误 ──────────────────────────────────────────────────────

export class SttNotConfiguredError extends Error {
    constructor() {
        super('STT API Key 未配置');
        this.name = 'SttNotConfiguredError';
    }
}

// ─── 核心函数 ────────────────────────────────────────────────────────

/**
 * 将音频 Blob 发送到云端 STT API，返回转写结果。
 *
 * @param blob     录音 Blob（webm/ogg/wav 等浏览器录制格式均可）
 * @param config   当前 STT 配置（来自 OSContext）
 * @param timeoutMs 超时时间，默认 15 秒
 */
export async function transcribe(
    blob: Blob,
    config: SttConfig,
    timeoutMs = 15000
): Promise<SttResult> {
    // ── 1. 前置检查 ──
    const apiKey = getActiveApiKey(config);
    if (!apiKey || !apiKey.trim()) {
        throw new SttNotConfiguredError();
    }

    // 空录音 / 过大录音拦截
    if (!blob || blob.size === 0) {
        throw new Error('录音数据为空，请检查麦克风权限');
    }
    if (blob.size > 25 * 1024 * 1024) {
        throw new Error('录音文件过大（超过 25MB），请缩短录音时长');
    }

    const defaults = STT_PROVIDER_DEFAULTS[config.provider];
    const baseUrl = (config.baseUrl || defaults.baseUrl).replace(/\/+$/, '');
    const model = config.model || defaults.model;
    const url = `${baseUrl}/audio/transcriptions`;

    // ── 2. 构建 FormData ──
    // 浏览器 MediaRecorder 输出格式因浏览器而异：
    //   Chrome → webm/opus, Safari → mp4, Edge → webm 或 mp4
    const blobType = (blob.type || '').toLowerCase();
    const ext = blobType.includes('wav') ? 'wav'
        : blobType.includes('mp4') || blobType.includes('m4a') ? 'mp4'
            : blobType.includes('ogg') ? 'ogg'
                : blobType.includes('webm') ? 'webm'
                    : 'webm'; // 兜底：Groq/SiliconFlow 均支持 webm
    const fileName = `recording.${ext}`;

    console.log(`🎤 [CloudSTT] Blob info: size=${blob.size}, type="${blob.type}", ext=${ext}`);

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('model', model);
    // 语言偏好：用户配置了就传，否则让 Whisper 自动检测（对中英混合更友好）
    if (config.language) {
        formData.append('language', config.language);
    }
    formData.append('response_format', 'json');

    // ── 3. 发送请求（带超时） ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log(`🎤 [CloudSTT] Sending to ${config.provider} (${model}), url=${url}`);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    // 注意：FormData 自动设置 Content-Type 含 boundary，不能手动设
                },
                body: formData,
                signal: controller.signal,
            });
        } catch (fetchErr: any) {
            // 网络错误 / CORS 拦截 — fetch 会 throw TypeError
            const isCors = fetchErr instanceof TypeError;
            const detail = fetchErr?.message || String(fetchErr);
            console.error(`🎤 [CloudSTT] fetch 失败 (provider=${config.provider}, url=${url}):`, fetchErr);
            if (isCors) {
                throw new Error(
                    `[${config.provider}] 网络/CORS 错误: 浏览器无法直连 ${url}。` +
                    `请检查网络或使用后端代理。(${detail})`
                );
            }
            throw new Error(`[${config.provider}] 网络请求失败: ${detail}`);
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[${config.provider}] STT API ${response.status}: ${errText.slice(0, 300)}`);
        }

        const data = await response.json();

        // ── 4. 解析结果 ──
        const text = (data.text || '').trim();
        console.log(`🎤 [CloudSTT] Result: "${text}"`);

        const result: SttResult = { text };

        // Groq 返回 language 字段
        if (data.language) result.language = data.language;

        // SenseVoice 可能返回情绪标签（在 text 中以 <|EMO|> 格式）
        if (config.provider === 'siliconflow' && text) {
            const emotionMatch = text.match(/<\|([A-Z]+)\|>/i);
            if (emotionMatch) {
                result.emotion = emotionMatch[1].toLowerCase();
                // 清除情绪标签，只保留纯文本
                result.text = text.replace(/<\|[A-Z]+\|>/gi, '').trim();
            }
        }

        return result;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error(`[${config.provider}] STT 请求超时 (${timeoutMs / 1000}s)，目标: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─── 导出命名空间 ────────────────────────────────────────────────────

export const CloudStt = { transcribe };
