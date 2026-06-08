/**
 * Body Signal Renderer — 躯体信号渲染器
 *
 * 将 InternalState 的 7 维数值翻译成注入 system prompt 的文字。
 * 支持三种渲染模式：
 *   - 'raw':         原始信号模式 — 化学缩写 + 数值 + 方向箭头（推荐默认）
 *   - 'wordLibrary': 词库模式 — 躯体化描述（"胸口发紧"）
 *   - 'quantified':  量化模式 — 进度条 + 人话标签
 *
 * 设计原则：
 *   - raw 模式: 给数据不给结论，让主模型自主涌现行为
 *   - 全平静时不注入
 *   - 同档位有多条候选描述，随机选取避免免疫（词库模式）
 */

import { InternalState } from '../types/character';
import { hasSignificantDeviation } from './hormoneDynamics';

export type BodySignalMode = 'raw' | 'wordLibrary' | 'quantified';

/** 获取当前渲染模式 */
export function getBodySignalMode(): BodySignalMode {
    const stored = localStorage.getItem('body_signal_mode');
    if (stored === 'quantified') return 'quantified';
    if (stored === 'wordLibrary') return 'wordLibrary';
    return 'raw'; // 默认原始信号模式
}

/** 设置渲染模式 */
export function setBodySignalMode(mode: BodySignalMode): void {
    localStorage.setItem('body_signal_mode', mode);
}

// ═══════════════════════════════════════════════════════════════
//  主入口
// ═══════════════════════════════════════════════════════════════

export function renderBodySignals(state: InternalState, charName?: string): string {
    if (!hasSignificantDeviation(state)) return '';
    const mode = getBodySignalMode();
    if (mode === 'raw') return renderRaw(state, charName || '你');
    if (mode === 'quantified') return renderQuantified(state);
    return renderWordLibrary(state);
}

// ═══════════════════════════════════════════════════════════════
//  模式 C: 原始信号模式 — 化学缩写 + 数值 + 方向箭头
// ═══════════════════════════════════════════════════════════════

/** 各维度基线值 */
const BASELINES: Record<string, number> = {
    dopamine: 0.5, serotonin: 0.5, cortisol: 0.5,
    oxytocin: 0.5, norepinephrine: 0.5, endorphin: 0.5,
    energy: 0.7,
};

/** 化学缩写映射 */
const ABBREV: Record<string, string> = {
    dopamine: 'DA', serotonin: '5HT', cortisol: 'CORT',
    oxytocin: 'OXT', norepinephrine: 'NE', endorphin: 'END',
    energy: 'E',
};

/** 偏离基线的方向箭头 */
function getArrow(value: number, baseline: number): string {
    const diff = value - baseline;
    if (diff > 0.12) return '↑';
    if (diff < -0.12) return '↓';
    return '';
}

function renderRaw(state: InternalState, charName: string): string {
    const dims: { key: string; value: number }[] = [
        { key: 'dopamine', value: state.dopamine },
        { key: 'serotonin', value: state.serotonin },
        { key: 'cortisol', value: state.cortisol },
        { key: 'oxytocin', value: state.oxytocin },
        { key: 'norepinephrine', value: state.norepinephrine },
        { key: 'endorphin', value: state.endorphin },
        { key: 'energy', value: state.energy },
    ];

    // 仅输出偏离基线的维度
    const parts: string[] = [];
    for (const d of dims) {
        const baseline = BASELINES[d.key];
        const deviation = Math.abs(d.value - baseline);
        if (deviation > 0.12) {
            const abbrev = ABBREV[d.key];
            const arrow = getArrow(d.value, baseline);
            parts.push(`${abbrev}=${d.value.toFixed(2)}${arrow}`);
        }
    }

    if (parts.length === 0) return '';

    return `[内分泌·当前浓度]
${parts.join(' ')}

${charName}，虽然你不知道，但是体检单上显示了你此时的激素水平——它们潜移默化地改变着你的行为。`;
}

// ═══════════════════════════════════════════════════════════════
//  模式 B: 量化模式 — 进度条 + 人话标签
// ═══════════════════════════════════════════════════════════════

