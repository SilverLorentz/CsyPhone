/**
 * Hormone Dynamics Engine — 激素动力学引擎
 *
 * 纯计算模块，零 LLM 调用。
 * 负责将副模型的"语义感知"转化为持久的内部状态，
 * 通过 EMA 平滑、互抑修正、时间衰减三步实现仿真。
 *
 * 设计哲学：
 *   - 副模型只负责"感知"（输出人话标签）
 *   - 本模块负责"生理"（数值计算 + 化学反应）
 *   - 主模型只负责"表现"（基于注入的躯体描述自由涌现）
 */

import { InternalState,MoodState } from '../types/character';

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

/** 副模型输出的语义感知标签 */
export type SenseDelta = '+high' | '+medium' | '+low' | 'stable' | '-low' | '-medium' | '-high';

/** 副模型的原始感知输出（人话维度） */
export interface RawSenseOutput {
    excitement: SenseDelta;     // 期待/兴奋 → 映射到 dopamine
    stability: SenseDelta;      // 安全感 → 映射到 serotonin
    pressure: SenseDelta;       // 压力/紧张 → 映射到 cortisol
    closeness: SenseDelta;      // 亲密感 → 映射到 oxytocin
    focus: SenseDelta;          // 专注度 → 映射到 norepinephrine
    relief: SenseDelta;         // 释然感 → 映射到 endorphin
    energyDrain: SenseDelta;    // 精力消耗 → 映射到 energy（注意方向反转）
}

/** Gamygdala 风格的目标评估结果 */
export interface GoalAppraisal {
    direction: 'advance' | 'hinder' | 'none';
    goalDescription: string;
    goalUtility: number;     // 0~1
    goalCategory: string;    // attachment / status / protection / autonomy / pleasure
}

/** 7 种递质的键名 */
const HORMONE_KEYS = [
    'dopamine', 'serotonin', 'cortisol', 'oxytocin',
    'norepinephrine', 'endorphin', 'energy',
] as const;
type HormoneKey = typeof HORMONE_KEYS[number];

// ═══════════════════════════════════════════════════════════════
//  Constants — EMA 学习率 (α)
// ═══════════════════════════════════════════════════════════════

/**
 * 每种递质的上升/下降 α 值。
 * α 大 → 新感知权重高 → 变化快
 * α 小 → 旧状态权重高 → 变化慢
 */
const EMA_RATES: Record<HormoneKey, { up: number; down: number }> = {
    dopamine:        { up: 0.70, down: 0.60 },  // 来得快去得也快
    serotonin:       { up: 0.15, down: 0.10 },  // 情绪基线极慢变化
    cortisol:        { up: 0.80, down: 0.15 },  // 来得极快去得极慢
    oxytocin:        { up: 0.20, down: 0.20 },  // 缓慢积累（背叛时代码另行处理）
    norepinephrine:  { up: 0.60, down: 0.40 },  // 中等速度
    endorphin:       { up: 0.50, down: 0.60 },  // 来得一般，消散略快
    energy:          { up: 0.30, down: 0.20 },  // 精力缓慢波动
};

/** 单轮最大变化幅度限制（保险丝） */
const MAX_DELTA_PER_ROUND = 0.30;

/** 基线值（"平静"状态） */
const BASELINE = 0.5;

/** 各维度基线（energy 的基线是 0.7 而非 0.5） */
const BASELINES: Record<HormoneKey, number> = {
    dopamine: 0.5, serotonin: 0.5, cortisol: 0.5,
    oxytocin: 0.5, norepinephrine: 0.5, endorphin: 0.5,
    energy: 0.7,
};

/** 偏离基线多少才算"有感觉"（用于注入判断） */
export const DEVIATION_THRESHOLD = 0.15;

// ═══════════════════════════════════════════════════════════════
//  Constants — 时间衰减半衰期（小时）
// ═══════════════════════════════════════════════════════════════

const HALF_LIFE_HOURS: Record<HormoneKey, number> = {
    dopamine:        1.0,   // 兴奋很短暂
    serotonin:       24.0,  // 情绪基线极慢回归
    cortisol:        4.0,   // 压力约4小时半衰
    oxytocin:        12.0,  // 信任缓慢消退
    norepinephrine:  2.0,   // 专注持续一般
    endorphin:       1.5,   // 释然感较短暂
    energy:          Infinity,  // 能量不自然回归到基线，有专门的恢复逻辑
};

