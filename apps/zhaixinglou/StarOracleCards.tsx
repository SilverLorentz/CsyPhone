/**
 * StarOracleCards — 星谕卡片组（纵向展开版）
 *
 * 纵向排列的行星卡片列表。
 * 折叠态：仅显示「太阳：双鱼座，6.8°」极简文本。
 * 展开态：缓缓浮现旋转六芒星法阵 SVG 背景 + 星谕判词。
 */
import React,{ useState,useCallback } from 'react';
import type { BirthChart,PlanetPosition } from './astroCalc';

// ─── 星谕判词模板 ───
const ORACLE_TEXTS: Record<string, (sign: string, degree: number) => string> = {
    '太阳': (sign, deg) =>
        `你的本命之光落于${sign}第${Math.ceil(deg)}度。这颗恒星以不灭的火焰照亮你灵魂深处的渴望——你天生是一个${sign === '白羊座' ? '开拓者' : sign === '金牛座' ? '守护者' : sign === '双子座' ? '传信者' : sign === '巨蟹座' ? '抚慰者' : sign === '狮子座' ? '王者' : sign === '处女座' ? '净化者' : sign === '天秤座' ? '裁决者' : sign === '天蝎座' ? '掘墓人' : sign === '射手座' ? '远行者' : sign === '摩羯座' ? '攀登者' : sign === '水瓶座' ? '革新者' : '梦行者'}，你的存在本身就是一种宣言。`,
    '月亮': (sign, deg) =>
        `月之暗面映照于${sign}第${Math.ceil(deg)}度。你内心最柔软的情感在此处潮汐般涌动——当夜深人静，你会感受到一种无法言说的${sign === '巨蟹座' ? '归属感' : sign === '天蝎座' ? '执念' : sign === '双鱼座' ? '共情' : '召唤'}，那是月光在轻声诉说你前世的记忆。`,
    '水星': (sign, deg) =>
        `信使之星停泊于${sign}第${Math.ceil(deg)}度。你的思维如同${sign === '双子座' ? '水银泻地般灵动' : sign === '处女座' ? '精密仪器般运转' : '星辰般闪烁'}，语言是你的魔法棒——每一个词语都承载着改变现实的力量。小心不要让过多的想法淹没了直觉的低语。`,
    '金星': (sign, deg) =>
        `爱与美之星栖息于${sign}第${Math.ceil(deg)}度。你渴望的爱情有着${sign === '金牛座' ? '大地般的厚重' : sign === '天秤座' ? '艺术品般的精致' : sign === '双鱼座' ? '诗歌般的绮丽' : '星光般的独特色彩'}。在关系中，你追求的不仅仅是陪伴，而是灵魂层面的共振与回响。`,
    '火星': (sign, deg) =>
        `战神之焰燃烧于${sign}第${Math.ceil(deg)}度。你的原始驱动力如同${sign === '白羊座' ? '烈火般不可阻挡' : sign === '天蝎座' ? '地底岩浆般隐忍而致命' : sign === '摩羯座' ? '寒铁般坚不可摧' : '流星般划破夜空'}。这股力量若被正确引导，足以移山倒海。`,
    '木星': (sign, deg) =>
        `宙斯之星展翼于${sign}第${Math.ceil(deg)}度。幸运的种子已在你的命盘中播下——在${sign}领域，你将遇见超乎预期的恩赐。保持敬畏与谦卑，宇宙的丰盛会在你最不期待时悄然降临。`,
    '土星': (sign, deg) =>
        `时间之主驻守于${sign}第${Math.ceil(deg)}度。这是你此生最深刻的功课所在——${sign}领域的考验将反复出现，直到你学会坚忍与自律。当你终于跨越这道门槛，所获得的智慧将如钻石般永恒。`,
    '上升点': (sign, deg) =>
        `命运的地平线升起于${sign}第${Math.ceil(deg)}度。上升点是你灵魂投射到世间的第一道光——世人看到的你，是一个带有${sign === '白羊座' ? '锐利锋芒' : sign === '金牛座' ? '沉稳气度' : sign === '双子座' ? '灵动气质' : sign === '巨蟹座' ? '温柔外表' : sign === '狮子座' ? '王者风范' : sign === '处女座' ? '精致优雅' : sign === '天秤座' ? '和谐之美' : sign === '天蝎座' ? '神秘磁场' : sign === '射手座' ? '自由气息' : sign === '摩羯座' ? '沉着气场' : sign === '水瓶座' ? '独特光芒' : '梦幻色彩'}的存在。这是你此生的面具，也是你踏入世间的方式。`,
};

function getOracleText(planet: PlanetPosition): string {
    const generator = ORACLE_TEXTS[planet.name];
    if (generator) {
        return generator(planet.sign, planet.degree);
    }
    return `${planet.name}落于${planet.sign}${planet.degree.toFixed(1)}°，在星空的低语中书写着你独特的命运篇章。`;
}

// ─── 行星图标色彩 ───

