/**
 * iOS Safari 音频解锁工具
 *
 * iOS Safari 要求 audio.play() 必须在用户手势的同步调用链中触发。
 * 在 React 中，openApp → useEffect → audio.play() 会脱离手势链。
 *
 * 解决方案：在用户点击时同步调用 unlockAudio()，
 * 播放一个极短的静音 buffer 来"解锁"全局 AudioContext。
 * 之后同一页面生命周期内的所有 audio.play() 都不会被拦截。
 */

let audioUnlocked = false;

export const unlockAudio = (): void => {
    if (audioUnlocked) return;

    try {
        // 方式 1: 创建 AudioContext 并播放静音 buffer
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
            const ctx = new AudioCtx();
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            // 不需要 close，让 ctx 保持 running
        }

        // 方式 2: 同步播放一个空白 Audio 元素
        const audio = new Audio();
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAaC9GQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAANCAKeeUAQBAA0oyq1HwfB8Hw+BAMfwfB8EAfD4EAgGP4Pg+D4Ph8CAfB8HwfB8CAIB8Hw+BAMfwfB8Hw+D4EAx/B8HwfB8Hw+D4EAx/+MYxA0AAADSAAAAALhj4fg+D4Pg+H4IB8PwfB8CAY/g+D4Pg+HwIB8HwfB8HwIBj+D4Pg+D4Ph8CAfB8HwfB8CAQD4fB8HwfB8';
        audio.volume = 0;
        audio.play().catch(() => { });

        audioUnlocked = true;
    } catch {
        // 静默失败 — 非 iOS 或无 AudioContext 支持
    }
};
