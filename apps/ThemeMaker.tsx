



import React,{ useState,useRef,useEffect,useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { ChatTheme,BubbleStyle,Message } from '../types';
import { processImage } from '../utils/file';
import ChatBubble from '../components/chat/ChatBubble';
import VoiceBubble from '../components/chat/VoiceBubble';
import DefaultTransferCard from '../components/chat/plugins/DefaultTransferCard';

const DEFAULT_STYLE: BubbleStyle = {
    textColor: '#334155',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    opacity: 1,
    backgroundImageOpacity: 0.5,
    decorationX: 90,
    decorationY: -10,
    decorationScale: 1,
    decorationRotate: 0,
    hideTail: false,
    avatarDecorationX: 50,
    avatarDecorationY: 50,
    avatarDecorationScale: 1,
    avatarDecorationRotate: 0
};

const DEFAULT_THEME: ChatTheme = {
    id: '',
    name: 'New Theme',
    type: 'custom',
    user: { ...DEFAULT_STYLE, textColor: '#ffffff', backgroundColor: '#6366f1' },
    ai: { ...DEFAULT_STYLE },
    customCss: ''
};

// --- Aesthetic Palette Inspiration Cards ---

// --- CSS Examples ---
const CSS_EXAMPLES = [
    {
        name: '毛玻璃 (Glass)',
        code: `/* Glassmorphism for bubbles */
.sully-bubble-user, .sully-bubble-ai {
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.4);
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
.sully-bubble-user { background: rgba(99, 102, 241, 0.7) !important; }
.sully-bubble-ai { background: rgba(255, 255, 255, 0.7) !important; }`
    },
    {
        name: '霓虹 (Neon)',
        code: `/* Glowing Neon Borders */
.sully-bubble-user {
  border: 2px solid #a855f7;
  box-shadow: 0 0 10px #a855f7;
  background: #2e1065 !important;
  color: #fff !important;
}
.sully-bubble-ai {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 10px #3b82f6;
  background: #172554 !important;
  color: #fff !important;
}`
    },
    {
        name: '像素 (Pixel)',
        code: `/* Pixel Art Style */
.sully-bubble-user, .sully-bubble-ai {
  border-radius: 0px !important;
  border: 2px solid #000;
  box-shadow: 4px 4px 0px #000;
  font-family: monospace;
}`
    }
];

type CssIssue = {
    message: string;
    line?: number;
};

type CssAnalysis = {
    errors: CssIssue[];
    warnings: CssIssue[];
    importantCount: number;
};

const ADVANCED_CSS_ALLOWED_SELECTORS = [
    ':root',
    '.sully-chat-container',
    '.sully-chat-header',
    '.sully-chat-input',
    '.sully-bubble-user',
    '.sully-bubble-ai',
    '.sully-bubble-tail',
    '.sully-voice-bubble',
    '.sully-voice-bar',
    '.sully-typing-bubble',
    '.sully-typing-tail',
    '.sully-image-msg',
    '.sully-msg-timestamp',
    '.sully-system-pill',
    '.sully-interaction-pill',
    '.sully-card-container',
    '.sully-transfer-card',
    '.sully-bubble-text',
];

const CSS_SELECTOR_REFERENCE = [
    { selector: '.sully-chat-container', desc: '整页聊天区域：背景图、渐变底色、整体氛围。' },
    { selector: '.sully-chat-header', desc: '顶部栏：角色头像、名字、返回按钮、通话按钮所在区域。' },
    { selector: '.sully-chat-input', desc: '底部输入栏：输入框、加号、表情、发送/语音按钮所在区域。' },
    { selector: '.sully-bubble-user', desc: '用户气泡外壳：背景、边框、圆角、阴影、内边距。' },
    { selector: '.sully-bubble-ai', desc: '角色气泡外壳：背景、边框、圆角、阴影、内边距。' },
    { selector: '.sully-bubble-text', desc: '气泡文字层：建议只改颜色/阴影，不建议改 display、换行、writing-mode。' },
    { selector: '.sully-bubble-tail polygon', desc: '气泡小尖角颜色：尾巴是 SVG，改颜色用 fill。' },
    { selector: '.sully-voice-bubble', desc: '语音条气泡：语音消息的圆角、背景、边框、阴影。' },
    { selector: '.sully-image-msg', desc: '图片消息：图片圆角、边框、阴影、尺寸限制。' },
    { selector: '.sully-msg-timestamp', desc: '时间戳：消息中间的“下午04:14”这类时间分隔。' },
    { selector: '.sully-system-pill', desc: '系统提示胶囊：转账提示、事件提示等系统小条。' },
    { selector: '.sully-card-container', desc: '聊天卡片容器：小红书、转发、其他结构化卡片的外框。' },
];

const PREVIEW_CHAT_COPY = {
    userFirst: '今天放学有点晚',
    userSecond: '操场的灯又坏了一半',
    timestamp: '下午06:12',
    aiFirst: '嗯，夏天快过去了',
    aiSecond: '有些话那时候没说出口，后来就只剩下风替我们翻旧试卷。你看，连教室后门那块掉漆的地方，都比我们更擅长留在原地。',
    imageSrc: '/assets/theater/library.png',
    imageAlt: '黄昏旧教室预览图',
    aiVoiceSeconds: 6,
    userVoiceSeconds: 3,
};

const findLineNumberByIndex = (input: string,index: number) => input.slice(0,index).split('\n').length;

const selectorIsAllowed = (selector: string) => (
    ADVANCED_CSS_ALLOWED_SELECTORS.some((allowed) => selector === allowed || selector.startsWith(`${allowed} `) || selector.startsWith(`${allowed}.`) || selector.startsWith(`${allowed}:`) || selector.startsWith(`${allowed}[`) || selector.startsWith(`${allowed}>`))
);

const customCssTargetsBubbleShell = (css: string | undefined) => /\.sully-bubble-(?:user|ai)\b/.test(css || '');

const analyzeCustomCss = (css: string): CssAnalysis => {
    const source = css || '';
    const errors: CssIssue[] = [];
    const warnings: CssIssue[] = [];
    const importantCount = (source.match(/!important/g) || []).length;

    const pushError = (message: string,line?: number) => errors.push({ message,line });
    const pushWarning = (message: string,line?: number) => warnings.push({ message,line });

    if (!source.trim()) {
        return { errors,warnings,importantCount };
    }

    try {
        if (typeof CSSStyleSheet !== 'undefined') {
            const sheet = new CSSStyleSheet();
            if (typeof sheet.replaceSync === 'function') {
                sheet.replaceSync(source);
            }
        }
    } catch (error: any) {
        pushError(`CSS 语法错误：${error?.message || '请检查语法。'}`);
    }

    const braceStack: number[] = [];
    [...source].forEach((char,index) => {
        if (char === '{') braceStack.push(index);
        if (char === '}') {
            if (braceStack.length === 0) {
                pushError('发现多余的 `}`，请检查大括号闭合。',findLineNumberByIndex(source,index));
            } else {
                braceStack.pop();
            }
        }
    });
    braceStack.forEach((index) => pushError('存在未闭合的 `{`，请补全规则块。',findLineNumberByIndex(source,index)));

    const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g,'');
    const selectorRegex = /([^{}]+)\{/g;
    let selectorMatch: RegExpExecArray | null;
    while ((selectorMatch = selectorRegex.exec(sourceWithoutComments)) !== null) {
        const selectorGroup = selectorMatch[1].trim();
        if (!selectorGroup || selectorGroup.startsWith('@')) continue;
        const selectorList = selectorGroup.split(',').map(item => item.trim()).filter(Boolean);
        selectorList.forEach((selector) => {
            if (selector === 'from' || selector === 'to' || selector.includes('%')) return;
            const line = findLineNumberByIndex(sourceWithoutComments,selectorMatch?.index ?? 0);
            if (/^(?:html|body|#root|\*)\b/.test(selector)) {
                pushWarning(`选择器 \`${selector}\` 会影响聊天页外部，建议改用 .sully-chat-container 作用域。`,line);
                return;
            }
            if (!selectorIsAllowed(selector)) {
                pushWarning(`选择器 \`${selector}\` 不在推荐白名单内，可能导致预览和实际页面不一致。`,line);
            }
        });
    }

    if (/\.sully-bubble-(?:ai|user)[^{]*{[^}]*?(?:^|[;{\s])height\s*:/is.test(sourceWithoutComments)) {
        pushWarning('检测到气泡固定 height，短句/长句可能被挤成异常分行。建议使用 min-height。');
    }
    if (/\bword-break\s*:\s*break-all\b/i.test(sourceWithoutComments)) {
        pushWarning('检测到 word-break: break-all，中文气泡可能出现单字断行。建议使用 overflow-wrap: break-word。');
    }
    if (/\bwriting-mode\s*:/i.test(sourceWithoutComments)) {
        pushWarning('检测到 writing-mode，可能让聊天文字竖排。');
    }
    if (/\.sully-bubble-text[^{]*{[^}]*\b(?:display|white-space|word-break|writing-mode)\s*:/is.test(sourceWithoutComments)) {
        pushWarning('检测到直接覆盖 .sully-bubble-text 排版核心，请确认不会造成文字竖排或异常断行。');
    }

    return { errors,warnings,importantCount };
};

// --- Helpers for Color & CSS ---

// Parse Hex/RGBA to { hex: "#RRGGBB", alpha: 0-1 }
const parseColorValue = (color: string) => {
    // Default
    let hex = '#ffffff';
    let alpha = 1;

    if (!color) return { hex, alpha };

    if (color.startsWith('#')) {
        hex = color.substring(0, 7);
        return { hex, alpha: 1 };
    }

    if (color.startsWith('rgba')) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const a = match[4] ? parseFloat(match[4]) : 1;
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            alpha = a;
        }
    }
    return { hex, alpha };
};

const toRgbaString = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Padding CSS Injection Helper
const PADDING_MARKER_START = '/* PADDING_AUTO_START */';
const PADDING_MARKER_END = '/* PADDING_AUTO_END */';

const injectPaddingCss = (css: string, verticalPadding: number) => {
    const horizontalPadding = Math.round(verticalPadding * 1.6); // Aspect ratio for bubble
    const rule = `
${PADDING_MARKER_START}
.sully-bubble-user, .sully-bubble-ai {
  padding: ${verticalPadding}px ${horizontalPadding}px !important;
}
${PADDING_MARKER_END}`;

    const regex = new RegExp(`${PADDING_MARKER_START.replace(/\*/g, '\\*')}[\\s\\S]*?${PADDING_MARKER_END.replace(/\*/g, '\\*')}`);

    if (css && css.match(regex)) {
        return css.replace(regex, rule);
    }
    return (css || '') + rule;
};

const extractPaddingFromCss = (css: string) => {
    const match = css?.match(/padding:\s*(\d+)px/);
    return match ? parseInt(match[1]) : 12; // Default 12px (py-3)
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeBubbleStyle = (value: unknown, fallback: BubbleStyle): BubbleStyle => {
    if (!isRecord(value)) throw new Error('invalid');
    const source = value as Partial<BubbleStyle>;
    return {
        ...fallback,
        ...source,
        textColor: typeof source.textColor === 'string' ? source.textColor : fallback.textColor,
        backgroundColor: typeof source.backgroundColor === 'string' ? source.backgroundColor : fallback.backgroundColor,
        borderRadius: typeof source.borderRadius === 'number' ? source.borderRadius : fallback.borderRadius,
        opacity: typeof source.opacity === 'number' ? source.opacity : fallback.opacity,
        backgroundImageOpacity: typeof source.backgroundImageOpacity === 'number' ? source.backgroundImageOpacity : fallback.backgroundImageOpacity,
        hideTail: typeof source.hideTail === 'boolean' ? source.hideTail : fallback.hideTail,
    };
};

const parseImportedTheme = (rawText: string, currentId: string): ChatTheme => {
    const parsed: unknown = JSON.parse(rawText);
    if (!isRecord(parsed)) throw new Error('invalid');

    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const type = parsed.type;
    if (!name || (type !== 'custom' && type !== 'preset')) throw new Error('invalid');

    return {
        ...(parsed as unknown as ChatTheme),
        id: currentId,
        name,
        type: 'custom',
        user: normalizeBubbleStyle(parsed.user, DEFAULT_THEME.user),
        ai: normalizeBubbleStyle(parsed.ai, DEFAULT_THEME.ai),
        customCss: typeof parsed.customCss === 'string' ? parsed.customCss : '',
    };
};

const safeThemeFileName = (name: string) => {
    const base = (name.trim() || 'bubble-theme').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
    return `${base}.json`;
};

// --- Collapsible Section chevron SVG ---
const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

// --- Collapsible Section (must be top-level to avoid remount on parent re-render) ---
const CollapsibleSection: React.FC<{ icon: string; title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }> = ({ icon, title, isOpen, onToggle, children }) => (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/80 transition-colors"
        >
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">{icon} {title}</span>
            <ChevronIcon open={isOpen} />
        </button>
        {isOpen && (
            <div className="px-4 pb-4 pt-3 space-y-5">
                {children}
            </div>
        )}
    </div>
);

// --- Mock data for transfer card preview ---
const MOCK_TRANSFER_USER: Message = {
    id: 0,
    charId: '',
    role: 'user',
    type: 'transfer',
    content: '',
    timestamp: Date.now(),
    metadata: { amount: '52.00', status: 'pending' }
};
const MOCK_TRANSFER_AI: Message = {
    id: 1,
    charId: '',
    role: 'assistant',
    type: 'transfer',
    content: '',
    timestamp: Date.now(),
    metadata: { amount: '13.14', status: 'pending' }
};

const ThemeMaker: React.FC = () => {
    const { closeApp, addCustomTheme, addToast, characters, activeCharacterId, customThemes, updateCharacter } = useOS();
    const [editingTheme, setEditingTheme] = useState<ChatTheme>({ ...DEFAULT_THEME, id: `theme-${Date.now()}` });
    const [activeTab, setActiveTab] = useState<'user' | 'ai' | 'css'>('user');
    const [toolSection, setToolSection] = useState<'base' | 'sticker' | 'avatar'>('base');
    const [sharePanel, setSharePanel] = useState<'none' | 'export' | 'import'>('none');
    const [importText, setImportText] = useState('');
    const [lastUsableCss, setLastUsableCss] = useState('');

    // Local state for sliders
    const [paddingVal, setPaddingVal] = useState(12);

    // Collapsible panel state — 'colors' open by default
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['colors']));

    const fileInputRef = useRef<HTMLInputElement>(null);
    const decorationInputRef = useRef<HTMLInputElement>(null);
    const avatarDecoInputRef = useRef<HTMLInputElement>(null);
    const exportTextareaRef = useRef<HTMLTextAreaElement>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);

    const activeStyle = editingTheme[activeTab === 'css' ? 'user' : activeTab];
    const themeJson = useMemo(() => JSON.stringify(editingTheme, null, 2), [editingTheme]);
    const cssAnalysis = useMemo(() => analyzeCustomCss(editingTheme.customCss || ''), [editingTheme.customCss]);
    const cssControlsBubbleShell = useMemo(() => customCssTargetsBubbleShell(editingTheme.customCss), [editingTheme.customCss]);
    const canRestoreLastUsableCss = cssAnalysis.errors.length > 0 && (editingTheme.customCss || '') !== lastUsableCss;

    // Edit mode: load existing theme from sessionStorage if set by Chat.tsx
    useEffect(() => {
        const editId = window.sessionStorage.getItem('themeMakerEditId');
        if (editId) {
            window.sessionStorage.removeItem('themeMakerEditId');
            const existingTheme = customThemes.find(t => t.id === editId);
            if (existingTheme) {
                setEditingTheme({ ...existingTheme });
                if (existingTheme.customCss) {
                    setPaddingVal(extractPaddingFromCss(existingTheme.customCss));
                }
                addToast('正在编辑: ' + existingTheme.name, 'success');
                return; // Skip default padding init
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Initialize padding state from CSS on load
    useEffect(() => {
        if (editingTheme.customCss) {
            setPaddingVal(extractPaddingFromCss(editingTheme.customCss));
        }
    }, []);

    useEffect(() => {
        if (cssAnalysis.errors.length === 0) {
            setLastUsableCss(editingTheme.customCss || '');
        }
    }, [cssAnalysis.errors.length, editingTheme.customCss]);

    const togglePanel = (id: string) => {
        setOpenPanels(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateStyle = (key: keyof BubbleStyle, value: any) => {
        if (activeTab === 'css') return;
        setEditingTheme(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab as 'user' | 'ai'],
                [key]: value
            }
        }));
    };

    const updateColorWithAlpha = (newHex: string, newAlpha: number) => {
        const val = newAlpha === 1 ? newHex : toRgbaString(newHex, newAlpha);
        updateStyle('backgroundColor', val);
    };

    const updatePadding = (val: number) => {
        setPaddingVal(val);
        const newCss = injectPaddingCss(editingTheme.customCss || '', val);
        setEditingTheme(prev => ({ ...prev, customCss: newCss }));
    };

    const handleImageUpload = async (file: File, type: 'bg' | 'deco' | 'avatarDeco') => {
        try {
            const result = await processImage(file);
            if (type === 'bg') updateStyle('backgroundImage', result);
            else if (type === 'deco') updateStyle('decoration', result);
            else if (type === 'avatarDeco') updateStyle('avatarDecoration', result);
            addToast('图片上传成功', 'success');
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const saveTheme = async () => {
        if (!editingTheme.name.trim()) return;
        if (cssAnalysis.errors.length > 0) {
            addToast('CSS 语法未通过，先修一下再保存', 'error');
            return;
        }
        const char = characters.find(c => c.id === activeCharacterId);
        const currentCustomTheme = customThemes.find(t => t.id === char?.bubbleStyle);
        const inheritedBaseId = currentCustomTheme?.baseThemeId || char?.bubbleStyle || 'default';
        const baseThemeId = inheritedBaseId === editingTheme.id ? (editingTheme.baseThemeId || 'default') : inheritedBaseId;
        const themeToSave: ChatTheme = {
            ...editingTheme,
            name: editingTheme.name.trim(),
            type: 'custom',
            baseThemeId,
        };
        await addCustomTheme(themeToSave);
        if (char) {
            updateCharacter(char.id, { bubbleStyle: themeToSave.id });
            addToast('已保存并应用到当前角色', 'success');
        } else {
            addToast('已保存到主题库', 'success');
        }
        closeApp();
    };

    const restoreLastUsableCss = () => {
        if ((editingTheme.customCss || '') === lastUsableCss) {
            addToast('当前已是上次可用 CSS', 'success');
            return;
        }
        setEditingTheme(prev => ({ ...prev, customCss: lastUsableCss }));
        addToast('已恢复到上次语法通过的 CSS', 'success');
    };

    const copyCssSelector = async (selector: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(selector);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = selector;
                textarea.setAttribute('readonly','true');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            addToast(`已复制 ${selector}`, 'success');
        } catch {
            addToast('复制失败，请手动长按类名复制', 'error');
        }
    };

    const resetTheme = () => {
        setEditingTheme(prev => ({
            ...DEFAULT_THEME,
            id: prev.id, // preserve ID so edit-mode still overwrites the right theme
            name: prev.name, // preserve user-given name
        }));
        setPaddingVal(12);
        addToast('已重置为默认样式', 'success');
    };

    const copyThemeJson = async () => {
        const selectTextarea = (textarea: HTMLTextAreaElement) => {
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
        };

        const copyWithSelection = () => {
            const textarea = exportTextareaRef.current ?? document.createElement('textarea');
            const shouldRemove = !exportTextareaRef.current;
            if (shouldRemove) {
                textarea.value = themeJson;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '0';
                textarea.style.left = '0';
                textarea.style.width = '1px';
                textarea.style.height = '1px';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
            }

            selectTextarea(textarea);
            const copied = document.execCommand('copy');
            if (shouldRemove) textarea.remove();
            return copied;
        };

        try {
            if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
            await navigator.clipboard.writeText(themeJson);
            addToast('主题 JSON 已复制到剪贴板', 'success');
        } catch {
            if (copyWithSelection()) {
                addToast('主题 JSON 已复制到剪贴板', 'success');
            } else if (exportTextareaRef.current) {
                selectTextarea(exportTextareaRef.current);
                addToast('已选中 JSON，请按 Ctrl+C 复制', 'success');
            } else {
                addToast('复制失败，请手动复制面板中的 JSON', 'error');
            }
        }
    };

    const downloadThemeJson = () => {
        const blob = new Blob([themeJson], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = safeThemeFileName(editingTheme.name);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        addToast('主题 JSON 已下载', 'success');
    };

    const applyImportedTheme = (text: string) => {
        try {
            const parsed = parseImportedTheme(text, editingTheme.id);
            setEditingTheme(parsed);
            setPaddingVal(parsed.customCss ? extractPaddingFromCss(parsed.customCss) : 12);
            setImportText(text);
            setSharePanel('none');
            addToast(`已导入: ${parsed.name}`, 'success');
        } catch {
            addToast('主题 JSON 无法解析', 'error');
        }
    };

    const importThemeFile = async (file: File) => {
        try {
            const text = await file.text();
            applyImportedTheme(text);
        } catch {
            addToast('主题文件读取失败', 'error');
        } finally {
            if (importFileInputRef.current) importFileInputRef.current.value = '';
        }
    };

    // Active character info for real avatars in preview
    const activeChar = characters.find(c => c.id === activeCharacterId);

    // --- Preview Helpers ---

    /** Wraps preview content in a row with avatar (same layout as Chat.tsx) */
    const renderPreviewRow = (role: 'user' | 'ai', content: React.ReactNode) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        const isUser = role === 'user';
        const isActive = activeTab === role || activeTab === 'css';

        return (
            <div
                className={`relative w-full flex items-end transition-all duration-300 cursor-pointer ${isActive ? 'opacity-100 scale-100' : 'opacity-60 scale-95 grayscale-[0.5] hover:opacity-80'
                    } ${isUser ? 'justify-end' : 'justify-start'}`}
                onClick={() => setActiveTab(role)}
                title={`点击编辑${isUser ? '用户' : '角色'}气泡`}
            >
                {/* Avatar */}
                <div className={`absolute bottom-0 ${isUser ? 'right-0' : 'left-0'} w-10 h-10 pb-1 z-10`}>
                    <div className="w-full h-full rounded-full bg-slate-300 overflow-hidden relative z-0 shadow-sm border border-white/50">
                        {isUser ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-[10px]">ME</div>
                        ) : activeChar?.avatar ? (
                            <img src={activeChar.avatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-[10px]">AI</div>
                        )}
                    </div>
                    {style.avatarDecoration && (
                        <img
                            src={style.avatarDecoration}
                            className="absolute pointer-events-none z-10 max-w-none"
                            style={{
                                left: `${style.avatarDecorationX ?? 50}%`,
                                top: `${style.avatarDecorationY ?? 50}%`,
                                width: `${40 * (style.avatarDecorationScale ?? 1)}px`,
                                height: 'auto',
                                transform: `translate(-50%, -50%) rotate(${style.avatarDecorationRotate ?? 0}deg)`,
                            }}
                        />
                    )}
                </div>

                {/* Content */}
                <div className={`relative group max-w-[75%] ${isUser ? 'mr-14' : 'ml-14'}`}>
                    {content}
                </div>
            </div>
        );
    };

    /** Text bubble preview (with decoration sticker, bg image, gradient support) */
    const renderTextPreview = (role: 'user' | 'ai', text: string) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        return renderPreviewRow(role, (
            <ChatBubble
                isUser={role === 'user'}
                styleConfig={style}
                displayContent={text}
                allowCssOverride={cssControlsBubbleShell}
            />
        ));
    };

    const renderImagePreview = (role: 'user' | 'ai') => renderPreviewRow(role, (
        <img
            src={PREVIEW_CHAT_COPY.imageSrc}
            className="sully-image-msg max-w-[180px] max-h-[220px] rounded-2xl shadow-sm border border-black/5 object-cover"
            alt={PREVIEW_CHAT_COPY.imageAlt}
        />
    ));

    /** Voice bubble preview */
    const renderVoicePreview = (role: 'user' | 'ai', duration: number) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        return renderPreviewRow(role, (
            <VoiceBubble
                duration={duration}
                isPlaying={false}
                isLoading={false}
                isUser={role === 'user'}
                onPlay={() => {}}
                onStop={() => {}}
                styleConfig={style}
            />
        ));
    };

    /** Transfer card preview */
    const renderTransferPreview = (role: 'user' | 'ai') => {
        const isUser = role === 'user';
        return renderPreviewRow(role, (
            <DefaultTransferCard
                message={isUser ? MOCK_TRANSFER_USER : MOCK_TRANSFER_AI}
                isUser={isUser}
                charName="角色"
                selectionMode={false}
            />
        ));
    };

    const parsedBgColor = parseColorValue(activeStyle.backgroundColor);


    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light relative">
            {/* Header */}
            <div className="bg-white/70 backdrop-blur-md shrink-0 z-20 border-b border-white/40 shadow-sm flex flex-col">
                <div className="h-20 flex items-end pb-3 px-4 justify-between gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <h1 className="text-xl font-medium text-slate-700">气泡工坊</h1>
                    </div>
                    {/* Theme Name — always visible regardless of active tab */}
                    <input
                        value={editingTheme.name}
                        onChange={(e) => setEditingTheme(prev => ({ ...prev, name: e.target.value }))}
                        className="flex-1 min-w-0 bg-slate-100/80 border border-slate-200/60 rounded-lg px-2.5 py-1 text-sm text-center focus:border-primary/50 transition-all outline-none placeholder:text-slate-300"
                        placeholder="主题名称"
                    />
                    <button onClick={() => void saveTheme()} className="shrink-0 px-4 py-1.5 bg-primary text-white rounded-full text-xs font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all">
                        保存
                    </button>
                </div>
                {/* Utility row: Reset + Import/Export */}
                <div className="px-4 pb-3 flex gap-2 items-center">
                    <button onClick={resetTheme} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↺ 重置</button>
                    <button onClick={() => setSharePanel('export')} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↑ 导出</button>
                    <button onClick={() => { setImportText(''); setSharePanel('import'); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↓ 导入</button>
                </div>
            </div>

            {/* Preview Area — Mini Chat Simulator */}
            <div className="sully-chat-container flex-1 bg-slate-100 relative overflow-hidden flex flex-col">
                {/* Live CSS Injection for Preview — same placement as Chat.tsx */}
                {editingTheme.customCss && <style>{editingTheme.customCss}</style>}

                <div className="sully-chat-header min-h-[4.25rem] bg-white/80 backdrop-blur-xl px-5 flex items-end pb-3 border-b border-slate-200/60 shrink-0 z-20 shadow-sm">
                    <div className="flex items-center gap-3 w-full">
                        <button className="p-2 -ml-2 text-slate-500 rounded-full" aria-label="返回预览">‹</button>
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-200 overflow-hidden shadow-sm shrink-0">
                                {activeChar?.avatar ? <img src={activeChar.avatar} className="w-full h-full object-cover" alt="" /> : null}
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-slate-800 truncate">{activeChar?.name || '角色'}</div>
                                <div className="text-[10px] text-slate-400 uppercase">Online</div>
                            </div>
                        </div>
                        <button className="p-2 text-slate-500 rounded-full" aria-label="更多预览">•••</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar relative pt-4 pb-4 px-5">
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                    {/* Rich Preview Conversation */}
                    <div className="relative z-10 w-full max-w-sm mx-auto space-y-3">
                        {renderTextPreview('user', PREVIEW_CHAT_COPY.userFirst)}
                        {renderTextPreview('user', PREVIEW_CHAT_COPY.userSecond)}
                        {renderImagePreview('user')}
                        <div className="sully-msg-timestamp flex justify-center w-full py-1">
                            <span className="text-[11px] text-gray-400">{PREVIEW_CHAT_COPY.timestamp}</span>
                        </div>
                        {renderTextPreview('ai', PREVIEW_CHAT_COPY.aiFirst)}
                        {renderTextPreview('ai', PREVIEW_CHAT_COPY.aiSecond)}
                        {renderVoicePreview('ai', PREVIEW_CHAT_COPY.aiVoiceSeconds)}
                        {renderVoicePreview('user', PREVIEW_CHAT_COPY.userVoiceSeconds)}
                        {renderTransferPreview('ai')}
                    </div>
                </div>

                <div className="sully-chat-input bg-white/90 backdrop-blur-2xl border-t border-slate-200/50 shrink-0 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
                    <div className="p-3 px-4 flex gap-3 items-center">
                        <button className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="加号预览">+</button>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-[24px] flex items-center px-4 py-2.5 text-[15px] text-slate-400 border border-transparent">Message...</div>
                        <button className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center" aria-label="发送预览">➤</button>
                    </div>
                </div>
            </div>

            {/* Editor Controls */}
            <div className="bg-white rounded-t-[2.5rem] shadow-[0_-5px_30px_rgba(0,0,0,0.08)] z-30 flex flex-col h-[48%] ring-1 ring-slate-100">
                {/* Main Tabs (User / AI / CSS) & Mirror Copy */}
                <div className="flex items-center justify-between px-8 pt-6 pb-2 border-b border-slate-50">
                    <div className="flex gap-6 overflow-x-auto no-scrollbar">
                        <button onClick={() => setActiveTab('user')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'user' ? 'text-slate-800' : 'text-slate-300'}`}>用户气泡</button>
                        <button onClick={() => setActiveTab('ai')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'text-slate-800' : 'text-slate-300'}`}>角色气泡</button>
                        <button onClick={() => setActiveTab('css')} className={`text-sm font-bold transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'css' ? 'text-indigo-600' : 'text-slate-300'}`}>
                            <span>⚡</span> CSS
                        </button>
                    </div>
                    {/* Mirror Copy Button */}
                    {activeTab !== 'css' && (
                        <button
                            onClick={() => {
                                const sourceTab = activeTab;
                                const targetTab = sourceTab === 'user' ? 'ai' : 'user';
                                const sourceStyle = editingTheme[sourceTab];
                                setEditingTheme(prev => ({
                                    ...prev,
                                    [targetTab]: {
                                        ...prev[targetTab],
                                        backgroundColor: sourceStyle.backgroundColor,
                                        gradient: sourceStyle.gradient ? { ...sourceStyle.gradient } : undefined,
                                        textColor: sourceStyle.textColor,
                                        borderRadius: sourceStyle.borderRadius,
                                        opacity: sourceStyle.opacity,
                                        borderWidth: sourceStyle.borderWidth,
                                        borderColor: sourceStyle.borderColor,
                                        hideTail: sourceStyle.hideTail,
                                        boxShadow: sourceStyle.boxShadow,
                                        fontSize: sourceStyle.fontSize,
                                        textShadow: sourceStyle.textShadow,
                                        backgroundImage: sourceStyle.backgroundImage,
                                        backgroundImageOpacity: sourceStyle.backgroundImageOpacity
                                    }
                                }));
                                addToast(`已将基础样式复制给${targetTab === 'user' ? '用户' : '角色'}`, 'success');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                            title={`将当前样式复制到${activeTab === 'user' ? '角色气泡' : '用户气泡'}（不含贴纸）`}
                        >
                            ⇄ 同步给对方
                        </button>
                    )}
                </div>

                {/* Conditional Sub-Tool Tabs */}
                {activeTab !== 'css' && (
                    <div className="flex px-6 border-b border-slate-100 mb-2 overflow-x-auto no-scrollbar">
                        <button onClick={() => setToolSection('base')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'base' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>基础样式</button>
                        <button onClick={() => setToolSection('sticker')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'sticker' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>气泡贴纸</button>
                        <button onClick={() => setToolSection('avatar')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'avatar' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>头像挂件</button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar pb-20">

                    {/* --- CSS EDITOR --- */}
                    {activeTab === 'css' && (
                        <div className="space-y-6 animate-fade-in h-full flex flex-col">
                            <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed space-y-2">
                                <span className="font-bold block mb-1 text-slate-500">CSS 增强模式</span>
                                普通面板继续负责捏气泡；这里是高级整页皮肤。推荐作用域：<code className="bg-slate-200 px-1 rounded">.sully-chat-container</code>、<code className="bg-slate-200 px-1 rounded">.sully-chat-header</code>、<code className="bg-slate-200 px-1 rounded">.sully-chat-input</code>、<code className="bg-slate-200 px-1 rounded">.sully-bubble-user</code>、<code className="bg-slate-200 px-1 rounded">.sully-bubble-ai</code>、<code className="bg-slate-200 px-1 rounded">.sully-voice-bubble</code>、<code className="bg-slate-200 px-1 rounded">.sully-image-msg</code>。
                                <br />支持使用 <code className="text-red-400">!important</code> 覆盖可视化编辑器的设置。
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                    <div>
                                        <div className={`font-semibold ${cssAnalysis.errors.length === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {cssAnalysis.errors.length === 0 ? '语法检查通过' : '语法检查未通过'}
                                        </div>
                                        <div>提示 {cssAnalysis.warnings.length} 条，<code className="text-red-500">!important</code> {cssAnalysis.importantCount} 处</div>
                                    </div>
                                    {canRestoreLastUsableCss && (
                                        <button
                                            onClick={restoreLastUsableCss}
                                            className="shrink-0 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 active:scale-95 transition-transform"
                                        >
                                            恢复上次通过
                                        </button>
                                    )}
                                </div>
                            </div>

                            <textarea
                                value={editingTheme.customCss || ''}
                                onChange={(e) => setEditingTheme(prev => ({ ...prev, customCss: e.target.value }))}
                                placeholder="/* 在这里输入 CSS 代码 */"
                                className="flex-1 w-full bg-slate-800 text-slate-300 font-mono text-xs p-4 rounded-xl resize-none shadow-inner focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                spellCheck={false}
                            />

                            {(cssAnalysis.errors.length > 0 || cssAnalysis.warnings.length > 0) && (
                                <div className={`text-[11px] rounded-xl border px-3 py-2 max-h-28 overflow-y-auto no-scrollbar ${cssAnalysis.errors.length > 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                    <div className="font-semibold mb-1">{cssAnalysis.errors.length > 0 ? 'CSS 错误提示' : '皮肤风险提示'}</div>
                                    <ul className="space-y-1 list-disc pl-4">
                                        {[...cssAnalysis.errors,...cssAnalysis.warnings].map((issue,idx) => (
                                            <li key={`${issue.message}-${idx}`}>{issue.line ? `第 ${issue.line} 行：` : ''}{issue.message}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <details className="group rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[11px] text-slate-500">
                                <summary className="cursor-pointer select-none font-bold text-slate-600 outline-none">
                                    变量 / 类名速查
                                    <span className="ml-2 font-normal text-slate-400">不知道写谁，就先看这里</span>
                                </summary>
                                <div className="mt-3 grid gap-2">
                                    {CSS_SELECTOR_REFERENCE.map((item) => (
                                        <div key={item.selector} className="rounded-lg bg-slate-50 px-2.5 py-2">
                                            <div className="flex items-center gap-2">
                                                <code className="min-w-0 flex-1 font-mono text-[10px] text-indigo-600 break-all">{item.selector}</code>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void copyCssSelector(item.selector);
                                                    }}
                                                    className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 active:scale-95 transition-transform"
                                                    aria-label={`复制 ${item.selector}`}
                                                >
                                                    复制
                                                </button>
                                            </div>
                                            <span className="mt-1 block leading-relaxed">{item.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">快速模板 (Templates)</label>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                    {CSS_EXAMPLES.map((ex, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setEditingTheme(prev => ({ ...prev, customCss: ex.code }))}
                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-mono text-slate-600 border border-slate-200 whitespace-nowrap transition-colors"
                                        >
                                            {ex.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- BASE STYLE TOOLS (Collapsible Accordion) --- */}
                    {activeTab !== 'css' && toolSection === 'base' && (
                        <div className="space-y-3 animate-fade-in">

                            {/* === Section 1: Colors & Background === */}
                            <CollapsibleSection icon="🎨" title="色彩与背板" isOpen={openPanels.has('colors')} onToggle={() => togglePanel('colors')}>
                                {/* Colors */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">文字颜色</label>
                                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100"><input type="color" value={activeStyle.textColor} onChange={(e) => updateStyle('textColor', e.target.value)} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" /></div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">背景色</label>
                                        {/* Gradient Toggle */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <button
                                                onClick={() => {
                                                    if (activeStyle.gradient) {
                                                        updateStyle('gradient', undefined);
                                                    } else {
                                                        updateStyle('gradient', { from: parsedBgColor.hex, to: '#ffffff', direction: 135 });
                                                    }
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeStyle.gradient ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
                                            >
                                                {activeStyle.gradient ? '渐变开' : '渐变关'}
                                            </button>
                                        </div>

                                        {!activeStyle.gradient ? (
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <input
                                                    type="color"
                                                    value={parsedBgColor.hex}
                                                    onChange={(e) => updateColorWithAlpha(e.target.value, parsedBgColor.alpha)}
                                                    className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent"
                                                />
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
                                                <div className="flex gap-2">
                                                    <input type="color" value={activeStyle.gradient?.from || '#000000'} onChange={(e) => updateStyle('gradient', { from: e.target.value, to: activeStyle.gradient?.to || '#ffffff', direction: activeStyle.gradient?.direction ?? 135 })} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" title="起点颜色" />
                                                    <span className="text-slate-300 self-center">→</span>
                                                    <input type="color" value={activeStyle.gradient?.to || '#ffffff'} onChange={(e) => updateStyle('gradient', { from: activeStyle.gradient?.from || '#000000', to: e.target.value, direction: activeStyle.gradient?.direction ?? 135 })} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" title="终点颜色" />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between mb-1"><span className="text-[10px] text-slate-400">方向 (°)</span><span className="text-[10px] text-slate-500 font-mono">{activeStyle.gradient?.direction ?? 135}°</span></div>
                                                    <input type="range" min="0" max="360" step="5" value={activeStyle.gradient?.direction ?? 135} onChange={(e) => updateStyle('gradient', { from: activeStyle.gradient?.from || '#000000', to: activeStyle.gradient?.to || '#ffffff', direction: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Background Alpha (Transparency) */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">背景透明度</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{Math.round(parsedBgColor.alpha * 100)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={parsedBgColor.alpha}
                                        onChange={(e) => updateColorWithAlpha(parsedBgColor.hex, parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary"
                                    />
                                </div>

                                {/* Background Image */}
                                <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 overflow-hidden hover:border-primary/50 hover:text-primary transition-all">
                                    {activeStyle.backgroundImage ? (
                                        <>
                                            <img src={activeStyle.backgroundImage} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                                            <span className="relative z-10 text-[10px] bg-white/80 px-2 py-1 rounded shadow-sm font-bold">更换底纹</span>
                                        </>
                                    ) : <span className="text-xs font-bold">+ 上传底纹图片</span>}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'bg')} />
                                    {activeStyle.backgroundImage && <button onClick={(e) => { e.stopPropagation(); updateStyle('backgroundImage', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full z-20">移除</button>}
                                </div>

                                {/* Background Image Opacity */}
                                {activeStyle.backgroundImage && (
                                    <div>
                                        <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">底纹透明度</label><span className="text-[10px] text-slate-500 font-mono">{Math.round((activeStyle.backgroundImageOpacity ?? 0.5) * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={activeStyle.backgroundImageOpacity ?? 0.5} onChange={(e) => updateStyle('backgroundImageOpacity', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                    </div>
                                )}
                            </CollapsibleSection>

                            {/* === Section 2: Border & Shadow === */}
                            <CollapsibleSection icon="✨" title="边框与光影" isOpen={openPanels.has('border')} onToggle={() => togglePanel('border')}>
                                {/* Border Radius */}
                                <div>
                                    <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">圆角大小</label><span className="text-[10px] text-slate-500 font-mono">{activeStyle.borderRadius}px</span></div>
                                    <input type="range" min="0" max="30" value={activeStyle.borderRadius} onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Bubble Tail */}
                                <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block">气泡尾巴</label>
                                        <span className="text-[10px] text-slate-400">{activeStyle.hideTail ? '隐藏' : '显示'}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={!activeStyle.hideTail}
                                        onClick={() => updateStyle('hideTail', !activeStyle.hideTail)}
                                        className={`relative w-12 h-6 rounded-full transition-colors active:scale-95 ${activeStyle.hideTail ? 'bg-slate-300' : 'bg-primary'}`}
                                    >
                                        <span
                                            className={`absolute left-0 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${activeStyle.hideTail ? 'translate-x-1' : 'translate-x-7'}`}
                                        />
                                    </button>
                                </div>

                                {/* Border Width & Color */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">边框</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{activeStyle.borderWidth || 0}px</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="range" min="0" max="10" step="1" value={activeStyle.borderWidth || 0} onChange={(e) => updateStyle('borderWidth', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                        {(activeStyle.borderWidth || 0) > 0 && (
                                            <div className="shrink-0 bg-slate-50 p-1 rounded-lg border border-slate-100">
                                                <input type="color" value={activeStyle.borderColor || '#000000'} onChange={(e) => updateStyle('borderColor', e.target.value)} className="w-6 h-6 rounded border-none cursor-pointer bg-transparent" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Box Shadow */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">投影阴影</label>
                                    <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">
                                        <button onClick={() => updateStyle('boxShadow', undefined)} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${!activeStyle.boxShadow ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>无</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 2px 6px rgba(0,0,0,0.05)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 2px 6px rgba(0,0,0,0.05)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>柔和</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 4px 12px rgba(0,0,0,0.1)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 4px 12px rgba(0,0,0,0.1)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>明显</button>
                                        <button onClick={() => updateStyle('boxShadow', '4px 4px 0px rgba(0,0,0,1)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '4px 4px 0px rgba(0,0,0,1)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>像素</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 0 10px rgba(99,102,241,0.5)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 0 10px rgba(99,102,241,0.5)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>霓虹</button>
                                    </div>
                                    <input
                                        type="text"
                                        value={activeStyle.boxShadow || ''}
                                        onChange={(e) => updateStyle('boxShadow', e.target.value || undefined)}
                                        placeholder="自定义 CSS box-shadow"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:border-primary/50 outline-none"
                                    />
                                </div>
                            </CollapsibleSection>

                            {/* === Section 3: Size & Typography === */}
                            <CollapsibleSection icon="📏" title="尺寸与排版" isOpen={openPanels.has('typo')} onToggle={() => togglePanel('typo')}>
                                {/* Padding (Compactness) */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">气泡紧凑度</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{paddingVal <= 6 ? '紧凑' : (paddingVal >= 16 ? '宽松' : '适中')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400">紧凑</span>
                                        <input
                                            type="range" min="4" max="24" step="1"
                                            value={paddingVal}
                                            onChange={(e) => updatePadding(parseInt(e.target.value))}
                                            className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary"
                                        />
                                        <span className="text-[10px] text-slate-400">宽敞</span>
                                    </div>
                                </div>

                                {/* Font Size */}
                                <div>
                                    <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">文字大小</label><span className="text-[10px] text-slate-500 font-mono">{activeStyle.fontSize || 15}px</span></div>
                                    <input type="range" min="12" max="22" step="1" value={activeStyle.fontSize || 15} onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Text Shadow */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">文字阴影</label>
                                        <button
                                            onClick={() => updateStyle('textShadow', activeStyle.textShadow ? undefined : '0 1px 2px rgba(0,0,0,0.3)')}
                                            className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${activeStyle.textShadow ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}
                                        >
                                            {activeStyle.textShadow ? '开' : '关'}
                                        </button>
                                    </div>
                                    {activeStyle.textShadow && (
                                        <input
                                            type="text"
                                            value={activeStyle.textShadow}
                                            onChange={(e) => updateStyle('textShadow', e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:border-primary/50 outline-none"
                                        />
                                    )}
                                </div>
                            </CollapsibleSection>

                        </div>
                    )}

                    {/* --- STICKER TOOLS --- */}
                    {activeTab !== 'css' && toolSection === 'sticker' && (
                        <div className="space-y-6 animate-fade-in">
                            <div onClick={() => decorationInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary/50 hover:text-primary transition-all">
                                {activeStyle.decoration ? <img src={activeStyle.decoration} className="h-10 w-10 object-contain" /> : <span className="text-xs font-bold">+ 上传气泡角标/贴纸</span>}
                                <input type="file" ref={decorationInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'deco')} />
                                {activeStyle.decoration && <button onClick={(e) => { e.stopPropagation(); updateStyle('decoration', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full">移除</button>}
                            </div>

                            {activeStyle.decoration && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-2">
                                    <div className="col-span-2"><label className="text-[10px] text-slate-400 uppercase block mb-2">位置坐标 (X / Y)</label>
                                        <div className="flex gap-3">
                                            <input type="range" min="-50" max="150" value={activeStyle.decorationX ?? 90} onChange={(e) => updateStyle('decorationX', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                            <input type="range" min="-50" max="150" value={activeStyle.decorationY ?? -10} onChange={(e) => updateStyle('decorationY', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                        </div>
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">缩放 ({activeStyle.decorationScale ?? 1}x)</label>
                                        <input type="range" min="0.2" max="3" step="0.1" value={activeStyle.decorationScale ?? 1} onChange={(e) => updateStyle('decorationScale', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">旋转 ({activeStyle.decorationRotate ?? 0}°)</label>
                                        <input type="range" min="-180" max="180" value={activeStyle.decorationRotate ?? 0} onChange={(e) => updateStyle('decorationRotate', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- AVATAR TOOLS --- */}
                    {activeTab !== 'css' && toolSection === 'avatar' && (
                        <div className="space-y-6 animate-fade-in">
                            <div onClick={() => avatarDecoInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary/50 hover:text-primary transition-all">
                                {activeStyle.avatarDecoration ? <img src={activeStyle.avatarDecoration} className="h-10 w-10 object-contain" /> : <span className="text-xs font-bold">+ 上传头像框/挂件</span>}
                                <input type="file" ref={avatarDecoInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'avatarDeco')} />
                                {activeStyle.avatarDecoration && <button onClick={(e) => { e.stopPropagation(); updateStyle('avatarDecoration', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full">移除</button>}
                            </div>

                            {activeStyle.avatarDecoration && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-2">
                                    <div className="col-span-2"><label className="text-[10px] text-slate-400 uppercase block mb-2">中心偏移 (Offset X / Y)</label>
                                        <div className="flex gap-3">
                                            <input type="range" min="-50" max="150" value={activeStyle.avatarDecorationX ?? 50} onChange={(e) => updateStyle('avatarDecorationX', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                            <input type="range" min="-50" max="150" value={activeStyle.avatarDecorationY ?? 50} onChange={(e) => updateStyle('avatarDecorationY', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                        </div>
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">缩放 ({activeStyle.avatarDecorationScale ?? 1}x)</label>
                                        <input type="range" min="0.5" max="3" step="0.1" value={activeStyle.avatarDecorationScale ?? 1} onChange={(e) => updateStyle('avatarDecorationScale', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">旋转 ({activeStyle.avatarDecorationRotate ?? 0}°)</label>
                                        <input type="range" min="-180" max="180" value={activeStyle.avatarDecorationRotate ?? 0} onChange={(e) => updateStyle('avatarDecorationRotate', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {sharePanel !== 'none' && (
                <div
                    className="absolute inset-0 z-50 flex items-end bg-slate-900/35 backdrop-blur-sm animate-fade-in"
                    onClick={() => setSharePanel('none')}
                >
                    <div
                        className="w-full bg-white rounded-t-[2rem] shadow-2xl border border-white/60 px-5 pt-5 pb-7 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">{sharePanel === 'export' ? '导出主题' : '导入主题'}</h2>
                                <p className="text-[11px] text-slate-400 mt-0.5">{editingTheme.name || '未命名主题'}</p>
                            </div>
                            <button
                                onClick={() => setSharePanel('none')}
                                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95 transition-transform"
                                aria-label="关闭"
                            >
                                ×
                            </button>
                        </div>

                        {sharePanel === 'export' ? (
                            <>
                                <textarea
                                    ref={exportTextareaRef}
                                    value={themeJson}
                                    readOnly
                                    data-allow-text-selection="true"
                                    className="w-full h-56 bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed rounded-2xl p-4 resize-none outline-none"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => void copyThemeJson()}
                                        className="py-3 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold active:scale-[0.98] transition-transform"
                                    >
                                        复制 JSON
                                    </button>
                                    <button
                                        onClick={downloadThemeJson}
                                        className="py-3 rounded-2xl bg-primary text-white text-xs font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
                                    >
                                        下载 JSON
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <textarea
                                    value={importText}
                                    onChange={(e) => setImportText(e.target.value)}
                                    data-allow-text-selection="true"
                                    placeholder="粘贴主题 JSON"
                                    className="w-full h-48 bg-slate-50 border border-slate-200 text-slate-700 font-mono text-[11px] leading-relaxed rounded-2xl p-4 resize-none outline-none focus:border-primary/40"
                                />
                                <input
                                    type="file"
                                    ref={importFileInputRef}
                                    accept="application/json,.json"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void importThemeFile(file);
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => importFileInputRef.current?.click()}
                                        className="py-3 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold active:scale-[0.98] transition-transform"
                                    >
                                        选择文件
                                    </button>
                                    <button
                                        onClick={() => applyImportedTheme(importText)}
                                        disabled={!importText.trim()}
                                        className="py-3 rounded-2xl bg-primary text-white text-xs font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:shadow-none"
                                    >
                                        应用导入
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThemeMaker;
