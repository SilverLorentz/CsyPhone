/**
 * StarOrbit — 星轨 / 星盘页
 *
 * 三种模式：我的星盘 | 角色星盘 | 合盘(Synastry)
 * 合盘模式支持双日期输入，计算后通过 SynastryChart SVG 缓缓浮现展示结果。
 *
 * 可行性说明：
 * ─────────────────────────────────
 * 1. 计算层 (astroCalc.ts)：已完整实现 calcBirthChart 和 calcSynastry，
 *    使用 astronomy-engine 库计算七大行星的真实黄经坐标。
 * 2. 渲染层 (SynastryChart.tsx)：纯 SVG 组件，用三角函数将黄经映射到圆上，
 *    不依赖任何图表库，viewBox 800×800 保证缩放精度。
 * 3. 视觉规范：严格使用暗金/纯金/暗红三色体系，
 *    外圈带 feGaussianBlur 微弱辉光，相位线 opacity 0.3~0.5。
 * 4. 交互：点击"推算星盘"后，SVG 以 2 秒 ease-out 从 opacity:0 + scale(0.92)
 *    过渡到完全显示，模拟"缓缓浮现"的神秘感。
 * ─────────────────────────────────
 */
import React,{ useState,useCallback,useMemo } from 'react';
import { SelectedCard,SecondaryAPIConfig } from './zhaixinglouStore';
import { calcBirthChart,calcSynastry,BirthChart,SynastryResult,formatChartForPrompt,formatSynastryForPrompt } from './astroCalc';
import SynastryChart from './SynastryChart';
import ChartReading from './ChartReading';
import { ReadingMode } from './divinationPrompts';
import { CharacterProfile,UserProfile } from '../../types';
import StarOracleCards from './StarOracleCards';
import { GothicHeader,GothicDivider,GothicCornerDecor,DECOR } from './components/GothicDecorations';

interface Props {
    onBack: () => void;
    selectedCard: SelectedCard | null;
    userName: string;
    userProfile: UserProfile;
    apiConfig: SecondaryAPIConfig;
    isApiConfigured: boolean;
    onOpenSettings: () => void;
    characters: CharacterProfile[];
    onCacheAstro?: (key: string, text: string) => void;
}

type AstroMode = 'user' | 'char' | 'synastry';

// ── 修复移动端 Date 解析（模块级纯函数，避免 useCallback 依赖问题） ──
// Safari/WeChat 对日期字符串解析非常严格，需要补全秒和时区标记
const parseSafeDate = (dateStr: string): Date => {
    try {
        // 如果字符串是 "YYYY-MM-DDTHH:mm"，补全 ":00" 秒
        let safeStr = dateStr;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(safeStr)) {
            safeStr += ':00';
        }
        const d = new Date(safeStr);
        if (isNaN(d.getTime())) {
            // 回退解析：把 - 替换为 / (一些旧设备需要)
            return new Date(safeStr.replace(/-/g, '/').replace('T', ' '));
        }
        return d;
    } catch (e) {
        return new Date(''); // 返回 Invalid Date
    }
};

/** 单人星盘 SVG 渲染：内部 useMemo 缓存 calcSynastry 结果，避免父组件重渲染时重复计算 */
const MemoizedSingleChart: React.FC<{ chart: BirthChart; nameA: string }> = React.memo(({ chart, nameA }) => {
    const synastryData = useMemo(() => calcSynastry(chart, chart), [chart]);
    return <SynastryChart synastry={synastryData} nameA={nameA} nameB="" />;
});


