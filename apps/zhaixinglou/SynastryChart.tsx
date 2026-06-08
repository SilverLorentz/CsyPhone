/**
 * SynastryChart — 高质量极简 SVG 占星合盘
 * 
 * 设计规范：
 * - viewBox="0 0 800 800"，全透明背景
 * - 暗金/黄铜色主线条 (#A67C00)，纯金符号 (#FFD700)
 * - 和谐相位暗金，紧张相位暗红 (#8B0000)
 * - 外圈微弱金色辉光滤镜
 * - 极细线 + 低透明度，视觉层级分明
 * 
 * 可行性说明：
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 本组件接收由 astroCalc.ts 中已完成的 calcSynastry() 输出的 SynastryResult，
 * 其中包含两人星盘的七颗行星黄经坐标及所有相位关系。
 * SVG 使用纯数学（三角函数）将黄经映射到圆上坐标，
 * 不依赖任何第三方图表库，渲染完全可控。
 * 所有颜色、线宽、透明度均遵循用户的严苛设计规范。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import React from 'react';
import type { SynastryResult,BirthChart } from './astroCalc';

// ─── 常量 ───
const CX = 400, CY = 400;                 // 圆心
const R_OUTER = 370;                        // 外圈星座环
const R_OUTER_INNER = 340;                  // 刻度环外侧
const R_SIGNS = 355;                        // 星座符号位置
const R_HOUSE_LINE_INNER = 220;             // 宫位线内侧终点
const R_PLANET_A = 290;                     // Person A 行星环
const R_PLANET_B = 250;                     // Person B 行星环
const R_PLANET_SYMBOL_A = 305;              // A 符号位置
const R_PLANET_SYMBOL_B = 235;              // B 符号位置
const R_ASPECT_A = 270;                     // 相位线起点 (A侧)
const R_ASPECT_B = 230;                     // 相位线终点 (B侧)

// 十二星座符号 — 使用优雅的拉丁缩写，替代默认 Unicode 星座符号
const ZODIAC_GLYPHS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis'];

// 配色
const COLORS = {
    line: '#FFD700',        // 明亮金 — 主线条
    gold: '#FFD700',        // 纯金 — 符号焦点
    goldMatte: '#F4D03F',   // 柔金 — B方符号
    goldFoil: '#FFD700',    // 金箔 — 刻度
    harmonic: '#FFD700',    // 和谐相位
    tense: '#C0392B',       // 紧张/挑战相位 (亮暗红)
    neutral: '#F4D03F',     // 中性相位
    glow: '#FFD700',        // 辉光颜色
};

// ─── 数学工具 ───
/** 黄经度数 → SVG 坐标（天文学约定：0° 白羊在左，逆时针增）*/
function lonToXY(lon: number, r: number): { x: number; y: number } {
    // SVG 0° 在右侧，顺时针。天文盘 0° 在左（180°），逆时针。
    // 转换：angle = 180 - lon（度数翻转）
    const angle = (180 - lon) * Math.PI / 180;
    return {
        x: CX + r * Math.cos(angle),
        y: CY - r * Math.sin(angle),
    };
}


// ─── Props ───
interface SynastryChartProps {
    synastry: SynastryResult;
    nameA?: string;
    nameB?: string;
}

