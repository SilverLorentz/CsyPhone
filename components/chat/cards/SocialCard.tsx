import React from 'react';

interface SocialCardProps {
    post: any;
}

const SocialCard: React.FC<SocialCardProps> = ({ post }) => {
    return (
        <div className="w-64 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:opacity-90 transition-opacity">
            <div className="h-32 w-full flex items-center justify-center text-6xl relative overflow-hidden" style={{ background: post.bgStyle || '#fce7f3' }}>
                {post.images?.[0] || '📄'}
                <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/30 to-transparent">
                    <div className="text-white text-xs font-bold line-clamp-1">{post.title}</div>
                </div>
            </div>
            <div className="p-3">
                <div className="flex items-center gap-2 mb-2">
                    <img src={post.authorAvatar} className="w-4 h-4 rounded-full" />
                    <span className="text-[10px] text-slate-500">{post.authorName}</span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{post.content}</p>
                <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="text-red-400">Spark</span> • 笔记分享
                </div>
            </div>
        </div>
    );
};

export default SocialCard;
