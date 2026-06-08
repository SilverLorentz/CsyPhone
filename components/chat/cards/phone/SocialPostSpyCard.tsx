import React from 'react';

/**
 * SocialPostSpyCard — 朋友圈/社交媒体动态仿真卡片
 * WeChat Moments layout for the chat evidence system.
 */

interface SocialPostSpyCardProps {
    title: string;
    detail: string;
    charName?: string;
    charAvatar?: string;
}

const SocialPostSpyCard: React.FC<SocialPostSpyCardProps> = ({ title, detail, charName, charAvatar }) => (
    <div className="w-64 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100">
        {/* Content area — WeChat Moments layout */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 12px 0' }}>
            {/* Avatar (square with rounded corners) */}
            {charAvatar ? (
                <img
                    src={charAvatar}
                    alt=""
                    style={{
                        width: 36, height: 36,
                        borderRadius: 4,
                        objectFit: 'cover',
                        flexShrink: 0,
                        backgroundColor: '#e5e5e5',
                    }}
                />
            ) : (
                <div style={{
                    width: 36, height: 36,
                    borderRadius: 4,
                    flexShrink: 0,
                    backgroundColor: '#e0e4ea',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: '#8a919e',
                }}>
                    {(charName || '?')[0]}
                </div>
            )}
            {/* Right side */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Author name in WeChat blue */}
                <div style={{
                    color: '#576b95',
                    fontSize: 14,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    marginBottom: 3,
                }}>
                    {charName || '好友'}
                </div>
                {/* Content text */}
                <div style={{
                    color: '#111111',
                    fontSize: 14,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                }}>
                    {detail}
                </div>
            </div>
        </div>

        {/* Time row */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px 0 58px', /* 12 + 36 avatar + 10 gap = 58 */
        }}>
            <span style={{ color: '#b2b2b2', fontSize: 11, lineHeight: 1 }}>
                {title || '刚刚'}
            </span>
            {/* Action dots */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 4px',
            }}>
                <span style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#576b95', display: 'inline-block' }} />
                <span style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#576b95', display: 'inline-block' }} />
            </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 mt-1 border-t border-slate-50 text-[9px] text-slate-300 text-center">
            朋友圈动态
        </div>
    </div>
);

export default SocialPostSpyCard;
