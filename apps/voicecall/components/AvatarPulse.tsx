import React from 'react';

interface AvatarPulseProps {
    avatarUrl: string;
    isRinging: boolean;
    isActive?: boolean;
    isSpeaking?: boolean;
}

const AvatarPulse: React.FC<AvatarPulseProps> = ({ avatarUrl, isRinging, isActive = false, isSpeaking = false }) => {
    return (
        <div className="relative flex items-center justify-center">

            {/* 雾化光晕 — 通话中持续呼吸 */}
            {isActive && (
                <div className={`vc-avatar-halo ${isSpeaking ? 'vc-avatar-halo--speaking' : ''}`} />
            )}

            {/* 呼吸光环（多层叠加） — ringing / dialing */}
            {isRinging && (
                <>
                    <div
                        className="absolute w-[120px] h-[120px] rounded-full bg-[rgba(200,192,182,0.12)] animate-[vc-avatar-pulse_2.5s_infinite_cubic-bezier(0.25,1,0.5,1)]"
                        style={{ animationDelay: '0s' }}
                    />
                    <div
                        className="absolute w-[120px] h-[120px] rounded-full bg-[rgba(200,192,182,0.06)] animate-[vc-avatar-pulse_2.5s_infinite_cubic-bezier(0.25,1,0.5,1)]"
                        style={{ animationDelay: '0.8s' }}
                    />
                    <div
                        className="absolute w-[120px] h-[120px] rounded-full bg-[rgba(200,192,182,0.06)] animate-[vc-avatar-pulse_2.5s_infinite_cubic-bezier(0.25,1,0.5,1)]"
                        style={{ animationDelay: '1.6s' }}
                    />
                </>
            )}

            {/* 流水灯光环 — active 通话中 */}
            {isActive && (
                <div className={`vc-stream-ring absolute z-[5] w-[128px] h-[128px] rounded-full ${isSpeaking ? 'vc-stream-ring--speaking' : ''}`} />
            )}

            {/* 头像本体 */}
            <div className={`relative z-10 w-[120px] h-[120px] rounded-full overflow-hidden ${
                isActive
                    ? 'border-0 shadow-[0_0_35px_rgba(200,192,182,0.15)]'
                    : 'border border-white/15 shadow-[0_0_30px_rgba(200,192,182,0.12)]'
            }`}>
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
        </div>
    );
};

export default AvatarPulse;
