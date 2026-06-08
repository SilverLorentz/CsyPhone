import React,{ useState,useEffect } from 'react';

const UPDATE_VERSION_KEY = 'sullyos_update_seen_version';
export const CURRENT_VERSION = 'v2.12.0';

const UPDATE_LOGS = [
    {
        title: '1. 记忆系统静默升级',
        desc: '记忆系统做了一轮神秘后台升级，体感上回复速度会更快，更省token，召回效果有所提升。'
    },
    {
        title: '2. 生图',
        desc: '聊天里补上了更完整的生图链路：手动生图、剧情模式整理、角色主动发照片和相册落档都可以一起工作。\n\n它会尽量读懂当前剧情，不再只是把一句话硬塞给生图接口。'
    },
    {
        title: '3. 主题曲',
        desc: '聊天窗口新增主题曲生成入口，可以把当前关系、剧情和角色气质整理成一首歌的草稿。\n\n生成后会有确认弹窗和封面预览，适合给一段关系留一张能播放的纪念票根。'
    },
    {
        title: '4. 生图预设',
        desc: '生图设置加入预设管理和风格预设库。\n\n常用模型、接口、画风、负面词、Vibe 参考可以更稳定地复用，不用每次重新填一遍。'
    },
    {
        title: '5. 线下文风',
        desc: '线下见面新增文风选择和自定义文风。\n\n目前内置：相对忘言、乍见之欢、不着一字、五感氤氲、光影成景、浮世苍凉、机锋暗涌、繁花缱绻、冷处偏佳、工笔水乡、静水深流、机锋暗许、咫尺天涯、危光微醺、谑而不虐、蜜里调油。'
    },
    {
        title: '6. 查手机桌面自定义',
        desc: '查手机的桌面外观开放更多自定义：壁纸、图标、播放器，桌面内容和自定义 App 都能更贴近char本人。\n\n现在它更像一台真的被使用过的小手机。'
    },
    {
        title: '7. 番外篇',
        desc: '新增番外篇模式。\n\n每轮回复后可以自动生成一篇藏在星星入口里的同人本番外，也可以手动加梗，让剧情在正文之外悄悄多长出一页。'
    },
    {
        title: '8. 线上聊天回复器',
        desc: '四个选项，支持自由编辑添加删减后发送，免收打字之苦'
    },
    {
        title: '9. 线上 / 线下时间感知开关',
        desc: '聊天设置里新增线上、线下时间感知相关开关，线上时间流逝感知开关。\n\n大家按需手动开启'
    },
    {
        title: '10. 语音通话 STT 优化',
        desc: '语音通话的 STT 链路做了优化。识别失败、识别为空、配置缺失时会有更清楚的降级处理。\n\n纯文字模式，和手动发送模式按需选择'
    }
];

interface UpdatePopupProps {
    canShow: boolean; // Control whether it's allowed to show (e.g., after disclaimer)
}

const UpdatePopup: React.FC<UpdatePopupProps> = ({ canShow }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (canShow) {
            try {
                const seenVersion = localStorage.getItem(UPDATE_VERSION_KEY);
                if (seenVersion !== CURRENT_VERSION) {
                    // Delay a tiny bit for smooth transition if needed, avoid stacking animations
                    setTimeout(() => setIsVisible(true), 300);
                }
            } catch (e) {
                setIsVisible(true);
            }
        }
    }, [canShow]);

    const handleClose = () => {
        try {
            localStorage.setItem(UPDATE_VERSION_KEY, CURRENT_VERSION);
        } catch (e) { /* ignore */ }
        setIsVisible(false);
    };

    if (!isVisible || !canShow) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={handleClose} />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="pt-7 pb-4 px-6 text-center">
                    <div className="text-4xl mb-3 animate-bounce">💌</div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">发现新版本 {CURRENT_VERSION}</h2>
                    </div>
                    <p className="text-[12px] text-slate-400 mt-1 font-medium">6.6 更新 · Csy 手抓糯米机</p>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 max-h-[55vh] overflow-y-auto no-scrollbar space-y-4">
                    {UPDATE_LOGS.map((log, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-1.5">{log.title}</h3>
                            <p className="text-[12px] text-slate-500 leading-relaxed font-medium whitespace-pre-line">
                                {log.desc}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 pb-7 pt-2">
                    <button
                        onClick={handleClose}
                        className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-transform text-sm tracking-wide"
                    >
                        我知道了，不再提示
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdatePopup;