const SynastryChart: React.FC<SynastryChartProps> = ({ synastry, nameA = '你', nameB = '对方' }) => {
    const { chart1, chart2, aspects } = synastry;

    return (
        <svg
            viewBox="0 0 800 800"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
            {/* ━━━ Layer 0: Defs — 滤镜、渐变 ━━━ */}
            <defs>
                {/* 金色辉光滤镜 — 行星符号 */}
                <filter id="syn-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                    <feFlood floodColor={COLORS.glow} floodOpacity="0.4" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glowColor" />
                    <feMerge>
                        <feMergeNode in="glowColor" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                {/* 更强的外圈辉光 — 圆环 */}
                <filter id="syn-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                    <feFlood floodColor={COLORS.glow} floodOpacity="0.45" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glowColor" />
                    <feMerge>
                        <feMergeNode in="glowColor" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                {/* 线条发光滤镜 — 分隔线/相位线 */}
                <filter id="syn-glow-line" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                    <feFlood floodColor={COLORS.glow} floodOpacity="0.35" result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glowColor" />
                    <feMerge>
                        <feMergeNode in="glowColor" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* ━━━ Layer 1: 外圈同心圆（金色流光） ━━━ */}
            <g filter="url(#syn-glow-strong)">
                <circle cx={CX} cy={CY} r={R_OUTER}
                    fill="transparent"
                    stroke={COLORS.line}
                    strokeWidth="1.5"
                    opacity="0.85"
                />
            </g>
            <g filter="url(#syn-glow-line)">
                <circle cx={CX} cy={CY} r={R_OUTER_INNER}
                    fill="transparent"
                    stroke={COLORS.line}
                    strokeWidth="0.8"
                    opacity="0.6"
                />
            </g>
            {/* 内分隔圈 */}
            <circle cx={CX} cy={CY} r={R_PLANET_A + 15}
                fill="transparent"
                stroke={COLORS.line}
                strokeWidth="0.6"
                opacity="0.35"
            />
            <circle cx={CX} cy={CY} r={R_PLANET_B - 15}
                fill="transparent"
                stroke={COLORS.line}
                strokeWidth="0.6"
                opacity="0.35"
            />
            {/* 最内装饰圈 */}
            <circle cx={CX} cy={CY} r={R_HOUSE_LINE_INNER}
                fill="transparent"
                stroke={COLORS.line}
                strokeWidth="0.5"
                opacity="0.3"
            />

            {/* ━━━ Layer 2: 12宫位线 + 星座符号（金色发光） ━━━ */}
            <g filter="url(#syn-glow-line)">
                {ZODIAC_GLYPHS.map((glyph, i) => {
                    const startAngle = i * 30;
                    const outerPt = lonToXY(startAngle, R_OUTER);
                    const innerPt = lonToXY(startAngle, R_HOUSE_LINE_INNER);
                    const midPt = lonToXY(startAngle + 15, R_SIGNS);

                    return (
                        <g key={`sign-${i}`}>
                            {/* 宫位分隔线 */}
                            <line
                                x1={outerPt.x} y1={outerPt.y}
                                x2={innerPt.x} y2={innerPt.y}
                                stroke={COLORS.line}
                                strokeWidth="1.2"
                                opacity="0.6"
                            />
                            {/* 星座符号 */}
                            <text
                                x={midPt.x} y={midPt.y}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill={COLORS.gold}
                                fontSize="10"
                                fontFamily="'ZhaixinglouTitle', serif"
                                fontStyle="italic"
                                opacity="0.9"
                                letterSpacing="0.5"
                                style={{ textShadow: '0 0 8px rgba(255, 215, 0, 0.7)' }}
                            >
                                {glyph}
                            </text>
                        </g>
                    );
                })}
            </g>

            {/* Layer 3: 刻度环 — 已移除，保持盘面干净 */}

            {/* ━━━ Layer 4: Person A 行星（明亮金色流光） ━━━ */}
            <g filter="url(#syn-glow)">
                {/* A 行星环 */}
                <circle cx={CX} cy={CY} r={R_PLANET_A}
                    fill="transparent"
                    stroke={COLORS.gold}
                    strokeWidth="0.6"
                    opacity="0.3"
                    strokeDasharray="3 5"
                />
                {renderPlanets(chart1, R_PLANET_SYMBOL_A, R_PLANET_A, COLORS.gold, 1.0, '亮')}
            </g>

            {/* ━━━ Layer 5: Person B 行星（柔金） ━━━ */}
            <g filter="url(#syn-glow)">
                {/* B 行星环 */}
                <circle cx={CX} cy={CY} r={R_PLANET_B}
                    fill="transparent"
                    stroke={COLORS.goldMatte}
                    strokeWidth="0.6"
                    opacity="0.3"
                    strokeDasharray="3 5"
                />
                {renderPlanets(chart2, R_PLANET_SYMBOL_B, R_PLANET_B, COLORS.goldMatte, 0.85, '暗')}
            </g>

            {/* ━━━ Layer 6: 相位连线（发光） ━━━ */}
            <g filter="url(#syn-glow-line)">
                {aspects.map((asp, i) => {
                    const p1 = chart1.planets.find(p => p.name === asp.planet1);
                    const p2 = chart2.planets.find(p => p.name === asp.planet2);
                    if (!p1 || !p2) return null;

                    const ptA = lonToXY(p1.longitude, R_ASPECT_A);
                    const ptB = lonToXY(p2.longitude, R_ASPECT_B);

                    const color = asp.nature === 'tense' ? COLORS.tense
                        : asp.nature === 'harmonious' ? COLORS.harmonic
                            : COLORS.neutral;

                    const opacity = asp.nature === 'tense' ? 0.5
                        : asp.nature === 'harmonious' ? 0.45
                            : 0.35;

                    return (
                        <line
                            key={`asp-${i}`}
                            x1={ptA.x} y1={ptA.y}
                            x2={ptB.x} y2={ptB.y}
                            stroke={color}
                            strokeWidth="0.8"
                            opacity={opacity}
                        />
                    );
                })}
            </g>

            {/* ━━━ 中心标记 ━━━ */}
            <circle cx={CX} cy={CY} r="3"
                fill={COLORS.gold}
                opacity="0.4"
            />
            <circle cx={CX} cy={CY} r="1.2"
                fill={COLORS.gold}
                opacity="0.7"
            />

            {/* ━━━ 人名标注 ━━━ */}
            <text x={CX} y={CY - 185} textAnchor="middle" fill={COLORS.gold} fontSize="9" fontFamily="sans-serif" opacity="0.7" letterSpacing="2">
                {nameA}
            </text>
            <text x={CX} y={CY + 195} textAnchor="middle" fill={COLORS.goldMatte} fontSize="9" fontFamily="sans-serif" opacity="0.5" letterSpacing="2">
                {nameB}
            </text>

            {/* ━━━ 图例 ━━━ */}
            <g opacity="0.5" transform={`translate(${CX - 50}, 760)`}>
                <line x1="0" y1="0" x2="16" y2="0" stroke={COLORS.harmonic} strokeWidth="1" opacity="0.6" />
                <text x="20" y="3" fill={COLORS.gold} fontSize="7" fontFamily="sans-serif" opacity="0.6">和谐</text>
                <line x1="50" y1="0" x2="66" y2="0" stroke={COLORS.tense} strokeWidth="1" opacity="0.6" />
                <text x="70" y="3" fill={COLORS.gold} fontSize="7" fontFamily="sans-serif" opacity="0.6">挑战</text>
            </g>
        </svg>
    );
};

