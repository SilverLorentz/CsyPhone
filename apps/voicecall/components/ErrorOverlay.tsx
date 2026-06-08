import React,{ useState,useEffect,useCallback } from 'react';

export interface VoiceCallError {
    /** 用户友好的错误描述 */
    friendlyMessage: string;
    /** 原始报错信息（JSON / 状态码等） */
    rawError: string;
    /** 错误时间戳 */
    timestamp: number;
    /** 是否正在重试 */
    isRetrying?: boolean;
}

interface ErrorOverlayProps {
    error: VoiceCallError | null;
    onDismiss: () => void;
}

/**
 * 语音通话错误浮窗
 * - 半透明玻璃拟态，适配暗色通话背景
 * - 显示友好描述 + 可展开原始报错
 * - 5 秒自动消失，手动也可关闭
 */
const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ error, onDismiss }) => {
    const [expanded, setExpanded] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // 新错误出现时重置展开状态并触发显示
    useEffect(() => {
        if (error) {
            setExpanded(false);
            setIsVisible(true);
        }
    }, [error]);

    // 自动消失（非展开 & 非重试状态下 6 秒后）
    useEffect(() => {
        if (!error || expanded || error.isRetrying) return;
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300); // 等退出动画
        }, 6000);
        return () => clearTimeout(timer);
    }, [error, expanded, onDismiss]);

    const handleDismiss = useCallback(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300);
    }, [onDismiss]);

    if (!error) return null;

    return (
        <div
            className={`vc-error-overlay ${isVisible ? 'vc-error-overlay--visible' : 'vc-error-overlay--hidden'}`}
        >
            <div className="vc-error-card">
                {/* 顶部：图标 + 友好描述 */}
                <div className="vc-error-header">
                    <div className="vc-error-icon">
                        {error.isRetrying ? (
                            /* 旋转加载图标 */
                            <svg className="vc-error-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                        ) : (
                            /* 警告图标 */
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                        )}
                    </div>
                    <p className="vc-error-message">{error.friendlyMessage}</p>
                    <button className="vc-error-close" onClick={handleDismiss}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 展开/收起按钮 */}
                {error.rawError && !error.isRetrying && (
                    <button
                        className="vc-error-toggle"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? '收起详情 ▲' : '查看报错详情 ▼'}
                    </button>
                )}

                {/* 原始报错信息 */}
                {expanded && (
                    <div className="vc-error-detail">
                        <pre>{error.rawError}</pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ErrorOverlay;
