import React from 'react';
import { Phone } from '@phosphor-icons/react';
import AvatarPulse from './AvatarPulse';
import { formatDuration } from '../utils';

interface CallEndedViewProps {
    avatarUrl: string;
    name: string;
    duration: number;
}

const CallEndedView: React.FC<CallEndedViewProps> = ({
    avatarUrl,
    name,
    duration
}) => {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center vc-animate-fade" style={{ animationDuration: '0.6s' }}>
            <div className="flex flex-col items-center">

                {/* 头像 — 优雅缩小 */}
                <div className="mb-8 vc-ended-avatar">
                    <AvatarPulse avatarUrl={avatarUrl} isRinging={false} />
                </div>

                {/* 结束信息 — 玻璃面板 */}
                <div className="vc-ended-text vc-ended-panel flex flex-col items-center">
                    <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-3">
                        <Phone weight="fill" className="w-4.5 h-4.5 text-[var(--vc-text-muted)] rotate-[135deg]" />
                    </div>
                    <h1 className="text-2xl font-light text-[var(--vc-text-primary)] mb-1.5 tracking-wide">
                        {name}
                    </h1>
                    <p className="text-[var(--vc-text-muted)] text-sm font-light tracking-widest mb-1">
                        通话结束
                    </p>
                    <div className="text-[var(--vc-text-muted)] text-xs font-mono font-light tracking-wider opacity-70">
                        {duration > 0 ? `通话时长 ${formatDuration(duration)}` : '未接通'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CallEndedView;
