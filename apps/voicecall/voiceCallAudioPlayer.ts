/**
 * voiceCallAudioPlayer.ts — 句子级队列播放器
 *
 * 架构：以"句子"为最小播放单元，每句话的 PCM 数据完整收集后
 * 用 AudioBufferSourceNode 一次性播放，句间插入可配置停顿。
 *
 * 状态机：
 *   idle → playing → gap_waiting → playing → ...
 *                                └→ waiting_next  (队列空时等待)
 *
 * 解决了以下问题（相比 ring-buffer 方案）：
 *   1. stop() 后 onended 仍触发 → _stopped 标志位防护
 *   2. 停顿结束后队列为空 → waiting_next 状态，markSentenceEnd 时触发播放
 *   3. markTtsFinished() 早于播放结束 → 三条件检查（ttsFinished + 队列空 + 不在 playing）
 *   4. AudioContext 被 suspend → 每次播放前 ctx.resume()
 *   5. 文字显示时机 → onSentenceStart 在 source.start() 之前触发
 */

// ─── PCM 转换 ────────────────────────────────────────────────────────────

/** Int16LE Uint8Array → Float32Array（归一化到 -1~1） */
function int16LEToFloat32(pcmBytes: Uint8Array): Float32Array {
    const sampleCount = pcmBytes.length >> 1;
    const float32 = new Float32Array(sampleCount);
    const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
    for (let i = 0; i < sampleCount; i++) {
        float32[i] = view.getInt16(i * 2, true) / 32768;
    }
    return float32;
}

// ─── 句子缓冲 ────────────────────────────────────────────────────────────

/**
 * 单句音频数据收集器。
 * 调用 append() 逐步添加 PCM chunk，调用 seal() 后拼接为完整 Float32Array。
 * seal 后不能再 append。
 */
class SentenceBuffer {
    private chunks: Float32Array[] = [];
    private _sealed = false;
    private _data: Float32Array | null = null;

    get isSealed(): boolean { return this._sealed; }
    get isEmpty(): boolean {
        return this.chunks.length === 0 && !this._sealed;
    }

    append(pcm: Uint8Array): void {
        if (this._sealed) {
            console.warn('[SentenceBuffer] append() called after seal(), ignoring');
            return;
        }
        if (pcm.length === 0) return;
        this.chunks.push(int16LEToFloat32(pcm));
    }

    seal(): Float32Array {
        if (this._sealed && this._data) return this._data;
        this._sealed = true;
        const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
        this._data = new Float32Array(total);
        let offset = 0;
        for (const c of this.chunks) {
            this._data.set(c, offset);
            offset += c.length;
        }
        this.chunks = []; // 释放内存
        return this._data;
    }
}

// ─── 播放器状态 ──────────────────────────────────────────────────────────

type PlayerState = 'idle' | 'playing' | 'gap_waiting' | 'waiting_next';

// ─── 选项 ────────────────────────────────────────────────────────────────

export interface VoiceCallAudioPlayerOptions {
    /** PCM 采样率（必须与 TTS 输出一致），默认 24000 */
    sampleRate?: number;
    /** 句间停顿时长（ms），默认 1800ms */
    gapMs?: number;
}

// ─── 播放器 ──────────────────────────────────────────────────────────────

export class VoiceCallAudioPlayer {
    private ctx: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private sampleRate: number;
    private gapMs: number;

    // 当前正在收集的句子 buffer
    private currentBuffer: SentenceBuffer | null = null;
    // 已经 seal 好、等待播放的句子队列
    private readyQueue: Float32Array[] = [];
    // 播放游标（已播完的句子数，用于通知 onSentenceStart）
    private _playedCount = 0;

    // 当前正在播放的 AudioBufferSourceNode
    private currentSource: AudioBufferSourceNode | null = null;

    // 当前停顿的定时器
    private gapTimer: ReturnType<typeof setTimeout> | null = null;

    // 状态机
    private state: PlayerState = 'idle';

    // TTS 已全部推送完毕标志
    private _ttsFinished = false;

    // stop() 保护标志：防止 onended 在打断后继续触发 playNext
    private _stopped = false;

    // ── 闸门模式：gated 时音频缓冲但不播放，releaseGate 后开始播 ──
    private _gated = false;

    // 是否已初始化
    private _initialized = false;

    // ── 对外回调 ──────────────────────────────────────────────────────
    /** 开始播放第 idx 句时触发（用于同步切换文字显示） */
    public onSentenceStart?: (idx: number) => void;
    /** 所有句子全部播放完毕时触发（恢复 listening 状态） */
    public onPlaybackEnd?: () => void;

    get isPlaying(): boolean {
        return this.state === 'playing' || this.state === 'gap_waiting' || this.state === 'waiting_next';
    }

    get isAudiblyPlaying(): boolean {
        return this.state === 'playing';
    }

    constructor(options: VoiceCallAudioPlayerOptions = {}) {
        this.sampleRate = options.sampleRate ?? 24000;
        this.gapMs = options.gapMs ?? 1800;
    }

