import React from 'react';
import { Phone,PhoneDisconnect } from '@phosphor-icons/react';
import AvatarPulse from './AvatarPulse';

interface IncomingCallOverlayProps {
    avatarUrl: string;
    name: string;
    direction?: 'outgoing' | 'incoming';
    onAccept?: () => void;
    onReject: () => void;
}

const IncomingCallOverlay: React.FC<IncomingCallOverlayProps> = ({
    avatarUrl,
    name,
    direction = 'incoming',
    onAccept,
    onReject
}) => {
    const isOutgoing = direction === 'outgoing';

    return (
        <div className="absolute inset-0 flex flex-col items-center vc-animate-fade">

            {/* 上部留白 — 把头像推到屏幕 40% 位置 */}
            <div className="flex-[2]" />

            {/* 头像 */}
            <div className="mb-5 vc-animate-scale">
                <AvatarPulse avatarUrl={avatarUrl} isRinging={true} />
            </div>

            {/* 名字 + 状态 */}
            <div className="text-center mb-4 vc-animate-slide-up" style={{ animationDelay: '0.15s' }}>
                <h1 className="text-3xl font-light text-[var(--vc-text-primary)] mb-2.5 tracking-wide">
                    {name}
                </h1>
                <p className="text-[var(--vc-text-secondary)] text-base font-light tracking-widest">
                    {isOutgoing ? (
                        <span className="vc-calling-text">
                            正在呼叫<span className="vc-dot">.</span><span className="vc-dot">.</span><span className="vc-dot">.</span>
                        </span>
                    ) : '语音来电'}
                </p>
            </div>

            {/* 下部弹性空间 */}
            <div className="flex-[3]" />

            {/* 底部按钮 */}
            <div
                className={`w-full flex items-center ${isOutgoing ? 'justify-center' : 'justify-between'} px-16 pb-16 vc-animate-slide-up`}
                style={{ animationDelay: '0.25s' }}
            >
                {/* 拒绝 / 取消 */}
                <div className="flex flex-col items-center gap-3">
                    <button
                        onClick={onReject}
                        className="vc-droplet-reject"
                    >
                        <PhoneDisconnect weight="fill" className="w-9 h-9" />
                    </button>
                    <span className="text-[var(--vc-text-muted)] text-xs font-medium tracking-wider">
                        {isOutgoing ? '取消' : '拒绝'}
                    </span>
                </div>

                {/* 接听 — incoming only */}
                {!isOutgoing && onAccept && (
                    <div className="flex flex-col items-center gap-3">
                        <button
                            onClick={onAccept}
                            className="vc-droplet-accept animate-bounce"
                            style={{ animationDuration: '2.2s' }}
                        >
                            <Phone weight="fill" className="w-9 h-9" />
                        </button>
                        <span className="text-[var(--vc-text-muted)] text-xs font-medium tracking-wider">接听</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IncomingCallOverlay;
