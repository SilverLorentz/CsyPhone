/**
 * MiniMax TTS WebSocket 模块
 * 
 * 使用 WebSocket 协议进行同步语音合成，适用于语音通话场景。
 * 支持持续连接、多段文本顺序合成（task_start → 多个 task_continue → task_finish）。
 * 
 * 协议流程:
 *   客户端 → 服务器:  task_start (配置音色等)
 *   服务器 → 客户端:  connected_success → task_started
 *   客户端 → 服务器:  task_continue (发送文本)
 *   服务器 → 客户端:  task_continued (含 hex 音频, is_final 标记)
 *   客户端 → 服务器:  task_finish
 *   服务器 → 客户端:  task_finished → 连接关闭
 * 
 * @see https://platform.minimaxi.com/docs/api-reference/speech-t2a-websocket
 */

import { getTtsWsProxyUrl } from './backendConfig';
import { TtsConfig } from '../types/tts';
import { trackedApiRequest } from './apiRequestLedger';

// ─── 类型定义 ──────────────────────────────────────────────────────────────

/** WebSocket 连接状态 */
export type WsConnectionState = 'idle' | 'connecting' | 'connected' | 'task_started' | 'closing' | 'closed' | 'error';

/** 音频数据块（已解码为 Uint8Array） */
export interface TtsAudioChunk {
    /** 解码后的音频二进制数据 */
    audio: Uint8Array;
    /** 是否为当前 task_continue 的最后一块 */
    isFinal: boolean;
    /** 额外信息（采样率、格式等） */
    extraInfo?: {
        audio_format?: string;
        audio_sample_rate?: number;
        audio_size?: number;
        audio_length?: number;
        usage_characters?: number;
    };
}

/** WebSocket TTS 事件回调 */
export interface MinimaxTtsWsCallbacks {
    /** 连接状态变更 */
    onStateChange?: (state: WsConnectionState) => void;
    /** 收到音频数据块 */
    onAudioChunk?: (chunk: TtsAudioChunk) => void;
    /** 任务完成（所有 task_continue 的音频都已返回） */
    onTaskFinished?: () => void;
    /** 发生错误 */
    onError?: (error: string, statusCode?: number) => void;
}

// ─── Hex 解码工具 ────────────────────────────────────────────────────────

function hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// ─── 连接地址 ────────────────────────────────────────────────────────────

/** Cloudflare Worker 代理地址 */

/**
 * 构建 WebSocket 连接 URL。
 * 
 * 浏览器 WebSocket 无法发送 Authorization header，所以我们通过
 * Cloudflare Worker 代理来添加 header：
 *   浏览器 → Cloudflare Worker(/ws?token=xxx&group_id=xxx) → MiniMax（带 Authorization + Group-Id header）
 */
function buildWsUrl(config: TtsConfig): string {
    // MiniMax API 鉴权格式: Authorization: Bearer {apiKey}
    // Group-Id 通过单独的 header 传递（与 HTTP API 一致）
    const bearerToken = `Bearer ${config.apiKey}`;

    // 所有环境统一使用 Cloudflare Worker 代理
    const proxyUrl = new URL(getTtsWsProxyUrl());
    proxyUrl.searchParams.set('token', bearerToken);
    if (config.groupId) {
        proxyUrl.searchParams.set('group_id', config.groupId);
    }
    const debugUrl = new URL(proxyUrl.toString());
    debugUrl.searchParams.set('token', '[token]');
    console.log('[TTS WS] Using Cloudflare proxy:', debugUrl.toString());
    return proxyUrl.toString();
}

// ─── 主类 ─────────────────────────────────────────────────────────────────

/**
 * MiniMax TTS WebSocket 客户端
 * 
 * 用法:
 * ```ts
 * const ws = new MinimaxTtsWs({
 *     onAudioChunk: (chunk) => playAudio(chunk.audio),
 *     onTaskFinished: () => console.log('done'),
 *     onError: (err) => console.error(err),
 * });
 * 
 * await ws.connect(ttsConfig);
 * await ws.start(ttsConfig);       // task_start
 * await ws.sendText('你好世界');    // task_continue
 * await ws.sendText('第二句话');    // task_continue
 * await ws.finish();                // task_finish → 等待关闭
 * ```
 */
export class MinimaxTtsWs {
    private ws: WebSocket | null = null;
    private state: WsConnectionState = 'idle';
    private callbacks: MinimaxTtsWsCallbacks;
    private sessionId: string = '';
    /** 防止 onTaskFinished 被重复触发（task_finished 事件 + onclose 安全网） */
    private taskFinishedEmitted = false;
    /** Worker 代理发送的诊断错误信息（proxy_error 消息） */
    private lastProxyError: string = '';
    private activeConfig: TtsConfig | null = null;

