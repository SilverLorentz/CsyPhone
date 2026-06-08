import React,{ useState } from 'react';

/**
 * WeChatMomentsCard — a pixel-perfect replica of a WeChat Moments (朋友圈) post.
 *
 * Design reference (2024 WeChat iOS):
 *   Avatar: 40×40 px, border-radius 4px, left column
 *   Name : #576b95 (link blue), 15px, medium weight
 *   Body : #111111, 15px, line-height 1.6
 *   Time : #b2b2b2, 12px
 *   Action btn: two-dot icon, #576b95
 *   Interaction box: #f7f7f7, 4px radius, upward triangle
 *     - Likes: ❤ icon + comma-separated blue names
 *     - Comments: "name: content" or "name 回复 name: content"
 */

export interface MomentsComment {
    author: string;
    replyTo?: string;
    content: string;
}

export interface MomentsData {
    authorName: string;
    authorAvatar: string;
    content: string;
    timeText?: string;
    location?: string;
    likes?: string[];
    comments?: MomentsComment[];
}

interface Props {
    data: MomentsData;
}

/* ---- tiny inline SVGs ---- */
const HeartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#576b95" width="14" height="14" style={{ flexShrink: 0 }}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
);

const ActionDots = ({ onClick }: { onClick: () => void }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{
            border: 'none',
            background: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
        }}
    >
        {/* Two small rounded-rect dots mimicking the WeChat action icon */}
        <span style={{
            width: 6, height: 6, borderRadius: 1.5,
            backgroundColor: '#576b95', display: 'inline-block',
        }} />
        <span style={{
            width: 6, height: 6, borderRadius: 1.5,
            backgroundColor: '#576b95', display: 'inline-block',
        }} />
    </button>
);

const WeChatMomentsCard: React.FC<Props> = ({ data }) => {
    const {
        authorName, authorAvatar, content,
        timeText, location,
        likes = [], comments = [],
    } = data;

    const [showActionBox, setShowActionBox] = useState(false);
    const hasInteraction = likes.length > 0 || comments.length > 0;

    return (
        <div style={{
            display: 'flex',
            gap: 10,
            padding: '12px 16px',
            backgroundColor: '#ffffff',
            minWidth: 280,
            maxWidth: 360,
            width: '100%',
            borderRadius: 6,
            boxShadow: '0 0.5px 2px rgba(0,0,0,0.06)',
            fontFamily: '-apple-system, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}>
            {/* ── Left: Avatar ── */}
            <img
                src={authorAvatar}
                alt={authorName}
                style={{
                    width: 40, height: 40,
                    borderRadius: 4,
                    objectFit: 'cover',
                    flexShrink: 0,
                    backgroundColor: '#e5e5e5',
                }}
            />

            {/* ── Right: Content Area ── */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Author Name */}
                <div style={{
                    color: '#576b95',
                    fontSize: 15,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    marginBottom: 4,
                    wordBreak: 'break-all',
                }}>
                    {authorName}
                </div>

                {/* Text Content */}
                <div style={{
                    color: '#111111',
                    fontSize: 15,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    marginBottom: 8,
                }}>
                    {content}
                </div>

                {/* Time row + Action button */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: hasInteraction ? 6 : 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#b2b2b2', fontSize: 12, lineHeight: 1 }}>
                            {timeText || '刚刚'}
                        </span>
                        {location && (
                            <span style={{ color: '#576b95', fontSize: 12, lineHeight: 1 }}>
                                {location}
                            </span>
                        )}
                    </div>
                    <ActionDots onClick={() => setShowActionBox(v => !v)} />
                </div>

                {/* ── Action Popup (点赞/评论) ── */}
                {showActionBox && (
                    <div style={{
                        display: 'flex',
                        borderRadius: 4,
                        overflow: 'hidden',
                        marginBottom: 6,
                        animation: 'moments-action-slide 0.15s ease-out',
                    }}>
                        <button style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: '#4c5a6b',
                            color: '#ffffff',
                            fontSize: 13,
                            cursor: 'pointer',
                        }}>
                            <HeartIcon />
                            <span style={{ color: '#fff' }}>赞</span>
                        </button>
                        <div style={{ width: 0.5, backgroundColor: '#5a6878' }} />
                        <button style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: '#4c5a6b',
                            color: '#ffffff',
                            fontSize: 13,
                            cursor: 'pointer',
                        }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>评论</span>
                        </button>
                    </div>
                )}

                {/* ── Interaction Box (Likes + Comments) ── */}
                {hasInteraction && (
                    <div style={{ position: 'relative', marginTop: 2 }}>
                        {/* Upward triangle */}
                        <div style={{
                            position: 'absolute',
                            top: -6,
                            left: 12,
                            width: 0, height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderBottom: '6px solid #f7f7f7',
                        }} />
                        <div style={{
                            backgroundColor: '#f7f7f7',
                            borderRadius: 3,
                            padding: '6px 8px',
                            fontSize: 14,
                            lineHeight: 1.6,
                        }}>
                            {/* Likes Section */}
                            {likes.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 4,
                                    paddingBottom: comments.length > 0 ? 5 : 0,
                                    borderBottom: comments.length > 0 ? '0.5px solid #dcdcdc' : 'none',
                                    marginBottom: comments.length > 0 ? 5 : 0,
                                    flexWrap: 'wrap',
                                }}>
                                    <HeartIcon />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        {likes.map((name, i) => (
                                            <React.Fragment key={i}>
                                                <span style={{ color: '#576b95', fontWeight: 500 }}>{name}</span>
                                                {i < likes.length - 1 && <span style={{ color: '#111' }}>, </span>}
                                            </React.Fragment>
                                        ))}
                                    </span>
                                </div>
                            )}

                            {/* Comments Section */}
                            {comments.map((c, i) => (
                                <div key={i} style={{ marginBottom: i < comments.length - 1 ? 2 : 0 }}>
                                    <span style={{ color: '#576b95', fontWeight: 500 }}>{c.author}</span>
                                    {c.replyTo && (
                                        <>
                                            <span style={{ color: '#111' }}> 回复 </span>
                                            <span style={{ color: '#576b95', fontWeight: 500 }}>{c.replyTo}</span>
                                        </>
                                    )}
                                    <span style={{ color: '#111' }}>: {c.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WeChatMomentsCard;
