/**
 * MemoryDestinyModal — 解盘结算面板
 *
 * 退出解盘对话时弹出，提供两个选项：
 * 1. ☽ 星痕铭刻 — 生成摘要 → 注入目标 char 的主聊天 (DB.saveMessage)
 * 2. ✧ 天机焚卷 — 阅后即焚，不留痕迹
 *
 * User 卡模式下，星痕铭刻会弹出角色多选器。
 */
import React,{ useState,useCallback } from 'react';
import { SecondaryAPIConfig } from './zhaixinglouStore';
import { fetchSecondaryApi } from './zhaixinglouApi';
import { SUMMARY_PROMPT,ReadingMode } from './divinationPrompts';
import { CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import BurnParticles from './BurnParticles';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface MemoryDestinyModalProps {
    visible: boolean;
    messages: ChatMessage[];
    apiConfig: SecondaryAPIConfig;
    readingMode: ReadingMode;
    selectedCardType: 'user' | 'character';
    charProfile?: CharacterProfile;
    characters: CharacterProfile[];
    onClose: () => void;       // 完成后关闭弹窗并返回
    onBurn: () => void;        // 天机焚卷：清空并返回
}

type ModalStep = 'choose' | 'generating' | 'preview' | 'select_chars' | 'saving' | 'done';

const MemoryDestinyModal: React.FC<MemoryDestinyModalProps> = ({
    visible, messages, apiConfig, readingMode, selectedCardType,
    charProfile, characters, onClose, onBurn,
}) => {
    const [step, setStep] = useState<ModalStep>('choose');
    const [summary, setSummary] = useState('');
    const [error, setError] = useState('');
    const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
    const [burning, setBurning] = useState(false);

    // ── 天机焚卷动画触发 ──
    const handleBurnStart = useCallback(() => {
        setBurning(true);
    }, []);

    const handleBurnComplete = useCallback(() => {
        setBurning(false);
        onBurn();
    }, [onBurn]);

    // ── 生成摘要 ──
    const handleEngrave = useCallback(async () => {
        setStep('generating');
        setError('');

        try {
            // Build conversation transcript for summary
            const speakerLabel = readingMode === 'tarot' ? '大祭司' : '命运之神';
            const transcript = messages
                .map(m => `${m.role === 'user' ? '寻路人' : speakerLabel}: ${m.content}`)
                .join('\n\n');

            const summaryMessages = [
                { role: 'system', content: SUMMARY_PROMPT },
                { role: 'user', content: transcript },
            ];

            const result = await fetchSecondaryApi(apiConfig, summaryMessages, {
                temperature: 0.5,
                max_tokens: 256,
            });

            setSummary(result || '星象启示：命运的丝线在此交汇。');

            // If User card → need to select characters
            if (selectedCardType === 'user') {
                setStep('select_chars');
            } else {
                setStep('preview');
            }
        } catch (err: any) {
            setError(err.message);
            setStep('choose');
        }
    }, [messages, apiConfig, selectedCardType]);

    // ── 切换角色选择 ──
    const toggleChar = useCallback((charId: string) => {
        setSelectedCharIds(prev =>
            prev.includes(charId) ? prev.filter(id => id !== charId) : [...prev, charId]
        );
    }, []);

    // ── 确认铭刻（写入 DB）──
    const handleConfirmEngrave = useCallback(async () => {
        setStep('saving');
        setError('');

        try {
            // Determine target char IDs
            const targetIds: string[] = selectedCardType === 'user'
                ? selectedCharIds
                : charProfile ? [charProfile.id] : [];

            if (targetIds.length === 0) {
                setError('请至少选择一个角色');
                setStep(selectedCardType === 'user' ? 'select_chars' : 'preview');
                return;
            }

            // Write system message to each target char's chat
            const eventName = readingMode === 'tarot' ? 'tarot_reading' : 'chart_reading';
            const messagePrefix = readingMode === 'tarot' ? '[星镜神谕] 大祭司的塔罗解读' : '[星象启示] 命运之神的星轨推演';

            for (const charId of targetIds) {
                await DB.saveMessage({
                    charId,
                    role: 'system',
                    type: 'text',
                    content: `${messagePrefix}：${summary}`,
                    metadata: {
                        source: readingMode === 'tarot' ? 'zhaixinglou_tarot' : 'zhaixinglou_chart',
                        event: eventName,
                        readingMode: readingMode,
                    },
                });
            }

            setStep('done');
            // Auto-close after brief display
            setTimeout(() => {
                onClose();
            }, 1800);
        } catch (err: any) {
            setError(err.message);
            setStep('preview');
        }
    }, [selectedCardType, selectedCharIds, charProfile, summary, readingMode, onClose]);

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop — burns golden during animation */}
            <div
                className={`absolute inset-0 backdrop-blur-md transition-all duration-700 ${burning ? 'bg-black/90' : 'bg-black/70'
                    }`}
                onClick={step === 'choose' && !burning ? handleBurnStart : undefined}
            />

            {/* Burn glow overlay — golden radial glow during burn */}
            {burning && (
                <div
                    className="absolute inset-0 pointer-events-none z-[10000] animate-[burn-glow_2.4s_ease-out_forwards]"
                    style={{
                        background: 'radial-gradient(ellipse at 50% 50%, rgba(212,175,55,0.15) 0%, rgba(255,200,80,0.05) 30%, transparent 60%)',
                    }}
                />
            )}

            {/* Burn Particles Overlay */}
            <BurnParticles active={burning} onComplete={handleBurnComplete} />

            {/* Content — dissolves during burn animation */}
            <div className={`relative z-10 w-[85%] max-w-sm transition-all duration-700 ${burning ? 'opacity-0 scale-110 blur-sm' : 'opacity-100 scale-100 blur-0'
                }`}>
                {/* ── Step 1: Choose ── */}
                {step === 'choose' && (
                    <div className="flex flex-col items-center gap-5 animate-fade-in">
                        <div className="text-center mb-2">
                            <div className="text-2xl mb-3" style={{ textShadow: '0 0 20px rgba(212,175,55,0.6)' }}>✦</div>
                            <p className="text-[#d4af37] text-sm font-bold tracking-[0.2em]" style={{ textShadow: '0 0 10px rgba(212,175,55,0.3)' }}>
                                此番天机，如何处置？
                            </p>
                        </div>

                        {/* 星痕铭刻 */}
                        <button
                            onClick={handleEngrave}
                            className="w-full py-4 rounded-2xl border text-left px-5 transition-all active:scale-[0.97]"
                            style={{
                                background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(140,107,62,0.1) 100%)',
                                borderColor: 'rgba(212,175,55,0.4)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl" style={{ textShadow: '0 0 8px rgba(212,175,55,0.5)' }}>☽</span>
                                <div>
                                    <div className="text-[#d4af37] font-bold text-sm tracking-wider">星痕铭刻</div>
                                    <div className="text-[#8c6b3e] text-[10px] mt-0.5 tracking-wide">将星象启示铭刻于记忆长河</div>
                                </div>
                            </div>
                        </button>

                        {/* 天机焚卷 */}
                        <button
                            onClick={handleBurnStart}
                            disabled={burning}
                            className="w-full py-4 rounded-2xl border text-left px-5 transition-all active:scale-[0.97] disabled:opacity-40"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                                borderColor: 'rgba(255,255,255,0.15)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-xl opacity-60">✧</span>
                                <div>
                                    <div className="text-white/60 font-bold text-sm tracking-wider">天机焚卷</div>
                                    <div className="text-white/30 text-[10px] mt-0.5 tracking-wide">阅后即焚，不留痕迹</div>
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {/* ── Step 2: Generating summary ── */}
                {step === 'generating' && (
                    <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <div className="text-3xl animate-pulse" style={{ textShadow: '0 0 20px rgba(212,175,55,0.6)' }}>☽</div>
                        <p className="text-[#8c6b3e] text-xs text-center leading-relaxed">
                            星痕正在凝结……<br />
                            命运之神正在提炼这段对话的精华
                        </p>
                        <span className="text-[#d4af37]/60 text-sm animate-pulse" style={{ fontFamily: 'ZhaixinglouFont, serif' }}>✧</span>
                    </div>
                )}

                {/* ── Step 3: Preview summary ── */}
                {step === 'preview' && (
                    <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <div className="text-center">
                            <div className="text-lg mb-1" style={{ textShadow: '0 0 12px rgba(212,175,55,0.5)' }}>☽</div>
                            <p className="text-[#d4af37] text-xs tracking-[0.15em]">星痕铭刻 · 预览</p>
                        </div>

                        <div
                            className="w-full rounded-xl p-4 text-[#c8b88a] text-xs leading-relaxed"
                            style={{
                                background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(30,25,15,0.6) 100%)',
                                border: '1px solid rgba(212,175,55,0.25)',
                            }}
                        >
                            {summary}
                        </div>

                        {error && <p className="text-red-400 text-[10px]">{error}</p>}

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setStep('choose')}
                                className="flex-1 py-2.5 rounded-xl border text-xs text-white/40 active:scale-95 transition-transform"
                                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                                返回
                            </button>
                            <button
                                onClick={handleConfirmEngrave}
                                className="flex-1 py-2.5 rounded-xl border text-xs font-bold active:scale-95 transition-transform"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(140,107,62,0.15))',
                                    borderColor: 'rgba(212,175,55,0.4)',
                                    color: '#d4af37',
                                }}
                            >
                                铭刻至{charProfile?.name || '角色'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 3b: Character selector (User card mode) ── */}
                {step === 'select_chars' && (
                    <div className="flex flex-col items-center gap-4 animate-fade-in">
                        <div className="text-center">
                            <div className="text-lg mb-1" style={{ textShadow: '0 0 12px rgba(212,175,55,0.5)' }}>☽</div>
                            <p className="text-[#d4af37] text-xs tracking-[0.1em] mb-1">星痕铭刻 · 选择归属</p>
                            <p className="text-[#8c6b3e] text-[10px]">要将此星象启示降临在谁的梦中？</p>
                        </div>

                        {/* Summary preview */}
                        <div
                            className="w-full rounded-xl p-3 text-[#c8b88a] text-[10px] leading-relaxed"
                            style={{
                                background: 'rgba(212,175,55,0.05)',
                                border: '1px solid rgba(212,175,55,0.15)',
                            }}
                        >
                            {summary}
                        </div>

                        {/* Character list */}
                        <div className="w-full max-h-[200px] overflow-y-auto no-scrollbar space-y-2">
                            {characters.map(c => {
                                const isSelected = selectedCharIds.includes(c.id);
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => toggleChar(c.id)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.97]"
                                        style={{
                                            background: isSelected
                                                ? 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(140,107,62,0.08))'
                                                : 'rgba(255,255,255,0.02)',
                                            borderColor: isSelected ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)',
                                        }}
                                    >
                                        <img
                                            src={c.avatar}
                                            className="w-8 h-8 rounded-full object-cover border"
                                            style={{ borderColor: isSelected ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)' }}
                                            alt={c.name}
                                        />
                                        <span className={`text-xs font-medium ${isSelected ? 'text-[#d4af37]' : 'text-white/40'}`}>
                                            {c.name}
                                        </span>
                                        {isSelected && (
                                            <span className="ml-auto text-[#d4af37] text-xs">✦</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {error && <p className="text-red-400 text-[10px]">{error}</p>}

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setStep('choose')}
                                className="flex-1 py-2.5 rounded-xl border text-xs text-white/40 active:scale-95 transition-transform"
                                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                            >
                                返回
                            </button>
                            <button
                                onClick={handleConfirmEngrave}
                                disabled={selectedCharIds.length === 0}
                                className="flex-1 py-2.5 rounded-xl border text-xs font-bold active:scale-95 transition-transform disabled:opacity-30"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(140,107,62,0.15))',
                                    borderColor: 'rgba(212,175,55,0.4)',
                                    color: '#d4af37',
                                }}
                            >
                                铭刻至 {selectedCharIds.length} 位角色
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 4: Saving ── */}
                {step === 'saving' && (
                    <div className="flex flex-col items-center gap-3 animate-fade-in">
                        <div className="text-2xl animate-pulse" style={{ textShadow: '0 0 15px rgba(212,175,55,0.6)' }}>✦</div>
                        <p className="text-[#8c6b3e] text-xs">星痕正在铭刻……</p>
                    </div>
                )}

                {/* ── Step 5: Done ── */}
                {step === 'done' && (
                    <div className="flex flex-col items-center gap-3 animate-fade-in">
                        <div className="text-3xl" style={{ textShadow: '0 0 25px rgba(212,175,55,0.8)' }}>✦</div>
                        <p className="text-[#d4af37] text-sm font-bold tracking-[0.15em]">星痕已铭刻</p>
                        <p className="text-[#8c6b3e] text-[10px]">命运的丝线已被记录于长河之中</p>
                    </div>
                )}
            </div>

            {/* Burn animation keyframes */}
            <style>{`
                @keyframes burn-glow {
                    0% { opacity: 0; }
                    15% { opacity: 1; }
                    50% { opacity: 0.8; }
                    100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default MemoryDestinyModal;
