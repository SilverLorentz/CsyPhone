/** 共享工具函数 — voicecall 模块内部使用 */

/** 格式化通话时长：seconds → "MM:SS" */
export const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};
