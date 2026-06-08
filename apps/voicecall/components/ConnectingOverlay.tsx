import React,{ useState,useEffect } from 'react';
import AvatarPulse from './AvatarPulse';

/**
 * ConnectingOverlay — incoming 来电接听后的过渡动画
 * 
 * 模拟"翻通讯录 → 拨号 → 接通"的步骤，
 * 引擎在后台预热（闸门模式），用户看到的是沉浸式连接动画。
 */

interface ConnectingOverlayProps {
    avatarUrl: string;
    name: string;
}

const STEPS = [
    { text: '正在打开通讯录', delay: 0 },
    { text: '找到了你的号码', delay: 1200 },
    { text: '拨号中', delay: 2400 },
    { text: '电话接通', delay: 3600 },
];

const ConnectingOverlay: React.FC<ConnectingOverlayProps> = ({
    avatarUrl,
    name,
}) => {
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        const timers = STEPS.map((step, i) => {
            if (i === 0) return null; // step 0 is immediate
            return setTimeout(() => setActiveStep(i), step.delay);
        });
        return () => timers.forEach(t => t && clearTimeout(t));
    }, []);

    return (
        <div className="absolute inset-0 flex flex-col items-center vc-animate-fade">
            {/* 上部留白 */}
            <div className="flex-[2]" />

            {/* 头像 */}
            <div className="mb-6 vc-animate-scale">
                <AvatarPulse avatarUrl={avatarUrl} isRinging={false} isActive={false} />
            </div>

            {/* 名字 */}
            <h1 className="text-2xl font-light text-[var(--vc-text-primary)] mb-3 tracking-wide vc-animate-slide-up">
                {name}
            </h1>

            {/* 步骤指示器 */}
            <div className="flex flex-col items-center gap-3 mt-4">
                {STEPS.map((step, i) => (
                    <div
                        key={i}
                        className={`vc-connect-step ${i <= activeStep ? 'vc-connect-step--active' : ''} ${i === activeStep ? 'vc-connect-step--current' : ''}`}
                        style={{ transitionDelay: `${i * 80}ms` }}
                    >
                        {/* 步骤圆点 */}
                        <div className="vc-connect-step-dot" />
                        {/* 步骤文字 */}
                        <span className="vc-connect-step-text">
                            {i < STEPS.length - 1
                                ? `${name}${step.text}`
                                : step.text
                            }
                            {i === activeStep && i < STEPS.length - 1 && (
                                <span className="vc-calling-text">
                                    <span className="vc-dot">.</span>
                                    <span className="vc-dot">.</span>
                                    <span className="vc-dot">.</span>
                                </span>
                            )}
                        </span>
                    </div>
                ))}
            </div>

            {/* 底部间距 */}
            <div className="flex-[3]" />

            {/* 底部提示 */}
            <div className="pb-16 vc-animate-slide-up" style={{ animationDelay: '0.3s' }}>
                <p className="text-[var(--vc-text-muted)] text-xs font-light tracking-widest">
                    正在为你接通
                </p>
            </div>
        </div>
    );
};

export default ConnectingOverlay;