// ═══════════════════════════════════════════════════════════════
//  1. 语义标签 → 数值映射
// ═══════════════════════════════════════════════════════════════

const DELTA_MAP: Record<SenseDelta, number> = {
    '+high':   0.85,
    '+medium': 0.70,
    '+low':    0.60,
    'stable':  NaN,     // 特殊标记: stable → 保持当前值（不拉回基线）
    '-low':    0.40,
    '-medium': 0.30,
    '-high':   0.15,
};

/** 感知维度到激素维度的映射关系 */
const SENSE_TO_HORMONE: { senseKey: keyof RawSenseOutput; hormoneKey: HormoneKey; invert?: boolean }[] = [
    { senseKey: 'excitement',  hormoneKey: 'dopamine' },
    { senseKey: 'stability',   hormoneKey: 'serotonin' },
    { senseKey: 'pressure',    hormoneKey: 'cortisol' },
    { senseKey: 'closeness',   hormoneKey: 'oxytocin' },
    { senseKey: 'focus',       hormoneKey: 'norepinephrine' },
    { senseKey: 'relief',      hormoneKey: 'endorphin' },
    { senseKey: 'energyDrain', hormoneKey: 'energy', invert: true },
];

/**
 * 基于 Gamygdala Appraisal Theory 计算目标对激素的修正因子。
 *
 * 目标推进(advance) → dopamine↑, cortisol↓
 * 目标受阻(hinder)  → dopamine↓, cortisol↑
 * 修正幅度与目标的 utility (重要度) 成正比。
 */
function computeGoalModifiers(appraisal: GoalAppraisal): Partial<Record<HormoneKey, number>> {
    if (appraisal.direction === 'none') return {};

    const u = appraisal.goalUtility;
    const sign = appraisal.direction === 'advance' ? 1 : -1;

    const mods: Partial<Record<HormoneKey, number>> = {};

    // 核心：目标 congruence → dopamine, incongruence → cortisol
    mods.dopamine = sign * u * 0.12;
    mods.cortisol = -sign * u * 0.10;

    // attachment 类目标额外影响 oxytocin
    if (appraisal.goalCategory === 'attachment') {
        mods.oxytocin = sign * u * 0.08;
    }

    // protection 类目标受阻 → norepinephrine↑（保护欲受挫→警觉）
    if (appraisal.goalCategory === 'protection' && appraisal.direction === 'hinder') {
        mods.norepinephrine = u * 0.06;
    }

    // 高重要度目标推进 → serotonin↑（目标确认→基线稳固）
    if (appraisal.direction === 'advance' && u > 0.7) {
        mods.serotonin = u * 0.05;
    }

    return mods;
}

/**
 * 将副模型的人话感知转为 7 个目标数值。
 * 注意: energyDrain 方向反转（消耗大 → energy 低）
 *
 * 当标签为 'stable' 时，对应维度返回 NaN 作为标记，
 * computeNewState 中会识别 NaN 并跳过 EMA（保持当前值）。
 */
