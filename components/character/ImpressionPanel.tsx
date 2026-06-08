import React from 'react';
import { UserImpression } from '../../types';

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asPercent(value: unknown, fallback = 50): number {
    return Math.min(100, Math.max(0, asNumber(value, fallback)));
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
}

function normalizeObservedChanges(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
        if (typeof item === 'string') {
            const normalized = item.trim();
            return normalized ? [normalized] : [];
        }

        if (item && typeof item === 'object') {
            const legacyItem = item as { period?: unknown; description?: unknown };
            const description = asString(legacyItem.description).trim();

            if (!description) {
                const serialized = JSON.stringify(item);
                return serialized ? [serialized] : [];
            }

            const period = asString(legacyItem.period).trim();
            return [period ? `[${period}] ${description}` : description];
        }

        return [];
    });
}

type SafeImpression = {
    version: number;
    lastUpdated: number;
    valueMap: {
        likes: string[];
        dislikes: string[];
        coreValues: string;
    };
    behaviorProfile: {
        toneStyle: string;
        emotionSummary: string;
    };
    emotionSchema: {
        positiveTriggers: string[];
        negativeTriggers: string[];
        comfortZone: string;
    };
    personalityCore: {
        observedTraits: string[];
        interactionStyle: string;
        summary: string;
    };
    mbtiAnalysis: {
        type: string;
        reasoning: string;
        dimensions: {
            e_i: number;
            s_n: number;
            t_f: number;
            j_p: number;
        };
    } | null;
    observedChanges: string[];
};

function normalizeImpression(impression: UserImpression | undefined): SafeImpression | null {
    if (!impression) return null;

    const raw = impression as Partial<UserImpression>;
    const rawMbti = raw.mbti_analysis as Partial<NonNullable<UserImpression['mbti_analysis']>> | undefined;
    const rawDimensions = rawMbti?.dimensions as Partial<NonNullable<NonNullable<UserImpression['mbti_analysis']>['dimensions']>> | undefined;

    return {
        version: asNumber(raw.version, 1),
        lastUpdated: asNumber(raw.lastUpdated, Date.now()),
        valueMap: {
            likes: asStringArray(raw.value_map?.likes),
            dislikes: asStringArray(raw.value_map?.dislikes),
            coreValues: asString(raw.value_map?.core_values, '暂无数据'),
        },
        behaviorProfile: {
            toneStyle: asString(raw.behavior_profile?.tone_style, '暂无数据'),
            emotionSummary: asString(raw.behavior_profile?.emotion_summary),
        },
        emotionSchema: {
            positiveTriggers: asStringArray((raw.emotion_schema as any)?.triggers?.positive),
            negativeTriggers: asStringArray((raw.emotion_schema as any)?.triggers?.negative),
            comfortZone: asString(raw.emotion_schema?.comfort_zone, '暂无数据'),
        },
        personalityCore: {
            observedTraits: asStringArray(raw.personality_core?.observed_traits),
            interactionStyle: asString(raw.personality_core?.interaction_style, '暂无数据'),
            summary: asString(raw.personality_core?.summary),
        },
        mbtiAnalysis: rawMbti ? {
            type: asString(rawMbti.type, '--'),
            reasoning: asString(rawMbti.reasoning),
            dimensions: {
                e_i: asPercent(rawDimensions?.e_i),
                s_n: asPercent(rawDimensions?.s_n),
                t_f: asPercent(rawDimensions?.t_f),
                j_p: asPercent(rawDimensions?.j_p),
            },
        } : null,
        observedChanges: normalizeObservedChanges(raw.observed_changes),
    };
}