    // 用于 await 风格的 Promise resolve/reject
    private connectResolve: (() => void) | null = null;
    private connectReject: ((err: Error) => void) | null = null;
    private startResolve: (() => void) | null = null;
    private startReject: ((err: Error) => void) | null = null;
    private finishResolve: (() => void) | null = null;

    // 超时保护
    private connectTimeout: ReturnType<typeof setTimeout> | null = null;
    private startTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(callbacks: MinimaxTtsWsCallbacks = {}) {
        this.callbacks = callbacks;
    }

    /**
     * 等待 WebSocket readyState 变为 OPEN。
     * Cloudflare Worker 的 WebSocketPair 可能在 readyState 还是 CONNECTING 时
     * 就通过 onmessage 转发了上游的 connected_success，导致 send() 失败。
     */
    private waitForOpen(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.ws) { reject(new Error('WebSocket is null')); return; }
            if (this.ws.readyState === WebSocket.OPEN) { resolve(); return; }
            if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
                reject(new Error('WebSocket already closed')); return;
            }
            // readyState === CONNECTING, 等 onopen
            const ws = this.ws;
            const onOpen = () => { ws.removeEventListener('open', onOpen); ws.removeEventListener('error', onErr); resolve(); };
            const onErr = () => { ws.removeEventListener('open', onOpen); ws.removeEventListener('error', onErr); reject(new Error('WebSocket error while waiting for open')); };
            ws.addEventListener('open', onOpen);
            ws.addEventListener('error', onErr);
        });
    }

    /** 当前连接状态 */
    get connectionState(): WsConnectionState {
        return this.state;
    }

    /** 当前会话 ID */
    get currentSessionId(): string {
        return this.sessionId;
    }

    // ─── 状态管理 ────────────────────────────────────────────────────

    private setState(newState: WsConnectionState) {
        this.state = newState;
        this.callbacks.onStateChange?.(newState);
        console.log(`[TTS WS] State → ${newState}`);
    }

    // ─── 连接 ──────────────────────────────────────────────────────

    /**
     * 建立 WebSocket 连接
     * 鉴权通过 URL query 参数传递（浏览器 WebSocket 不支持自定义 header）
     */
    connect(config: TtsConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                this.close();
            }
            this.taskFinishedEmitted = false;
            this.lastProxyError = '';
            this.activeConfig = config;

            this.connectResolve = resolve;
            this.connectReject = reject;
            this.setState('connecting');

            const wsUrl = buildWsUrl(config);

            console.log('[TTS WS] Connecting...');
            this.ws = new WebSocket(wsUrl);

            // 25 秒连接超时（浏览器↔Worker WSS 已建立，等待 Worker 转发上游 MiniMax connected_success）
            // 网络差的用户（校园网/公司网/移动 4G）握手链路可能需要 15-20s
            this.connectTimeout = setTimeout(() => {
                if (this.state === 'connecting') {
                    const err = new Error('[TTS WS] 连接超时 (25s)');
                    this.connectReject?.(err);
                    this.connectResolve = null;
                    this.connectReject = null;
                    this.close();
                }
            }, 25000);

            this.ws.onopen = () => {
                console.log('[TTS WS] WebSocket opened, waiting for connected_success...');
            };

            this.ws.onmessage = (event) => this.handleMessage(event);

            this.ws.onerror = () => {
                // WebSocket error events don't carry useful detail; the close
                // event (which fires immediately after) provides code & reason.
                console.error('[TTS WS] WebSocket error event fired (details in onclose)');
                // Don't reject here — let onclose handle it with code + reason
                // to avoid swallowing the proxy_error diagnostic message.
            };

            this.ws.onclose = (event) => {
                console.log(`[TTS WS] WebSocket closed: code=${event.code}, reason=${event.reason}`);
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                if (this.startTimeout) {
                    clearTimeout(this.startTimeout);
                    this.startTimeout = null;
                }

                // 连接阶段异常关闭（Worker 代理拒绝、上游不可达等）
                if (this.connectReject) {
                    const reason = event.reason || `WebSocket closed (code=${event.code})`;
                    // 使用 proxyError 提供更具体的诊断（如果有）
                    const detail = this.lastProxyError || reason;
                    this.connectReject(new Error(`[TTS WS] ${detail}`));
                    this.connectResolve = null;
                    this.connectReject = null;
                    this.callbacks.onError?.(detail);
                    this.setState('error');
                    this.ws = null;
                    return;
                }
                if (this.startReject) {
                    this.startReject(new Error('WebSocket 连接中断'));
                    this.startResolve = null;
                    this.startReject = null;
                }

                // 如果等 finish 的 Promise 还没 resolve，现在 resolve 它
                if (this.finishResolve) {
                    this.finishResolve();
                    this.finishResolve = null;
                }

                // 安全网：只有在 task_finished 事件未到达时才做兜底调用
                // 防止重复触发导致 markTtsFinished 过早
                if (!this.taskFinishedEmitted) {
                    this.taskFinishedEmitted = true;
                    this.callbacks.onTaskFinished?.();
                }

                if (this.state !== 'error') {
                    this.setState('closed');
                }
                this.ws = null;
            };
        });
    }

    // ─── 发送 task_start ──────────────────────────────────────────

    /**
     * 发送 task_start，配置音色和音频参数。
     * 必须在 connect() 成功后调用。
     */
    start(config: TtsConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.state !== 'connected') {
                reject(new Error(`[TTS WS] 无法 start: 当前状态 ${this.state}`));
                return;
            }

            this.startResolve = resolve;
            this.startReject = reject;

            const taskStart: Record<string, any> = {
                event: 'task_start',
                model: config.model,
                voice_setting: {
                    voice_id: config.voiceSetting.voice_id,
                    speed: config.voiceSetting.speed,
                    vol: config.voiceSetting.vol,
                    pitch: config.voiceSetting.pitch,
                },
            };

            // 可选: 情绪
            if (config.voiceSetting.emotion) {
                taskStart.voice_setting.emotion = config.voiceSetting.emotion;
            }

            // 音频设置
            if (config.audioSetting) {
                taskStart.audio_setting = {
                    sample_rate: config.audioSetting.audio_sample_rate,
                    bitrate: config.audioSetting.bitrate,
                    format: config.audioSetting.format,
                    channel: config.audioSetting.channel,
                };
            }

            // 发音词典
            if (config.pronunciationDict && config.pronunciationDict.tone.length > 0) {
                taskStart.pronunciation_dict = { tone: config.pronunciationDict.tone };
            }

            // 语种增强
            if (config.languageBoost) {
                taskStart.language_boost = config.languageBoost;
            }

            console.log('[TTS WS] Sending task_start');
            // 等待 WebSocket 真正 OPEN 再发送（防止 Cloudflare Worker 代理的时序问题）
            this.waitForOpen().then(() => {
                this.ws?.send(JSON.stringify(taskStart));
            }).catch((err) => {
                this.startReject?.(err);
                this.startResolve = null;
                this.startReject = null;
            });

            // 20 秒超时（task_start 需要等 MiniMax 分配音色资源）
            this.startTimeout = setTimeout(() => {
                if (this.startReject) {
                    this.startReject(new Error('[TTS WS] task_start 超时 (20s)'));
                    this.startResolve = null;
                    this.startReject = null;
                }
            }, 20000);
        });
    }

    // ─── 发送 task_continue ──────────────────────────────────────

    /**
     * 发送待合成文本（task_continue）。
     * 可多次调用以顺序合成多段文本。
     * 服务端每段返回 task_continued 事件（含音频数据）。
     */
    sendText(text: string): void {
        if (!this.ws || this.state !== 'task_started') {
            console.warn(`[TTS WS] 无法 sendText: 当前状态 ${this.state}`);
            return;
        }

        if (!text.trim()) {
            console.warn('[TTS WS] 忽略空文本');
            return;
        }

        const msg = {
            event: 'task_continue',
            text: text,
        };

        console.log('[TTS WS] Sending task_continue:', text.slice(0, 50) + (text.length > 50 ? '...' : ''));
        void trackedApiRequest({
            feature: 'tts',
            reason: '语音通话 MiniMax TTS 片段',
            provider: 'minimax',
            model: this.activeConfig?.model,
            userInitiated: false,
        }, async () => {
            this.ws?.send(JSON.stringify(msg));
        });
    }

    // ─── 发送 task_finish ──────────────────────────────────────────

    /**
     * 结束当前任务。
     * 服务端会等待队列中所有合成任务完成后关闭连接。
     * 返回的 Promise 在连接关闭后 resolve。
     */
    finish(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.ws || (this.state !== 'task_started' && this.state !== 'connected')) {
                resolve();
                return;
            }

            this.finishResolve = resolve;

            const msg = { event: 'task_finish' };
            console.log('[TTS WS] Sending task_finish');
            this.ws.send(JSON.stringify(msg));
            this.setState('closing');
        });
    }

    // ─── 强制关闭 ──────────────────────────────────────────────────

    /**
     * 立即关闭 WebSocket 连接（不等待服务端 finish）
     */
    close(): void {
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
        }
        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        if (this.ws) {
            try {
                this.ws.close(1000, 'client close');
            } catch { /* ignore */ }
            this.ws = null;
        }

        this.connectResolve = null;
        this.connectReject = null;
        this.startResolve = null;
        this.startReject = null;
        this.activeConfig = null;
        if (this.finishResolve) {
            this.finishResolve();
            this.finishResolve = null;
        }

        this.setState('closed');
    }

    // ─── 消息处理 ──────────────────────────────────────────────────

    private handleMessage(event: MessageEvent) {
        let data: any;
        try {
            data = JSON.parse(event.data);
        } catch {
            console.warn('[TTS WS] 无法解析消息:', event.data);
            return;
        }

        // Worker 代理发送的诊断错误消息（上游连接失败等）
        if (data.type === 'proxy_error') {
            const errorMsg = data.error || 'Worker 代理错误';
            console.error(`[TTS WS] 代理错误 (phase=${data.phase}): ${errorMsg}`);
            this.lastProxyError = errorMsg;
            // onclose 会紧随其后触发，由 onclose 负责 reject connectPromise
            return;
        }

        const eventType = data.event;

        // 检查 base_resp 中的错误
        if (data.base_resp && data.base_resp.status_code !== 0) {
            const errMsg = data.base_resp.status_msg || `错误码: ${data.base_resp.status_code}`;
            console.error(`[TTS WS] 服务端错误: ${errMsg}`);
            this.callbacks.onError?.(errMsg, data.base_resp.status_code);

            if (eventType === 'task_failed') {
                if (this.startReject) {
                    this.startReject(new Error(errMsg));
                    this.startResolve = null;
                    this.startReject = null;
                }
                this.close();
            }
            return;
        }

        switch (eventType) {
            case 'connected_success':
                console.log('[TTS WS] connected_success, session:', data.session_id);
                this.sessionId = data.session_id || '';
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                this.setState('connected');
                if (this.connectResolve) {
                    this.connectResolve();
                    this.connectResolve = null;
                    this.connectReject = null;
                }
                break;

            case 'task_started':
                console.log('[TTS WS] task_started');
                if (this.startTimeout) {
                    clearTimeout(this.startTimeout);
                    this.startTimeout = null;
                }
                this.setState('task_started');
                if (this.startResolve) {
                    this.startResolve();
                    this.startResolve = null;
                    this.startReject = null;
                }
                break;

            case 'task_continued':
            // 未命名事件 — 包含音频数据
            // fallthrough
            default:
                // 含有 data.audio 的消息就是音频数据
                if (data.data?.audio) {
                    const audioBytes = hexToUint8Array(data.data.audio);
                    const chunk: TtsAudioChunk = {
                        audio: audioBytes,
                        isFinal: !!data.is_final,
                        extraInfo: data.extra_info,
                    };
                    this.callbacks.onAudioChunk?.(chunk);
                    break;
                }

                // 句子合成完成 ACK（is_final=true 但无音频数据）
                // 用空音频 + isFinal 通知引擎该句子朗读完毕
                if (eventType === 'task_continued' && data.is_final) {
                    this.callbacks.onAudioChunk?.({
                        audio: new Uint8Array(0),
                        isFinal: true,
                        extraInfo: data.extra_info,
                    });
                    break;
                }

                if (eventType === 'task_finished') {
                    console.log('[TTS WS] task_finished');
                    if (!this.taskFinishedEmitted) {
                        this.taskFinishedEmitted = true;
                        this.callbacks.onTaskFinished?.();
                    }
                    // 服务端会在此后关闭连接, onclose 会触发 finishResolve
                    break;
                }

                if (eventType === 'task_failed') {
                    // 已在上方 base_resp 检查中处理
                    break;
                }

                console.log('[TTS WS] Unknown event:', eventType, data);
                break;
        }
    }
}

