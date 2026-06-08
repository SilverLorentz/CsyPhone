
import React,{ useEffect,useRef,useState } from 'react';
import Modal from '../os/Modal';
import { useOS } from '../../context/OSContext';
import { AppID,CharacterProfile,Message,Emoji,EmojiCategory,YesterdayNewspaperPeriodType,PhotoStylePreset,ImageProviderType,SavedVibeReference,VibeReferenceInput,type ManualPhotoGenerationOptions,type ManualPhotoMode,type UserProfile } from '../../types';
import { CustomStatusTemplate } from '../../types/statusCard';
import VibeReferencePicker from './VibeReferencePicker';
import { NO_PHOTO_STYLE_PRESET,NO_PHOTO_STYLE_PRESET_ID } from '../../utils/photoGeneration';

type CustomTemplateSelection = CustomStatusTemplate & {
    _setActiveOnly?: boolean;
};

interface ChatModalsProps {
    modalType: string;
    setModalType: (v: any) => void;
    // Data Props
    transferAmt: string;
    setTransferAmt: (v: string) => void;
    emojiImportText: string;
    setEmojiImportText: (v: string) => void;
    settingsContextLimit: number;
    setSettingsContextLimit: (v: number) => void;
    settingsHideSysLogs: boolean;
    setSettingsHideSysLogs: (v: boolean) => void;
    preserveContext: boolean;
    setPreserveContext: (v: boolean) => void;
    editContent: string;
    setEditContent: (v: string) => void;

    // New Category Props
    newCategoryName: string;
    setNewCategoryName: (v: string) => void;
    onAddCategory: () => void;

    // Archive Props
    archivePrompts: { id: string, name: string, content: string }[];
    selectedPromptId: string;
    setSelectedPromptId: (id: string) => void;
    editingPrompt: { id: string, name: string, content: string } | null;
    setEditingPrompt: (p: any) => void;
    isSummarizing: boolean;

    // Selection Props
    selectedMessage: Message | null;
    selectedEmoji: Emoji | null;
    selectedEmojis: Emoji[];
    selectedCategory: EmojiCategory | null;
    activeCharacter: CharacterProfile;
    userProfile: UserProfile;
    messages: Message[];
    allHistoryMessages?: Message[];

    // Handlers
    onTransfer: () => void;
    onImportEmoji: () => void;
    onSaveSettings: () => void;
    onBgUpload: (file: File) => void;
    onRemoveBg: () => void;
    onClearHistory: () => void;
    onArchive: () => void;
    onCreatePrompt: () => void;
    onEditPrompt: () => void;
    onSavePrompt: () => void;
    onDeletePrompt: (id: string) => void;
    onSetHistoryStart: (id: number | undefined) => void;
    onEnterSelectionMode: () => void;
    onReplyMessage: () => void;
    onCloseMessageOptions: () => void;
    onEditMessageStart: () => void;
    onConfirmEditMessage: () => void;
    onDeleteMessage: () => void;
    onCopyMessage: () => void;
    onDeleteEmoji: () => void;
    onDeleteSelectedEmojis: () => void;
    onDeleteCategory: () => void;
    // Category Visibility
    allCharacters?: CharacterProfile[];
    onSaveCategoryVisibility?: (categoryId: string, allowedCharacterIds: string[] | undefined) => void;
    // Translation
    translationEnabled?: boolean;
    onToggleTranslation?: () => void;
    translateSourceLang?: string;
    translateTargetLang?: string;
    onSetTranslateSourceLang?: (lang: string) => void;
    onSetTranslateLang?: (lang: string) => void;
    // XHS toggle
    xhsEnabled?: boolean;
    onToggleXhs?: () => void;
    // Timestamp toggle
    showTimestampSetting?: boolean;
    isTimestampForced?: boolean;
    onToggleTimestamp?: () => void;
    chatTimeAwarenessEnabled?: boolean;
    onToggleChatTimeAwareness?: () => void;
    chatTimePassageAwarenessEnabled?: boolean;
    onToggleChatTimePassageAwareness?: () => void;
    dateTimeAwarenessEnabled?: boolean;
    onToggleDateTimeAwareness?: () => void;
    // Voice / TTS
    onReadAloud?: () => void;
    onVoiceToText?: () => void;
    onDownloadVoice?: () => void;
    autoTts?: boolean;
    onToggleAutoTts?: () => void;
    autoCall?: boolean;
    onToggleAutoCall?: () => void;
    autoShareSong?: boolean;
    onToggleAutoShareSong?: () => void;
    injectPlaybackContext?: boolean;
    onToggleInjectPlaybackContext?: () => void;
    // Status Bar Mode
    statusBarMode?: string;
    onStatusBarModeChange?: (mode: string) => void;
    // Custom Template
    customStatusTemplates?: CustomStatusTemplate[];
    onSaveCustomTemplate?: (template: CustomTemplateSelection) => void;
    // Thinking Chain
    showThinking?: boolean;
    onToggleShowThinking?: () => void;
    // Opt-in automations
    newspaperEnabled?: boolean;
    onToggleNewspaper?: () => void;
    newspaperGenerating?: boolean;
    onGenerateNewspaperPeriod?: (periodType: YesterdayNewspaperPeriodType) => void;
    todayScheduleEnabled?: boolean;
    onToggleTodaySchedule?: () => void;
    // Photo generation
    photoStylePresets?: PhotoStylePreset[];
    photoConfigReady?: boolean;
    manualPhotoGenerating?: boolean;
    imageProviderType?: ImageProviderType;
    savedVibeReferences?: SavedVibeReference[];
    onManualPhotoGenerate?: (prompt: string, stylePresetId?: string, vibeReferences?: VibeReferenceInput[], options?: ManualPhotoGenerationOptions) => void;
    onSaveVibeReference?: (reference: VibeReferenceInput) => Promise<SavedVibeReference | undefined>;
    onImportVibeFile?: (file: File) => Promise<SavedVibeReference | undefined>;
    onRenameSavedVibe?: (id: string, name: string) => Promise<void>;
    onDeleteSavedVibe?: (id: string) => Promise<void>;
    onClearSavedVibeCache?: (id: string) => Promise<void>;
    onToggleManualPhoto?: () => void;
    onToggleAutoPhoto?: () => void;
    onSetDefaultPhotoStyle?: (styleId: string) => void;
    onToggleBoundPhotoStyle?: (styleId: string) => void;
    onToggleDefaultVibeReference?: (vibeId: string) => void;
    onSaveNaiAppearance?: (
        tags: string,
        negativeTags: string,
        appearancePrompt?: string,
        userTags?: string,
        userNegativeTags?: string,
        userAppearancePrompt?: string,
    ) => void;
}

