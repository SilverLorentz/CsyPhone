/**
 * Crosstime Types — 跨时空对话
 * 让不同时间版本的角色在一个房间里对话
 */

/** 一个跨时空参与者（时空切片） */
export interface CrosstimeParticipant {
    id: string;                              // 唯一参与者 ID（crypto.randomUUID）
    charId: string;                          // 对应 CharacterProfile.id
    timeSlice: 'current' | 'trajectory';     // 当前版本 or 轨迹节点切片
    trajectoryNodeId?: string;               // trajectory 模式下对应的 TrajectoryNode.id
    age?: number;                            // 显示用年龄
    label: string;                           // 显示标签，如「17岁」「现在」
    era?: 'before_meeting' | 'after_meeting';
}

/** 跨时空房间 */
export interface CrosstimeRoom {
    id: string;
    name: string;                            // 用户自定义或自动生成
    participants: CrosstimeParticipant[];     // 2~5 个参与者
    userMode: 'online' | 'invisible';        // 当前用户身份模式
    createdAt: number;
    lastActiveAt: number;
}

/** 跨时空消息（房间内专用，不使用主 Message 表） */
export interface CrosstimeMessage {
    id: number;
    roomId: string;
    participantId: string;                   // CrosstimeParticipant.id
    charId: string;                          // 冗余存储，用于快速查找头像/名字
    role: 'user' | 'assistant' | 'system';
    content: string;
    userInputKind?: 'speech' | 'action';     // user 消息：公开发言 or 现场动作
    userInputBatchId?: string;               // 同一次发送拆出的多段输入
    userInputBatchIndex?: number;            // 多段输入中的顺序（从 1 开始）
    userInputBatchSize?: number;             // 同一次发送的总段数
    isPrivate?: boolean;                     // 用户私聊某切片的标记
    privateTargetId?: string;                // 私聊目标的 participantId
    timestamp: number;
}
