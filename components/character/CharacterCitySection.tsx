import React, { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
// === [Deprecated] 高德地图 API 联想已因额度耗尽停用，改为纯文本输入 ===
// import { getCityInputTips, type CityTip } from '../../utils/mapService';

type CityFieldKey = 'cityOverride' | 'cityAdcode' | 'isFictionalCity' | 'cityReferenceReal';
type CityFieldValue = string | boolean | undefined;
type CityFieldPatch = Partial<Record<CityFieldKey, CityFieldValue>>;

interface CharacterCitySectionProps {
    characterId: string;
    cityOverride?: string;
    cityAdcode?: string;
    isFictionalCity?: boolean;
    cityReferenceReal?: string;
    onFieldChange: (field: CityFieldKey, value: string | boolean | undefined) => void;
    onImmediatePatchCommit?: (patch: CityFieldPatch) => void;
    onSaved?: (didSave: boolean) => void;
}

export interface CharacterCitySectionHandle {
    flushPendingDraft: () => void;
}

function normalizeOptionalText(value?: string): string | undefined {
    return value?.trim() || undefined;
}

// ─── 纯文本输入版本（LLM-Native，无需地图 API）───────────────────────
const CharacterCitySectionComponent = ({
    characterId,
    cityOverride,
    cityAdcode,
    isFictionalCity,
    cityReferenceReal,
    onFieldChange,
    onImmediatePatchCommit,
    onSaved,
}: CharacterCitySectionProps, ref: React.ForwardedRef<CharacterCitySectionHandle>) => {
    const [cityKeyword, setCityKeyword] = useState(cityOverride || '');
    const [draftIsFictionalCity, setDraftIsFictionalCity] = useState(Boolean(isFictionalCity));
    const [referenceCityKeyword, setReferenceCityKeyword] = useState(cityReferenceReal || '');

    const callbacksRef = useRef({ onFieldChange, onImmediatePatchCommit, onSaved });
    const commitCurrentDraftRef = useRef<(immediate: boolean, announce?: boolean) => boolean>(() => false);

    useEffect(() => {
        callbacksRef.current = { onFieldChange, onImmediatePatchCommit, onSaved };
    }, [onFieldChange, onImmediatePatchCommit, onSaved]);

    const applyFieldPatch = (patch: CityFieldPatch, immediate: boolean) => {
        const callbacks = callbacksRef.current;

        if (immediate && callbacks.onImmediatePatchCommit) {
            callbacks.onImmediatePatchCommit(patch);
            return;
        }

        (Object.entries(patch) as Array<[CityFieldKey, CityFieldValue]>).forEach(([field, value]) => {
            callbacks.onFieldChange(field, value);
        });
    };

    const buildDraftPatch = (): CityFieldPatch | null => {
        const nextCityValue = normalizeOptionalText(cityKeyword);
        const currentCityValue = normalizeOptionalText(cityOverride);
        // adcode 不再由地图 API 写入，新保存时统一清空（兼容旧数据）
        const nextCityAdcode = undefined;
        const currentCityAdcode = normalizeOptionalText(cityAdcode);
        const nextIsFictionalCity = draftIsFictionalCity ? true : undefined;
        const currentIsFictionalCity = isFictionalCity ? true : undefined;
        const nextReferenceValue = draftIsFictionalCity ? normalizeOptionalText(referenceCityKeyword) : undefined;
        const currentReferenceValue = normalizeOptionalText(cityReferenceReal);
        const patch: CityFieldPatch = {};

        if (nextCityValue !== currentCityValue) {
            patch.cityOverride = nextCityValue;
        }

        if (nextCityAdcode !== currentCityAdcode) {
            patch.cityAdcode = nextCityAdcode;
        }

        if (nextIsFictionalCity !== currentIsFictionalCity) {
            patch.isFictionalCity = nextIsFictionalCity;
        }

        if (nextReferenceValue !== currentReferenceValue) {
            patch.cityReferenceReal = nextReferenceValue;
        }

        return Object.keys(patch).length > 0 ? patch : null;
    };

    const commitCurrentDraft = (immediate: boolean, announce = false): boolean => {
        const patch = buildDraftPatch();
        if (!patch) {
            if (announce) callbacksRef.current.onSaved?.(false);
            return false;
        }

        applyFieldPatch(patch, immediate);
        if (announce) callbacksRef.current.onSaved?.(true);
        return true;
    };

    commitCurrentDraftRef.current = commitCurrentDraft;

    useImperativeHandle(ref, () => ({
        flushPendingDraft: () => {
            commitCurrentDraftRef.current(true);
        },
    }));

    useEffect(() => {
        setCityKeyword(cityOverride || '');
    }, [characterId, cityOverride]);

    useEffect(() => {
        setDraftIsFictionalCity(Boolean(isFictionalCity));
    }, [characterId, isFictionalCity]);

    useEffect(() => {
        setReferenceCityKeyword(cityReferenceReal || '');
    }, [characterId, cityReferenceReal]);

    // Flush any pending city value on unmount
    useEffect(() => {
        return () => {
            commitCurrentDraftRef.current(true);
        };
    }, []);

    const hasUnsavedDraft = Boolean(buildDraftPatch());

    const handleClearCity = () => {
        setCityKeyword('');
    };

    const handleClearReferenceCity = () => {
        setReferenceCityKeyword('');
    };

    const handleSaveDraft = () => {
        commitCurrentDraftRef.current(true, true);
    };

    return (
        <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">📍 角色所在城市</label>
            <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
                <div className="relative">
                    {draftIsFictionalCity && (
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">城市名称</label>
                    )}
                    <div className="relative">
                        <input
                            value={cityKeyword}
                            onChange={(event) => {
                                setCityKeyword(event.target.value);
                            }}
                            className="w-full bg-slate-50 rounded-2xl border border-slate-100 px-4 py-3 pr-10 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                            placeholder={draftIsFictionalCity ? '输入架空城市名，如"哥谭市"、"璃月港"' : '输入城市名，如"北京"、"成都"、"东京"'}
                        />
                        {cityKeyword && (
                            <button
                                type="button"
                                onClick={handleClearCity}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                aria-label="清空城市"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                        type="checkbox"
                        checked={draftIsFictionalCity}
                        onChange={(event) => {
                            setDraftIsFictionalCity(event.target.checked);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                    />
                    <span>这是一个架空 / 虚构城市</span>
                </label>

                {draftIsFictionalCity && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">现实参照城市</label>
                            <div className="relative">
                                <input
                                    value={referenceCityKeyword}
                                    onChange={(event) => {
                                        setReferenceCityKeyword(event.target.value);
                                    }}
                                    className="w-full bg-white rounded-2xl border border-slate-100 px-4 py-3 pr-10 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                                    placeholder="输入现实参照城市，如'上海'、'伦敦'"
                                />
                                {referenceCityKeyword && (
                                    <button
                                        type="button"
                                        onClick={handleClearReferenceCity}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                        aria-label="清空参照城市"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <p className="text-[11px] leading-relaxed text-slate-400">
                            💡 大模型会融合参照城市的真实风貌，在你的世界观里创造出符合设定的本地商家和地理细节。
                        </p>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                    <span className={`text-[10px] ${hasUnsavedDraft ? 'text-amber-500' : 'text-slate-400'}`}>
                        {hasUnsavedDraft ? '有未保存的城市改动' : '城市设定已保存'}
                    </span>
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={!hasUnsavedDraft}
                        className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:active:scale-100"
                    >
                        保存城市
                    </button>
                </div>
            </div>
        </div>
    );
};

const propsAreEqual = (prev: CharacterCitySectionProps, next: CharacterCitySectionProps) => (
    prev.characterId === next.characterId
    && prev.cityOverride === next.cityOverride
    && prev.cityAdcode === next.cityAdcode
    && prev.isFictionalCity === next.isFictionalCity
    && prev.cityReferenceReal === next.cityReferenceReal
);

const ForwardedCharacterCitySection = forwardRef(CharacterCitySectionComponent);
ForwardedCharacterCitySection.displayName = 'CharacterCitySection';

const CharacterCitySection = memo(ForwardedCharacterCitySection, propsAreEqual);

export default CharacterCitySection;


// ========================================================================================
// === [LEGACY] 高德地图 API 在线联想版本 — 因 API 额度耗尽暂停使用 ===
// === 如需恢复，取消下方注释并恢复 import ===
// ========================================================================================
//
// --- 以下为原版 useCityAutocomplete hook + SuggestionList 组件 ---
//
// const CITY_SUGGESTION_LIMIT = 6;
// const CITY_SEARCH_DEBOUNCE_MS = 250;
// const CITY_SEARCH_MIN_KEYWORD_LENGTH = 2;
// const BLUR_CLOSE_DELAY_MS = 120;
//
// function getCityTipMeta(tip: CityTip): string {
//     return [tip.district, tip.adcode].filter(Boolean).join(' · ');
// }
//
// function getAutocompleteErrorMessage(error: unknown): string {
//     if (error instanceof Error && error.message.trim()) {
//         return error.message;
//     }
//     return '城市搜索失败，请稍后再试';
// }
//
// function useCityAutocomplete(keyword: string, enabled: boolean, selectedValue?: string): CityAutocompleteState {
//     const [debouncedKeyword, setDebouncedKeyword] = useState('');
//     const [suggestions, setSuggestions] = useState<CityTip[]>([]);
//     const [isFocused, setIsFocused] = useState(false);
//     const [isLoading, setIsLoading] = useState(false);
//     const [error, setError] = useState<string | null>(null);
//     const blurTimerRef = useRef<number | null>(null);
//     const requestSequenceRef = useRef(0);
//
//     useEffect(() => { return () => { if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current); }; }, []);
//
//     useEffect(() => {
//         const trimmedKeyword = keyword.trim();
//         const shouldDelaySearch = trimmedKeyword.length > 0 && trimmedKeyword.length < CITY_SEARCH_MIN_KEYWORD_LENGTH;
//         if (!enabled || !trimmedKeyword || shouldDelaySearch) {
//             requestSequenceRef.current += 1; setDebouncedKeyword(''); setSuggestions([]); setIsLoading(false); setError(null); return;
//         }
//         const timer = window.setTimeout(() => setDebouncedKeyword(trimmedKeyword), CITY_SEARCH_DEBOUNCE_MS);
//         return () => window.clearTimeout(timer);
//     }, [keyword, enabled]);
//
//     useEffect(() => {
//         const trimmedSelectedValue = selectedValue?.trim() || '';
//         if (!enabled || !debouncedKeyword || debouncedKeyword === trimmedSelectedValue) {
//             requestSequenceRef.current += 1; setSuggestions([]); setIsLoading(false); setError(null); return;
//         }
//         const requestId = requestSequenceRef.current + 1;
//         requestSequenceRef.current = requestId;
//         let active = true;
//         setIsLoading(true); setError(null);
//         const abortController = new AbortController();
//         getCityInputTips(debouncedKeyword, { signal: abortController.signal })
//             .then((tips) => { if (!active || requestSequenceRef.current !== requestId) return; setSuggestions(tips.slice(0, CITY_SUGGESTION_LIMIT)); setIsLoading(false); })
//             .catch((searchError) => {
//                 if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
//                 if (!active || requestSequenceRef.current !== requestId) return;
//                 setSuggestions([]); setError(getAutocompleteErrorMessage(searchError)); setIsLoading(false);
//             });
//         return () => { active = false; abortController.abort(); };
//     }, [debouncedKeyword, enabled, selectedValue]);
//
//     const reset = () => { requestSequenceRef.current += 1; setDebouncedKeyword(''); setSuggestions([]); setIsLoading(false); setError(null); setIsFocused(false); };
//     const handleFocus = () => { if (blurTimerRef.current !== null) { window.clearTimeout(blurTimerRef.current); blurTimerRef.current = null; } setIsFocused(true); };
//     const handleBlur = () => { if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current); blurTimerRef.current = window.setTimeout(() => { setIsFocused(false); blurTimerRef.current = null; }, BLUR_CLOSE_DELAY_MS); };
//
//     return { debouncedKeyword, error, isFocused, isKeywordTooShort: enabled && keyword.trim().length > 0 && keyword.trim().length < CITY_SEARCH_MIN_KEYWORD_LENGTH, isLoading, suggestions, handleBlur, handleFocus, reset };
// }
//
// function SuggestionList({ suggestions, onSelect }: { suggestions: CityTip[]; onSelect: (tip: CityTip) => void; }) {
//     return (
//         <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/70">
//             {suggestions.map((tip) => (
//                 <button key={`${tip.name}-${tip.adcode || tip.district}`} type="button"
//                     onMouseDown={(event) => { event.preventDefault(); onSelect(tip); }}
//                     className="w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 transition-colors">
//                     <div className="text-sm font-medium text-slate-700">{tip.name}</div>
//                     {getCityTipMeta(tip) && (<div className="mt-0.5 text-[10px] text-slate-400">{getCityTipMeta(tip)}</div>)}
//                 </button>
//             ))}
//         </div>
//     );
// }