export function mapSenseToTargets(sense: RawSenseOutput): Record<HormoneKey, number> {
    const result = {} as Record<HormoneKey, number>;
    for (const mapping of SENSE_TO_HORMONE) {
        const raw = DELTA_MAP[sense[mapping.senseKey]] ?? BASELINE;
        result[mapping.hormoneKey] = mapping.invert && !isNaN(raw) ? 1.0 - raw : raw;
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════
//  2. EMA 平滑
// ═══════════════════════════════════════════════════════════════

function applyEMA(prev: number, target: number, αUp: number, αDown: number): number {
    const isRising = target > prev;
    const α = isRising ? αUp : αDown;
    let result = prev * (1 - α) + target * α;

    // 单轮变化幅度限制（保险丝）
    const delta = result - prev;
    if (Math.abs(delta) > MAX_DELTA_PER_ROUND) {
        result = prev + Math.sign(delta) * MAX_DELTA_PER_ROUND;
    }

    return result;
}

/**
 * 对 7 个维度分别应用 EMA 平滑。
 * @param prev 上一轮的最终状态
 * @param targets 本轮副模型感知映射后的目标值
 */
export function applyEMASmoothing(
    prev: Record<HormoneKey, number>,
    targets: Record<HormoneKey, number>,
): Record<HormoneKey, number> {
    const result = {} as Record<HormoneKey, number>;
    for (const key of HORMONE_KEYS) {
        const rates = EMA_RATES[key];
        result[key] = applyEMA(prev[key], targets[key], rates.up, rates.down);
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════
//  3. 互抑修正（化学反应）
// ═══════════════════════════════════════════════════════════════

/**
 * 基于递质之间的生理互动关系，对 EMA 后的数值进行修正。
 * 所有修正都是柔性的（乘法削减），不会产生负值。
 */
export function applyCrossEffects(state: Record<HormoneKey, number>): Record<HormoneKey, number> {
    const s = { ...state };

    // ── 皮质醇↑ → 压低血清素 (压力破坏情绪稳定) ──
    if (s.cortisol > 0.6) {
        const pressure = (s.cortisol - 0.6) * 0.5; // 最大削减: (0.95-0.6)*0.5 = 17.5%
        s.serotonin *= (1 - pressure);
    }

    // ── 皮质醇↑ → 催产素效果被削弱 (紧张时难感到亲密) ──
    if (s.cortisol > 0.6) {
        const pressure = (s.cortisol - 0.6) * 0.3;
        s.oxytocin *= (1 - pressure);
    }

    // ── 催产素↑ → 缓冲皮质醇 (安全的关系减压) ──
    if (s.oxytocin > 0.6) {
        const comfort = (s.oxytocin - 0.6) * 0.3;
        s.cortisol *= (1 - comfort);
    }

    // ── 内啡肽↑ → 加速皮质醇下降 (释然促进恢复) ──
    if (s.endorphin > 0.5) {
        const relief = (s.endorphin - 0.5) * 0.4;
        s.cortisol *= (1 - relief);
    }

    // ── 【新增】血清素↑ → 缓冲皮质醇 (情绪稳定时压力自然减轻) ──
    if (s.serotonin > 0.6) {
        const calm = (s.serotonin - 0.6) * 0.25;
        s.cortisol *= (1 - calm);
    }

    // ── 【新增】多巴胺↑ + 皮质醇↑ → 加剧去甲肾上腺素 (兴奋+紧张=高度警觉, 如告白前/考试前) ──
    if (s.dopamine > 0.6 && s.cortisol > 0.6) {
        const alertBoost = Math.min((s.dopamine - 0.6), (s.cortisol - 0.6)) * 0.4;
        s.norepinephrine = Math.min(0.95, s.norepinephrine + alertBoost);
    }

    // ── 【新增】内啡肽↑ → 血清素微升 (释然后情绪基线回升) ──
    if (s.endorphin > 0.6) {
        const uplift = (s.endorphin - 0.6) * 0.2;
        s.serotonin = Math.min(0.95, s.serotonin + uplift);
    }

    // ── 【仿生补完】皮质醇↑ → 压低多巴胺 (持续高压→快感缺失/anhedonia) ──
    // 生理依据: 慢性压力抑制 VTA→NAc 中脑边缘多巴胺通路
    if (s.cortisol > 0.7) {
        const anhedonia = (s.cortisol - 0.7) * 0.35; // 最大削减: (0.95-0.7)*0.35 ≈ 8.75%
        s.dopamine *= (1 - anhedonia);
    }

    // ── 【仿生补完】皮质醇↑ → 精力消耗 (肾上腺疲劳效应) ──
    // 生理依据: 持续 HPA 轴激活消耗身体储备
    if (s.cortisol > 0.7) {
        s.energy -= (s.cortisol - 0.7) * 0.12;
    }

    // ── 【仿生补完】多巴胺↑ → 催产素微升 (奖赏+亲密协同="坠入爱河"效应) ──
    // 生理依据: 多巴胺奖赏通路与催产素在 VTA 存在正向交互
    if (s.dopamine > 0.65) {
        const bonding = (s.dopamine - 0.65) * 0.12;
        s.oxytocin = Math.min(0.95, s.oxytocin + bonding);
    }

    // ── 【仿生补完】血清素↑ → 多巴胺微降 (SSRI "情感平淡" 效应) ──
    // 生理依据: 5-HT2C 受体激活抑制中脑多巴胺释放
    if (s.serotonin > 0.7) {
        const blunting = (s.serotonin - 0.7) * 0.15;
        s.dopamine *= (1 - blunting);
    }

    // ── 多巴胺↑ → 能量消耗加速 (兴奋是耗能的) ──
    if (s.dopamine > 0.7) {
        s.energy -= (s.dopamine - 0.7) * 0.15;
    }

    // ── 去甲肾上腺素↑ → 能量微耗 (高度专注也耗能) ──
    if (s.norepinephrine > 0.7) {
        s.energy -= (s.norepinephrine - 0.7) * 0.08;
    }

    // ── 能量↓ → 拉低血清素 + 去甲肾上腺素 (累了就容易 emo + 走神) ──
    if (s.energy < 0.3) {
        const penalty = (0.3 - s.energy) * 0.4;
        s.serotonin -= penalty;
        s.norepinephrine -= penalty;
    }

    // ── Clamp 所有值到 [0.05, 0.95] ──
    for (const key of HORMONE_KEYS) {
        s[key] = Math.max(0.05, Math.min(0.95, s[key]));
    }

    return s;
}

// ═══════════════════════════════════════════════════════════════
//  4. 时间衰减
// ═══════════════════════════════════════════════════════════════

/**
 * 昼夜节律精力恢复率曲线（时/h）。
 * 比简单的 isLateNight 二值判断更自然。
 *
 * @param isUserActive 用户是否正在活跃（发消息），凌晨时段影响恢复/消耗判定
 */
function getCircadianRecoveryRate(hour: number, isUserActive: boolean = false): number {
    if (hour >= 6 && hour < 10)  return 0.10;   // 晨间恢复高峰
    if (hour >= 10 && hour < 14) return 0.06;   // 稳态
    if (hour >= 14 && hour < 16) return 0.04;   // 午后低谷
    if (hour >= 16 && hour < 22) return 0.06;   // 稳态
    if (hour >= 22 || hour < 1)  return isUserActive ? -0.03 : 0.02;  // 深夜: 熬夜反而消耗 vs 入睡微恢复
    /* 1:00 ~ 6:00 */           return isUserActive ? -0.05 : 0.08;  // 凌晨: 熬夜严重消耗 vs 深度睡眠恢复
}

/**
 * 【仿生补完】皮质醇昼夜节律基线偏移。
 * 真实人体皮质醇在凌晨 4-6 点开始上升，上午 8-9 点达峰，之后逐渐下降。
 * 返回对 cortisol 基线 (0.5) 的偏移量。
 */
function getCortisolCircadianShift(hour: number): number {
    if (hour >= 6 && hour < 10)  return +0.05;  // 晨峰 (CAR: Cortisol Awakening Response)
    if (hour >= 10 && hour < 14) return +0.02;  // 上午稳态
    if (hour >= 14 && hour < 18) return  0.00;  // 下午回归
    if (hour >= 18 && hour < 22) return -0.02;  // 傍晚下降
    if (hour >= 22 || hour < 4)  return -0.05;  // 夜间低谷
    /* 4:00 ~ 6:00 */           return +0.02;  // 黎明前开始回升
}

/**
 * 基于距离上次更新的时间差，让各递质自然回归基线。
 * 使用半衰期公式: value = baseline + (value - baseline) × 0.5^(hours/halfLife)
 *
 * @param state 当前持久化的状态
 * @param elapsedMs 距上次更新的毫秒数
 */
export function applyTimeDecay(
    state: Record<HormoneKey, number>,
    elapsedMs: number,
    isUserActive: boolean = false,
): Record<HormoneKey, number> {
    const s = { ...state };
    const hours = elapsedMs / 3600000;

    // 如果间隔太短（< 10秒），不做时间衰减
    if (hours < 0.003) return s;

    // 【Bug 修复】在衰减前保存原始 cortisol，用于后续能量惩罚
    const originalCortisol = s.cortisol;

    const currentHour = new Date().getHours();

    for (const key of HORMONE_KEYS) {
        if (key === 'energy') continue; // 能量有专门的恢复逻辑
        const halfLife = HALF_LIFE_HOURS[key];
        if (!isFinite(halfLife)) continue;

        // 【仿生补完】cortisol 使用昼夜节律偏移后的基线
        const baseline = key === 'cortisol'
            ? BASELINE + getCortisolCircadianShift(currentHour)
            : BASELINES[key];

        // 回归基线
        const decayFactor = Math.pow(0.5, hours / halfLife);
        s[key] = baseline + (s[key] - baseline) * decayFactor;
    }

    // ── 能量恢复逻辑（特殊处理）──
    // 【仿生补完】凌晨时段区分睡眠恢复 vs 熬夜消耗
    const recoveryRate = getCircadianRecoveryRate(currentHour, isUserActive);
    let energyDelta = hours * recoveryRate;

    // 【Bug 修复】使用原始 cortisol 判断能量惩罚（"带着气睡觉"）
    if (originalCortisol > 0.6) {
        const penalty = (originalCortisol - 0.6) * 0.5; // 最多 50% 打折
        energyDelta *= (1 - penalty);
    }

    s.energy = s.energy + energyDelta;

    // Clamp（统一最后执行）
    for (const key of HORMONE_KEYS) {
        s[key] = Math.max(0.05, Math.min(0.95, s[key]));
    }

    return s;
}

// ═══════════════════════════════════════════════════════════════
//  5. 完整计算管线
// ═══════════════════════════════════════════════════════════════

/** 情绪惯性: streak > 此阈值时，回归速率开始衰减 */
const INERTIA_STREAK_THRESHOLD = 3;
/** 每多 1 轮 streak，down α 乘以此系数（越小 = 越难回归） */
const INERTIA_DAMPING = 0.85;
/** 【仿生补完】刺激适应: streak > 此阈值时，上升速率也开始衰减（脱敏/habituation） */
const HABITUATION_STREAK_THRESHOLD = 6;
/** 每多 1 轮 streak 超过适应阈值，up α 乘以此系数 */
const HABITUATION_DAMPING = 0.90;

/**
 * 从副模型的语义感知到最终的 InternalState，一步到位。
 *
 * @param sense 副模型输出的人话感知
 * @param previous 上一轮持久化的 InternalState（可能为 undefined）
 * @returns 新的 InternalState（不含 innerVoice，留给 generateInnerVoice 填充）
 */
export function computeNewState(
    sense: RawSenseOutput,
    previous: InternalState | undefined,
    goalAppraisal?: GoalAppraisal,
): Omit<InternalState, 'innerVoice' | 'surfaceEmotion'> {
    const now = Date.now();

    // 初始化：第一轮没有历史状态
    if (!previous) {
        const targets = mapSenseToTargets(sense);
        // 将 NaN (stable) 替换为基线
        for (const key of HORMONE_KEYS) {
            if (isNaN(targets[key])) targets[key] = BASELINES[key];
        }
        return {
            ...targets,
            roundCount: 1,
            updatedAt: now,
        };
    }

    // 提取上一轮的 7 维数值
    const prevHormones: Record<HormoneKey, number> = {
        dopamine: previous.dopamine,
        serotonin: previous.serotonin,
        cortisol: previous.cortisol,
        oxytocin: previous.oxytocin,
        norepinephrine: previous.norepinephrine,
        endorphin: previous.endorphin,
        energy: previous.energy,
    };

    // Step 0: 时间衰减（在 EMA 之前，基于上次更新到现在的时间差）
    // isUserActive = true（用户正在发消息 → 不在睡觉）
    const elapsed = now - previous.updatedAt;
    const decayed = applyTimeDecay(prevHormones, elapsed, true);

    // Step 1: 语义标签 → 目标数值
    const targets = mapSenseToTargets(sense);

    // Step 1.5: stable 标签处理 — NaN 的维度使用当前值（跳过 EMA）
    for (const key of HORMONE_KEYS) {
        if (isNaN(targets[key])) {
            targets[key] = decayed[key];  // 保持当前值，不拉回基线
        }
    }

    // Step 1.7: 目标评估修正 (Gamygdala appraisal injection)
    // 事件对角色目标的推进/阻碍直接调制激素目标值
    if (goalAppraisal && goalAppraisal.direction !== 'none') {
        const mods = computeGoalModifiers(goalAppraisal);
        for (const key of HORMONE_KEYS) {
            const mod = mods[key];
            if (mod) {
                targets[key] = Math.max(0.05, Math.min(0.95, targets[key] + mod));
            }
        }
    }

    // Step 2: EMA 平滑（新旧加权），应用情绪惯性 + 刺激适应
    const prevStreaks = previous.streaks || {};
    const smoothed = {} as Record<HormoneKey, number>;
    for (const key of HORMONE_KEYS) {
        const rates = EMA_RATES[key];
        let upRate = rates.up;
        let downRate = rates.down;

        const streak = prevStreaks[key] || 0;

        // 情绪惯性: streak 超过阈值时，减缓回归速度
        if (streak > INERTIA_STREAK_THRESHOLD) {
            const dampingRounds = streak - INERTIA_STREAK_THRESHOLD;
            downRate *= Math.pow(INERTIA_DAMPING, dampingRounds);
        }

        // 【仿生补完】刺激适应 (habituation): 同方向刺激持续过久，up α 也衰减
        // 生理依据: 受体下调 (receptor downregulation) — 持续暴露于同一递质导致受体脱敏
        if (streak > HABITUATION_STREAK_THRESHOLD) {
            const habRounds = streak - HABITUATION_STREAK_THRESHOLD;
            upRate *= Math.pow(HABITUATION_DAMPING, habRounds);
        }

        smoothed[key] = applyEMA(decayed[key], targets[key], upRate, downRate);
    }

    // Step 3: 互抑修正（化学反应）
    const final = applyCrossEffects(smoothed);

    // Step 4: 更新 streak 计数器
    const newStreaks: Partial<Record<string, number>> = {};
    for (const key of HORMONE_KEYS) {
        const base = BASELINES[key];
        const deviation = final[key] - base;
        const prevDeviation = prevHormones[key] - base;

        // 同方向偏离 → streak +1，方向反转或回归基线 → 重置
        if (Math.abs(deviation) > DEVIATION_THRESHOLD) {
            if (Math.sign(deviation) === Math.sign(prevDeviation) && Math.abs(prevDeviation) > DEVIATION_THRESHOLD) {
                newStreaks[key] = (prevStreaks[key] || 0) + 1;
            } else {
                newStreaks[key] = 1;  // 新方向开始
            }
        }
        // deviation <= threshold → 回到基线附近，不记入 streaks（自然消失）
    }

    return {
        ...final,
        streaks: Object.keys(newStreaks).length > 0 ? newStreaks : undefined,
        roundCount: previous.roundCount + 1,
        updatedAt: now,
    };
}

// ═══════════════════════════════════════════════════════════════
//  6. 旧格式迁移
// ═══════════════════════════════════════════════════════════════

/** 判断一个 moodState 是旧格式还是新格式 */
export function isLegacyMoodState(state: any): state is MoodState {
    return state && typeof state.mood === 'string' && typeof state.intensity === 'number' && !('dopamine' in state);
}

/** 将旧 MoodState 转换为新 InternalState 的初始值 */
export function migrateLegacyMoodState(legacy: MoodState): InternalState {
    const intensity = legacy.intensity / 10; // 1-10 → 0.1-1.0

    // 尝试从情绪词推断递质状态
    const mood = legacy.mood || '平静';
    const isNegative = /[委屈难过伤心生气烦躁焦虑紧张害怕不安愤怒]/.test(mood);
    const isPositive = /[开心高兴快乐幸福心动甜蜜放松满足期待兴奋]/.test(mood);

    return {
        dopamine:        isPositive ? BASELINE + intensity * 0.3 : BASELINE - intensity * 0.1,
        serotonin:       isNegative ? BASELINE - intensity * 0.3 : BASELINE + intensity * 0.1,
        cortisol:        isNegative ? BASELINE + intensity * 0.3 : BASELINE - intensity * 0.1,
        oxytocin:        isPositive ? BASELINE + intensity * 0.2 : BASELINE,
        norepinephrine:  intensity > 0.6 ? BASELINE + intensity * 0.2 : BASELINE,
        endorphin:       BASELINE,
        energy:          BASELINE,
        innerVoice:      legacy.innerVoice || '',
        surfaceEmotion:  legacy.mood || '平静',
        roundCount:      legacy.roundCount || 1,
        updatedAt:       legacy.updatedAt || Date.now(),
    };
}

/**
 * 获取标准化的 InternalState，自动处理迁移。
 * 如果传入旧格式，转为新格式；如果传入新格式或 undefined，直接返回。
 */
export function resolveInternalState(moodState: InternalState | MoodState | undefined): InternalState | undefined {
    if (!moodState) return undefined;
    if (isLegacyMoodState(moodState)) return migrateLegacyMoodState(moodState);
    return moodState as InternalState;
}

/** 创建默认的平静基线状态 */
export function createBaselineState(): InternalState {
    return {
        dopamine: BASELINE,
        serotonin: BASELINE,
        cortisol: BASELINE,
        oxytocin: BASELINE,
        norepinephrine: BASELINE,
        endorphin: BASELINE,
        energy: 0.7,  // 默认精力偏高（刚开始聊天）
        innerVoice: '',
        surfaceEmotion: '平静',
        roundCount: 0,
        updatedAt: Date.now(),
    };
}

// ═══════════════════════════════════════════════════════════════
//  7. 辅助工具
// ═══════════════════════════════════════════════════════════════

/** 计算综合激活度（用于自主决策引擎的概率门控） */
export function computeActivationLevel(state: InternalState): number {
    // 综合考虑压力、兴奋、精力
    const stressComponent = Math.max(0, state.cortisol - BASELINE) * 2;
    const exciteComponent = Math.max(0, state.dopamine - BASELINE) * 1.5;
    const energyComponent = state.energy;
    return Math.min(10, Math.round((stressComponent + exciteComponent + energyComponent) * 5));
}

/** 检查是否有任何维度偏离基线超过阈值（用于决定是否注入 prompt） */
export function hasSignificantDeviation(state: InternalState): boolean {
    for (const key of HORMONE_KEYS) {
        if (Math.abs(state[key] - BASELINES[key]) > DEVIATION_THRESHOLD) {
            return true;
        }
    }
    return false;
}

/** 格式化为日志字符串 */
export function formatStateLog(state: InternalState): string {
    const vals = HORMONE_KEYS.map(k => `${k.slice(0, 4)}=${state[k].toFixed(2)}`).join(' ');
    return `${vals} | ${state.surfaceEmotion} | R${state.roundCount}`;
}

// ═══════════════════════════════════════════════════════════════
//  8. 情感基因 — 激素快照 & 冲量 & 共振
// ═══════════════════════════════════════════════════════════════

/** 激素快照类型（7 维浮点向量） */
export type HormoneSnapshot = {
    [K in typeof HORMONE_KEYS[number]]: number;
};

/** 从 InternalState 提取 7 维激素快照 */
export function extractHormoneSnapshot(state: InternalState): HormoneSnapshot {
    const snapshot = {} as HormoneSnapshot;
    for (const key of HORMONE_KEYS) {
        snapshot[key] = state[key];
    }
    return snapshot;
}

/**
 * 计算情绪冲量 (Salience Score)。
 * 
 * 每个维度的偏离按其最大可能偏离归一化到 [0, 1]，保证 7 个维度等权。
 * 总范围: 0（完全平静）~ 7（所有维度满偏离）。
 *
 * 冲量越高 = 情绪波动越剧烈 = 记忆越"刻骨铭心"。
 */
export function computeSalience(state: InternalState): number {
    // 使用模块级 BASELINES 常量
    const MAX_DEVS: Record<string, number> = {
        dopamine: 0.45, serotonin: 0.45, cortisol: 0.45,
        oxytocin: 0.45, norepinephrine: 0.45, endorphin: 0.45,
        energy: 0.65,  // energy 基线 0.7, clamp 下限 0.05 → 最大偏离 0.65
    };
    let sum = 0;
    for (const key of HORMONE_KEYS) {
        const dev = Math.abs(state[key] - BASELINES[key]);
        sum += dev / MAX_DEVS[key];  // 归一化到 [0, 1]
    }
    return sum;  // 范围 [0, 7]
}

/**
 * 两个激素快照之间的"情绪共振"分数。
 * 
 * 关键：先减去基线，将原始全正值向量转为"情绪偏离向量"。
 * 不这样做的话，全正向量的余弦相似度永远在 0.85~0.95，失去区分力。
 * 
 * 偏离向量的余弦值 ∈ [-1, 1]：
 *   - +1：完全同向（相同的情绪偏离模式）
 *   -  0：正交（无关的情绪状态）
 *   - -1：完全反向（相反的情绪偏离模式）
 * 
 * 映射到 [0, 1] 后返回：
 *   - 1.0：完美共振（两个状态偏离方向完全一致）
 *   - 0.5：中性（无偏离，或偏离正交）
 *   - 0.0：反向共振（适合"对比回忆"场景）
 */
export function hormoneResonance(a: HormoneSnapshot, b: HormoneSnapshot): number {
    let dot = 0, normA = 0, normB = 0;
    for (const key of HORMONE_KEYS) {
        const base = key === 'energy' ? 0.7 : BASELINE;
        const da = a[key] - base;
        const db = b[key] - base;
        dot += da * db;
        normA += da * da;
        normB += db * db;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0.5;  // 两者都在基线附近 → 中性共振
    const rawCos = dot / denom;   // ∈ [-1, 1]
    return (rawCos + 1) / 2;      // 映射到 [0, 1]
}
