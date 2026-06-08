/**
 * Science Tips — Mock data for menstrual health education.
 * Rotates by cycle phase.
 */
import type { ScienceTip } from './cycleTypes';

export const SCIENCE_TIPS: ScienceTip[] = [
    // Menstrual phase
    {
        id: 'tip-m1',
        phase: 'menstrual',
        title: '经期补铁小贴士',
        content: '经期失血会消耗铁元素。多吃红肉、菠菜、黑木耳等富含铁质的食物，搭配维C促进吸收。',
        emoji: '🥬',
    },
    {
        id: 'tip-m2',
        phase: 'menstrual',
        title: '热敷缓解痛经',
        content: '在下腹部放置热水袋或暖宝宝，温度控制在40-45℃，可有效缓解子宫平滑肌痉挛带来的疼痛。',
        emoji: '🔥',
    },
    {
        id: 'tip-m3',
        phase: 'menstrual',
        title: '经期运动指南',
        content: '经期不必完全停止运动。轻度瑜伽和散步有助于缓解经期不适，但建议避免高强度训练和水上运动。',
        emoji: '🧘',
    },

    // Follicular phase
    {
        id: 'tip-f1',
        phase: 'follicular',
        title: '卵泡期是黄金期',
        content: '经期结束后进入卵泡期，雌激素逐渐升高，精力充沛，是安排高强度锻炼和学习的好时机。',
        emoji: '✨',
    },
    {
        id: 'tip-f2',
        phase: 'follicular',
        title: '蛋白质助力恢复',
        content: '卵泡期新陈代谢活跃，适量增加蛋白质摄入（如鸡蛋、鱼肉、豆制品）可帮助身体恢复和肌肉修复。',
        emoji: '🥚',
    },

    // Ovulation phase
    {
        id: 'tip-o1',
        phase: 'ovulation',
        title: '排卵期身体信号',
        content: '排卵前后可能出现透明拉丝状分泌物，部分人会有轻微腹痛（排卵痛），这些都是正常的生理现象。',
        emoji: '🌸',
    },
    {
        id: 'tip-o2',
        phase: 'ovulation',
        title: '排卵期情绪变化',
        content: '排卵期雌激素达到峰值，很多人会感到心情愉悦、社交欲望增强，这是激素在发挥作用。',
        emoji: '💫',
    },

    // Luteal phase
    {
        id: 'tip-l1',
        phase: 'luteal',
        title: 'PMS 不是你的错',
        content: '黄体期孕激素升高可能导致情绪波动、乳房胀痛、水肿等经前综合征(PMS)，这些都是正常的生理反应。',
        emoji: '🫂',
    },
    {
        id: 'tip-l2',
        phase: 'luteal',
        title: '减少钠盐缓解水肿',
        content: '黄体期容易水肿，减少高盐食物的摄入，适当多喝水，可以帮助缓解浮肿不适。',
        emoji: '💧',
    },
    {
        id: 'tip-l3',
        phase: 'luteal',
        title: '镁元素安抚情绪',
        content: '黑巧克力、香蕉、坚果等富含镁的食物，有助于缓解经前焦虑和情绪低落，给自己一点甜蜜吧。',
        emoji: '🍫',
    },
];

/**
 * Get tips for the current cycle phase.
 */
export function getTipsForPhase(phase: string): ScienceTip[] {
    return SCIENCE_TIPS.filter((tip) => tip.phase === phase);
}

/**
 * Get a rotating tip for a given phase and day-in-cycle.
 */
export function getRotatingTip(phase: string, dayInCycle: number): ScienceTip | null {
    const phaseTips = getTipsForPhase(phase);
    if (phaseTips.length === 0) return null;
    return phaseTips[dayInCycle % phaseTips.length];
}
