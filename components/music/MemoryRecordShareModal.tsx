import React, { useMemo } from 'react';
import type { MemoryRecordPlayable } from '../../types/music';
import {
    buildMemoryRecordSharePreview,
    formatMemoryRecordShareDuration,
} from '../../utils/memoryRecordShare';
import './memoryRecordShareModal.css';

interface MemoryRecordShareModalProps {
    isSharing: boolean;
    onClose: () => void;
    onShare: () => void;
    playable: MemoryRecordPlayable | null;
}

const MemoryRecordShareModal: React.FC<MemoryRecordShareModalProps> = ({
    isSharing,
    onClose,
    onShare,
    playable,
}) => {
    const preview = useMemo(
        () => (playable ? buildMemoryRecordSharePreview(playable) : null),
        [playable],
    );

    if (!preview) return null;

    const lyricLines = preview.lyricLines.length > 0
        ? preview.lyricLines
        : ['把这一段回忆轻轻压进唱片', '等夜色替我们按下播放键'];
    const posterGradient = preview.coverGradient || 'linear-gradient(135deg,#211f2e 0%,#b98f73 54%,#d8cab6 100%)';

    return (
        <div
            className="memory-record-share-modal-backdrop"
            onClick={isSharing ? undefined : onClose}
        >
            <div
                className="memory-record-share-modal"
                role="dialog"
                aria-modal="true"
                aria-label="分享一起写歌作品"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="memory-record-share-card-preview">
                    {preview.coverImageUrl ? (
                        <img
                            className="memory-record-share-card-backdrop"
                            src={preview.coverImageUrl}
                            alt=""
                        />
                    ) : null}
                    <div
                        className="memory-record-share-card-wash"
                        style={{ background: posterGradient }}
                    />
                    <div className="memory-record-share-card-frame" />

                    <div className="memory-record-share-card-header">
                        <span>EMO CLOUD</span>
                        <span>{formatMemoryRecordShareDuration(preview.durationMs)}</span>
                    </div>

                    <div className="memory-record-share-card-stage">
                        <div className="memory-record-share-card-disc" />
                        <div className="memory-record-share-card-cover-shell">
                            <div
                                className="memory-record-share-card-cover"
                                style={preview.coverImageUrl ? undefined : { background: posterGradient }}
                            >
                                {preview.coverImageUrl ? (
                                    <img src={preview.coverImageUrl} alt={preview.title} />
                                ) : (
                                    <span>♪</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="memory-record-share-card-copy">
                        <h3>{preview.title}</h3>
                        <div>
                            <p>{preview.artistName}</p>
                            <span>{preview.albumName}</span>
                        </div>
                    </div>

                    <div className="memory-record-share-card-lyrics">
                        {lyricLines.map((line) => (
                            <p key={line}>{line}</p>
                        ))}
                    </div>

                    <div className="memory-record-share-card-footer">
                        <span>一起写歌</span>
                        <span>MEMORY RECORD</span>
                    </div>
                </div>

                <div className="memory-record-share-modal-copy">
                    <h2>分享海报</h2>
                    <p>会生成一张适合发布的 PNG 海报。想保存能听的音频，可以继续用播放器里的“导出 MP3”。</p>
                </div>

                <div className="memory-record-share-modal-actions">
                    <button
                        type="button"
                        className="memory-record-share-modal-btn memory-record-share-modal-btn--primary"
                        disabled={isSharing}
                        onClick={onShare}
                    >
                        {isSharing ? '生成中...' : '分享海报'}
                    </button>
                    <button
                        type="button"
                        className="memory-record-share-modal-btn memory-record-share-modal-btn--secondary"
                        disabled={isSharing}
                        onClick={onClose}
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MemoryRecordShareModal;