const ChatModals: React.FC<ChatModalsProps> = ({
    modalType, setModalType,
    transferAmt, setTransferAmt,
    emojiImportText, setEmojiImportText,
    settingsContextLimit, setSettingsContextLimit,
    settingsHideSysLogs, setSettingsHideSysLogs,
    preserveContext, setPreserveContext,
    editContent, setEditContent,
    newCategoryName, setNewCategoryName, onAddCategory,
    archivePrompts, selectedPromptId, setSelectedPromptId,
    editingPrompt, setEditingPrompt, isSummarizing,
    selectedMessage, selectedEmoji, selectedEmojis, selectedCategory, activeCharacter, userProfile,
    allHistoryMessages = [],
    onTransfer, onImportEmoji, onSaveSettings,
    onBgUpload, onRemoveBg, onClearHistory,
    onArchive, onCreatePrompt, onEditPrompt, onSavePrompt, onDeletePrompt,
    onSetHistoryStart, onEnterSelectionMode, onReplyMessage, onCloseMessageOptions, onEditMessageStart, onConfirmEditMessage, onDeleteMessage, onCopyMessage, onDeleteEmoji, onDeleteSelectedEmojis, onDeleteCategory,
    allCharacters = [], onSaveCategoryVisibility,
    translationEnabled, onToggleTranslation, translateSourceLang, translateTargetLang, onSetTranslateSourceLang, onSetTranslateLang,
    xhsEnabled, onToggleXhs,
    showTimestampSetting, isTimestampForced, onToggleTimestamp,
    chatTimeAwarenessEnabled = true, onToggleChatTimeAwareness,
    chatTimePassageAwarenessEnabled = true, onToggleChatTimePassageAwareness,
    dateTimeAwarenessEnabled = true, onToggleDateTimeAwareness,
    onReadAloud, onVoiceToText, onDownloadVoice, autoTts, onToggleAutoTts,
    autoCall, onToggleAutoCall,
    autoShareSong, onToggleAutoShareSong,
    injectPlaybackContext, onToggleInjectPlaybackContext,
    statusBarMode, onStatusBarModeChange,
    customStatusTemplates, onSaveCustomTemplate,
    showThinking, onToggleShowThinking,
    newspaperEnabled, onToggleNewspaper, newspaperGenerating, onGenerateNewspaperPeriod,
    todayScheduleEnabled, onToggleTodaySchedule,
    photoStylePresets = [],
    photoConfigReady = false,
    manualPhotoGenerating = false,
    imageProviderType = 'novelai',
    savedVibeReferences = [],
    onManualPhotoGenerate,
    onSaveVibeReference,
    onImportVibeFile,
    onRenameSavedVibe,
    onDeleteSavedVibe,
    onClearSavedVibeCache,
    onToggleManualPhoto,
    onToggleAutoPhoto,
    onSetDefaultPhotoStyle,
    onToggleBoundPhotoStyle,
    onToggleDefaultVibeReference,
    onSaveNaiAppearance,
}) => {
    const { openApp, addToast } = useOS();
    const bgInputRef = useRef<HTMLInputElement>(null);
    const [visibilitySelection, setVisibilitySelection] = useState<Set<string>>(new Set());
    const [historyPage, setHistoryPage] = useState(0);
    const [manualPhotoPrompt, setManualPhotoPrompt] = useState('');
    const [manualPhotoStyleId, setManualPhotoStyleId] = useState('');
    const [manualPhotoVibes, setManualPhotoVibes] = useState<VibeReferenceInput[]>([]);
    const [manualPhotoMode, setManualPhotoMode] = useState<ManualPhotoMode>('direct');
    const [manualPhotoUseAppearance, setManualPhotoUseAppearance] = useState(true);
    const [manualPhotoUseUserAppearance, setManualPhotoUseUserAppearance] = useState(false);
    const [naiAppearanceTagsDraft, setNaiAppearanceTagsDraft] = useState(activeCharacter.naiAppearanceTags || '');
    const [naiAppearanceNegativeDraft, setNaiAppearanceNegativeDraft] = useState(activeCharacter.naiAppearanceNegativeTags || '');
    const [appearancePromptDraft, setAppearancePromptDraft] = useState(activeCharacter.photoAppearancePrompt || '');
    const [userNaiAppearanceTagsDraft, setUserNaiAppearanceTagsDraft] = useState(userProfile.naiAppearanceTags || '');
    const [userNaiAppearanceNegativeDraft, setUserNaiAppearanceNegativeDraft] = useState(userProfile.naiAppearanceNegativeTags || '');
    const [userAppearancePromptDraft, setUserAppearancePromptDraft] = useState(userProfile.photoAppearancePrompt || '');
    const HISTORY_PAGE_SIZE = 50;
    const realPhotoStylePresets = photoStylePresets.filter(style => style.id !== NO_PHOTO_STYLE_PRESET_ID);
    const manualPhotoStyleOptions = [
        photoStylePresets.find(style => style.id === NO_PHOTO_STYLE_PRESET_ID) || NO_PHOTO_STYLE_PRESET,
        ...realPhotoStylePresets,
    ];
    const selectedManualPhotoStyleId = manualPhotoStyleOptions.some(style => style.id === manualPhotoStyleId)
        ? manualPhotoStyleId
        : '';
    const boundManualPhotoStyleIds = activeCharacter.boundPhotoStylePresetIds && activeCharacter.boundPhotoStylePresetIds.length > 0
        ? new Set(activeCharacter.boundPhotoStylePresetIds)
        : null;
    const defaultManualPhotoStyleOptions = boundManualPhotoStyleIds
        ? manualPhotoStyleOptions.filter(style => boundManualPhotoStyleIds.has(style.id))
        : manualPhotoStyleOptions;
    const explicitDefaultManualPhotoStyleId = manualPhotoStyleOptions.some(style => style.id === activeCharacter.defaultPhotoStylePresetId)
        ? activeCharacter.defaultPhotoStylePresetId
        : '';
    const defaultManualPhotoStyleId = explicitDefaultManualPhotoStyleId === NO_PHOTO_STYLE_PRESET_ID
        ? NO_PHOTO_STYLE_PRESET_ID
        : (
            defaultManualPhotoStyleOptions.some(style => style.id === explicitDefaultManualPhotoStyleId)
                ? explicitDefaultManualPhotoStyleId
                : (
                    defaultManualPhotoStyleOptions.find(style => style.id !== NO_PHOTO_STYLE_PRESET_ID)?.id
                    || defaultManualPhotoStyleOptions[0]?.id
                    || realPhotoStylePresets[0]?.id
                    || NO_PHOTO_STYLE_PRESET_ID
                )
        );
    const effectiveManualPhotoStyleId = selectedManualPhotoStyleId
        || defaultManualPhotoStyleId
        || NO_PHOTO_STYLE_PRESET_ID;
    const hasNaiAppearanceBinding = Boolean(
        (activeCharacter.naiAppearanceTags || '').trim()
        || (activeCharacter.naiAppearanceNegativeTags || '').trim(),
    );
    const hasOpenAIAppearanceBinding = Boolean((activeCharacter.photoAppearancePrompt || '').trim());
    const hasUserAppearanceBinding = Boolean(
        (userProfile.naiAppearanceTags || '').trim()
        || (userProfile.naiAppearanceNegativeTags || '').trim()
        || (userProfile.photoAppearancePrompt || '').trim(),
    );

    useEffect(() => {
        setNaiAppearanceTagsDraft(activeCharacter.naiAppearanceTags || '');
        setNaiAppearanceNegativeDraft(activeCharacter.naiAppearanceNegativeTags || '');
        setAppearancePromptDraft(activeCharacter.photoAppearancePrompt || '');
    }, [activeCharacter.id, activeCharacter.naiAppearanceTags, activeCharacter.naiAppearanceNegativeTags, activeCharacter.photoAppearancePrompt]);

    useEffect(() => {
        setUserNaiAppearanceTagsDraft(userProfile.naiAppearanceTags || '');
        setUserNaiAppearanceNegativeDraft(userProfile.naiAppearanceNegativeTags || '');
        setUserAppearancePromptDraft(userProfile.photoAppearancePrompt || '');
    }, [userProfile.naiAppearanceTags, userProfile.naiAppearanceNegativeTags, userProfile.photoAppearancePrompt]);

    const openVisibilityModal = () => {
        if (selectedCategory) {
            setVisibilitySelection(new Set(selectedCategory.allowedCharacterIds || []));
            setModalType('category-visibility');
        }
    };

    const toggleVisibilityChar = (charId: string) => {
        setVisibilitySelection(prev => {
            const next = new Set(prev);
            if (next.has(charId)) next.delete(charId);
            else next.add(charId);
            return next;
        });
    };

    const handleSaveVisibility = () => {
        if (selectedCategory && onSaveCategoryVisibility) {
            const ids = Array.from(visibilitySelection);
            onSaveCategoryVisibility(selectedCategory.id, ids.length > 0 ? ids : undefined);
        }
        setModalType('none');
    };

    const handleGenerateNewspaperPeriod = (periodType: YesterdayNewspaperPeriodType, label: string) => {
        if (!newspaperEnabled || newspaperGenerating || !onGenerateNewspaperPeriod) return;
        const confirmed = typeof window === 'undefined' || window.confirm(`确认生成${label}？这会调用一次聊天模型。`);
        if (!confirmed) return;
        onGenerateNewspaperPeriod(periodType);
        setModalType('none');
    };

    const handleOpenWorkshop = (template?: CustomStatusTemplate) => {
        if (template) {
            onSaveCustomTemplate?.({
                ...template,
                _setActiveOnly: true,
            });
        }

        setModalType('none');
        window.setTimeout(() => openApp(AppID.StatusWorkshop), 0);
    };

    return (
        <>
            <Modal
                isOpen={modalType === 'transfer'} title="Credits 转账" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onTransfer} className="flex-1 py-3 bg-orange-500 text-white rounded-2xl">确认</button></>}
            ><input type="number" value={transferAmt} onChange={e => setTransferAmt(e.target.value)} className="w-full bg-slate-100 rounded-2xl px-5 py-4 text-lg font-bold" autoFocus /></Modal>

            {/* New Category Modal */}
            <Modal
                isOpen={modalType === 'add-category'} title="新建表情分类" onClose={() => setModalType('none')}
                footer={<button onClick={onAddCategory} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">创建</button>}
            >
                <input
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="输入分类名称..."
                    className="w-full bg-slate-100 rounded-2xl px-5 py-4 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-700"
                    autoFocus
                />
            </Modal>

            <Modal
                isOpen={modalType === 'emoji-import'} title="表情注入" onClose={() => setModalType('none')}
                footer={<button onClick={onImportEmoji} className="w-full py-4 bg-primary text-white font-bold rounded-2xl">添加至当前分类</button>}
            >
                <div className="space-y-3">
                    <p className="text-xs text-slate-400">表情将导入到你当前选中的分类。</p>
                    <textarea value={emojiImportText} onChange={e => setEmojiImportText(e.target.value)} placeholder="Name--URL (每行一个)" className="w-full h-40 bg-slate-100 rounded-2xl p-4 resize-none" />
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'manual-photo'} title="手动生图" onClose={() => setModalType('none')}
                footer={
                    <button
                        onClick={() => onManualPhotoGenerate?.(
                            manualPhotoPrompt,
                            selectedManualPhotoStyleId || undefined,
                            imageProviderType === 'novelai' ? manualPhotoVibes : [],
                            {
                                mode: manualPhotoMode,
                                useAppearance: manualPhotoUseAppearance,
                                useUserAppearance: manualPhotoUseUserAppearance,
                                appearanceTags: imageProviderType === 'novelai' ? naiAppearanceTagsDraft : undefined,
                                appearanceNegativeTags: imageProviderType === 'novelai' ? naiAppearanceNegativeDraft : undefined,
                                userAppearanceTags: imageProviderType === 'novelai' ? userNaiAppearanceTagsDraft : undefined,
                                userAppearanceNegativeTags: imageProviderType === 'novelai' ? userNaiAppearanceNegativeDraft : undefined,
                                appearancePrompt: appearancePromptDraft,
                                userAppearancePrompt: userAppearancePromptDraft,
                            },
                        )}
                        disabled={!photoConfigReady || manualPhotoGenerating || !onManualPhotoGenerate}
                        className={`w-full py-3 rounded-2xl font-bold ${photoConfigReady && !manualPhotoGenerating ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}
                    >
                        {manualPhotoGenerating ? '生成中...' : '生成并发送'}
                    </button>
                }
            >
                <div className="space-y-3">
                    {!photoConfigReady && (
                        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-700">
                            请先在系统设置的「生图服务」里配置当前生图供应商。
                        </div>
                    )}
                    <div className="rounded-2xl bg-slate-100 p-1 grid grid-cols-2 gap-1">
                        {([
                            ['direct', '手写模式'],
                            ['story', '剧情模式'],
                        ] as Array<[ManualPhotoMode, string]>).map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setManualPhotoMode(mode)}
                                className={`rounded-xl py-2 text-xs font-bold transition-colors ${manualPhotoMode === mode ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400">
                        {manualPhotoMode === 'story'
                            ? '剧情模式会读取最近聊天和角色设定，用副 API 整理成适合生图的 tags。'
                            : '手写模式会直接使用你输入的 prompt，不调用副 API。'}
                    </p>
                    <>
                        <div
                            className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2"
                            onClick={() => setManualPhotoUseAppearance(prev => !prev)}
                        >
                            <div>
                                <div className="text-xs font-bold text-slate-600">使用角色锁脸</div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {imageProviderType === 'novelai'
                                        ? (hasNaiAppearanceBinding ? '会把角色 NAI 外貌 tags 拼进 prompt。' : '可在下方填写角色 NAI tags。')
                                        : (hasOpenAIAppearanceBinding ? '会把角色自然语言外貌描述拼进 prompt。' : '可在下方填写角色自然语言外貌。')}
                                </p>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${manualPhotoUseAppearance ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${manualPhotoUseAppearance ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        {manualPhotoUseAppearance && (
                            <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-500">
                                            {imageProviderType === 'novelai' ? '角色外貌 NAI tags' : '角色锁脸描述'}
                                        </div>
                                        <p className="text-[10px] leading-relaxed text-slate-400">
                                            {imageProviderType === 'novelai' ? '当前弹窗填写的 tags 会直接参与这次生成。' : 'OpenAI 兼容生图使用自然语言，不需要英文 tag。'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onSaveNaiAppearance?.(naiAppearanceTagsDraft, naiAppearanceNegativeDraft, appearancePromptDraft, userNaiAppearanceTagsDraft, userNaiAppearanceNegativeDraft, userAppearancePromptDraft)}
                                        disabled={!onSaveNaiAppearance}
                                        className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-primary border border-slate-100 disabled:text-slate-300"
                                    >
                                        保存
                                    </button>
                                </div>
                                {imageProviderType === 'novelai' ? (
                                    <>
                                        <textarea
                                            value={naiAppearanceTagsDraft}
                                            onChange={e => setNaiAppearanceTagsDraft(e.target.value)}
                                            placeholder="例：1girl, solo, long black hair, blue eyes"
                                            className="mb-2 h-20 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                        <textarea
                                            value={naiAppearanceNegativeDraft}
                                            onChange={e => setNaiAppearanceNegativeDraft(e.target.value)}
                                            placeholder="外貌相关 negative tags，可留空"
                                            className="h-14 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                    </>
                                ) : (
                                    <textarea
                                        value={appearancePromptDraft}
                                        onChange={e => setAppearancePromptDraft(e.target.value)}
                                        placeholder="例：黑色长发，蓝灰色眼睛，清瘦，常穿深色衬衫，气质冷淡"
                                        className="h-24 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                    />
                                )}
                            </div>
                        )}
                        <div
                            className="flex items-center justify-between rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2"
                            onClick={() => setManualPhotoUseUserAppearance(prev => !prev)}
                        >
                            <div>
                                <div className="text-xs font-bold text-slate-600">使用我的锁脸</div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {hasUserAppearanceBinding ? '合照或画面包含你时打开。' : '可先填写你的锁脸，合照时使用。'}
                                </p>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${manualPhotoUseUserAppearance ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${manualPhotoUseUserAppearance ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        {manualPhotoUseUserAppearance && (
                            <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-500">
                                            {imageProviderType === 'novelai' ? '我的外貌 NAI tags' : '我的锁脸描述'}
                                        </div>
                                        <p className="text-[10px] leading-relaxed text-slate-400">默认不参与单人照，合照时再打开更稳。</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onSaveNaiAppearance?.(naiAppearanceTagsDraft, naiAppearanceNegativeDraft, appearancePromptDraft, userNaiAppearanceTagsDraft, userNaiAppearanceNegativeDraft, userAppearancePromptDraft)}
                                        disabled={!onSaveNaiAppearance}
                                        className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-primary border border-slate-100 disabled:text-slate-300"
                                    >
                                        保存
                                    </button>
                                </div>
                                {imageProviderType === 'novelai' ? (
                                    <>
                                        <textarea
                                            value={userNaiAppearanceTagsDraft}
                                            onChange={e => setUserNaiAppearanceTagsDraft(e.target.value)}
                                            placeholder="合照用 tags，建议不要写 solo"
                                            className="mb-2 h-20 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                        <textarea
                                            value={userNaiAppearanceNegativeDraft}
                                            onChange={e => setUserNaiAppearanceNegativeDraft(e.target.value)}
                                            placeholder="我的外貌 negative tags，可留空"
                                            className="h-14 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                    </>
                                ) : (
                                    <textarea
                                        value={userAppearancePromptDraft}
                                        onChange={e => setUserAppearancePromptDraft(e.target.value)}
                                        placeholder="例：年轻女性，黑色中长发，圆眼，日常穿浅色针织衫，神情温柔"
                                        className="h-24 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                    />
                                )}
                            </div>
                        )}
                    </>
                    <textarea
                        value={manualPhotoPrompt}
                        onChange={e => setManualPhotoPrompt(e.target.value)}
                        placeholder={manualPhotoMode === 'story' ? '想让这张图更偏向什么情节、动作或氛围...' : '直接输入 NAI prompt 或画面描述...'}
                        className="w-full h-36 bg-slate-100 rounded-2xl p-4 resize-none text-sm"
                    />
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">风格预设</label>
                        <select
                            value={effectiveManualPhotoStyleId}
                            onChange={e => setManualPhotoStyleId(e.target.value)}
                            className="w-full bg-slate-100 rounded-xl px-3 py-2.5 text-sm"
                        >
                            {manualPhotoStyleOptions.map(style => (
                                <option key={style.id} value={style.id}>{style.name}</option>
                            ))}
                        </select>
                    </div>
                    <VibeReferencePicker
                        enabled={imageProviderType === 'novelai'}
                        value={manualPhotoVibes}
                        savedVibes={savedVibeReferences}
                        disabled={manualPhotoGenerating}
                        onChange={setManualPhotoVibes}
                        onSaveReference={onSaveVibeReference}
                        onImportVibeFile={onImportVibeFile}
                        onRenameSavedVibe={onRenameSavedVibe}
                        onDeleteSavedVibe={onDeleteSavedVibe}
                        onClearSavedVibeCache={onClearSavedVibeCache}
                        addToast={addToast}
                    />
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'chat-settings'} title="聊天设置" onClose={() => setModalType('none')}
                footer={<button onClick={onSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存设置</button>}
            >
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">聊天背景</label>
                        <div onClick={() => bgInputRef.current?.click()} className="h-24 bg-slate-100 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-primary/50 overflow-hidden relative">
                            {activeCharacter.chatBackground ? <img src={activeCharacter.chatBackground} className="w-full h-full object-cover opacity-60" /> : <span className="text-xs text-slate-400">点击上传图片 (原画质)</span>}
                            {activeCharacter.chatBackground && <span className="absolute z-10 text-xs bg-white/80 px-2 py-1 rounded">更换</span>}
                        </div>
                        <input type="file" ref={bgInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onBgUpload(e.target.files[0])} />
                        {activeCharacter.chatBackground && <button onClick={onRemoveBg} className="text-[10px] text-red-400 mt-1">移除背景</button>}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">上下文条数 ({settingsContextLimit})</label>
                        <input type="range" min="20" max="5000" step="10" value={settingsContextLimit} onChange={e => setSettingsContextLimit(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-full appearance-none accent-primary" />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>20 (省流)</span><span>5000 (超长记忆)</span></div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => setSettingsHideSysLogs(!settingsHideSysLogs)}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">隐藏系统日志</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${settingsHideSysLogs ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settingsHideSysLogs ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，将不再显示 Date/App 产生的上下文提示文本（转账、戳一戳、图片发送提示除外）。
                        </p>
                    </div>

                    {onToggleShowThinking && (
                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex justify-between items-center cursor-pointer" onClick={onToggleShowThinking}>
                                <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">思考链可见</label>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${showThinking ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showThinking ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                                开启后，支持思考的模型的推理过程将显示在气泡中的可折叠区域内。
                            </p>
                        </div>
                    )}

                    <div className="pt-2 border-t border-slate-100">
                        <div className={`flex justify-between items-center ${onToggleNewspaper ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleNewspaper}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">昨日来信</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${newspaperEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${newspaperEnabled ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            打开后，进入聊天时自动投递「昨日来信」。周章 / 月章需要手动确认生成。
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={!newspaperEnabled || newspaperGenerating || !onGenerateNewspaperPeriod}
                                onClick={() => handleGenerateNewspaperPeriod('weekly', '回望·周章')}
                                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                                    newspaperEnabled && !newspaperGenerating && onGenerateNewspaperPeriod
                                        ? 'bg-slate-900 text-white active:scale-95'
                                        : 'bg-slate-100 text-slate-400'
                                }`}
                            >
                                生成周章
                            </button>
                            <button
                                type="button"
                                disabled={!newspaperEnabled || newspaperGenerating || !onGenerateNewspaperPeriod}
                                onClick={() => handleGenerateNewspaperPeriod('monthly', '回望·月章')}
                                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                                    newspaperEnabled && !newspaperGenerating && onGenerateNewspaperPeriod
                                        ? 'bg-slate-900 text-white active:scale-95'
                                        : 'bg-slate-100 text-slate-400'
                                }`}
                            >
                                生成月章
                            </button>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <div className={`flex justify-between items-center ${onToggleTodaySchedule ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleTodaySchedule}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">今日行程</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${todayScheduleEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${todayScheduleEnabled ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            打开后，聊天页才会同步并显示今日行程入口。默认关闭UI显示，但日程仍会同步更新。
                        </p>
                    </div>

                    {/* Timestamp Toggle */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className={`flex justify-between items-center ${isTimestampForced ? 'opacity-60' : 'cursor-pointer'}`} onClick={isTimestampForced ? undefined : onToggleTimestamp}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">消息时间戳</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${showTimestampSetting ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showTimestampSetting ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            {isTimestampForced
                                ? '当前主题（微信）强制显示时间戳'
                                : '开启后，消息间隔超过 3 分钟时显示时间戳分隔符'
                            }
                        </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">时间感知</label>
                        <div className="space-y-3">
                            <div className={`flex justify-between items-start gap-4 ${onToggleChatTimeAwareness ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleChatTimeAwareness}>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-slate-600">主聊天当前时间</div>
                                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">控制今日信息、当前日程锚点、特殊日期和日历上下文。</p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center shrink-0 ${chatTimeAwarenessEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${chatTimeAwarenessEnabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                            <div className={`flex justify-between items-start gap-4 ${onToggleChatTimePassageAwareness ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleChatTimePassageAwareness}>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-slate-600">主聊天时间流逝</div>
                                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">控制聊天空窗、节奏、时段变迁和待跟进事件提醒。</p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center shrink-0 ${chatTimePassageAwarenessEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${chatTimePassageAwarenessEnabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                            <div className={`flex justify-between items-start gap-4 ${onToggleDateTimeAwareness ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleDateTimeAwareness}>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-bold text-slate-600">线下时间感知</div>
                                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">控制线下见面/约会中的当前时间、时段变化和互动间隔。</p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center shrink-0 ${dateTimeAwarenessEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${dateTimeAwarenessEnabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Translation Settings */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleTranslation}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">消息翻译</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${translationEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${translationEnabled ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            开启后，对方的消息会先以「选」的语言显示，点「译」切换到目标语言。
                        </p>
                        {translationEnabled && (
                            <div className="mt-3 space-y-3">
                                {/* Source Language (选) */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1.5 block">选（气泡显示语言）</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['中文', '粤语', 'English', '日本語', '한국어', 'Français', 'Español'].map(lang => (
                                            <button
                                                key={`src-${lang}`}
                                                onClick={() => onSetTranslateSourceLang?.(lang)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${translateSourceLang === lang ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Target Language (译) */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1.5 block">译（翻译目标语言）</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['中文', '粤语', 'English', '日本語', '한국어', 'Français', 'Español'].map(lang => (
                                            <button
                                                key={`tgt-${lang}`}
                                                onClick={() => onSetTranslateLang?.(lang)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${translateTargetLang === lang ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Preview */}
                                <div className="text-[11px] text-center text-slate-500 bg-slate-50 rounded-lg py-2">
                                    选<span className="font-bold text-slate-700">{translateSourceLang || '?'}</span> 译<span className="font-bold text-primary">{translateTargetLang || '?'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* XHS Toggle */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleXhs}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">小红书</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${xhsEnabled ? 'bg-red-400' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${xhsEnabled ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，角色在聊天中可以搜索、浏览、发帖、评论小红书。需要在全局设置中配置 MCP 或 Cookie。
                        </p>
                    </div>

                    {/* Status Bar Mode Selector */}
                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">心声模式</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'off', title: '关闭', desc: '不生成心声，不消耗副 API' },
                                { id: 'classic', title: '经典心声', desc: '明信片风格，点击头像查看' },
                                { id: 'creative', title: '创意卡片', desc: '从 8 种预设骨架中择一生成' },
                                { id: 'freeform', title: '自由创作', desc: '即兴生成独一无二的 HTML 碎片' },
                                { id: 'custom', title: '自定义模板', desc: '自己写提示词和正则，完全自由' },
                                { id: 'story_phone', title: '查手机', desc: '头像旁出现手机入口，按剧情随机查看一个 App' },
                                { id: 'afterglow', title: '番外篇', desc: '每轮回复后自动生成，星星入口可手动加梗' },
                            ].map(opt => {
                                const isActive = (statusBarMode || 'classic') === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => onStatusBarModeChange?.(opt.id)}
                                        className={`relative text-left p-3 rounded-2xl transition-all border ${
                                            isActive
                                                ? 'bg-primary/8 border-primary/25 ring-1 ring-primary/15'
                                                : 'bg-slate-50/80 border-slate-100 hover:bg-slate-100/80 active:scale-[0.97]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                                                isActive ? 'bg-primary' : 'bg-slate-300'
                                            }`} />
                                            <div className={`text-[13px] font-bold leading-tight ${
                                                isActive ? 'text-primary' : 'text-slate-600'
                                            }`}>{opt.title}</div>
                                        </div>
                                        <div className="text-[10px] text-slate-400 leading-snug pl-3">{opt.desc}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Custom Template Selector — shown when custom mode selected */}
                    {(statusBarMode || 'classic') === 'custom' && (
                        <div className="mt-3 space-y-3 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold text-slate-500">自定义模板</span>
                                <button
                                    onClick={() => handleOpenWorkshop()}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95"
                                >
                                    编辑工坊 →
                                </button>
                            </div>
                            {customStatusTemplates && customStatusTemplates.length > 0 ? (
                                <div className="space-y-2">
                                    {customStatusTemplates.map(tpl => {
                                        const isActive = tpl.id === activeCharacter.activeCustomTemplateId
                                            || (!activeCharacter.activeCustomTemplateId && tpl.id === customStatusTemplates[0].id);

                                        return (
                                            <div
                                                key={tpl.id}
                                                className={`flex items-start gap-2 rounded-xl border p-3 transition-all ${
                                                    isActive
                                                        ? 'bg-primary/8 border-primary/25 ring-1 ring-primary/15'
                                                        : 'bg-white border-slate-100 hover:bg-slate-50 active:scale-[0.97]'
                                                }`}
                                            >
                                                <button
                                                    onClick={() => onSaveCustomTemplate?.({
                                                        ...tpl,
                                                        _setActiveOnly: true,
                                                    })}
                                                    className="min-w-0 flex-1 text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-slate-300'}`} />
                                                        <span className={`text-[13px] font-bold ${isActive ? 'text-primary' : 'text-slate-600'}`}>
                                                            {tpl.name || '未命名方案'}
                                                        </span>
                                                    </div>
                                                    {tpl.systemPrompt && (
                                                        <p className="text-[10px] text-slate-400 mt-1 pl-3.5 truncate">
                                                            {tpl.systemPrompt.substring(0, 60)}…
                                                        </p>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleOpenWorkshop(tpl)}
                                                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                                                        isActive
                                                            ? 'bg-primary/12 text-primary hover:bg-primary/18'
                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                                    title="在工坊中编辑这个方案"
                                                >
                                                    编辑
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-4">
                                    <p className="text-[11px] text-slate-400">还没有方案</p>
                                    <p className="text-[10px] text-slate-300 mt-1">点击"编辑工坊 →"创建你的第一个方案</p>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleAutoTts}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">语音回复</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${autoTts ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${autoTts ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，对方可以给你发送语音消息。
                        </p>
                    </div>

                    {/* Incoming Call Toggle */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleAutoCall}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">主动来电</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${autoCall ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${autoCall ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，对方会在合适的时机主动给你拨打语音电话。
                        </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">生图 / 发照片</label>
                        <div className="space-y-3">
                            <div className={`flex justify-between items-center ${onToggleManualPhoto ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleManualPhoto}>
                                <div>
                                    <div className="text-xs font-bold text-slate-500">手动生图入口</div>
                                    <p className="text-[10px] text-slate-400 mt-1">打开后，聊天 + 面板显示“生图”。</p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${activeCharacter.manualPhotoEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${activeCharacter.manualPhotoEnabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                            <div className={`flex justify-between items-center ${onToggleAutoPhoto ? 'cursor-pointer' : 'opacity-60'}`} onClick={onToggleAutoPhoto}>
                                <div>
                                    <div className="text-xs font-bold text-slate-500">角色主动发照片</div>
                                    <p className="text-[10px] text-slate-400 mt-1">开启后，对方可以给你发送图片。</p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${activeCharacter.autoPhotoEnabled ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${activeCharacter.autoPhotoEnabled ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
                                <div className="text-[11px] font-bold text-slate-500 mb-1">
                                    {imageProviderType === 'novelai' ? '角色外貌 NAI tags' : '角色锁脸描述'}
                                </div>
                                <p className="mb-2 text-[10px] leading-relaxed text-slate-400">
                                    {imageProviderType === 'novelai' ? '用于 NAI 生图。这里不做中文转 tags。' : '用于 OpenAI 兼容生图，用自然语言写外貌即可。'}
                                </p>
                                {imageProviderType === 'novelai' ? (
                                    <>
                                        <textarea
                                            value={naiAppearanceTagsDraft}
                                            onChange={e => setNaiAppearanceTagsDraft(e.target.value)}
                                            placeholder="例：1girl, solo, long black hair, blue eyes"
                                            className="mb-2 h-20 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                        <textarea
                                            value={naiAppearanceNegativeDraft}
                                            onChange={e => setNaiAppearanceNegativeDraft(e.target.value)}
                                            placeholder="外貌相关 negative tags，可留空"
                                            className="mb-2 h-16 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                    </>
                                ) : (
                                    <textarea
                                        value={appearancePromptDraft}
                                        onChange={e => setAppearancePromptDraft(e.target.value)}
                                        placeholder="例：黑色长发，蓝灰色眼睛，清瘦，常穿深色衬衫，气质冷淡"
                                        className="mb-2 h-24 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                    />
                                )}
                                <div className="mt-3 border-t border-slate-100 pt-3">
                                    <div className="text-[11px] font-bold text-slate-500 mb-1">
                                        {imageProviderType === 'novelai' ? '我的外貌 NAI tags' : '我的锁脸描述'}
                                    </div>
                                    <p className="mb-2 text-[10px] leading-relaxed text-slate-400">合照或画面包含你时使用；自动发图只会在双人语境里带上。</p>
                                    {imageProviderType === 'novelai' ? (
                                        <>
                                            <textarea
                                                value={userNaiAppearanceTagsDraft}
                                                onChange={e => setUserNaiAppearanceTagsDraft(e.target.value)}
                                                placeholder="合照用 tags，建议不要写 solo"
                                                className="mb-2 h-20 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                            />
                                            <textarea
                                                value={userNaiAppearanceNegativeDraft}
                                                onChange={e => setUserNaiAppearanceNegativeDraft(e.target.value)}
                                                placeholder="我的外貌 negative tags，可留空"
                                                className="mb-2 h-16 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                            />
                                        </>
                                    ) : (
                                        <textarea
                                            value={userAppearancePromptDraft}
                                            onChange={e => setUserAppearancePromptDraft(e.target.value)}
                                            placeholder="例：年轻女性，黑色中长发，圆眼，日常穿浅色针织衫"
                                            className="mb-2 h-24 w-full resize-none rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs outline-none focus:border-primary/40"
                                        />
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onSaveNaiAppearance?.(naiAppearanceTagsDraft, naiAppearanceNegativeDraft, appearancePromptDraft, userNaiAppearanceTagsDraft, userNaiAppearanceNegativeDraft, userAppearancePromptDraft)}
                                    className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
                                >
                                    保存锁脸设定
                                </button>
                            </div>
                        </div>

                        {photoStylePresets.length > 0 && (
                            <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
                                <div className="text-[11px] font-bold text-slate-500 mb-2">角色风格预设</div>
                                <div className="space-y-2">
                                    {photoStylePresets.map(style => {
                                        const boundIds = activeCharacter.boundPhotoStylePresetIds;
                                        const isBound = !boundIds || boundIds.length === 0 || boundIds.includes(style.id);
                                        const isDefault = activeCharacter.defaultPhotoStylePresetId === style.id
                                            || (!activeCharacter.defaultPhotoStylePresetId && style.id === realPhotoStylePresets[0]?.id);
                                        return (
                                            <div key={style.id} className="flex items-center gap-2 rounded-xl bg-white border border-slate-100 px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onToggleBoundPhotoStyle?.(style.id)}
                                                    className={`w-5 h-5 rounded-md border flex items-center justify-center ${isBound ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-transparent'}`}
                                                >
                                                    ✓
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onSetDefaultPhotoStyle?.(style.id)}
                                                    className="min-w-0 flex-1 text-left"
                                                >
                                                    <div className={`text-xs font-bold truncate ${isDefault ? 'text-primary' : 'text-slate-600'}`}>{style.name}</div>
                                                    <div className="text-[9px] text-slate-400 truncate">{style.id}</div>
                                                </button>
                                                {isDefault && <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary">默认</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {imageProviderType === 'novelai' && savedVibeReferences.length > 0 && (
                            <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-100 p-3">
                                <div className="text-[11px] font-bold text-slate-500 mb-1">角色默认 Vibe</div>
                                <p className="mb-2 text-[10px] leading-relaxed text-slate-400">最多选择 3 个；角色主动发照片时会自动使用。</p>
                                <div className="space-y-2">
                                    {savedVibeReferences.map(vibe => {
                                        const selectedIds = activeCharacter.defaultVibeReferenceIds || [];
                                        const isSelected = selectedIds.includes(vibe.id);
                                        return (
                                            <button
                                                key={vibe.id}
                                                type="button"
                                                onClick={() => onToggleDefaultVibeReference?.(vibe.id)}
                                                className="flex w-full items-center gap-2 rounded-xl bg-white border border-slate-100 px-3 py-2 text-left"
                                            >
                                                <div className={`w-5 h-5 rounded-md border flex shrink-0 items-center justify-center ${isSelected ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-transparent'}`}>
                                                    ✓
                                                </div>
                                                {vibe.previewUrl ? (
                                                    <img src={vibe.previewUrl} alt={vibe.name} className="h-8 w-8 rounded-lg object-cover" />
                                                ) : (
                                                    <div className="h-8 w-8 rounded-lg bg-slate-100" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className={`truncate text-xs font-bold ${isSelected ? 'text-primary' : 'text-slate-600'}`}>{vibe.name}</div>
                                                    <div className="truncate text-[9px] text-slate-400">{Object.keys(vibe.encodings || {}).length} 个编码缓存</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleAutoShareSong}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">歌曲分享</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${autoShareSong ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${autoShareSong ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，对方在聊天里可以自然发出歌曲分享卡片。
                        </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center cursor-pointer" onClick={onToggleInjectPlaybackContext}>
                            <label className="text-xs font-bold text-slate-400 uppercase pointer-events-none">一起听歌</label>
                            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${injectPlaybackContext ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${injectPlaybackContext ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            开启后，char能和你实时同步听歌
                        </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <button onClick={() => setModalType('history-manager')} className="w-full py-3 bg-slate-50 text-slate-600 font-bold rounded-2xl border border-slate-200 active:scale-95 transition-transform flex items-center justify-center gap-2">
                            管理上下文 / 隐藏历史
                        </button>
                        <p className="text-[10px] text-slate-400 mt-2 text-center">可选择从某条消息开始显示，隐藏之前的记录（不会再参与后续回复）。</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold text-red-400 uppercase mb-3 block">危险区域 (Danger Zone)</label>
                        <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setPreserveContext(!preserveContext)}>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${preserveContext ? 'bg-primary border-primary' : 'bg-slate-100 border-slate-300'}`}>
                                {preserveContext && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                            </div>
                            <span className="text-sm text-slate-600">清空时保留最后10条记录 (维持语境)</span>
                        </div>
                        <button onClick={onClearHistory} className="w-full py-3 bg-red-50 text-red-500 font-bold rounded-2xl border border-red-100 active:scale-95 transition-transform flex items-center justify-center gap-2">
                            执行清空
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Archive Settings Modal */}
            <Modal isOpen={modalType === 'archive-settings'} title="记忆归档设置" onClose={() => setModalType('none')} footer={<button onClick={onArchive} disabled={isSummarizing} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200">开始归档</button>}>
                <div className="space-y-4">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block">选择提示词模板</label>
                        <div className="flex flex-col gap-2">
                            {archivePrompts.map(p => (
                                <div key={p.id} onClick={() => setSelectedPromptId(p.id)} className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between ${selectedPromptId === p.id ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500' : 'bg-white/50 border-indigo-200 hover:bg-white'}`}>
                                    <span className={`text-xs font-bold ${selectedPromptId === p.id ? 'text-indigo-700' : 'text-slate-600'}`}>{p.name}</span>
                                    <div className="flex gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); setSelectedPromptId(p.id); onEditPrompt(); }} className="text-[10px] text-slate-400 hover:text-indigo-500 px-2 py-1 rounded bg-slate-100 hover:bg-indigo-50">编辑/查看</button>
                                        {!p.id.startsWith('preset_') && (
                                            <button onClick={(e) => { e.stopPropagation(); onDeletePrompt(p.id); }} className="text-[10px] text-red-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50">×</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={onCreatePrompt} className="mt-3 w-full py-2 text-xs font-bold text-indigo-500 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-100">+ 新建自定义提示词</button>
                    </div>
                    <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl leading-relaxed">
                        • <b>理性精炼</b>: 适合生成条理清晰的事件日志，便于长期记忆检索。<br />
                        • <b>日记风格</b>: 适合生成第一人称的角色日记，更有代入感和情感色彩。<br />
                        • 支持变量: <code>{'${dateStr}'}</code>, <code>{'${char.name}'}</code>, <code>{'${userProfile.name}'}</code>, <code>{'${rawLog}'}</code>
                    </div>
                </div>
            </Modal>

            {/* Prompt Editor Modal */}
            <Modal isOpen={modalType === 'prompt-editor'} title="编辑提示词" onClose={() => setModalType('archive-settings')} footer={<button onClick={onSavePrompt} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存预设</button>}>
                <div className="space-y-3">
                    <input
                        value={editingPrompt?.name || ''}
                        onChange={e => setEditingPrompt((prev: any) => prev ? { ...prev, name: e.target.value } : null)}
                        placeholder="预设名称"
                        className="w-full px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <textarea
                        value={editingPrompt?.content || ''}
                        onChange={e => setEditingPrompt((prev: any) => prev ? { ...prev, content: e.target.value } : null)}
                        className="w-full h-64 bg-slate-100 rounded-xl p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                        placeholder="输入提示词内容..."
                    />
                </div>
            </Modal>

            {/* History Manager Modal */}
            <Modal
                isOpen={modalType === 'history-manager'} title="历史记录断点" onClose={() => { setModalType('none'); setHistoryPage(0); }}
                footer={<><button onClick={() => onSetHistoryStart(undefined)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">恢复全部</button><button onClick={() => { setModalType('none'); setHistoryPage(0); }} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">完成</button></>}
            >
                <div className="space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar p-1">
                    <p className="text-xs text-slate-400 text-center mb-2">点击某条消息，将其设为"新的起点"。此条之前的消息将被隐藏，也不会再参与后续回复。</p>
                    {(() => {
                        const reversed = allHistoryMessages.slice().reverse();
                        const totalPages = Math.max(1, Math.ceil(reversed.length / HISTORY_PAGE_SIZE));
                        const pageMessages = reversed.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
                        return (<>
                            {reversed.length > HISTORY_PAGE_SIZE && (
                                <div className="flex items-center justify-between px-1 py-1">
                                    <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0} className={`px-3 py-1 text-xs rounded-lg ${historyPage === 0 ? 'text-slate-300' : 'text-primary hover:bg-primary/10'}`}>上一页</button>
                                    <span className="text-xs text-slate-400">{historyPage + 1} / {totalPages}（共 {reversed.length} 条）</span>
                                    <button onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))} disabled={historyPage >= totalPages - 1} className={`px-3 py-1 text-xs rounded-lg ${historyPage >= totalPages - 1 ? 'text-slate-300' : 'text-primary hover:bg-primary/10'}`}>下一页</button>
                                </div>
                            )}
                            {pageMessages.map(m => (
                                <div key={m.id} onClick={() => onSetHistoryStart(m.id)} className={`p-3 rounded-xl border cursor-pointer text-xs flex gap-2 items-start ${activeCharacter.hideBeforeMessageId === m.id ? 'bg-primary/10 border-primary ring-1 ring-primary' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                                    <span className="text-slate-400 font-mono whitespace-nowrap pt-0.5">[{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-600 mb-0.5">{m.role === 'user' ? '我' : activeCharacter.name}</div>
                                        <div className="text-slate-500 truncate">{m.content}</div>
                                    </div>
                                    {activeCharacter.hideBeforeMessageId === m.id && <span className="text-primary font-bold text-[10px] bg-white px-2 rounded-full border border-primary/20">起点</span>}
                                </div>
                            ))}
                            {reversed.length > HISTORY_PAGE_SIZE && (
                                <div className="flex items-center justify-center px-1 pt-2">
                                    <span className="text-xs text-slate-400">{historyPage + 1} / {totalPages}</span>
                                </div>
                            )}
                        </>);
                    })()}
                </div>
            </Modal>

            <Modal isOpen={modalType === 'message-options'} title="消息操作" onClose={onCloseMessageOptions}>
                <div className="space-y-3">
                    <button onClick={onEnterSelectionMode} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        多选 / 批量删除
                    </button>
                    <button onClick={onReplyMessage} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        引用 / 回复
                    </button>
                    {selectedMessage?.type === 'text' && (
                        <button onClick={onEditMessageStart} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            编辑内容
                        </button>
                    )}
                    {selectedMessage?.type === 'text' && (
                        <button onClick={onCopyMessage} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            复制文字
                        </button>
                    )}
                    {/* Voice: Read Aloud for text messages */}
                    {selectedMessage?.type === 'text' && onReadAloud && (
                        <button onClick={onReadAloud} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            🔊 朗读
                        </button>
                    )}
                    {/* Voice: Convert to text for voice messages */}
                    {selectedMessage?.type === 'voice' && onVoiceToText && (
                        <button onClick={onVoiceToText} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            📝 转文字
                        </button>
                    )}
                    {/* Voice: Download audio for voice messages */}
                    {selectedMessage?.type === 'voice' && selectedMessage?.metadata?.hasAudio && onDownloadVoice && (
                        <button onClick={onDownloadVoice} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            ⬇️ 下载语音
                        </button>
                    )}
                    <button onClick={onDeleteMessage} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                        删除消息
                    </button>
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'delete-emoji'} title="删除表情包" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onDeleteEmoji} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除</button></>}
            >
                <div className="flex flex-col items-center gap-4 py-2">
                    {selectedEmoji && <img src={selectedEmoji.url} className="w-24 h-24 object-contain rounded-xl border" />}
                    <p className="text-center text-sm text-slate-500">确定要删除这个表情包吗？</p>
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'delete-emojis'} title="批量删除表情包" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onDeleteSelectedEmojis} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除 {selectedEmojis.length}</button></>}
            >
                <div className="flex flex-col items-center gap-4 py-2">
                    <div className="grid grid-cols-4 gap-2 w-full max-w-[240px]">
                        {selectedEmojis.slice(0, 8).map(emoji => (
                            <div key={emoji.name} className="aspect-square rounded-xl border border-slate-100 bg-slate-50 p-1.5">
                                <img src={emoji.url} className="w-full h-full object-contain" alt={emoji.name} />
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-slate-500">确定要删除选中的 {selectedEmojis.length} 个表情包吗？</p>
                </div>
            </Modal>

            {/* Delete Category Modal */}
            <Modal
                isOpen={modalType === 'delete-category'} title="删除分类" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onDeleteCategory} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">删除</button></>}
            >
                <div className="py-4 text-center">
                    <p className="text-sm text-slate-600">确定要删除分类 <br /><span className="font-bold">"{selectedCategory?.name}"</span> 吗？</p>
                    <p className="text-[10px] text-red-400 mt-2">注意：分类下的所有表情也将被删除！</p>
                </div>
            </Modal>

            {/* Category Options Modal (shown on long-press) */}
            <Modal isOpen={modalType === 'category-options'} title="分类操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={openVisibilityModal} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        设置可见角色
                    </button>
                    {selectedCategory && !selectedCategory.isSystem && selectedCategory.id !== 'default' && (
                        <button onClick={() => setModalType('delete-category')} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            删除分类
                        </button>
                    )}
                </div>
            </Modal>

            {/* Category Visibility Modal */}
            <Modal
                isOpen={modalType === 'category-visibility'} title={`"${selectedCategory?.name}" 可见角色`} onClose={() => setModalType('none')}
                footer={<button onClick={handleSaveVisibility} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存设置</button>}
            >
                <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                        选择谁可以使用此表情分组。不勾选任何选项表示所有人均可使用。
                    </p>
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar">
                        {/* User (self) option */}
                        <div
                            onClick={() => toggleVisibilityChar('__user__')}
                            className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${visibilitySelection.has('__user__') ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                        >
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${visibilitySelection.has('__user__') ? 'bg-blue-500 border-blue-500' : 'bg-slate-100 border-slate-300'}`}>
                                {visibilitySelection.has('__user__') && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                            </div>
                            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-lg">👤</div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-700">用户（我）</div>
                                <div className="text-[10px] text-slate-400">勾选后可在所有聊天中使用此分组</div>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-2 px-1"><div className="flex-1 h-px bg-slate-100" /><span className="text-[10px] text-slate-300">角色</span><div className="flex-1 h-px bg-slate-100" /></div>

                        {allCharacters.map(c => (
                            <div
                                key={c.id}
                                onClick={() => toggleVisibilityChar(c.id)}
                                className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${visibilitySelection.has(c.id) ? 'bg-primary/5 border-primary/30' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${visibilitySelection.has(c.id) ? 'bg-primary border-primary' : 'bg-slate-100 border-slate-300'}`}>
                                    {visibilitySelection.has(c.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                </div>
                                <img src={c.avatar} className="w-9 h-9 rounded-xl object-cover" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-700">{c.name}</div>
                                    <div className="text-[10px] text-slate-400 truncate">{c.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {visibilitySelection.size > 0 && (
                        <div className="text-[11px] text-center text-slate-500 bg-slate-50 rounded-lg py-2">
                            {visibilitySelection.size === 1 && visibilitySelection.has('__user__')
                                ? <>仅 <span className="font-bold text-blue-500">用户</span> 可发送此分组表情，对方无法使用</>
                                : <>已选 <span className="font-bold text-primary">{visibilitySelection.size}</span> 个可使用此分组</>
                            }
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={modalType === 'edit-message'} title="编辑内容" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={onConfirmEditMessage} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button></>}
            >
                <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed"
                />
            </Modal>
        </>
    );
};

export default ChatModals;