/** 渲染行星符号 + 发光小圆点 */
function renderPlanets(
    chart: BirthChart,
    rSymbol: number,
    rDot: number,
    color: string,
    opacity: number,
    _label: string,
) {
    // 防止行星符号重叠：检测碰撞并微调
    const positions = chart.planets.map(p => ({
        ...p,
        adjustedLon: p.longitude,
    }));

    // 简单碰撞检测：如果两颗行星距离 < 8°，稍微分开
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            let diff = Math.abs(positions[i].adjustedLon - positions[j].adjustedLon);
            if (diff > 180) diff = 360 - diff;
            if (diff < 8) {
                positions[i].adjustedLon -= 4;
                positions[j].adjustedLon += 4;
            }
        }
    }

    return positions.map((p, i) => {
        const symPt = lonToXY(p.adjustedLon, rSymbol);
        const dotPt = lonToXY(p.longitude, rDot);
        // 度数标注位置（符号外侧一点）

        return (
            <g key={`planet-${_label}-${i}`}>
                {/* 行星在环上的精确位置点 */}
                <circle
                    cx={dotPt.x} cy={dotPt.y} r="2"
                    fill={color}
                    opacity={opacity * 0.8}
                />
                {/* 行星符号 — 明亮 + 金色辉光 */}
                <text
                    x={symPt.x} y={symPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color}
                    fontSize="14"
                    fontFamily="serif"
                    fontWeight="bold"
                    opacity={opacity}
                    style={{ textShadow: `0 0 10px ${color}88, 0 0 20px ${color}44` }}
                >
                    {p.symbol}
                </text>
                {/* 度数标注 */}
                <text
                    x={symPt.x} y={symPt.y + 12}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={color}
                    fontSize="5.5"
                    fontFamily="monospace"
                    opacity={opacity * 0.5}
                >
                    {p.degree.toFixed(0)}°
                </text>
            </g>
        );
    });
}

export default React.memo(SynastryChart);