const TagGroup: React.FC<{ title: string; tags: string[]; color: string; onRemove?: (t: string) => void }> = ({ title, tags, color, onRemove }) => (
    <div className="mb-4">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${color}`}></span> {title}
        </h4>
        <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? tags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-slate-100 text-xs text-slate-600 shadow-sm">
                    {tag}
                    {onRemove && <button onClick={() => onRemove(tag)} className="ml-1.5 text-slate-300 hover:text-red-400">×</button>}
                </span>
            )) : <span className="text-xs text-slate-300 italic">暂无数据</span>}
        </div>
    </div>
);

const AnalysisBlock: React.FC<{ title: string; content: string; icon: React.ReactNode }> = ({ title, content, icon }) => (
    <div className="bg-white/60 p-4 rounded-2xl border border-white/60 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500 text-slate-800">
            {icon}
        </div>
        <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-2 relative z-10">
            {title}
        </h4>
        <p className="text-sm text-slate-700 leading-relaxed text-justify relative z-10 whitespace-pre-wrap">
            {content || '需要更多数据进行分析...'}
        </p>
    </div>
);

const MBTIBar: React.FC<{ labelLeft: string; labelRight: string; value: number; color: string }> = ({ labelLeft, labelRight, value, color }) => (
    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 w-full">
        <span className={`w-4 text-center ${value < 50 ? color : 'opacity-50'}`}>{labelLeft}</span>
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden relative">
            <div className={`absolute top-0 bottom-0 w-1.5 rounded-full ${color} transition-all duration-1000`} style={{ left: `${value}%`, transform: 'translateX(-50%)' }}></div>
        </div>
        <span className={`w-4 text-center ${value > 50 ? color : 'opacity-50'}`}>{labelRight}</span>
    </div>
);

interface ImpressionPanelProps {
    impression: UserImpression | undefined;
    isGenerating: boolean;
    onGenerate: (type: 'initial' | 'update') => void;
    onUpdateImpression: (newImp: UserImpression) => void;
    onDelete?: () => void;
}

const ImpressionPanel: React.FC<ImpressionPanelProps> = ({ impression, isGenerating, onGenerate, onUpdateImpression, onDelete }) => {
    const safeImpression = normalizeImpression(impression);

    const removeTag = (path: string[], tag: string) => {
        if (!impression) return;

        const nextImpression = JSON.parse(JSON.stringify(impression)) as Record<string, any>;
        let target: Record<string, any> | undefined = nextImpression;
        for (let i = 0; i < path.length - 1; i++) {
            if (!target || typeof target !== 'object') return;
            target = target[path[i]];
        }
        if (!target || typeof target !== 'object') return;

        const lastKey = path[path.length - 1];
        if (!Array.isArray(target[lastKey])) return;

        target[lastKey] = target[lastKey].filter((item: string) => item !== tag);
        onUpdateImpression(nextImpression as UserImpression);
    };

    if (!safeImpression && !isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6">
                <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" /></svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-700">尚未生成印象档案</h3>
                    <p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto">让 AI 回看过往记忆和对话，为这个角色生成一份更稳定的用户印象总结。</p>
                </div>
                <button
                    onClick={() => onGenerate('initial')}
                    className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
                >
                    开始深度分析
                </button>
            </div>
        );
    }

    if (isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="relative w-20 h-20">
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-sm text-slate-500 font-medium animate-pulse">正在回看你们的共同记忆...</p>
                <p className="text-xs text-slate-400">构建思维档案 / 梳理情绪轨迹</p>
            </div>
        );
    }

    if (!safeImpression) {
        return null;
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Version {safeImpression.version.toFixed(1)}</div>
                    <div className="text-xs text-slate-600">上次更新: {new Date(safeImpression.lastUpdated).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2">
                    {onDelete && (
                        <button
                            onClick={() => {
                                if (window.confirm('确定要删除这份印象档案吗？删除后可以重新生成。')) onDelete();
                            }}
                            className="px-3 py-1.5 text-xs font-bold text-red-400 bg-red-50 rounded-lg hover:bg-red-100"
                        >
                            删除
                        </button>
                    )}
                    <button onClick={() => onGenerate('initial')} className="px-3 py-1.5 text-xs font-bold text-slate-400 bg-slate-50 rounded-lg hover:bg-slate-100">重置</button>
                    <button onClick={() => onGenerate('update')} className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-500 rounded-lg shadow-md shadow-indigo-200 hover:bg-indigo-600 active:scale-95 transition-all">追加/更新</button>
                </div>
            </div>

            <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg overflow-hidden">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3">核心印象 (Core Summary)</h3>
                <p className="text-lg font-light leading-relaxed italic opacity-95">"{safeImpression.personalityCore.summary || '需要更多数据进行总结'}"</p>

                <div className="mt-6 pt-4 border-t border-white/20 grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-[10px] text-white/60 uppercase mb-1">互动模式</div>
                        <div className="text-sm font-medium">{safeImpression.personalityCore.interactionStyle}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-white/60 uppercase mb-1">语气感知</div>
                        <div className="text-sm font-medium">{safeImpression.behaviorProfile.toneStyle}</div>
                    </div>
                </div>
            </div>

            {safeImpression.mbtiAnalysis && (
                <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal-50 rounded-full blur-xl pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <span className="text-teal-500 text-lg">MBTI</span> 侧写
                        </h3>
                        <span className="text-2xl font-black text-slate-800 tracking-tighter bg-teal-100/50 px-2 rounded-lg text-teal-700">
                            {safeImpression.mbtiAnalysis.type}
                        </span>
                    </div>

                    <div className="space-y-3 mb-5">
                        <MBTIBar labelLeft="E" labelRight="I" value={safeImpression.mbtiAnalysis.dimensions.e_i} color="text-teal-500 bg-teal-500" />
                        <MBTIBar labelLeft="S" labelRight="N" value={safeImpression.mbtiAnalysis.dimensions.s_n} color="text-teal-500 bg-teal-500" />
                        <MBTIBar labelLeft="T" labelRight="F" value={safeImpression.mbtiAnalysis.dimensions.t_f} color="text-teal-500 bg-teal-500" />
                        <MBTIBar labelLeft="J" labelRight="P" value={safeImpression.mbtiAnalysis.dimensions.j_p} color="text-teal-500 bg-teal-500" />
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl">
                        <p className="text-xs text-slate-600 leading-relaxed italic">"{safeImpression.mbtiAnalysis.reasoning || '暂无更多解释'}"</p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4a1 1 0 001.414 0l4-4a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    价值地图 (Value Map)
                </h3>

                <TagGroup title="观察到的特质 (Traits)" tags={safeImpression.personalityCore.observedTraits} color="bg-blue-400" onRemove={(tag) => removeTag(['personality_core', 'observed_traits'], tag)} />
                <TagGroup title="TA 喜欢的 (Likes)" tags={safeImpression.valueMap.likes} color="bg-pink-400" onRemove={(tag) => removeTag(['value_map', 'likes'], tag)} />
                <TagGroup title="TA 不喜欢的 (Dislikes)" tags={safeImpression.valueMap.dislikes} color="bg-slate-400" onRemove={(tag) => removeTag(['value_map', 'dislikes'], tag)} />

                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">核心价值观推测</div>
                    <p className="text-sm text-slate-600">{safeImpression.valueMap.coreValues}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <AnalysisBlock
                    title="情绪状态总结 (Emotion)"
                    content={safeImpression.behaviorProfile.emotionSummary}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <div className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">正向触发器</div>
                            <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                                {safeImpression.emotionSchema.positiveTriggers.map((trigger, index) => <li key={`${trigger}-${index}`}>{trigger}</li>)}
                            </ul>
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">压力/雷区</div>
                            <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
                                {safeImpression.emotionSchema.negativeTriggers.map((trigger, index) => <li key={`${trigger}-${index}`}>{trigger}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">舒适区 (Comfort Zone)</div>
                    <p className="text-sm text-slate-600">{safeImpression.emotionSchema.comfortZone}</p>
                </div>
            </div>

            {safeImpression.observedChanges.length > 0 && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">最近观察到的变化</h4>
                    <ul className="space-y-2">
                        {safeImpression.observedChanges.map((change, index) => (
                            <li key={index} className="text-xs text-amber-900 flex items-start gap-2">
                                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                                <span className="opacity-90">{change}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ImpressionPanel;
