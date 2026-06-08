/**
 * roomAssets.ts — Constants and preset data for the Room App
 *
 * Extracted from RoomApp.tsx to reduce component file size.
 * Contains asset library, wallpaper/floor presets, default furniture layouts,
 * and the FLOOR_HORIZON constant.
 */

import { RoomItem } from '../../types';

// --- Sticker Library (copyright-free assets) ---
export const ASSET_LIBRARY = {
    // Sully专属家具 (默认大小已根据你的布局调整)
    sully_special: [
        { name: 'Sully床', image: 'https://sharkpan.xyz/f/A3XeUZ/BED.png', defaultScale: 2.4 },
        { name: 'Sully电脑桌', image: 'https://sharkpan.xyz/f/G5n3Ul/DNZ.png', defaultScale: 2.4 },
        { name: 'Sully书柜', image: 'https://sharkpan.xyz/f/zlpWS5/SG.png', defaultScale: 2.0 },
        { name: 'Sully洞洞板', image: 'https://sharkpan.xyz/f/85K5ij/DDB.png', defaultScale: 2.6 },
        { name: 'Sully垃圾桶', image: 'https://sharkpan.xyz/f/75Nvsj/LJT.png', defaultScale: 0.9 },
    ],
    furniture: [
        { name: '床', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6cf.png', defaultScale: 1.5 },
        { name: '沙发', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6cb.png', defaultScale: 1.4 },
        { name: '椅子', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fa91.png', defaultScale: 1.0 },
        { name: '马桶', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6bd.png', defaultScale: 1.0 },
        { name: '浴缸', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6c1.png', defaultScale: 1.5 },
    ],
    decor: [
        { name: '盆栽', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fab4.png', defaultScale: 0.8 },
        { name: '电脑', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5a5.png', defaultScale: 0.8 },
        { name: '游戏机', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3ae.png', defaultScale: 0.6 },
        { name: '吉他', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b8.png', defaultScale: 1.0 },
        { name: '画', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5bc.png', defaultScale: 1.2 },
        { name: '书堆', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4da.png', defaultScale: 0.8 },
        { name: '台灯', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3db.png', defaultScale: 0.8 },
        { name: '垃圾桶', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5d1.png', defaultScale: 0.7 },
    ],
    food: [
        { name: '咖啡', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2615.png', defaultScale: 0.5 },
        { name: '蛋糕', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f370.png', defaultScale: 0.6 },
        { name: '披萨', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f355.png', defaultScale: 0.8 },
    ]
};

// 预设背景图
export const WALLPAPER_PRESETS = [
    { name: '温馨暖白', value: 'radial-gradient(circle at 50% 50%, #fdfbf7 0%, #e2e8f0 100%)' },
    { name: '深夜蓝调', value: 'linear-gradient(to bottom, #1e293b 0%, #0f172a 100%)' },
    { name: '少女粉', value: 'radial-gradient(circle at 50% 50%, #fff1f2 0%, #ffe4e6 100%)' },
    { name: '极简灰', value: 'linear-gradient(135deg, #f3f4f6 0%, #d1d5db 100%)' },
    { name: '木质感', value: 'repeating-linear-gradient(45deg, #f7fee7 0px, #f7fee7 10px, #ecfccb 10px, #ecfccb 20px)' },
];

export const FLOOR_PRESETS = [
    { name: '浅色木板', value: 'repeating-linear-gradient(90deg, #e7e5e4 0px, #e7e5e4 20px, #d6d3d1 21px)' },
    { name: '深色木板', value: 'repeating-linear-gradient(90deg, #78350f 0px, #78350f 20px, #451a03 21px)' },
    { name: '格纹地砖', value: 'conic-gradient(from 90deg at 2px 2px, #0000 90deg, #cbd5e1 0) 0 0/30px 30px' },
    { name: '素色地毯', value: '#d1d5db' },
];

export const DEFAULT_FURNITURE: RoomItem[] = [
    { id: 'desk', name: '书桌', type: 'furniture', image: ASSET_LIBRARY.furniture[1].image, x: 20, y: 55, scale: 1.2, rotation: 0, isInteractive: true, descriptionPrompt: '这里是书桌，可能乱糟糟的，也可能整整齐齐。' },
    { id: 'plant', name: '盆栽', type: 'decor', image: ASSET_LIBRARY.decor[0].image, x: 85, y: 40, scale: 0.8, rotation: 0, isInteractive: true, descriptionPrompt: '角落里的植物。' },
];

// User-provided layout (Perfectly aligned!)
export const SULLY_FURNITURE: RoomItem[] = [
    {
        id: "item-1768927221380",
        name: "Sully床",
        type: "furniture",
        image: "https://sharkpan.xyz/f/A3XeUZ/BED.png",
        x: 78.45852578067732,
        y: 97.38889754570907,
        scale: 2.4,
        rotation: 0,
        isInteractive: true,
        descriptionPrompt: "看起来很好睡的猫窝（确信）。"
    },
    {
        id: "item-1768927255102",
        name: "Sully电脑桌",
        type: "furniture",
        image: "https://sharkpan.xyz/f/G5n3Ul/DNZ.png",
        x: 28.853756791175588,
        y: 69.9444485439727,
        scale: 2.4,
        rotation: 0,
        isInteractive: true,
        descriptionPrompt: "硬核的电脑桌，上面大概运行着什么毁灭世界的程序。"
    },
    {
        id: "item-1768927271632",
        name: "Sully垃圾桶",
        type: "furniture",
        image: "https://sharkpan.xyz/f/75Nvsj/LJT.png",
        x: 10.276680026943646,
        y: 80.49999880981437,
        scale: 0.9,
        rotation: 0,
        isInteractive: true,
        descriptionPrompt: "不要乱翻垃圾桶！"
    },
    {
        id: "item-1768927286526",
        name: "Sully洞洞板",
        type: "furniture",
        image: "https://sharkpan.xyz/f/85K5ij/DDB.png",
        x: 32.608697687684455,
        y: 48.72222587415929,
        scale: 2.6,
        rotation: 0,
        isInteractive: true,
        descriptionPrompt: "收纳着各种奇奇怪怪的黑客工具和猫咪周边的洞洞板。"
    },
    {
        id: "item-1768927303472",
        name: "Sully书柜",
        type: "furniture",
        image: "https://sharkpan.xyz/f/zlpWS5/SG.png",
        x: 79.84189945375853,
        y: 68.94444543117953,
        scale: 2,
        rotation: 0,
        isInteractive: true,
        descriptionPrompt: "塞满了技术书籍和漫画书的柜子。"
    }
];

export const FLOOR_HORIZON = 65; // Floor starts at 65% from top

export interface ItemInteraction {
    description: string;
    reaction: string;
}
