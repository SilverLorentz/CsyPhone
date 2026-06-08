/**
 * Status Card Types — 创意状态栏类型定义
 *
 * 状态栏/心声模式：
 *   1. classic  — 经典心声（明信片卡片）
 *   2. creative — AI 创意卡片（基于对话语境选骨架 + 生成样式）
 *   3. custom   — 用户自定义模板
 *   4. freeform — 自由 HTML 卡片
 *   5. story_phone — 剧情查手机入口
 *   6. afterglow — 余韵长文入口
 */

/** AI 输出的统一卡片数据结构 */
export interface StatusCardData {
    cardType: string;               // 骨架名: 'postcard' | 'phone_screen' | 'sticky_note' | ...
    title?: string;                 // 标题文字
    body: string;                   // 主体内容文字
    footer?: string;                // 底部文字（日期、签名等）
    icon?: string;                  // emoji 图标
    meta?: Record<string, any>;     // 骨架特有数据 (天气的 temp、音乐的 artist 等)
    style: StatusCardStyle;
}

/** 卡片样式参数（由 AI 生成，骨架组件消费） */
export interface StatusCardStyle {
    bgGradient?: [string, string];  // 背景渐变 [起始色, 结束色]
    textColor?: string;             // 主文字颜色
    accent?: string;                // 强调色（边框、装饰等）
    fontStyle?: 'serif' | 'sans' | 'handwrite' | 'mono';
    mood?: string;                  // 情绪词（供装饰逻辑参考）
    decoration?: string;            // 装饰元素名
}

/** 可视化编辑器字段定义 */
export interface TemplateField {
    id: string;
    name: string;          // 字段显示名（如 "时间"、"地点"）
    description: string;   // 给 AI 的提示（如 "当前时间，格式 HH:MM"）
    required: boolean;
    type?: 'text' | 'list';
}

/** 嵌入图片定义 */
export interface EmbeddedImage {
    id: string;
    dataUri: string;       // base64 图片
    x: number;             // 百分比位置
    y: number;
    width: number;         // px
    opacity: number;
}

/** 卡片外观参数 */
export interface CardAppearance {
    bgColor?: string;
    bgGradient?: [string, string];
    textColor?: string;
    fontStyle?: 'serif' | 'sans' | 'handwrite' | 'mono';
    borderRadius?: number;
    width?: number;
    height?: number;
    images?: EmbeddedImage[];
}

export type StatusWorkshopInteractionMode = 'none' | 'expand' | 'flip' | 'pages' | 'state';

export interface StatusWorkshopReviewFlags {
    fields?: boolean;
    advanced?: boolean;
    system?: boolean;
    protocol?: boolean;
    html?: boolean;
    css?: boolean;
    js?: boolean;
}

/** 用户自定义模板 */
export interface CustomStatusTemplate {
    id: string;
    name: string;                   // 模板名称（如 "赛博日记"）
    systemPrompt: string;           // 用户自定义的状态文本规则（告诉副模型输出什么格式）
    extractRegex: string;           // 用户自定义的提取正则（从 AI 输出中提取渲染内容）
    htmlTemplate?: string;          // 旧版完整 HTML 模板（支持 $1, $2 等正则捕获组替换）
    htmlBody?: string;              // 新版分层模板：body 内 HTML 骨架
    cssTemplate?: string;           // 新版分层模板：状态栏内联 CSS
    jsTemplate?: string;            // 新版分层模板：可选 classic inline JS（不含 <script> 标签）
    templateVersion?: number;       // 模板结构版本。2=分层模板；缺省=旧版完整 HTML
    allowScripts?: boolean;         // 是否允许该模板在沙箱 iframe 内执行内联脚本，默认关闭
    interactionMode?: StatusWorkshopInteractionMode; // 互动需求类型，none=无互动
    interactionIdea?: string;        // 互动需求补充说明，供 HTML/CSS/JS 共同读取
    reviewFlags?: StatusWorkshopReviewFlags; // 上游改动后下游需复核的提示标记
    renderMode: 'html' | 'text';    // 渲染方式：html=iframe沙箱，text=纯文本卡片
    fields?: TemplateField[];       // 可视化编辑器字段定义
    cardStyle?: CardAppearance;     // 卡片外观参数
}

/** 状态栏模式类型 */
export type StatusBarMode = 'off' | 'classic' | 'creative' | 'custom' | 'freeform' | 'story_phone' | 'afterglow';

/** 可用的骨架类型 ID 列表 */
export const SKELETON_TYPES = [
    'postcard',
    'phone_screen',
    'sticky_note',
    'receipt',
    'diary',
    'music_player',
    'polaroid',
    'social_post',
] as const;

export type SkeletonType = typeof SKELETON_TYPES[number];

/** 骨架注册表条目 */
export interface SkeletonRegistryEntry {
    id: SkeletonType;
    name: string;           // 中文显示名
    description: string;    // 简短描述
    keywords: string[];     // 触发关键词（供 AI 参考）
}

/** 骨架元数据注册表 */
export const SKELETON_REGISTRY: SkeletonRegistryEntry[] = [
    { id: 'postcard',      name: '明信片',     description: '复古纸质明信片',       keywords: ['心情', '思念', '旅行', '散步', '风景'] },
    { id: 'phone_screen',  name: '手机截图',   description: '模拟App界面截图',       keywords: ['天气', '外卖', '通知', '消息', '提醒'] },
    { id: 'sticky_note',   name: '便签',       description: '彩色便利贴',           keywords: ['备忘', '待办', '灵感', '随手记'] },
    { id: 'receipt',       name: '小票',       description: '热敏纸收据',           keywords: ['购物', '吃饭', '花钱', '消费', '买'] },
    { id: 'diary',         name: '日记页',     description: '手写日记本页',         keywords: ['日记', '记录', '回忆', '今天', '日常'] },
    { id: 'music_player',  name: '音乐播放器', description: '深色音乐播放界面',     keywords: ['音乐', '听歌', '歌', '旋律', '哼'] },
    { id: 'polaroid',      name: '拍立得',     description: '宝丽来即时照片',       keywords: ['照片', '拍照', '看到', '好看', '风景'] },
    { id: 'social_post',   name: '社交动态',   description: '朋友圈/微博风格卡片',  keywords: ['朋友圈', '分享', '发布', '吐槽', '评论'] },
];
