/**
 * TheaterSettings — 约会设置面板
 * 上传角色立绘 & 用户头像（复用 DateApp 的 sprites 数据）
 * 直接拖拽/双指缩放调整立绘位置（优雅交互）
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { CharacterProfile, SpriteConfig } from '../../types';
import { useOS } from '../../context/OSContext';
import { resolveTheaterBg } from '../../utils/db/theaterStore';

const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
const EMOTION_LABELS: Record<string, string> = {
    normal: '普通',
    happy: '开心',
    angry: '生气',
    sad: '难过',
    shy: '害羞',
};
const DEFAULT_SPRITE_CONFIG: SpriteConfig = { scale: 1, x: 0, y: 0 };

interface TheaterSettingsProps {
    char: CharacterProfile;
    location?: { bgImage?: string; bgGradient?: string };
    isOpen: boolean;
    onClose: () => void;
}

const TheaterSettings: React.FC<TheaterSettingsProps> = ({ char, location, isOpen, onClose }) => {
    const { updateCharacter, userProfile, updateUserProfile, addToast } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<{ type: 'sprite' | 'user-avatar'; emotionKey?: string }>({ type: 'sprite', emotionKey: 'normal' });
    const [activeTab, setActiveTab] = useState<'adjust' | 'sprites'>('adjust');

    // ── Sprite Config (local copy for live preview) ──
    const [tempConfig, setTempConfig] = useState<SpriteConfig>(char.spriteConfig || DEFAULT_SPRITE_CONFIG);

    // Sync on open
    useEffect(() => {
        if (isOpen) setTempConfig(char.spriteConfig || DEFAULT_SPRITE_CONFIG);
    }, [isOpen, char.id]);

    const sprites = char.sprites || {};
    const dateEmotionKeys = [...REQUIRED_EMOTIONS, ...(char.customDateSprites || [])];

    // Resolve current preview sprite
    const previewSprite = (() => {
        if (char.activeSkinSetId && char.dateSkinSets) {
            const skin = char.dateSkinSets.find(s => s.id === char.activeSkinSetId);
            if (skin && Object.keys(skin.sprites).length > 0) {
                return skin.sprites['normal'] || Object.values(skin.sprites)[0];
            }
        }
        return sprites['normal'] || Object.values(sprites)[0] || null;
    })();

    // ── Drag to move sprite ──
    const dragRef = useRef<{ startX: number; startY: number; startCfgX: number; startCfgY: number } | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!previewRef.current) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startCfgX: tempConfig.x,
            startCfgY: tempConfig.y,
        };
    }, [tempConfig]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !previewRef.current) return;
        const rect = previewRef.current.getBoundingClientRect();
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        const newX = Math.round(Math.max(-100, Math.min(100, drag.startCfgX + dx)));
        const newY = Math.round(Math.max(-50, Math.min(50, drag.startCfgY + dy)));
        setTempConfig(prev => ({ ...prev, x: newX, y: newY }));
    }, []);

    const handlePointerUp = useCallback(() => {
        dragRef.current = null;
    }, []);

    // ── Pinch / wheel to scale ──
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setTempConfig(prev => ({
            ...prev,
            scale: Math.round(Math.max(0.3, Math.min(2.5, prev.scale + delta)) * 100) / 100,
        }));
    }, []);

    // Touch pinch support
    const pinchRef = useRef<{ dist: number; startScale: number } | null>(null);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchRef.current = { dist: Math.hypot(dx, dy), startScale: tempConfig.scale };
        }
    }, [tempConfig.scale]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const pinch = pinchRef.current;
        if (e.touches.length === 2 && pinch) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const ratio = dist / pinch.dist;
            const newScale = Math.round(Math.max(0.3, Math.min(2.5, pinch.startScale * ratio)) * 100) / 100;
            setTempConfig(prev => ({ ...prev, scale: newScale }));
        }
    }, []);

    const handleTouchEnd = useCallback(() => { pinchRef.current = null; }, []);

    // Resolve bg image from IndexedDB if needed (must be before any early return!)
    const [resolvedBg, setResolvedBg] = useState<string | null>(null);
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        resolveTheaterBg(location?.bgImage).then(url => {
            if (!cancelled) setResolvedBg(url);
        });
        return () => { cancelled = true; };
    }, [isOpen, location?.bgImage]);

    // ── Save ──
    const handleSave = () => {
        updateCharacter(char.id, { spriteConfig: tempConfig });
        addToast('立绘位置已保存', 'success');
    };

    const handleReset = () => {
        setTempConfig(DEFAULT_SPRITE_CONFIG);
        addToast('已重置', 'info');
    };

    // ── File Upload ──
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('文件读取失败'));
                reader.readAsDataURL(file);
            });

            if (uploadTarget.type === 'user-avatar') {
                updateUserProfile({ avatar: base64 });
                addToast('用户头像已更新', 'success');
            } else if (uploadTarget.type === 'sprite' && uploadTarget.emotionKey) {
                const newSprites = { ...sprites, [uploadTarget.emotionKey]: base64 };
                updateCharacter(char.id, { sprites: newSprites });
                addToast(`立绘 [${uploadTarget.emotionKey}] 已保存`, 'success');
            }
        } catch (err: any) {
            addToast(err.message || '上传失败', 'error');
        } finally {
            // Clear AFTER read completes, not during
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const triggerUpload = (type: 'sprite' | 'user-avatar', emotionKey?: string) => {
        setUploadTarget({ type, emotionKey });
        // Use setTimeout to ensure state update is committed before file picker opens
        setTimeout(() => fileInputRef.current?.click(), 50);
    };

    if (!isOpen) return null;

    const bgStyle = resolvedBg
        ? `url(${resolvedBg}) center/cover`
        : location?.bgGradient || '#111';

    return (
        <div
            className="absolute inset-0 z-[200] flex flex-col"
            style={{ background: '#000' }}
        >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

            {/* ── Live Preview Area (interactive) ── */}
            <div
                ref={previewRef}
                className="relative w-full shrink-0 overflow-hidden touch-none"
                style={{ height: '45%', background: bgStyle }}
                onPointerDown={previewSprite ? handlePointerDown : undefined}
                onPointerMove={previewSprite ? handlePointerMove : undefined}
                onPointerUp={previewSprite ? handlePointerUp : undefined}
                onPointerCancel={previewSprite ? handlePointerUp : undefined}
                onWheel={previewSprite ? handleWheel : undefined}
                onTouchStart={previewSprite ? handleTouchStart : undefined}
                onTouchMove={previewSprite ? handleTouchMove : undefined}
                onTouchEnd={previewSprite ? handleTouchEnd : undefined}
            >
                {/* Sprite */}
                {previewSprite && (
                    <div className="absolute inset-x-0 bottom-0 h-full flex items-end justify-center pointer-events-none">
                        <img
                            src={previewSprite}
                            alt=""
                            className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-none origin-bottom"
                            style={{
                                transform: `translate(${tempConfig.x}%, ${tempConfig.y}%) scale(${tempConfig.scale})`,
                                cursor: 'grab',
                            }}
                            draggable={false}
                        />
                    </div>
                )}

                {/* Crosshair guides */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
                </div>

                {/* Instruction Badge */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    <div
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.7)' }}
                    >
                        {previewSprite ? '拖拽移动 · 滚轮/双指缩放' : '暂无立绘'}
                    </div>
                </div>

                {/* Scale indicator */}
                {previewSprite && (
                    <div
                        className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', color: 'rgba(255,255,255,0.6)' }}
                    >
                        {tempConfig.scale.toFixed(2)}x · ({tempConfig.x}, {tempConfig.y})
                    </div>
                )}

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#fff" width={16} height={16}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* ── Controls Area ── */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'rgba(0,0,0,0.95)' }}>
                {/* Tab Selector */}
                <div className="flex px-5 pt-4 pb-2 gap-1">
                    {(['adjust', 'sprites'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                            style={{
                                background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.35)',
                            }}
                        >
                            {tab === 'adjust' ? '位置调整' : '立绘管理'}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto px-5 pb-24" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {activeTab === 'adjust' && (
                        <div className="space-y-5 pt-2">
                            {/* Scale slider */}
                            <div>
                                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    <span>缩放 Scale</span>
                                    <span className="font-mono">{tempConfig.scale.toFixed(2)}x</span>
                                </div>
                                <input
                                    type="range" min="0.3" max="2.5" step="0.05"
                                    value={tempConfig.scale}
                                    onChange={e => setTempConfig(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'rgba(255,255,255,0.15)', accentColor: '#FF6B9D' }}
                                />
                            </div>

                            {/* X slider */}
                            <div>
                                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    <span>水平 X</span>
                                    <span className="font-mono">{tempConfig.x}%</span>
                                </div>
                                <input
                                    type="range" min="-100" max="100" step="1"
                                    value={tempConfig.x}
                                    onChange={e => setTempConfig(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'rgba(255,255,255,0.15)', accentColor: '#FF6B9D' }}
                                />
                            </div>

                            {/* Y slider */}
                            <div>
                                <div className="flex justify-between text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    <span>垂直 Y</span>
                                    <span className="font-mono">{tempConfig.y}%</span>
                                </div>
                                <input
                                    type="range" min="-50" max="50" step="1"
                                    value={tempConfig.y}
                                    onChange={e => setTempConfig(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                                    className="w-full h-1 rounded-full appearance-none cursor-pointer"
                                    style={{ background: 'rgba(255,255,255,0.15)', accentColor: '#FF6B9D' }}
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleReset}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                    重置
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-[2] py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, #FF6B9D, #C44569)' }}
                                >
                                    保存位置
                                </button>
                            </div>

                            {/* Info */}
                            <div
                                className="rounded-xl p-3 text-[10px] leading-relaxed"
                                style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
                            >
                                note 保存后会同步到「见面」模式。也可以直接在上方预览区拖拽立绘。
                            </div>
                        </div>
                    )}

                    {activeTab === 'sprites' && (
                        <div className="space-y-6 pt-2">
                            {/* User Avatar */}
                            <section>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>你的形象</h3>
                                <div className="flex items-center gap-4">
                                    <div
                                        onClick={() => triggerUpload('user-avatar')}
                                        className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer transition-all active:scale-95"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.15)' }}
                                    >
                                        {userProfile.avatar ? (
                                            <img src={userProfile.avatar} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="rgba(255,255,255,0.25)" width={24} height={24}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-white/80 text-sm font-medium">{userProfile.name || '未设置'}</div>
                                        <div className="text-white/25 text-[10px] mt-0.5">点击更换头像</div>
                                    </div>
                                </div>
                            </section>

                            {/* Char Sprites Grid */}
                            <section>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                    {char.name} 的立绘
                                </h3>
                                <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
                                    与「见面」模式共享 · 建议使用透明 PNG
                                </p>

                                <div className="grid grid-cols-3 gap-2.5">
                                    {dateEmotionKeys.map(key => (
                                        <div
                                            key={key}
                                            onClick={() => triggerUpload('sprite', key)}
                                            className="group cursor-pointer"
                                        >
                                            <div
                                                className="aspect-[3/4] rounded-xl overflow-hidden relative flex items-center justify-center transition-all active:scale-95"
                                                style={{
                                                    background: sprites[key] ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                                                    border: sprites[key]
                                                        ? '1px solid rgba(255,255,255,0.1)'
                                                        : '1px dashed rgba(255,255,255,0.1)',
                                                }}
                                            >
                                                {sprites[key] ? (
                                                    <img src={sprites[key]} className="w-full h-full object-cover" alt={key} />
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="rgba(255,255,255,0.15)" width={20} height={20}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                                    </svg>
                                                )}

                                                {sprites[key] && (
                                                    <div
                                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        style={{ background: 'rgba(0,0,0,0.4)' }}
                                                    >
                                                        <span className="text-white text-[10px] font-bold">替换</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-center text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                                {EMOTION_LABELS[key] || key}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TheaterSettings;
