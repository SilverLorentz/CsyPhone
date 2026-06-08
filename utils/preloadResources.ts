/**
 * preloadResources.ts — 资源预加载工具
 * 
 * 三层预加载：
 * 1. preloadLocalAssets()   → React 渲染前立即加载心声图片 + 邮戳装饰
 * 2. preloadImages(urls)    → OSContext 初始化后加载当前角色的立绘/头像
 * 3. scheduleIdlePreload()  → 空闲期后台加载朋友圈背景、表情包等
 */

// ═══════════════════════════════════════════════════════════
//  Core: Image Preloader
// ═══════════════════════════════════════════════════════════

const preloaded = new Set<string>();

/**
 * 用 new Image() 预加载图片列表到浏览器缓存。
 * 已加载过的 URL 会被跳过（去重）。
 */
export function preloadImages(urls: string[]): void {
    for (const url of urls) {
        if (!url || preloaded.has(url)) continue;
        preloaded.add(url);
        const img = new Image();
        img.src = url;
    }
}

/**
 * 用 fetch() 预加载音频到浏览器缓存。
 */
function preloadAudio(url: string): void {
    if (!url || preloaded.has(url)) return;
    preloaded.add(url);
    fetch(url, { mode: 'no-cors' }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
//  Layer 2: 本地关键资产预加载（React mount 前调用）
// ═══════════════════════════════════════════════════════════

/**
 * 预加载心声卡片图片 (11张) + 邮戳装饰 (4张)。
 * 这些是本地 public/ 文件夹下的资源，体积小但打开时需要立即显示。
 */
export function preloadLocalAssets(): void {
    // 心声水墨画 1-11
    const innerVoiceImages = Array.from({ length: 11 }, (_, i) => `/images/inner-voice/${i + 1}.jpg`);
    
    // 邮戳装饰
    const postmarks = [
        '/images/decorations/postmark.png',
        '/images/decorations/postmark2.png',
        '/images/decorations/postmark3.png',
        '/images/decorations/postmark4.png',
    ];

    preloadImages([...innerVoiceImages, ...postmarks]);
}

// ═══════════════════════════════════════════════════════════
//  Layer 3: 空闲期后台预加载（低优先级外部资源）
// ═══════════════════════════════════════════════════════════

// 朋友圈封面背景图（CheckPhone 组件 MOMENTS_BG_POOL）
const MOMENTS_COVERS = [
    'https://i.postimg.cc/FKHSBpn0/Camera-1040g3k031roibveui4405pjvpo8gu1m2pj5m6bg.jpg',
    'https://i.postimg.cc/0NySBnHp/Camera-XHS-17719469368011040g2sg31dsqqr5ngccg5o6it4n098c9sr3goe0.jpg',
    'https://i.postimg.cc/W41ZH8fG/Camera-XHS-17719472040941040g2sg31enohhbkmi7g5pu896g399ls9l2jb1o.jpg',
    'https://i.postimg.cc/5yYqkgjj/Camera-XHS-17719473891901040g00831dne1qidge305o3i8irg8p0lbup6im0.jpg',
    'https://i.postimg.cc/prhY1Crw/Camera-XHS-17719479279871040g2sg30ttugsjr4m605ojdbvn8d1ctvlghth8.jpg',
    'https://i.postimg.cc/rs0CYjzK/mmexport1771947836221.jpg',
];

// 微信通知音效
const NOTIFICATION_AUDIO = 'https://image2url.com/r2/default/audio/1771769870930-c9be8c96-c34e-4509-bc81-48619ad5406d.wav';

/**
 * 使用 requestIdleCallback 在浏览器空闲时预加载非关键外部资源。
 * 降级方案：不支持的浏览器用 setTimeout(fn, 3000)。
 */
export function scheduleIdlePreload(): void {
    const run = () => {
        // 朋友圈封面照片
        preloadImages(MOMENTS_COVERS);
        
        // 通知音效
        preloadAudio(NOTIFICATION_AUDIO);
    };

    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(run, { timeout: 5000 });
    } else {
        setTimeout(run, 3000);
    }
}