const StarOrbit: React.FC<Props> = ({ onBack, selectedCard, userName, userProfile, apiConfig, isApiConfigured, onOpenSettings, characters, onCacheAstro }) => {
    const [mode, setMode] = useState<AstroMode>('user');
    // 单人星盘
    const [birthDate, setBirthDate] = useState('');
    const [chart, setChart] = useState<BirthChart | null>(null);
    // 经纬度（选填，用于上升星座计算）
    const [userLat, setUserLat] = useState('');
    const [userLon, setUserLon] = useState('');
    const [charLat, setCharLat] = useState('');
    const [charLon, setCharLon] = useState('');
    // 合盘双日期
    const [dateA, setDateA] = useState('');
    const [dateB, setDateB] = useState('');
    const [synastryResult, setSynastryResult] = useState<SynastryResult | null>(null);
    // 浮现动画
    const [chartVisible, setChartVisible] = useState(false);
    // 解盘对话
    const [showReading, setShowReading] = useState(false);

    const isCharSelected = selectedCard?.type === 'character';
    const charProfile = isCharSelected && selectedCard?.characterId
        ? characters.find(c => c.id === selectedCard.characterId)
        : undefined;

    // ── 解盘模式判定 ──
    // 基于当前 tab mode 和选择的卡片类型判断。
    // User 卡 → 始终 'self'（因为 User 卡不显示 char/synastry tabs）
    // Char 卡 → 根据当前 tab mode 决定
    const getReadingMode = useCallback((): ReadingMode => {
        if (!isCharSelected) return 'self';
        if (mode === 'synastry') return 'synastry';
        if (mode === 'char') return 'observe_char';
        return 'observe_user';
    }, [isCharSelected, mode]);

    // ── 构建 chartData 文本 ──
    const getChartDataText = useCallback((): string => {
        if (mode === 'synastry' && synastryResult) {
            let text = formatChartForPrompt(synastryResult.chart1, userName);
            text += '\n\n' + formatChartForPrompt(synastryResult.chart2, charProfile?.name || '角色');
            text += '\n\n' + formatSynastryForPrompt(synastryResult, userName, charProfile?.name || '角色');
            return text;
        }
        if (chart) {
            const label = mode === 'char' ? (charProfile?.name || '角色') : userName;
            return formatChartForPrompt(chart, label);
        }
        return '';
    }, [chart, synastryResult, mode, userName, charProfile]);

    // parseSafeDate 已提取为模块级纯函数

    // ── 单人星盘计算 ──
    const handleCalculateSingle = useCallback(() => {
        if (!birthDate) return;
        const date = parseSafeDate(birthDate);
        if (isNaN(date.getTime())) {
            alert('日期解析失败，请重新选择时间');
            return;
        }

        // 获取当前模式对应的经纬度
        const lat = mode === 'char' ? parseFloat(charLat) || 0 : parseFloat(userLat) || 0;
        const lon = mode === 'char' ? parseFloat(charLon) || 0 : parseFloat(userLon) || 0;

        // 经纬度范围校验
        if ((lat !== 0 || lon !== 0) && (lat < -90 || lat > 90 || lon < -180 || lon > 180)) {
            alert('经纬度格式有误：纬度范围 -90~90，经度范围 -180~180');
            return;
        }

        try {
            setChart(null);
            setChartVisible(false);
            const result = calcBirthChart(date, lat, lon);
            setChart(result);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setChartVisible(true));
            });

            // ── 缓存星盘文本到全局 Store ──
            if (onCacheAstro) {
                const label = mode === 'char' ? (charProfile?.name || '角色') : userName;
                const text = formatChartForPrompt(result, label);
                const cacheKey = mode === 'char' && selectedCard?.characterId
                    ? `char_${selectedCard.characterId}`
                    : 'user';
                onCacheAstro(cacheKey, text);
            }
        } catch (err: any) {
            alert(`星盘计算出错: ${err.message || String(err)}`);
        }
    }, [birthDate, mode, userLat, userLon, charLat, charLon, onCacheAstro, charProfile, selectedCard, userName]);

    // ── 合盘计算 ──
    const handleCalculateSynastry = useCallback(() => {
        if (!dateA || !dateB) return;
        const dA = parseSafeDate(dateA);
        const dB = parseSafeDate(dateB);

        if (isNaN(dA.getTime()) || isNaN(dB.getTime())) {
            alert('日期解析失败，请检查输入的出生日期');
            return;
        }

        const latA = parseFloat(userLat) || 0;
        const lonA = parseFloat(userLon) || 0;
        const latB = parseFloat(charLat) || 0;
        const lonB = parseFloat(charLon) || 0;

        // 经纬度范围校验
        if ((latA !== 0 || lonA !== 0) && (latA < -90 || latA > 90 || lonA < -180 || lonA > 180)) {
            alert('我方经纬度格式有误：纬度范围 -90~90，经度范围 -180~180');
            return;
        }
        if ((latB !== 0 || lonB !== 0) && (latB < -90 || latB > 90 || lonB < -180 || lonB > 180)) {
            alert('对方经纬度格式有误：纬度范围 -90~90，经度范围 -180~180');
            return;
        }

        try {
            setSynastryResult(null);
            setChartVisible(false);
            const chartA = calcBirthChart(dA, latA, lonA);
            const chartB = calcBirthChart(dB, latB, lonB);
            const result = calcSynastry(chartA, chartB);
            setSynastryResult(result);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setChartVisible(true));
            });

            // ── 缓存合盘文本到全局 Store ──
            if (onCacheAstro) {
                let text = formatChartForPrompt(result.chart1, userName);
                text += '\n\n' + formatChartForPrompt(result.chart2, charProfile?.name || '角色');
                text += '\n\n' + formatSynastryForPrompt(result, userName, charProfile?.name || '角色');
                // 同时缓存用户单人盘和角色单人盘
                onCacheAstro('user', formatChartForPrompt(result.chart1, userName));
                if (selectedCard?.characterId) {
                    onCacheAstro(`char_${selectedCard.characterId}`, formatChartForPrompt(result.chart2, charProfile?.name || '角色'));
                    onCacheAstro(`synastry_${selectedCard.characterId}`, text);
                }
            }
        } catch (err: any) {
            alert(`合盘计算出错: ${err.message || String(err)}`);
        }
    }, [dateA, dateB, userLat, userLon, charLat, charLon, onCacheAstro, charProfile, selectedCard, userName]);

    // ── 切换模式时重置所有输入和结果 ──
    const handleModeSwitch = useCallback((newMode: AstroMode) => {
        setMode(newMode);
        setBirthDate('');
        setChart(null);
        setSynastryResult(null);
        setChartVisible(false);
    }, []);

    const isSynastry = mode === 'synastry';
    const charName = selectedCard?.name || '角色';

    // ── 如果在解盘对话中，渲染 ChartReading ──
    if (showReading) {
        return (
            <ChartReading
                onBack={() => setShowReading(false)}
                mode={getReadingMode()}
                chartData={getChartDataText()}
                apiConfig={apiConfig}
                isApiConfigured={isApiConfigured}
                onOpenSettings={onOpenSettings}
                userName={userName}
                userBio={userProfile.bio || ''}
                charProfile={charProfile}
                characters={characters}
                selectedCardType={selectedCard?.type || 'user'}
            />
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* 角标装饰 */}
            <GothicCornerDecor corners={['tl', 'tr']} iconUrl={DECOR.occultSymbol} size={24} opacity={0.15} />

            {/* Header */}
            <GothicHeader
                title="Astrolabe"
                onBack={onBack}
                decorIcon={DECOR.moonPhases}
            />

            {/* Mode Tabs (only for character selections) */}
            {isCharSelected && (
                <div className="flex mx-5 mb-4 bg-black/40 backdrop-blur-md rounded-xl p-1 border border-[#d4af37]/20 relative overflow-hidden">
                    {([
                        { key: 'user' as AstroMode, label: 'My Chart', sub: '我的星盘', icon: DECOR.moon },
                        { key: 'char' as AstroMode, label: `${charName}'s`, sub: `${charName}的星盘`, icon: DECOR.priestess },
                        { key: 'synastry' as AstroMode, label: 'Synastry', sub: '合盘', icon: DECOR.lovers },
                    ] as const).map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => handleModeSwitch(tab.key)}
                            className={`relative flex-1 py-2.5 rounded-lg text-xs transition-all truncate px-1 ${mode === tab.key
                                ? 'bg-[#d4af37]/15 text-[#e5d08f] shadow-[0_0_12px_rgba(212,175,55,0.1)]'
                                : 'text-[#8c6b3e]/60 hover:text-[#8c6b3e]/80'
                                }`}
                        >
                            <span className="text-[12px] tracking-wider" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>{tab.label}</span>
                            <br />
                            <span className="text-[8px] opacity-60">{tab.sub}</span>
                            {mode === tab.key && (
                                <div className="absolute bottom-0 left-[20%] right-[20%] h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
                            )}
                        </button>
                    ))}
                    {/* 扫光 */}
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.03) 48%, rgba(212,175,55,0.05) 50%, transparent 55%)', animation: 'tarot-sweep 6s ease-in-out infinite' }} />
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8">

                {/* ━━━ 合盘模式：双日期输入 ━━━ */}
                {isSynastry ? (
                    <>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl border border-[#d4af37]/20 p-5 mb-4 relative overflow-hidden">
                            {/* 合盘装饰：情人牌 */}
                            <div className="absolute top-3 right-3 z-0">
                                <img src={DECOR.lovers} className="w-10 h-10 object-contain opacity-15" style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.3))' }} alt="" />
                            </div>
                            {/* Person A */}
                            <label className="text-[11px] text-[#d4af37]/70 tracking-widest block mb-2" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                {userName} 的出生日期
                            </label>
                            <input
                                type="datetime-local"
                                value={dateA}
                                onChange={e => setDateA(e.target.value)}
                                className="w-full bg-black/50 border border-[#d4af37]/25 rounded-xl px-4 py-3 text-[#e5d08f] text-sm focus:outline-none focus:border-[#d4af37]/60 mb-2"
                            />
                            {/* Person A 经纬度 */}
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1">
                                    <input type="number" step="any" placeholder="纬度（选填）" value={userLat} onChange={e => setUserLat(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40" />
                                </div>
                                <div className="flex-1">
                                    <input type="number" step="any" placeholder="经度（选填）" value={userLon} onChange={e => setUserLon(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40" />
                                </div>
                            </div>
                            <div className="text-[9px] text-[#8c6b3e]/50 -mt-3 mb-3 pl-1">填写出生地经纬度可计算上升星座</div>

                            {/* 哥特分割线 */}
                            <GothicDivider iconUrl={DECOR.chainDivider} iconSize="w-8" className="-mx-1" />

                            {/* Person B */}
                            <label className="text-[11px] text-[#d4af37]/70 tracking-widest block mb-2" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                {charName} 的出生日期
                            </label>
                            <input
                                type="datetime-local"
                                value={dateB}
                                onChange={e => setDateB(e.target.value)}
                                className="w-full bg-black/50 border border-[#d4af37]/25 rounded-xl px-4 py-3 text-[#e5d08f] text-sm focus:outline-none focus:border-[#d4af37]/60 mb-2"
                            />
                            {/* Person B 经纬度 */}
                            <div className="flex gap-2 mb-2">
                                <div className="flex-1">
                                    <input type="number" step="any" placeholder="纬度（选填）" value={charLat} onChange={e => setCharLat(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40" />
                                </div>
                                <div className="flex-1">
                                    <input type="number" step="any" placeholder="经度（选填）" value={charLon} onChange={e => setCharLon(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40" />
                                </div>
                            </div>
                            <div className="text-[9px] text-[#8c6b3e]/50 mb-2 pl-1">填写出生地经纬度可计算上升星座</div>
                            {/* 推算按钮 */}
                            <button
                                onClick={handleCalculateSynastry}
                                disabled={!dateA || !dateB}
                                className="group relative w-full mt-2 py-3 bg-[#d4af37]/10 border border-[#d4af37]/35 rounded-xl text-[#d4af37] text-sm active:scale-95 transition-all disabled:opacity-30 overflow-hidden hover:bg-[#d4af37]/15 hover:border-[#d4af37]/50"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <img src={DECOR.lovers} className="w-4 h-4 object-contain opacity-60" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 8px rgba(212,175,55,0.3)' }}>Cast Synastry</span>
                                </div>
                                <span className="text-[9px] opacity-60">推算合盘</span>
                                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                </div>
                                <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent" />
                            </button>
                        </div>

                        {/* ━━━ 合盘 SVG（缓缓浮现） ━━━ */}
                        {synastryResult && (
                            <div
                                className="transition-all ease-out"
                                style={{
                                    transitionDuration: '2000ms',
                                    opacity: chartVisible ? 1 : 0,
                                    transform: chartVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
                                    filter: chartVisible ? 'blur(0px)' : 'blur(4px)',
                                }}
                            >
                                {/* SVG 容器 */}
                                <div className="relative aspect-square w-full max-w-[400px] mx-auto mb-4">
                                    <SynastryChart
                                        synastry={synastryResult}
                                        nameA={userName}
                                        nameB={charName}
                                    />
                                </div>

                                {/* 相位摘要 */}
                                <div className="bg-black/30 backdrop-blur-md rounded-2xl border border-[#d4af37]/20 p-4 mt-2">
                                    <div className="flex items-center gap-2 mb-3">
                                        <img src={DECOR.occultSymbol} className="w-4 h-4 object-contain opacity-40" style={{ filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.3))' }} alt="" />
                                        <span className="text-[10px] text-[#d4af37]/70 tracking-widest" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>Major Aspects <span className="text-[8px] opacity-70">主要相位</span></span>
                                    </div>
                                    <div className="space-y-2">
                                        {synastryResult.aspects.slice(0, 10).map((asp, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full" style={{
                                                        backgroundColor: asp.nature === 'tense' ? '#8B0000' : '#A67C00',
                                                        opacity: 0.8,
                                                    }}></span>
                                                    <span className="text-[#e5d08f]">{asp.planet1}</span>
                                                    <span className="text-[#8c6b3e] text-[10px]">{asp.aspectName}</span>
                                                    <span className="text-[#e5d08f]">{asp.planet2}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[#8c6b3e] font-mono text-[10px]">{asp.angle}°</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${asp.nature === 'tense' ? 'bg-red-900/30 text-red-400' : asp.nature === 'harmonious' ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-800/30 text-gray-400'}`}>
                                                        {asp.nature === 'harmonious' ? 'Harmony 和谐' : asp.nature === 'tense' ? 'Tense 紧张' : 'Neutral 中性'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── 解析命轨 按钮 ── */}
                                <button
                                    onClick={() => setShowReading(true)}
                                    className="group relative w-full mt-4 py-3.5 bg-[#d4af37]/10 border border-[#d4af37]/35 rounded-xl text-[#d4af37] text-sm tracking-[0.2em] active:scale-95 transition-all hover:bg-[#d4af37]/15 hover:border-[#d4af37]/50 hover:shadow-[0_0_20px_rgba(212,175,55,0.15)] overflow-hidden"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <img src={DECOR.wheel} className="w-4 h-4 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.4))' }} alt="" />
                                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 8px rgba(212,175,55,0.3)' }}>Read the Stars</span>
                                    </div>
                                    <span className="text-[9px] opacity-60">解析命轨</span>
                                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                    </div>
                                    <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent" />
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    /* ━━━ 单人星盘模式 ━━━ */
                    <>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl border border-[#d4af37]/20 p-5 mb-4 relative overflow-hidden">
                            <label className="text-[11px] text-[#d4af37]/70 tracking-widest block mb-2" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>
                                {mode === 'user' ? `${userName}的出生日期` : `${charName}的出生日期`}
                            </label>
                            <input
                                type="datetime-local"
                                value={birthDate}
                                onChange={e => setBirthDate(e.target.value)}
                                className="w-full bg-black/50 border border-[#d4af37]/25 rounded-xl px-4 py-3 text-[#e5d08f] text-sm focus:outline-none focus:border-[#d4af37]/60 mb-2"
                            />
                            {/* 经纬度输入（选填） */}
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <input
                                        type="number" step="any"
                                        placeholder="纬度（选填）"
                                        value={mode === 'char' ? charLat : userLat}
                                        onChange={e => mode === 'char' ? setCharLat(e.target.value) : setUserLat(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40"
                                    />
                                </div>
                                <div className="flex-1">
                                    <input
                                        type="number" step="any"
                                        placeholder="经度（选填）"
                                        value={mode === 'char' ? charLon : userLon}
                                        onChange={e => mode === 'char' ? setCharLon(e.target.value) : setUserLon(e.target.value)}
                                        className="w-full bg-black/50 border border-[#d4af37]/15 rounded-lg px-3 py-2 text-[#e5d08f] text-xs focus:outline-none focus:border-[#d4af37]/50 placeholder-[#8c6b3e]/40"
                                    />
                                </div>
                            </div>
                            <div className="text-[9px] text-[#8c6b3e]/50 mt-1 mb-3 pl-1">填写出生地经纬度可计算上升星座</div>
                            <button
                                onClick={handleCalculateSingle}
                                disabled={!birthDate}
                                className="group relative w-full py-3 bg-[#d4af37]/10 border border-[#d4af37]/35 rounded-xl text-[#d4af37] text-sm active:scale-95 transition-all disabled:opacity-30 overflow-hidden hover:bg-[#d4af37]/15 hover:border-[#d4af37]/50"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <img src={DECOR.wheel} className="w-4 h-4 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.4))' }} alt="" />
                                    <span style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 8px rgba(212,175,55,0.3)' }}>Cast Chart</span>
                                </div>
                                <span className="text-[9px] opacity-60">推算星盘</span>
                                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                </div>
                                <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent" />
                            </button>
                            {/* 扫光效果 */}
                            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                                <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.02) 48%, rgba(212,175,55,0.04) 50%, transparent 55%)', animation: 'tarot-sweep 8s ease-in-out infinite' }} />
                            </div>
                        </div>

                        {/* Chart Result (缓缓浮现) */}
                        {chart && (
                            <div
                                className="flex-1 flex flex-col transition-all ease-out"
                                style={{
                                    transitionDuration: '1500ms',
                                    opacity: chartVisible ? 1 : 0,
                                    transform: chartVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(16px)',
                                    filter: chartVisible ? 'blur(0px)' : 'blur(3px)',
                                }}
                            >
                                {/* Sun/Moon/Ascendant Summary */}
                                <div className="flex gap-2.5 mb-3">
                                    <div className="flex-1 bg-black/30 backdrop-blur-md rounded-xl border border-[#d4af37]/20 p-3 text-center relative overflow-hidden">
                                        <img src="https://i.postimg.cc/CxDZ6664/com-xingin-xhs-20260228152730.png" className="w-7 h-7 object-contain mx-auto mb-0.5" style={{ filter: 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))' }} alt="Sun" />
                                        <div className="text-[9px] text-[#d4af37]/70 tracking-widest" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>Sun Sign<br /><span className="text-[8px] opacity-70">太阳星座</span></div>
                                        <div className="text-[#FFD700] font-bold text-sm mt-0.5" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>{chart.sunSign}</div>
                                    </div>
                                    <div className="flex-1 bg-black/30 backdrop-blur-md rounded-xl border border-[#d4af37]/20 p-3 text-center relative overflow-hidden">
                                        <img src="https://i.postimg.cc/bvhGXHKg/com-xingin-xhs-20260228152803.png" className="w-7 h-7 object-contain mx-auto mb-0.5" style={{ filter: 'drop-shadow(0 0 8px rgba(192, 192, 255, 0.5))' }} alt="Moon" />
                                        <div className="text-[9px] text-[#d4af37]/70 tracking-widest" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>Moon Sign<br /><span className="text-[8px] opacity-70">月亮星座</span></div>
                                        <div className="text-[#FFD700] font-bold text-sm mt-0.5" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>{chart.moonSign}</div>
                                    </div>
                                    {chart.ascendantSign && (
                                        <div className="flex-1 bg-black/30 backdrop-blur-md rounded-xl border border-[#d4af37]/20 p-3 text-center relative overflow-hidden">
                                            <img src="https://i.postimg.cc/k5mVrFkw/com-xingin-xhs-20260228153301.png" className="w-7 h-7 object-contain mx-auto mb-0.5" style={{ filter: 'drop-shadow(0 0 8px rgba(212, 175, 55, 0.5))' }} alt="Ascendant" />
                                            <div className="text-[9px] text-[#d4af37]/70 tracking-widest" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>Ascendant<br /><span className="text-[8px] opacity-70">上升星座</span></div>
                                            <div className="text-[#FFD700] font-bold text-sm mt-0.5" style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>{chart.ascendantSign}</div>
                                        </div>
                                    )}
                                </div>

                                {/* SVG Star Chart — useMemo 避免每次渲染都重复计算 */}
                                <div className="relative aspect-square w-full max-w-[340px] mx-auto mb-4">
                                    <MemoizedSingleChart chart={chart} nameA={mode === 'user' ? userName : charName} />
                                </div>

                                {/* ━━━ 星谕滑动卡片 ━━━ */}
                                <StarOracleCards chart={chart} />

                                {/* ── 解析命轨 按钮 ── */}
                                <button
                                    onClick={() => setShowReading(true)}
                                    className="group relative w-full mt-4 py-3.5 bg-[#d4af37]/10 border border-[#d4af37]/35 rounded-xl text-[#d4af37] text-sm tracking-[0.2em] active:scale-95 transition-all hover:bg-[#d4af37]/15 hover:border-[#d4af37]/50 hover:shadow-[0_0_20px_rgba(212,175,55,0.15)] overflow-hidden"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <img src={DECOR.wheel} className="w-4 h-4 object-contain" style={{ animation: 'gothic-spin 12s linear infinite', filter: 'drop-shadow(0 0 3px rgba(212,175,55,0.4))' }} alt="" />
                                        <span style={{ fontFamily: 'ZhaixinglouFont, serif', textShadow: '0 0 8px rgba(212,175,55,0.3)' }}>Read the Stars</span>
                                    </div>
                                    <span className="text-[9px] opacity-60">解析命轨</span>
                                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="absolute w-[200%] h-[200%] top-[-50%] left-[-100%]" style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(212,175,55,0.05) 48%, rgba(212,175,55,0.1) 50%, transparent 55%)', animation: 'tarot-sweep 4s ease-in-out infinite' }} />
                                    </div>
                                    <div className="absolute left-0 top-[15%] bottom-[15%] w-[2px] rounded-full bg-gradient-to-b from-transparent via-[#d4af37]/30 to-transparent" />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default StarOrbit;