// ─── 六芒星法阵 SVG ───
const HexagramSVG: React.FC = () => (
    <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.12 }}
    >
        <defs>
            <filter id="hexGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        <g transform="translate(100,100)" filter="url(#hexGlow)">
            {/* 外圆 */}
            <circle r="88" fill="none" stroke="#d4af37" strokeWidth="0.8" opacity="0.6" />
            <circle r="78" fill="none" stroke="#d4af37" strokeWidth="0.4" opacity="0.3" strokeDasharray="4 4" />

            {/* 上三角 △ */}
            <polygon
                points="0,-75 64.95,37.5 -64.95,37.5"
                fill="none"
                stroke="#FFD700"
                strokeWidth="1"
                opacity="0.7"
            />
            {/* 下三角 ▽ */}
            <polygon
                points="0,75 64.95,-37.5 -64.95,-37.5"
                fill="none"
                stroke="#FFD700"
                strokeWidth="1"
                opacity="0.7"
            />

            {/* 内六边形 */}
            {(() => {
                const pts = Array.from({ length: 6 }, (_, i) => {
                    const angle = (i * 60 - 90) * Math.PI / 180;
                    return `${Math.cos(angle) * 42},${Math.sin(angle) * 42}`;
                }).join(' ');
                return <polygon points={pts} fill="none" stroke="#d4af37" strokeWidth="0.6" opacity="0.5" />;
            })()}

            {/* 中心小圆 */}
            <circle r="8" fill="none" stroke="#FFD700" strokeWidth="0.8" opacity="0.5" />
            <circle r="3" fill="#FFD700" opacity="0.3" />

            {/* 六个顶点小圆 */}
            {Array.from({ length: 6 }, (_, i) => {
                const angle = (i * 60 - 90) * Math.PI / 180;
                const x = Math.cos(angle) * 75;
                const y = Math.sin(angle) * 75;
                return <circle key={i} cx={x} cy={y} r="3" fill="#FFD700" opacity="0.3" />;
            })}

            {/* 从中心到顶点的细线 */}
            {Array.from({ length: 6 }, (_, i) => {
                const angle = (i * 60 - 90) * Math.PI / 180;
                const x = Math.cos(angle) * 75;
                const y = Math.sin(angle) * 75;
                return <line key={i} x1="0" y1="0" x2={x} y2={y} stroke="#d4af37" strokeWidth="0.3" opacity="0.3" />;
            })}
        </g>
    </svg>
);


interface Props {
    chart: BirthChart;
}

const StarOracleCards: React.FC<Props> = ({ chart }) => {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const handleToggle = useCallback((index: number) => {
        setExpandedIndex(prev => prev === index ? null : index);
    }, []);

    return (
        <div className="flex flex-col gap-2">
            {/* ── 标题 ── */}
            <div className="flex items-center justify-center gap-2 px-2 mb-1">
                <div className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#d4af37]/50"></div>
                <span className="text-[10px] text-[#8c6b3e] tracking-[0.3em] uppercase">Star Oracle · 星谕</span>
                <div className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#d4af37]/50"></div>
            </div>

            {/* ── 纵向卡片列表 ── */}
            {chart.planets.map((planet, index) => {
                const isExpanded = expandedIndex === index;

                return (
                    <div
                        key={planet.name}
                        onClick={() => handleToggle(index)}
                        className="cursor-pointer overflow-hidden transition-all duration-700 ease-out"
                        style={{
                            background: 'rgba(10, 6, 4, 0.65)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: `1px solid rgba(212, 175, 55, ${isExpanded ? '0.35' : '0.15'})`,
                            borderRadius: '16px',
                            boxShadow: isExpanded
                                ? `0 4px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,215,0,0.06), 0 0 20px rgba(212,175,55,0.08)`
                                : '0 2px 10px rgba(0,0,0,0.3)',
                        }}
                    >
                        {/* ── 折叠态：极简一行 ── */}
                        <div className="flex items-center gap-3 px-4 py-3">
                            {/* 行星 : 星座 度数 */}
                            <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
                                <span className="text-[#e5d08f] text-sm font-bold tracking-wider">{planet.name}</span>
                                <span className="text-[#8c6b3e] text-xs">:</span>
                                <span className="text-[#FFD700] text-sm font-bold">{planet.sign}</span>
                                <span className="text-[#8c6b3e] text-[11px] font-mono">{planet.degree.toFixed(1)}°</span>
                            </div>

                            {/* 展开指示箭头 */}
                            <svg
                                className="w-3.5 h-3.5 text-[#8c6b3e]/50 shrink-0 transition-transform duration-500"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>

                        {/* ── 展开态：六芒星法阵 + 判词 ── */}
                        <div
                            className="transition-all duration-700 ease-out overflow-hidden"
                            style={{
                                maxHeight: isExpanded ? '400px' : '0px',
                                opacity: isExpanded ? 1 : 0,
                            }}
                        >
                            <div className="relative px-4 pb-5 pt-1">
                                {/* 六芒星法阵背景（缓慢旋转） */}
                                <div
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                    style={{
                                        animation: 'hexSpin 30s linear infinite',
                                    }}
                                >
                                    <div className="w-[200px] h-[200px]">
                                        <HexagramSVG />
                                    </div>
                                </div>

                                {/* 分隔线 */}
                                <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/25 to-transparent mb-4" />

                                {/* 判词文本 */}
                                <p
                                    className="relative text-[12px] leading-[2] text-[#c4a87a]/85"
                                    style={{
                                        fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
                                        letterSpacing: '0.04em',
                                        animation: isExpanded ? 'oracleTextFadeIn 1.2s ease-out both' : 'none',
                                    }}
                                >
                                    {getOracleText(planet)}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* ── CSS Keyframes (注入到 style 标签) ── */}
            <style>{`
                @keyframes hexSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes oracleTextFadeIn {
                    0% { opacity: 0; transform: translateY(8px); filter: blur(4px); }
                    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                }
            `}</style>
        </div>
    );
};

export default React.memo(StarOracleCards);