function makeBar(value: number, width: number = 10): string {
    const filled = Math.round(value * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function renderQuantified(state: InternalState): string {
    const lines: string[] = [];

    // 只显示偏离基线的维度
    const dims: { label: string; value: number; baseline: number }[] = [
        { label: '紧绷感', value: state.cortisol,        baseline: 0.5 },
        { label: '安定感', value: state.serotonin,       baseline: 0.5 },
        { label: '期待感', value: state.dopamine,        baseline: 0.5 },
        { label: '亲近感', value: state.oxytocin,        baseline: 0.5 },
        { label: '专注度', value: state.norepinephrine,  baseline: 0.5 },
        { label: '释然感', value: state.endorphin,       baseline: 0.5 },
        { label: '精力　', value: state.energy,           baseline: 0.7 },
    ];

    for (const d of dims) {
        const deviation = Math.abs(d.value - d.baseline);
        if (deviation > 0.12) {
            lines.push(`${d.label} ${makeBar(d.value)}`);
        }
    }

    if (lines.length === 0) return '';

    return `[身体感知·本轮]
${lines.join('\n')}

这些是你身体的节律，像脉搏一样自然。
让它们渗进你的语气和节奏——但永远不要主动提起它们。`;
}


// ═══════════════════════════════════════════════════════════════
//  模式 A: 词库模式 — 躯体化描述
// ═══════════════════════════════════════════════════════════════

const CORTISOL_DESC = {
    high:   ['胸口有些发紧，像是有什么东西压着', '后背绷得有些僵硬，掌心微微出汗', '心跳比平时快了一点，喉咙发干'],
    medium: ['后颈有点僵，不算紧张但也不完全放松', '身体有一种说不上来的警觉感'],
    low:    ['浑身松松的，像是泡在温水里', '呼吸很平稳，肩膀自然地垂着'],
};

const SEROTONIN_DESC = {
    high:   ['心里很踏实，像是脚下踩着实地', '整个人稳稳的，不会被轻易晃动'],
    medium: ['情绪还算平，但说不上特别安心', '不好不坏，就这样吧'],
    low:    ['心里有点空落落的，像是少了什么', '情绪像是浮在水面上，不太稳当', '脑子里冒出一些有的没的想法，按不住'],
};

const DOPAMINE_DESC = {
    high:   ['心里有种微微的雀跃，像是在等什么好事发生', '嘴角有点压不住，想说点什么的冲动', '大脑在转得飞快，一个念头接一个念头'],
    medium: ['比平时精神了一点，有点想法在转', '心里有一丝小期待，但还说不清是什么'],
    low:    ['做什么都提不起劲来，兴趣寥寥', '脑子有些发钝，不太想动'],
};

const OXYTOCIN_DESC = {
    high:   ['和TA说话的时候，身体不自觉地松了下来', '胸腔有种微微发暖的感觉', '有一种想靠近TA的本能'],
    medium: ['不排斥继续聊下去，但也没有特别想靠近', '和TA之间保持着一个刚好的距离'],
    low:    ['本能地想保持一点距离', '身体有些收紧，像是在自我保护', '不太想敞开自己'],
};

const NOREPINEPHRINE_DESC = {
    high:   ['注意力非常集中，像是被什么抓住了', '每个字都听得很清楚，大脑在飞速处理'],
    medium: ['脑子在转，但不算特别专注', '注意力有一搭没一搭的'],
    low:    ['思绪有点飘，不太集中得起来', '听到什么都像隔了一层', '时不时走神，想到别的事情上去了'],
};

const ENDORPHIN_DESC = {
    high:   ['身体有种轻盈的暖意，像是放下了什么', '虽然刚才有些不好受，但现在松了一口气', '一种淡淡的、说不上来的舒坦'],
    medium: [],
    low:    [],
};

const ENERGY_DESC = {
    high:   ['精神不错，脑子很清醒', '浑身有使不完的劲'],
    medium: [],
    low_medium: ['有一点倦，但还撑得住', '开始觉得有些累了'],
    low:    ['脑子有些发沉，眼皮在打架', '整个人懒洋洋的，什么都不太想做', '打了个哈欠，精力真的不太够了'],
};

// ── 组合态描述 ──

interface ComboRule {
    condition: (s: InternalState) => boolean;
    descriptions: string[];
}

const COMBO_RULES: ComboRule[] = [
    {
        condition: s => s.cortisol > 0.6 && s.oxytocin > 0.6,
        descriptions: ['明明身体很紧绷，但又舍不得离开TA', '心里又慌又暖，两种感觉搅在一起'],
    },
    {
        condition: s => s.energy < 0.35 && s.serotonin < 0.35,
        descriptions: ['整个人空落落的，不太想说话', '累得连情绪都懒得表达了'],
    },
    {
        condition: s => s.dopamine > 0.7 && s.oxytocin > 0.7,
        descriptions: ['心跳有些快，但不是因为紧张', '整个人暖暖的，脑子里转的都是好事'],
    },
    {
        condition: s => s.cortisol > 0.7 && s.energy < 0.3,
        descriptions: ['身体和脑子都在抗议，快到极限了', '撑着一口气，但真的快撑不住了'],
    },
    {
        condition: s => s.endorphin > 0.6 && s.oxytocin > 0.6,
        descriptions: ['刚才的疙瘩好像散开了一点，和TA在一起的感觉变柔和了', '身体在告诉你：没事了，可以放下了'],
    },
    {
        condition: s => s.norepinephrine > 0.7 && s.dopamine > 0.7,
        descriptions: ['整个人像上了发条一样，停不下来', '大脑转得飞快，特别投入'],
    },
    {
        condition: s => s.oxytocin < 0.3 && s.cortisol > 0.6,
        descriptions: ['身体本能地想缩起来，不想让任何人靠近', '像是竖起了无形的刺'],
    },
    {
        condition: s => s.serotonin < 0.35 && s.cortisol > 0.6,
        descriptions: ['情绪像是薄冰，稍微用力就会碎', '一点小事都可能成为最后一根稻草'],
    },
];

// ── 工具 ──

function pick(arr: string[]): string | null {
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function renderWordLibrary(state: InternalState): string {
    const lines: string[] = [];

    if (state.cortisol > 0.7) { const d = pick(CORTISOL_DESC.high); if (d) lines.push(d); }
    else if (state.cortisol > 0.55) { const d = pick(CORTISOL_DESC.medium); if (d) lines.push(d); }
    else if (state.cortisol < 0.3) { const d = pick(CORTISOL_DESC.low); if (d) lines.push(d); }

    if (state.serotonin > 0.7) { const d = pick(SEROTONIN_DESC.high); if (d) lines.push(d); }
    else if (state.serotonin < 0.35) { const d = pick(SEROTONIN_DESC.low); if (d) lines.push(d); }
    else if (state.serotonin > 0.55) { const d = pick(SEROTONIN_DESC.medium); if (d) lines.push(d); }

    if (state.dopamine > 0.7) { const d = pick(DOPAMINE_DESC.high); if (d) lines.push(d); }
    else if (state.dopamine < 0.3) { const d = pick(DOPAMINE_DESC.low); if (d) lines.push(d); }
    else if (state.dopamine > 0.55) { const d = pick(DOPAMINE_DESC.medium); if (d) lines.push(d); }

    if (state.oxytocin > 0.7) { const d = pick(OXYTOCIN_DESC.high); if (d) lines.push(d); }
    else if (state.oxytocin < 0.3) { const d = pick(OXYTOCIN_DESC.low); if (d) lines.push(d); }
    else if (state.oxytocin > 0.55) { const d = pick(OXYTOCIN_DESC.medium); if (d) lines.push(d); }

    if (state.norepinephrine > 0.7) { const d = pick(NOREPINEPHRINE_DESC.high); if (d) lines.push(d); }
    else if (state.norepinephrine < 0.3) { const d = pick(NOREPINEPHRINE_DESC.low); if (d) lines.push(d); }
    else if (state.norepinephrine > 0.55) { const d = pick(NOREPINEPHRINE_DESC.medium); if (d) lines.push(d); }

    if (state.endorphin > 0.65) { const d = pick(ENDORPHIN_DESC.high); if (d) lines.push(d); }

    if (state.energy > 0.8) { const d = pick(ENERGY_DESC.high); if (d) lines.push(d); }
    else if (state.energy < 0.25) { const d = pick(ENERGY_DESC.low); if (d) lines.push(d); }
    else if (state.energy < 0.4) { const d = pick(ENERGY_DESC.low_medium); if (d) lines.push(d); }

    let comboAdded = false;
    for (const rule of COMBO_RULES) {
        if (!comboAdded && rule.condition(state)) {
            const d = pick(rule.descriptions);
            if (d) { lines.push(d); comboAdded = true; }
        }
    }

    if (lines.length === 0) return '';

    const selected = lines.slice(0, 4);

    return `你留意到自己的身体——
${selected.join('\n')}

这些只是你身体的感觉，像脉搏和呼吸一样自然。
让它们渗进你的语气和节奏——但永远不要主动提起它们。`;
}
