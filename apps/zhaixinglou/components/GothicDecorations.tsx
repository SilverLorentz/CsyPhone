/**
 * GothicDecorations — 摘星楼共享哥特装饰组件
 *
 * 提供统一的中世纪哥特风装饰元素，可在各页面复用。
 * 所有贴图均为金色箔纹透明背景素材。
 */
import React from 'react';

// ━━━ 装饰贴图 URL 常量 ━━━
export const DECOR = {
    wheel: 'https://i.postimg.cc/zXxyW7rB/ming-yun-lun.png',       // 命运轮盘（全视之眼）
    moon: 'https://i.postimg.cc/FsTYcp4q/yue-liang.png',            // 新月
    moonPhases: 'https://i.postimg.cc/GhX4YKCt/qi-qi-su-cai-pu-(108).png', // 月相圆环
    triangleBorder: 'https://i.postimg.cc/T3hpcbdN/qi-qi-su-cai-pu-(33).png', // 三角纹分割线
    chainDivider: 'https://i.postimg.cc/2S3VxWjN/qi-qi-su-cai-pu-(34).png',  // 链式分割线
    occultSymbol: 'https://i.postimg.cc/PfzpfhFh/qi-qi-su-cai-pu-(94).png',  // 神秘学符号
    justice: 'https://i.postimg.cc/Hs6r5zgt/zheng-yi.png',           // 正义天秤
    chalice: 'https://i.postimg.cc/Zq25bYdM/32.png',                 // 圣杯
    crown: 'https://i.postimg.cc/cJ2Lx13y/60.png',                   // 王冠
    priestess: 'https://i.postimg.cc/xdcdVNcL/nu-ji-si.png',         // 女祭司（三月符号）
    lovers: 'https://i.postimg.cc/YSZCr2WV/qing-ren.png',           // 情人（双蛇缠绕）
} as const;

// ━━━ 统一的 Header 组件 ━━━
export const GothicHeader: React.FC<{
    title: string;
    onBack: () => void;
    rightAction?: React.ReactNode;
    /** 标题旁的小装饰图标 URL */
    decorIcon?: string;
}> = ({ title, onBack, rightAction, decorIcon }) => (
    <div className="pt-12 pb-3 px-5 flex items-center justify-between shrink-0 z-30 relative">
        {/* 左：返回按钮 */}
        <button
            onClick={onBack}
            className="p-2 -ml-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-[#d4af37] border border-[#d4af37]/30 bg-black/40 backdrop-blur-md"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </button>
        {/* 中：标题 + 装饰 */}
        <div className="flex items-center gap-2">
            {decorIcon && (
                <img
                    src={decorIcon}
                    className="w-6 h-6 object-contain"
                    style={{ animation: 'gothic-glow-pulse 4s ease-in-out infinite', filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.4))' }}
                    alt=""
                />
            )}
            <span
                className="text-[#d4af37] text-2xl tracking-[0.08em]"
                style={{ fontFamily: 'ZhaixinglouTitle, serif', textShadow: '0 0 12px rgba(212,175,55,0.5)' }}
            >
                {title}
            </span>
            {decorIcon && (
                <img
                    src={decorIcon}
                    className="w-6 h-6 object-contain"
                    style={{ animation: 'gothic-glow-pulse 4s ease-in-out infinite 2s', filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.4)) scaleX(-1)', transform: 'scaleX(-1)' }}
                    alt=""
                />
            )}
        </div>
        {/* 右：操作区 */}
        {rightAction || <div className="w-9" />}
    </div>
);

// ━━━ 哥特分割线 ━━━
export const GothicDivider: React.FC<{
    /** 中央装饰图 URL，默认用 chainDivider */
    iconUrl?: string;
    /** 中央图标尺寸，默认 w-8 */
    iconSize?: string;
    className?: string;
}> = ({ iconUrl, iconSize = 'w-8', className = '' }) => (
    <div className={`flex items-center justify-center gap-3 py-3 ${className}`}>
        <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/25 to-[#d4af37]/15" />
        <img
            src={iconUrl || DECOR.chainDivider}
            className={`${iconSize} h-auto object-contain opacity-50`}
            style={{ filter: 'drop-shadow(0 0 4px rgba(212,175,55,0.3))' }}
            alt=""
        />
        <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-[#d4af37]/25 to-[#d4af37]/15" />
    </div>
);

// ━━━ 旋转命运轮盘加载器 ━━━
export const GothicLoadingSpinner: React.FC<{
    size?: number;
    className?: string;
}> = ({ size = 40, className = '' }) => (
    <div className={`flex items-center justify-center ${className}`}>
        <img
            src={DECOR.wheel}
            width={size}
            height={size}
            className="object-contain"
            style={{
                animation: 'gothic-spin 8s linear infinite',
                filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.5))',
            }}
            alt=""
        />
    </div>
);

// ━━━ 页面角标装饰（四角飘浮的小装饰图） ━━━
export const GothicCornerDecor: React.FC<{
    /** 只在特定角显示：tl tr bl br */
    corners?: ('tl' | 'tr' | 'bl' | 'br')[];
    iconUrl?: string;
    size?: number;
    opacity?: number;
}> = ({ corners = ['tl', 'tr'], iconUrl, size = 32, opacity = 0.25 }) => {
    const src = iconUrl || DECOR.occultSymbol;
    const posMap = {
        tl: { top: 8, left: 8, rotate: '0deg' },
        tr: { top: 8, right: 8, rotate: '90deg' },
        bl: { bottom: 8, left: 8, rotate: '270deg' },
        br: { bottom: 8, right: 8, rotate: '180deg' },
    };
    return (
        <>
            {corners.map(c => {
                const pos = posMap[c];
                return (
                    <img
                        key={c}
                        src={src}
                        width={size}
                        height={size}
                        className="absolute pointer-events-none object-contain z-[5]"
                        style={{
                            ...pos,
                            opacity,
                            transform: `rotate(${pos.rotate})`,
                            filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.3))',
                            animation: `gothic-float 6s ease-in-out infinite ${c === 'tr' || c === 'bl' ? '3s' : '0s'}`,
                        }}
                        alt=""
                    />
                );
            })}
        </>
    );
};

// ━━━ 背景装饰大图（缓慢旋转的命运轮盘等） ━━━
export const GothicBackgroundDecor: React.FC<{
    src?: string;
    size?: number;
    opacity?: number;
    /** CSS position: e.g. 'center bottom' */
    position?: string;
    spin?: boolean;
    glow?: boolean;
    className?: string;
}> = ({ src, size = 200, opacity = 0.08, position = 'center', spin = false, glow = true, className = '' }) => (
    <div
        className={`absolute inset-0 pointer-events-none overflow-hidden z-[2] ${className}`}
        style={{ display: 'flex', alignItems: position.includes('bottom') ? 'flex-end' : position.includes('top') ? 'flex-start' : 'center', justifyContent: 'center' }}
    >
        <img
            src={src || DECOR.wheel}
            width={size}
            height={size}
            className="object-contain"
            style={{
                opacity,
                animation: spin ? 'gothic-spin 60s linear infinite' : 'gothic-float 8s ease-in-out infinite',
                filter: glow ? 'drop-shadow(0 0 20px rgba(212,175,55,0.3))' : undefined,
            }}
            alt=""
        />
    </div>
);

export default {
    GothicHeader,
    GothicDivider,
    GothicLoadingSpinner,
    GothicCornerDecor,
    GothicBackgroundDecor,
};
