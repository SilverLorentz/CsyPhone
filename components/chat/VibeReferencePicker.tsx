import React, { useRef, useState } from 'react';
import { FloppyDisk, Image, PencilSimple, Trash, UploadSimple, X } from '@phosphor-icons/react';
import type { SavedVibeReference, VibeReferenceInput } from '../../types';
import {
    DEFAULT_VIBE_INFORMATION_EXTRACTED,
    DEFAULT_VIBE_STRENGTH,
    buildVibeInputFromSaved,
    fileToDataUrl,
    isNaiv4VibeBundleFile,
    isNaiv4VibeFile,
    isSupportedVibeImageFile,
    MAX_VIBE_REFERENCES,
    randomVibeId,
    VIBE_INFORMATION_OPTIONS,
    VIBE_STRENGTH_OPTIONS,
} from '../../utils/vibeReferences';

type ToastType = 'success' | 'error' | 'info';

interface VibeReferencePickerProps {
    enabled: boolean;
    value: VibeReferenceInput[];
    savedVibes: SavedVibeReference[];
    disabled?: boolean;
    onChange: (references: VibeReferenceInput[]) => void;
    onSaveReference?: (reference: VibeReferenceInput) => Promise<SavedVibeReference | undefined>;
    onImportVibeFile?: (file: File) => Promise<SavedVibeReference | undefined>;
    onRenameSavedVibe?: (id: string, name: string) => Promise<void>;
    onDeleteSavedVibe?: (id: string) => Promise<void>;
    onClearSavedVibeCache?: (id: string) => Promise<void>;
    addToast?: (message: string, type?: ToastType) => void;
}

const VibePreview: React.FC<{ src?: string; name: string }> = ({ src, name }) => (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
        {src ? (
            <img src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
                <Image className="h-6 w-6" weight="fill" />
            </div>
        )}
    </div>
);

