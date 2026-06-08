
import { ChatTheme } from '../../types';
import wechatCss from '../../styles/themes/wechat.css?raw';
import waterdropCss from '../../styles/themes/waterdrop.css?raw';
import glassmorphismCss from '../../styles/themes/glassmorphism.css?raw';

// Built-in presets map to the new data structure for consistency
export const PRESET_THEMES: Record<string, ChatTheme> = {
    default: {
        id: 'default', name: 'WeChat(绿)', type: 'preset',
        user: { textColor: '#000000', backgroundColor: '#95ec69', borderRadius: 8, opacity: 1 },
        ai: { textColor: '#000000', backgroundColor: '#ffffff', borderRadius: 8, opacity: 1 },
        customCss: wechatCss,
        showTimestamp: true,
        timestampIntervalMs: 180000,  // 3 minutes, same as real WeChat
    },
    waterdrop: {
        id: 'waterdrop', name: '拟态水滴(Gloss)', type: 'preset',
        user: { textColor: '#1a1a2e', backgroundColor: 'rgba(225,230,235,0.06)', borderRadius: 26, opacity: 1 },
        ai: { textColor: '#1a1a2e', backgroundColor: 'rgba(225,230,235,0.06)', borderRadius: 26, opacity: 1 },
        customCss: waterdropCss
    },
    glassmorphism: {
        id: 'glassmorphism', name: '毛玻璃(Glass)', type: 'preset',
        user: { textColor: '#1a1a2e', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, opacity: 1 },
        ai: { textColor: '#1a1a2e', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, opacity: 1 },
        customCss: glassmorphismCss
    }
};