// ─── 便捷工具函数 ──────────────────────────────────────────────────────────

/**
 * 将 Uint8Array 音频数据转为可播放的 Blob URL
 */
export function audioChunkToBlobUrl(chunk: TtsAudioChunk, format: string = 'mp3'): string {
    const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        pcm: 'audio/pcm',
        flac: 'audio/flac',
        wav: 'audio/wav',
    };
    const ab = new ArrayBuffer(chunk.audio.byteLength);
    new Uint8Array(ab).set(chunk.audio);
    const blob = new Blob([ab], { type: mimeMap[format] || 'audio/mpeg' });
    return URL.createObjectURL(blob);
}

/**
 * 将多个音频 chunk 合并为一个 Blob
 */
export function mergeAudioChunks(chunks: TtsAudioChunk[], format: string = 'mp3'): Blob {
    const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        pcm: 'audio/pcm',
        flac: 'audio/flac',
        wav: 'audio/wav',
    };
    const totalSize = chunks.reduce((sum, c) => sum + c.audio.byteLength, 0);
    const merged = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk.audio, offset);
        offset += chunk.audio.byteLength;
    }
    const ab = new ArrayBuffer(merged.byteLength);
    new Uint8Array(ab).set(merged);
    return new Blob([ab], { type: mimeMap[format] || 'audio/mpeg' });
}
