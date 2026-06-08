import React from 'react';

interface XhsCardProps {
    note: any;
    isUser: boolean;
}

const XhsCard: React.FC<XhsCardProps> = ({ note, isUser }) => {
    return (
        <div className="sully-card-container w-64 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:opacity-90 transition-opacity">
            {/* Cover image */}
            {note.coverUrl ? (
                <div className="relative w-full h-36 bg-slate-100 overflow-hidden">
                    <img
                        src={note.coverUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e: any) => {
                            const img = e.target;
                            const container = img.parentElement;
                            if (!container) return;
                            img.style.display = 'none';
                            if (container.querySelector('.xhs-cover-fallback')) return;
                            const fallback = document.createElement('div');
                            fallback.className = 'xhs-cover-fallback w-full h-full bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center';
                            fallback.innerHTML = `<div class="text-center"><div class="text-2xl mb-1">📕</div><div class="text-[10px] text-red-300 font-medium">${note.title ? '封面加载失败' : '小红书笔记'}</div></div>`;
                            container.appendChild(fallback);
                        }}
                    />
                    {note.type === 'video' && (
                        <div className="absolute top-2 right-2 bg-black/50 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
                            <span className="text-[9px] text-white font-medium">视频</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="h-14 bg-gradient-to-r from-red-400 to-pink-500 flex items-center justify-center">
                    <span className="text-white/80 text-xs font-medium tracking-wide">小红书笔记</span>
                </div>
            )}
            <div className="p-3">
                {/* Title */}
                <div className="font-bold text-sm text-slate-800 line-clamp-2 leading-snug mb-1.5">{note.title || '无标题笔记'}</div>
                {/* Description */}
                {note.desc && <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-2">{note.desc}</p>}
                {/* Author + Likes */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-400 to-pink-400 flex items-center justify-center text-[8px] text-white font-bold">{(note.author || '?')[0]}</div>
                        <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{note.author || '小红书用户'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-red-300"><path d="m9.653 16.915-.005-.003-.019-.01a20.759 20.759 0 0 1-1.162-.682 22.045 22.045 0 0 1-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 0 1 8-2.828A4.5 4.5 0 0 1 18 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 0 1-3.744 2.582l-.019.01-.005.003h-.002a.723.723 0 0 1-.692 0l-.003-.002Z" /></svg>
                        <span>{note.likes || 0}</span>
                    </div>
                </div>
                {/* Footer label */}
                <div className="mt-2 pt-1.5 flex items-center gap-1 text-[9px] text-slate-300">
                    <span className="text-red-400 font-bold">小红书</span> <span>·</span> <span>{note.type === 'video' ? '视频' : '笔记'}{isUser ? '分享' : '推荐'}</span>
                </div>
            </div>
        </div>
    );
};

export default XhsCard;