const VibeReferencePicker: React.FC<VibeReferencePickerProps> = ({
    enabled,
    value,
    savedVibes,
    disabled = false,
    onChange,
    onSaveReference,
    onImportVibeFile,
    onRenameSavedVibe,
    onDeleteSavedVibe,
    onClearSavedVibeCache,
    addToast,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [busyId, setBusyId] = useState<string>('');

    if (!enabled) return null;

    const updateReference = (id: string, updates: Partial<VibeReferenceInput>) => {
        onChange(value.map(reference => reference.id === id ? { ...reference, ...updates } : reference));
    };

    const removeReference = (id: string) => {
        onChange(value.filter(reference => reference.id !== id));
    };

    const addReference = (reference: VibeReferenceInput) => {
        if (value.length >= MAX_VIBE_REFERENCES) {
            addToast?.('Vibe 参考图最多选择 3 张', 'error');
            return;
        }
        onChange([...value, reference]);
    };

    const addSavedVibe = (vibe: SavedVibeReference) => {
        if (value.some(reference => reference.savedVibeId === vibe.id)) {
            addToast?.('这个 Vibe 已经在本次生图里了', 'info');
            return;
        }
        addReference(buildVibeInputFromSaved(vibe));
    };

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        let next = [...value];
        for (const file of Array.from(files)) {
            if (next.length >= MAX_VIBE_REFERENCES) {
                addToast?.('Vibe 参考图最多选择 3 张', 'error');
                break;
            }
            try {
                if (isNaiv4VibeBundleFile(file)) {
                    throw new Error('暂不支持 .naiv4vibeBundle，请先导入单个 .naiv4vibe 文件');
                }
                if (isNaiv4VibeFile(file)) {
                    const saved = await onImportVibeFile?.(file);
                    if (saved) {
                        next = [...next, buildVibeInputFromSaved(saved)];
                        addToast?.('Vibe 文件已导入', 'success');
                    }
                    continue;
                }
                if (!isSupportedVibeImageFile(file)) {
                    throw new Error('只支持 PNG、JPG、WEBP 或 .naiv4vibe 文件');
                }
                const dataUrl = await fileToDataUrl(file);
                next = [...next, {
                    id: randomVibeId('vibe-ref'),
                    name: file.name.replace(/\.[^.]+$/, '') || '参考图',
                    previewUrl: dataUrl,
                    imageDataUrl: dataUrl,
                    strength: DEFAULT_VIBE_STRENGTH,
                    informationExtracted: DEFAULT_VIBE_INFORMATION_EXTRACTED,
                }];
            } catch (error: any) {
                addToast?.(error?.message || '参考图上传失败', 'error');
            }
        }
        onChange(next);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const saveReference = async (reference: VibeReferenceInput) => {
        if (!onSaveReference) return;
        setBusyId(reference.id);
        try {
            const saved = await onSaveReference(reference);
            if (saved) {
                updateReference(reference.id, {
                    savedVibeId: saved.id,
                    name: saved.name,
                    previewUrl: saved.previewUrl,
                    imageDataUrl: saved.imageDataUrl,
                });
                addToast?.('已保存到我的 Vibe', 'success');
            }
        } catch (error: any) {
            addToast?.(error?.message || '保存 Vibe 失败', 'error');
        } finally {
            setBusyId('');
        }
    };

    const renameSaved = async (vibe: SavedVibeReference) => {
        const name = window.prompt('新的 Vibe 名称', vibe.name);
        if (!name || name.trim() === vibe.name) return;
        try {
            await onRenameSavedVibe?.(vibe.id, name.trim());
            addToast?.('Vibe 名称已更新', 'success');
        } catch (error: any) {
            addToast?.(error?.message || '重命名失败', 'error');
        }
    };

    const deleteSaved = async (vibe: SavedVibeReference) => {
        if (!window.confirm(`删除「${vibe.name}」？`)) return;
        try {
            await onDeleteSavedVibe?.(vibe.id);
            onChange(value.filter(reference => reference.savedVibeId !== vibe.id));
            addToast?.('Vibe 已删除', 'success');
        } catch (error: any) {
            addToast?.(error?.message || '删除失败', 'error');
        }
    };

    const clearCache = async (vibe: SavedVibeReference) => {
        try {
            await onClearSavedVibeCache?.(vibe.id);
            addToast?.('编码缓存已清除', 'success');
        } catch (error: any) {
            addToast?.(error?.message || '清除缓存失败', 'error');
        }
    };

    return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[11px] font-bold text-slate-600">参考图（Vibe）</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                        让画风、氛围、色调更接近参考图；不一定保留原图构图。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || value.length >= MAX_VIBE_REFERENCES}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm disabled:opacity-40"
                    title="上传参考图"
                >
                    <UploadSimple className="h-5 w-5" weight="bold" />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.naiv4vibe,.naiv4vibeBundle"
                    multiple
                    className="hidden"
                    onChange={event => void handleFiles(event.target.files)}
                />
            </div>

            {value.length > 0 && (
                <div className="mt-3 space-y-2">
                    {value.map(reference => (
                        <div key={reference.id} className="rounded-2xl border border-slate-100 bg-white p-2">
                            <div className="flex gap-2">
                                <VibePreview src={reference.previewUrl} name={reference.name} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="min-w-0 flex-1 truncate text-xs font-bold text-slate-600">{reference.name}</div>
                                        {!reference.savedVibeId && (
                                            <button
                                                type="button"
                                                onClick={() => void saveReference(reference)}
                                                disabled={busyId === reference.id}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400"
                                                title="保存到我的 Vibe"
                                            >
                                                <FloppyDisk className="h-4 w-4" weight="bold" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => removeReference(reference.id)}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400"
                                            title="移除"
                                        >
                                            <X className="h-4 w-4" weight="bold" />
                                        </button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <label className="block">
                                            <span className="text-[9px] font-bold text-slate-400">参考强度</span>
                                            <select
                                                value={reference.strength}
                                                onChange={event => updateReference(reference.id, { strength: Number(event.target.value) })}
                                                className="mt-1 w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                                            >
                                                {VIBE_STRENGTH_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="block">
                                            <span className="text-[9px] font-bold text-slate-400">提取程度</span>
                                            <select
                                                value={reference.informationExtracted}
                                                onChange={event => updateReference(reference.id, { informationExtracted: Number(event.target.value) })}
                                                className="mt-1 w-full rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                                            >
                                                {VIBE_INFORMATION_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {savedVibes.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                    <div className="mb-2 text-[10px] font-bold text-slate-400">我的 Vibe</div>
                    <div className="space-y-2">
                        {savedVibes.map(vibe => (
                            <div key={vibe.id} className="flex items-center gap-2 rounded-xl bg-white p-2">
                                <VibePreview src={vibe.previewUrl} name={vibe.name} />
                                <button
                                    type="button"
                                    onClick={() => addSavedVibe(vibe)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <div className="truncate text-xs font-bold text-slate-600">{vibe.name}</div>
                                    <div className="mt-0.5 truncate text-[9px] text-slate-400">
                                        {Object.keys(vibe.encodings || {}).length} 个编码缓存
                                    </div>
                                </button>
                                <button type="button" onClick={() => void renameSaved(vibe)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400" title="重命名">
                                    <PencilSimple className="h-4 w-4" weight="bold" />
                                </button>
                                <button type="button" onClick={() => void clearCache(vibe)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400" title="清除编码缓存">
                                    <Trash className="h-4 w-4" weight="regular" />
                                </button>
                                <button type="button" onClick={() => void deleteSaved(vibe)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-400" title="删除">
                                    <Trash className="h-4 w-4" weight="bold" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VibeReferencePicker;
