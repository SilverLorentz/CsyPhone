/**
 * voiceCallTypes.ts - 语音通话模式类型定义
 *
 * 所有与通话模式相关的类型集中在此，供 UI 层、引擎层、LLM 层共同引用。
 */

/** 通话模式标识 */
export type VoiceCallMode = 'daily' | 'confide' | 'truth' | 'sleep';

/** 角色回复通道：语音回复 or 只显示文字 */
export type VoiceCallReplyChannel = 'voice' | 'text';

export interface VoiceCallModeSelection {
    mode: VoiceCallMode;
    replyChannel: VoiceCallReplyChannel;
}

/** 模式 → 中文标签映射（UI 展示用） */
export const MODE_LABELS: Record<VoiceCallMode, string> = {
    daily: '日常',
    confide: '倾诉',
    truth: '真心话',
    sleep: '哄睡',
};

/** 回复通道 → 中文标签映射（UI 展示用） */
export const REPLY_CHANNEL_LABELS: Record<VoiceCallReplyChannel, string> = {
    voice: '语音回复',
    text: '文字通道',
};

export const DEFAULT_REPLY_CHANNEL: VoiceCallReplyChannel = 'voice';

export function isVoiceCallReplyChannel(value: unknown): value is VoiceCallReplyChannel {
    return value === 'voice' || value === 'text';
}

/** 模式选项（UI 渲染用） */
export interface VoiceCallModeOption {
    id: VoiceCallMode;
    /** 显示名称，sleep 模式会在运行时替换 charName */
    title: string;
    /** 一句话描述 */
    subtitle: string;
}

/**
 * 获取模式选项列表
 * @param charName 当前角色名，用于替换哄睡模式标题
 */
export function getVoiceCallModeOptions(charName: string): VoiceCallModeOption[] {
    return [
        {
            id: 'daily',
            title: '日常模式',
            subtitle: '无事可说的日子，也值得被记住',
        },
        {
            id: 'confide',
            title: '倾诉陪伴模式',
            subtitle: '有些沉默，比拥抱更诚实',
        },
        {
            id: 'truth',
            title: '真心话与坦白局',
            subtitle: '不必总是勇敢，偶尔示弱也是一种信任',
        },
        {
            id: 'sleep',
            title: `深夜${charName}在线哄睡`,
            subtitle: '夜色收走白昼的倦意，留一盏灯等你入眠',
        },
    ];
}
