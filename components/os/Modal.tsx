
import React from 'react';

interface ModalProps {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in sm:p-6"
            style={{
                paddingTop: 'max(1rem, calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 0.75rem))',
                paddingBottom: 'max(1rem, calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 0.75rem))',
            }}
        >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div
                data-testid="modal-shell"
                className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl animate-slide-up"
                style={{
                    maxHeight: 'calc(var(--visual-viewport-height, 100dvh) - var(--safe-top, env(safe-area-inset-top, 0px)) - var(--safe-bottom, env(safe-area-inset-bottom, 0px)) - 2rem)',
                }}
            >
                <div className="shrink-0 px-6 pt-6 pb-2">
                    <h3 className="text-lg font-bold text-slate-800 text-center">{title}</h3>
                </div>
                <div
                    data-testid="modal-scroll-body"
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 no-scrollbar"
                    style={{
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-y',
                    }}
                >
                    {children}
                </div>
                {footer ? (
                    <div className="shrink-0 px-6 pb-6 flex gap-3">
                        {footer}
                    </div>
                ) : (
                    <div className="shrink-0 px-6 pb-6">
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform"
                        >
                            关闭
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