    // ─── 初始化 ──────────────────────────────────────────────────────

    /** 初始化 AudioContext（需在用户交互后调用），支持重复调用以重置状态 */
    init(): void {
        // 清理状态，以便重新使用
        this._resetState();

        if (!this._initialized) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioCtx({ sampleRate: this.sampleRate });
            // GainNode 插入信号链：source → gainNode → destination
            this.gainNode = this.ctx.createGain();
            this.gainNode.gain.value = 1.0;
            this.gainNode.connect(this.ctx.destination);
            this._initialized = true;
            console.log(`[SentencePlayer] AudioContext created: sampleRate=${this.sampleRate}`);
        }

        console.log('[SentencePlayer] Initialized (state reset)');
    }

    /** 重置所有运行时状态（不销毁 AudioContext，保留闸门状态） */
    private _resetState(): void {
        this._stopCurrentSource();
        this._clearGapTimer();

        this.currentBuffer = null;
        this.readyQueue = [];
        this._playedCount = 0;
        this._ttsFinished = false;
        this._stopped = false;
        // 注意：不重置 _gated — 闸门状态由 setGated/releaseGate 显式管理，
        // 否则 processUserMessage 里的 init() 会在 dialing 阶段意外解锁闸门
        this.state = 'idle';
    }

    // ─── 数据写入接口 ─────────────────────────────────────────────────

    /**
     * 接收来自 TTS 的 PCM Int16LE 数据，追加到当前句子 buffer。
     * 必须在 markSentenceEnd() 之前调用。
     */
    enqueue(pcmData: Uint8Array): void {
        if (!this._initialized || !this.ctx) {
            console.warn('[SentencePlayer] Not initialized, ignoring enqueue');
            return;
        }
        if (this._stopped) return;

        if (!this.currentBuffer) {
            this.currentBuffer = new SentenceBuffer();
        }
        this.currentBuffer.append(pcmData);
    }

    /**
     * 标记当前句子的音频数据已全部到达（即 TTS is_final 信号）。
     * seal 当前 buffer，推入播放队列。如果播放器在 waiting_next 状态，立刻触发播放。
     */
    markSentenceEnd(): void {
        if (!this._initialized) return;
        if (this._stopped) return;

        if (!this.currentBuffer) {
            console.warn('[SentencePlayer] markSentenceEnd() called but no currentBuffer, ignoring');
            return;
        }

        const sealed = this.currentBuffer.seal();
        this.readyQueue.push(sealed);
        const queueIdx = this.readyQueue.length - 1;
        console.log(`[SentencePlayer] Sentence ${queueIdx} sealed (${sealed.length} samples, ${(sealed.length / this.sampleRate).toFixed(2)}s)`);
        this.currentBuffer = null;

        // 如果播放器在等待中，立刻开始播放这句
        if (this.state === 'idle' || this.state === 'waiting_next') {
            this._playNext();
        }
        // 其他状态（playing / gap_waiting）：新句子已在队列里，onended 后自然会取到
    }

    /**
     * 标记 TTS 已发送完全部句子。
     * 不会立刻触发 onPlaybackEnd —— 只有当队列也全部播完时才触发。
     */
    markTtsFinished(): void {
        if (this._stopped) return;
        this._ttsFinished = true;
        console.log('[SentencePlayer] TTS marked finished');

        // 如果当前已经在等待下一句（队列空）且没有正在播放的，说明全部播完了
        this._checkPlaybackComplete();
    }

    // ─── 核心播放逻辑 ─────────────────────────────────────────────────

    private async _playNext(): Promise<void> {
        if (this._stopped) return;
        if (!this.ctx) return;

        // ── 闸门：gated 模式下不播放，只缓冲 ──
        if (this._gated) {
            this.state = 'waiting_next';
            console.log(`[SentencePlayer] Gated: ${this.readyQueue.length} sentence(s) buffered, waiting for gate release`);
            return;
        }

        if (this.readyQueue.length === 0) {
            // 队列空：进入等待状态
            if (this._ttsFinished) {
                // TTS 已经结束且队列空 → 真正全部播完
                this._onAllDone();
            } else {
                // TTS 还在继续，等待下一句的 markSentenceEnd
                this.state = 'waiting_next';
                console.log('[SentencePlayer] Queue empty, waiting for next sentence...');
            }
            return;
        }

        // 取出队头句子
        const audioData = this.readyQueue.shift()!;
        const sentenceIdx = this._playedCount;
        this._playedCount++;

        this.state = 'playing';

        // 漏洞4修复：确保 AudioContext 处于运行状态
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                console.log('[SentencePlayer] AudioContext resumed');
            } catch (e) {
                console.error('[SentencePlayer] Failed to resume AudioContext:', e);
            }
        }

        if (this._stopped) return; // 双重检查（resume 是异步的）

        // 构建 AudioBuffer
        const audioBuffer = this.ctx.createBuffer(1, audioData.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(audioData);

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode || this.ctx.destination);

        this.currentSource = source;

        // 漏洞5修复：先触发文字切换，再 start()，保证视觉先于声音（或同步）
        try {
            this.onSentenceStart?.(sentenceIdx);
        } catch (e) {
            console.error('[SentencePlayer] onSentenceStart error:', e);
        }

        console.log(`[SentencePlayer] Playing sentence ${sentenceIdx} (${audioData.length} samples)`);

        // 漏洞1修复：onended 里检查 _stopped，防止 stop() 后续播
        source.onended = () => {
            if (this._stopped) {
                console.log('[SentencePlayer] onended fired but stopped, ignoring');
                return;
            }
            if (this.currentSource !== source) {
                // 已经被替换了，忽略
                return;
            }
            this.currentSource = null;
            console.log(`[SentencePlayer] Sentence ${sentenceIdx} ended, waiting ${this.gapMs}ms...`);
            this._startGap();
        };

        source.start();
    }

    /** 句子播放结束后，开始计时停顿 */
    private _startGap(): void {
        if (this._stopped) return;
        this.state = 'gap_waiting';

        this.gapTimer = setTimeout(() => {
            this.gapTimer = null;
            if (this._stopped) return;

            // 漏洞2修复：停顿结束后队列空 → 进 waiting_next 状态，而不是直接结束
            this._playNext();
        }, this.gapMs);
    }

    /** 所有句子全部播完（包括最后一句的 gap 也结束） */
    private _onAllDone(): void {
        if (this._stopped) return;
        this.state = 'idle';
        console.log('[SentencePlayer] All sentences played, playback ended');
        try {
            this.onPlaybackEnd?.();
        } catch (e) {
            console.error('[SentencePlayer] onPlaybackEnd error:', e);
        }
    }

    /** 检查是否已全部播完（三条件：ttsFinished + 队列空 + 不在 playing） */
    private _checkPlaybackComplete(): void {
        if (!this._ttsFinished) return;
        if (this.readyQueue.length > 0) return;
        if (this.state === 'playing' || this.state === 'gap_waiting') return;
        // waiting_next 或 idle 下，如果 ttsFinished 且队列空，说明全部结束
        if (this.state === 'waiting_next' || this.state === 'idle') {
            this._onAllDone();
        }
    }

    // ─── 内部工具 ─────────────────────────────────────────────────────

    private _stopCurrentSource(): void {
        if (this.currentSource) {
            try {
                this.currentSource.onended = null; // 先摘掉回调，防止误触发
                this.currentSource.stop();
            } catch { /* ignore: already stopped */ }
            this.currentSource = null;
        }
    }

    private _clearGapTimer(): void {
        if (this.gapTimer !== null) {
            clearTimeout(this.gapTimer);
            this.gapTimer = null;
        }
    }

    // ─── 打断 ────────────────────────────────────────────────────────

    /**
     * 立即停止播放，清空所有缓冲（用于 barge-in 打断）。
     * 打断后调用 init() 重置状态供下一轮使用。
     */
    stop(): void {
        console.log('[SentencePlayer] stop() called');
        this._stopped = true;
        this._stopCurrentSource();
        this._clearGapTimer();
        this.state = 'idle';
        // 不触发 onPlaybackEnd（打断不是"正常结束"）
    }

    // ─── 闸门控制 ──────────────────────────────────────────────────────

    /** 设置闸门状态。gated=true 时音频只缓冲不播放。 */
    setGated(gated: boolean): void {
        this._gated = gated;
        console.log(`[SentencePlayer] Gate ${gated ? 'LOCKED' : 'UNLOCKED'}`);
    }

    /** 开闸：释放缓冲的音频并开始播放。 */
    releaseGate(): void {
        if (!this._gated) return;
        this._gated = false;
        console.log(`[SentencePlayer] Gate RELEASED (${this.readyQueue.length} buffered sentences)`);
        // 如果有缓冲句子在等待，立刻开始播放
        if (this.state === 'waiting_next' && this.readyQueue.length > 0) {
            this._playNext();
        } else if (this.state === 'waiting_next' && this._ttsFinished) {
            this._checkPlaybackComplete();
        }
    }

    /** 返回当前闸门状态 */
    get isGated(): boolean {
        return this._gated;
    }

    // ─── 销毁 ────────────────────────────────────────────────────────

    /** 设置音量（0~1），实时生效 */
    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /** 获取当前音量 */
    getVolume(): number {
        return this.gainNode?.gain.value ?? 1;
    }

    /** 销毁（释放 AudioContext）。通话结束时调用。 */
    destroy(): void {
        console.log('[SentencePlayer] destroy()');
        this._stopped = true;
        this._stopCurrentSource();
        this._clearGapTimer();
        this.currentBuffer = null;
        this.readyQueue = [];
        this.state = 'idle';
        this._initialized = false;

        this.gainNode?.disconnect();
        this.gainNode = null;

        if (this.ctx) {
            this.ctx.close().catch(() => {});
            this.ctx = null;
        }
    }
}
