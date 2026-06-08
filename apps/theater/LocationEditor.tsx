/**
 * LocationEditor — 用户自定义地点编辑器 Modal
 */

import React, { useState, useRef, useEffect } from 'react';
import type { TheaterLocation, LocationTag } from '../../types';
import Modal from '../../components/os/Modal';
import { processImage } from '../../utils/file';
import { saveTheaterBgImage, deleteTheaterBgImage, resolveTheaterBg } from '../../utils/db/theaterStore';
import {
    DATE_WORLDLINE_LOCATION_GUIDE_KEY,
    readStorageFlag,
    writeStorageFlag,
} from '../../utils/dateWorldlineOrb';

const ALL_TAGS: { value: LocationTag; label: string }[] = [
    { value: 'romantic', label: '浪漫' },
    { value: 'daily',    label: '日常' },
    { value: 'adventure', label: '冒险' },
    { value: 'quiet',    label: '安静' },
    { value: 'crowded',  label: '热闹' },
    { value: 'outdoor',  label: '户外' },
    { value: 'indoor',   label: '室内' },
];

interface LocationEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (location: TheaterLocation) => void;
    editingLocation?: TheaterLocation | null;
}

const LocationEditor: React.FC<LocationEditorProps> = ({ isOpen, onClose, onSave, editingLocation }) => {
    const [name, setName] = useState(editingLocation?.name || '');
    const [nameEn, setNameEn] = useState(editingLocation?.nameEn || '');
    const [description, setDescription] = useState(editingLocation?.description || '');
    const [tags, setTags] = useState<LocationTag[]>(editingLocation?.tags || ['daily']);
    // previewUrl is what's displayed — could be a resolved data URL or asset URL
    const [previewUrl, setPreviewUrl] = useState<string>('');
    // pendingDataUrl holds the raw upload data until save
    const [pendingDataUrl, setPendingDataUrl] = useState<string>('');
    const [uploading, setUploading] = useState(false);
    const [removedImage, setRemovedImage] = useState(false);
    const [showZhiGuide, setShowZhiGuide] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Resolve existing bgImage on open
    const resolvedRef = useRef(false);
    React.useEffect(() => {
        if (!isOpen) {
            resolvedRef.current = false;
            return;
        }
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        if (editingLocation?.bgImage) {
            resolveTheaterBg(editingLocation.bgImage).then(url => {
                if (url) setPreviewUrl(url);
            });
        }
    }, [isOpen, editingLocation?.bgImage]);

    useEffect(() => {
        if (!isOpen || editingLocation) {
            setShowZhiGuide(false);
            return;
        }
        setShowZhiGuide(!readStorageFlag(DATE_WORLDLINE_LOCATION_GUIDE_KEY));
    }, [isOpen, editingLocation]);

    const handleDismissZhiGuide = () => {
        writeStorageFlag(DATE_WORLDLINE_LOCATION_GUIDE_KEY);
        setShowZhiGuide(false);
    };

    const toggleTag = (tag: LocationTag) => {
        setTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploading(true);
            const dataUrl = await processImage(file, { skipCompression: true });
            setPendingDataUrl(dataUrl);
            setPreviewUrl(dataUrl);
            setRemovedImage(false);
        } catch (err) {
            console.error('[LocationEditor] Image upload failed:', err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveImage = () => {
        setPreviewUrl('');
        setPendingDataUrl('');
        setRemovedImage(true);
    };

    const handleSave = async () => {
        if (!name.trim() || !description.trim()) return;

        const locationId = editingLocation?.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        // Handle image persistence
        let bgImageValue: string | undefined = editingLocation?.bgImage;

        if (pendingDataUrl) {
            // New upload → save to IndexedDB, store asset key
            const key = await saveTheaterBgImage(locationId, pendingDataUrl);
            bgImageValue = key;
        } else if (removedImage) {
            // User removed image → delete from IndexedDB
            if (editingLocation?.id) {
                await deleteTheaterBgImage(editingLocation.id);
            }
            bgImageValue = undefined;
        }

        const location: TheaterLocation = {
            id: locationId,
            name: name.trim(),
            nameEn: nameEn.trim() || undefined,
            description: description.trim(),
            tags: tags.length > 0 ? tags : ['daily'],
            bgImage: bgImageValue,
            bgGradient: bgImageValue ? undefined : 'linear-gradient(135deg, #f5d0e0, #e8d5f5)',
            isPreset: false,
            visitCount: editingLocation?.visitCount || 0,
            lastVisitTime: editingLocation?.lastVisitTime,
        };

        onSave(location);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} title={editingLocation ? "编辑地点" : "新增地点"} onClose={onClose} footer={
            <div className="flex gap-3 w-full">
                <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-bold text-sm" style={{ background: 'rgba(0,0,0,0.04)', color: '#999' }}>取消</button>
                <button
                    onClick={handleSave}
                    disabled={!name.trim() || !description.trim()}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm disabled:opacity-30"
                    style={{ background: 'linear-gradient(135deg, #F5A0B8, #E8869E)', color: '#fff' }}
                >
                    {editingLocation ? '保存修改' : '创建地点'}
                </button>
            </div>
        }>
            <div className="space-y-4" style={{ color: '#3a3a3a' }}>
                {showZhiGuide && (
                    <div className="rounded-[20px] border border-[#f5c8d6] bg-[#fff7fa] p-3.5 text-[13px] leading-relaxed text-[#6a4252] shadow-sm">
                        <div className="mb-1 text-[12px] font-bold tracking-[0.16em] text-[#d97998]">吱吱吱探头。</div>
                        <p>这里可以加你们自己的约会地点。</p>
                        <p className="mt-1">没有合适的场景图，就去 DC 找本体吱吱吱，约会场景生成咒语/焚诀已经双手奉上了。</p>
                        <div className="mt-3 flex justify-end">
                            <button
                                type="button"
                                onClick={handleDismissZhiGuide}
                                className="rounded-full bg-[#3f2733] px-3.5 py-1.5 text-[12px] font-medium text-white active:scale-95"
                            >
                                知道啦
                            </button>
                        </div>
                    </div>
                )}

                {/* Name */}
                <div className="theater-editor-field">
                    <label className="theater-editor-label">地点名称 *</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="例如：后山秘密基地"
                        className="theater-editor-input"
                        maxLength={20}
                    />
                </div>

                {/* English Name */}
                <div className="theater-editor-field">
                    <label className="theater-editor-label">英文副标题（可选）</label>
                    <input
                        type="text"
                        value={nameEn}
                        onChange={e => setNameEn(e.target.value)}
                        placeholder="例如：Secret Base"
                        className="theater-editor-input"
                        maxLength={30}
                    />
                </div>

                {/* Description */}
                <div className="theater-editor-field">
                    <label className="theater-editor-label">氛围描述 * <span style={{ color: 'rgba(0,0,0,0.3)' }}>（100-200字，越详细剧情越好）</span></label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="描述这个地方的环境、气氛、声音、气味……越有画面感越好。导演会根据这段描述来设计事件。"
                        className="theater-editor-input theater-editor-textarea"
                        maxLength={300}
                    />
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', textAlign: 'right', marginTop: 4 }}>
                        {description.length}/300
                    </div>
                </div>

                {/* Tags */}
                <div className="theater-editor-field">
                    <label className="theater-editor-label">场景标签</label>
                    <div className="theater-editor-tags">
                        {ALL_TAGS.map(t => (
                            <button
                                key={t.value}
                                onClick={() => toggleTag(t.value)}
                                className={`theater-editor-tag-btn ${tags.includes(t.value) ? 'selected' : ''}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Background Image Upload */}
                <div className="theater-editor-field">
                    <label className="theater-editor-label">场景壁纸 <span style={{ color: 'rgba(0,0,0,0.3)' }}>（可选，会显示在票根卡片和对话背景）</span></label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                    />
                    {previewUrl ? (
                        <div className="theater-editor-preview">
                            <img src={previewUrl} alt="场景壁纸预览" className="theater-editor-preview-img" />
                            <div className="theater-editor-preview-actions">
                                <button
                                    className="theater-editor-preview-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    更换
                                </button>
                                <button
                                    className="theater-editor-preview-btn theater-editor-preview-btn--danger"
                                    onClick={handleRemoveImage}
                                >
                                    移除
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            className="theater-editor-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <span className="theater-editor-upload-text">处理中…</span>
                            ) : (
                                <>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="3" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                                    </svg>
                                    <span className="theater-editor-upload-text">点击上传壁纸</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default LocationEditor;
