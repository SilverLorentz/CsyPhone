import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    CheckCircle,
    Disc,
    FloppyDisk,
    Lock,
    Needle,
    PenNib,
    PlayCircle,
    SlidersHorizontal,
    Sparkle,
    VinylRecord,
    Waveform,
} from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { haptic } from '../utils/haptics';
import { DB } from '../utils/db';
import { findCharacterByAnyId } from '../utils/cognitiveNetworkCharacterStats';
import {
    MEMORY_RECORD_MODE_COPY,
    COVER_GRADIENTS,
    checkLyricSingability,
    createRecordId,
    generateLyrics,
    generateStylePrompt,
    optimizeLyrics,
    produceMemoryRecordAudio,
    shouldGenerateMemoryRecordMonologue,
    type MemoryRecordMemoryHeader,
    type SingabilityCheckResult,
    type StylePromptResult,
} from '../utils/memoryRecordService';
import { getMemoryRecordCoverImage } from '../utils/memoryRecordCovers';
import { hasPlayableMemoryRecordAudio, memoryRecordToPlayable } from '../utils/memoryRecordPlayable';
import { shareMemoryRecordPoster } from '../utils/memoryRecordShare';
import type { CharacterProfile, MemoryRecord, MemoryRecordMode, MemoryRecordSongRequest, OptimizationNotes } from '../types';
import { MEMORY_RECORD_STATUS_LABELS } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import MemoryRecordShareModal from '../components/music/MemoryRecordShareModal';

type EchoRecordTab = 'records' | 'studio' | 'mine';

type MemoryRecordFlowStatus =
    | 'idle'
    | 'generating_lyrics'
    | 'lyrics_ready'
    | 'checking_singability'
    | 'singability_checked'
    | 'optimizing_lyrics'
    | 'lyrics_optimized'
    | 'lyrics_confirmed'
    | 'generating_style'
    | 'style_ready'
    | 'generating_song'
    | 'song_ready'
    | 'error';

interface LyricsEditorDraft {
    title: string;
    lyrics: string;
    stylePrompt: string;
    negativeStylePrompt: string;
    revisionInstruction: string;
    lyricistReference: string;
    optimizedLyrics?: string;
    optimizedTitle?: string;
    optimizationNotes?: OptimizationNotes;
}

const TABS: { id: EchoRecordTab; label: string; caption: string }[] = [
    { id: 'records', label: '唱片', caption: 'Records' },
    { id: 'studio', label: '制作', caption: 'Studio' },
    { id: 'mine', label: '我的', caption: 'Archive' },
];

const createEmptySongRequest = (): MemoryRecordSongRequest => ({
    theme: '',
    mood: '',
    style: '',
    perspective: '',
    voicePreference: '',
    extraRequirements: '',
});

const createEmptyLyricsDraft = (): LyricsEditorDraft => ({
    title: '',
    lyrics: '',
    stylePrompt: '',
    negativeStylePrompt: '',
    revisionInstruction: '',
    lyricistReference: '',
});

interface NeedleDropFormDraft {
    version: 1;
    charId: string | null;
    mode: MemoryRecordMode;
    recordReference: string;
    selectedMemoryIds: string[];
    songRequest: MemoryRecordSongRequest;
    updatedAt: number;
}

const NEEDLE_DROP_FORM_DRAFT_KEY = 'echo_record_needle_drop_form_v1';
const ACTIVE_RECORD_DRAFT_KEY = 'echo_record_active_record_id_v1';

const SINGABILITY_SEVERITY_COPY: Record<'low' | 'medium' | 'high', string> = {
    low: '轻微',
    medium: '需要留意',
    high: '重点处理',
};

function isMemoryRecordMode(value: unknown): value is MemoryRecordMode {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEMORY_RECORD_MODE_COPY, value);
}

function sanitizeSongRequest(value: unknown): MemoryRecordSongRequest {
    const source = value && typeof value === 'object' ? value as Partial<MemoryRecordSongRequest> : {};
    return {
        theme: typeof source.theme === 'string' ? source.theme : '',
        mood: typeof source.mood === 'string' ? source.mood : '',
        style: typeof source.style === 'string' ? source.style : '',
        perspective: typeof source.perspective === 'string' ? source.perspective : '',
        voicePreference: typeof source.voicePreference === 'string' ? source.voicePreference : '',
        extraRequirements: typeof source.extraRequirements === 'string' ? source.extraRequirements : '',
    };
}

function readNeedleDropFormDraft(): NeedleDropFormDraft | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(NEEDLE_DROP_FORM_DRAFT_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<NeedleDropFormDraft> | null;
        if (!parsed || parsed.version !== 1) return null;

        return {
            version: 1,
            charId: typeof parsed.charId === 'string' ? parsed.charId : null,
            mode: isMemoryRecordMode(parsed.mode) ? parsed.mode : 'blind_box',
            recordReference: typeof parsed.recordReference === 'string' ? parsed.recordReference : '',
            selectedMemoryIds: Array.isArray(parsed.selectedMemoryIds)
                ? parsed.selectedMemoryIds.filter((id): id is string => typeof id === 'string')
                : [],
            songRequest: sanitizeSongRequest(parsed.songRequest),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        };
    } catch {
        return null;
    }
}

function hasNeedleDropDraftContent(draft: NeedleDropFormDraft): boolean {
    return draft.mode !== 'blind_box'
        || draft.recordReference.trim().length > 0
        || draft.selectedMemoryIds.length > 0
        || Object.values(draft.songRequest).some(value => typeof value === 'string' && value.trim().length > 0);
}

function writeNeedleDropFormDraft(draft: NeedleDropFormDraft): void {
    if (typeof window === 'undefined') return;

    try {
        if (hasNeedleDropDraftContent(draft)) {
            window.localStorage.setItem(NEEDLE_DROP_FORM_DRAFT_KEY, JSON.stringify(draft));
        } else {
            window.localStorage.removeItem(NEEDLE_DROP_FORM_DRAFT_KEY);
        }
    } catch {
        // Ignore storage failures so the studio can keep working in private mode.
    }
}

function clearNeedleDropFormDraft(): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.removeItem(NEEDLE_DROP_FORM_DRAFT_KEY);
    } catch {
        // Ignore storage failures.
    }
}

function readActiveRecordDraftId(): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const value = window.localStorage.getItem(ACTIVE_RECORD_DRAFT_KEY);
        return value && value.trim() ? value : null;
    } catch {
        return null;
    }
}

function writeActiveRecordDraftId(recordId: string): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(ACTIVE_RECORD_DRAFT_KEY, recordId);
    } catch {
        // Ignore storage failures; IndexedDB remains the source of truth.
    }
}

function clearActiveRecordDraftId(): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.removeItem(ACTIVE_RECORD_DRAFT_KEY);
    } catch {
        // Ignore storage failures.
    }
}

function normalizeSongRequest(request: MemoryRecordSongRequest): MemoryRecordSongRequest {
    return {
        theme: request.theme.trim(),
        mood: request.mood.trim(),
        style: request.style.trim(),
        perspective: request.perspective.trim(),
        voicePreference: request.voicePreference?.trim() || undefined,
        extraRequirements: request.extraRequirements?.trim() || undefined,
    };
}

function formatRecordDate(timestamp: number): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '时间待确认';
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function inferFlowStatus(record: MemoryRecord): MemoryRecordFlowStatus {
    if (record.status === 'ready') return 'song_ready';
    if (record.stylePrompt || record.musicPrompt) return 'style_ready';
    if (record.lyricsConfirmedAt) return 'lyrics_confirmed';
    if (record.lyrics) return 'lyrics_ready';
    if (record.error) return 'error';
    return 'idle';
}

function getRecordStatusLabel(record: MemoryRecord): string {
    return MEMORY_RECORD_STATUS_LABELS[record.status] || record.status;
}

function getRecordTone(record: MemoryRecord): { ring: string; glow: string; chip: string; text: string } {
    if (record.status === 'ready') {
        return {
            ring: 'border-[#a8d5ba]/36',
            glow: 'from-[#a8d5ba]/20',
            chip: 'border-[#a8d5ba]/28 bg-[#a8d5ba]/10 text-[#bfe5cc]',
            text: 'text-[#bfe5cc]',
        };
    }
    if (record.error || record.status === 'failed') {
        return {
            ring: 'border-[#d99aae]/36',
            glow: 'from-[#d99aae]/20',
            chip: 'border-[#d99aae]/28 bg-[#d99aae]/10 text-[#ffd0d8]',
            text: 'text-[#ffd0d8]',
        };
    }
    return {
        ring: 'border-[#f2d290]/32',
        glow: 'from-[#f2d290]/18',
        chip: 'border-[#f2d290]/24 bg-[#f2d290]/10 text-[#f8dc9f]',
        text: 'text-[#f8dc9f]',
    };
}

interface RecordCardProps {
    record: MemoryRecord;
    compact?: boolean;
    disabled?: boolean;
    onDelete: (record: MemoryRecord) => void;
    onEdit: (record: MemoryRecord) => void;
    onPlay: (record: MemoryRecord) => void;
    onRetry: (record: MemoryRecord) => void;
    onShare: (record: MemoryRecord) => void;
}

const EmptyState: React.FC<{ title: string; text: string }> = ({ title, text }) => (
    <div className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#111017]/72 px-5 py-8 text-center shadow-[0_18px_44px_rgba(0,0,0,0.26)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(242,210,144,0.10),transparent_34%,rgba(139,184,241,0.07))]" />
        <div className="pointer-events-none absolute left-1/2 top-4 h-24 w-24 -translate-x-1/2 rounded-full border border-[#f2d290]/12" />
        <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#f2d290]/22 bg-black/24 shadow-[0_0_28px_rgba(242,210,144,0.08)_inset]">
            <span className="h-3 w-3 rounded-full border border-[#f2d290]/32 bg-[#f2d290]/12" />
        </div>
        <div className="relative text-[14px] font-semibold tracking-[0.08em] text-[#fff1bd]">{title}</div>
        <div className="relative mx-auto mt-2 max-w-[26rem] text-[11px] leading-relaxed text-white/44">{text}</div>
    </div>
);

const RecordCard: React.FC<RecordCardProps> = ({
    record,
    compact = false,
    disabled = false,
    onDelete,
    onEdit,
    onPlay,
    onRetry,
    onShare,
}) => {
    const playable = hasPlayableMemoryRecordAudio(record);
    const coverImage = getMemoryRecordCoverImage(record);
    const canPreview = shouldGenerateMemoryRecordMonologue(record.mode) && Boolean(record.monologueAudioId);
    const tone = getRecordTone(record);

    return (
        <article className="group relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#111017]/82 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.28)] transition-transform duration-300 active:scale-[0.992]">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.glow} via-transparent to-[#8bb8f1]/[0.08] opacity-70`} />
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/38 to-transparent" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/[0.035]" />

            <div className="relative flex items-start gap-3.5">
                <div className="relative h-[76px] w-[76px] shrink-0">
                    <div className={`absolute -right-2 top-2 h-[58px] w-[58px] rounded-full border ${tone.ring} bg-[radial-gradient(circle_at_center,#110f14_0_18%,#d8c18d_19%_21%,#211a1b_22%_58%,#08070b_59%_100%)] shadow-[0_12px_28px_rgba(0,0,0,0.34)] transition-transform duration-500 group-hover:rotate-12`} />
                    <div
                        className={`relative h-[70px] w-[70px] overflow-hidden rounded-[14px] border ${tone.ring} shadow-[0_16px_30px_rgba(0,0,0,0.34)]`}
                        style={coverImage ? undefined : { background: record.coverGradient }}
                    >
                        {coverImage ? <img src={coverImage} alt="" className="h-full w-full object-cover" /> : null}
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.20),transparent_38%,rgba(0,0,0,0.22))]" />
                    </div>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="truncate text-[15px] font-semibold tracking-[0.04em] text-[#fff1bd]">{record.title || '未命名唱片'}</div>
                            <div className={`mt-1 text-[9px] font-bold uppercase tracking-[0.22em] ${tone.text}`}>Echo pressing</div>
                        </div>
                        <div className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.08em] ${tone.chip}`}>
                            {getRecordStatusLabel(record)}
                        </div>
                    </div>
                    <div className="mt-2 truncate text-[10px] text-white/44">
                        {record.charName} · {MEMORY_RECORD_MODE_COPY[record.mode].label} · {formatRecordDate(record.updatedAt || record.createdAt)}
                    </div>
                    {canPreview ? <div className="mt-1 text-[10px] text-white/32">含独白音轨</div> : null}
                </div>
            </div>

            {!compact && record.error ? (
                <details className="relative mt-3 rounded-[12px] border border-[#d99aae]/18 bg-[#d99aae]/[0.055] px-3 py-2">
                    <summary className="cursor-pointer select-none text-[10px] font-semibold text-[#ffd0d8]/82 outline-none">
                        生成记录
                    </summary>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-[10px] bg-black/24 p-2 text-[9px] leading-relaxed text-[#ffe1e7]/78">
                        {record.error}
                    </pre>
                </details>
            ) : null}

            <div className="relative mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => onEdit(record)} className="rounded-[10px] border border-[#f2d290]/24 bg-[#f2d290]/[0.05] px-3 py-1.5 text-[10px] font-semibold text-[#fff1bd] active:scale-[0.97]">
                    继续编辑
                </button>
                <button type="button" disabled={!playable} onClick={() => onPlay(record)} className="rounded-[10px] border border-[#a8d5ba]/28 bg-[#a8d5ba]/[0.06] px-3 py-1.5 text-[10px] font-semibold text-[#bfe5cc] active:scale-[0.97] disabled:opacity-35">
                    播放
                </button>
                <button type="button" disabled={!playable} onClick={() => onShare(record)} className="rounded-[10px] border border-[#8bb8f1]/28 bg-[#8bb8f1]/[0.06] px-3 py-1.5 text-[10px] font-semibold text-[#cfe0ff] active:scale-[0.97] disabled:opacity-35">
                    分享
                </button>
                <button type="button" disabled={disabled} onClick={() => onRetry(record)} className="rounded-[10px] bg-[#f2d290] px-3 py-1.5 text-[10px] font-bold text-[#241814] shadow-[0_8px_20px_rgba(242,210,144,0.16)] active:scale-[0.97] disabled:opacity-45">
                    重压
                </button>
                <button type="button" disabled={disabled} onClick={() => onDelete(record)} className="rounded-[10px] border border-[#d99aae]/32 bg-[#d99aae]/[0.045] px-3 py-1.5 text-[10px] font-semibold text-[#ffd0d8] active:scale-[0.97] disabled:opacity-40">
                    删除
                </button>
            </div>
        </article>
    );
};

const EchoRecordApp: React.FC = () => {
    const { closeApp, addToast, characters, userProfile, apiConfig, ttsConfig } = useOS();
    const { playSong } = useAudioPlayer();
    const initialNeedleDropDraft = useMemo(() => readNeedleDropFormDraft(), []);
    const initialActiveRecordDraftId = useMemo(() => readActiveRecordDraftId(), []);
    const restoredActiveRecordDraftRef = useRef(false);
    const [activeTab, setActiveTab] = useState<EchoRecordTab>('records');
    const [records, setRecords] = useState<MemoryRecord[]>([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [recordsHydrated, setRecordsHydrated] = useState(false);
    const [selectedCharId, setSelectedCharId] = useState<string | null>(() => initialNeedleDropDraft?.charId || characters[0]?.id || null);
    const [recordMode, setRecordMode] = useState<MemoryRecordMode>(() => initialNeedleDropDraft?.mode || 'blind_box');
    const [recordReference, setRecordReference] = useState(() => initialNeedleDropDraft?.recordReference || '');
    const [selectedRecordMemoryIds, setSelectedRecordMemoryIds] = useState<string[]>(() => initialNeedleDropDraft?.selectedMemoryIds || []);
    const [recordMemoryOptions, setRecordMemoryOptions] = useState<MemoryRecordMemoryHeader[]>([]);
    const [recordMemoryOptionsLoading, setRecordMemoryOptionsLoading] = useState(false);
    const [recordMemoryOptionsError, setRecordMemoryOptionsError] = useState('');
    const [recordGenerating, setRecordGenerating] = useState(false);
    const [recordStatusText, setRecordStatusText] = useState('');
    const [recordFlowStatus, setRecordFlowStatus] = useState<MemoryRecordFlowStatus>('idle');
    const [recordSongRequest, setRecordSongRequest] = useState<MemoryRecordSongRequest>(() => initialNeedleDropDraft?.songRequest || createEmptySongRequest());
    const [activeDraftRecordId, setActiveDraftRecordId] = useState<string | null>(() => initialActiveRecordDraftId);
    const [suppressedAutoResumeCharId, setSuppressedAutoResumeCharId] = useState<string | null>(() => initialNeedleDropDraft?.charId || null);
    const [lyricsDraft, setLyricsDraft] = useState<LyricsEditorDraft>(() => createEmptyLyricsDraft());
    const lyricsDraftRef = useRef<LyricsEditorDraft>(lyricsDraft);
    const [recordFlowError, setRecordFlowError] = useState('');
    const [singabilityResult, setSingabilityResult] = useState<SingabilityCheckResult | null>(null);
    const [stylePromptResult, setStylePromptResult] = useState<StylePromptResult | null>(null);
    const [showOptimizedLyrics, setShowOptimizedLyrics] = useState(false);
    const [shareModalPlayable, setShareModalPlayable] = useState<MemoryRecordPlayable | null>(null);
    const [isSharingMemoryRecord, setIsSharingMemoryRecord] = useState(false);
    const monologuePreviewRef = useRef<HTMLAudioElement | null>(null);
    const monologuePreviewUrlRef = useRef<string | null>(null);

    const selectedChar = useMemo(
        () => findCharacterByAnyId(characters, selectedCharId),
        [characters, selectedCharId],
    );

    const activeDraftRecord = useMemo(
        () => activeDraftRecordId ? records.find(record => record.id === activeDraftRecordId) || null : null,
        [activeDraftRecordId, records],
    );

    const playableRecords = useMemo(
        () => records.filter(hasPlayableMemoryRecordAudio),
        [records],
    );

    const workbenchRecords = useMemo(
        () => records.filter(record => record.status !== 'ready' || Boolean(record.error)).slice(0, 16),
        [records],
    );

    const recentRecords = useMemo(
        () => records.slice(0, 8),
        [records],
    );

    const failedRecords = useMemo(
        () => records.filter(record => Boolean(record.error) || record.status === 'failed'),
        [records],
    );

    useEffect(() => {
        lyricsDraftRef.current = lyricsDraft;
    }, [lyricsDraft]);

    const refreshRecords = useCallback(async () => {
        setRecordsLoading(true);
        try {
            const nextRecords = await DB.getMemoryRecords();
            setRecords(nextRecords);
        } catch (error) {
            addToast(error instanceof Error ? `唱片载入失败: ${error.message}` : '唱片载入失败', 'error');
        } finally {
            setRecordsHydrated(true);
            setRecordsLoading(false);
        }
    }, [addToast]);

    const upsertMemoryRecord = useCallback((record: MemoryRecord) => {
        setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)].sort((a, b) => b.createdAt - a.createdAt));
    }, []);

    const persistMemoryRecord = useCallback(async (record: MemoryRecord): Promise<MemoryRecord> => {
        await DB.saveMemoryRecord(record);
        upsertMemoryRecord(record);
        return record;
    }, [upsertMemoryRecord]);

    useEffect(() => {
        void refreshRecords();
        window.addEventListener('focus', refreshRecords);
        return () => window.removeEventListener('focus', refreshRecords);
    }, [refreshRecords]);

    useEffect(() => {
        if (characters.length === 0) {
            setSelectedCharId(null);
            return;
        }
        if (!selectedChar) {
            setSelectedCharId(characters[0].id);
        }
    }, [characters, selectedChar]);

    const loadRecordIntoLyricsEditor = useCallback((record: MemoryRecord, status: MemoryRecordFlowStatus = inferFlowStatus(record), switchToStudio = true) => {
        setSuppressedAutoResumeCharId(null);
        clearNeedleDropFormDraft();
        writeActiveRecordDraftId(record.id);
        setSelectedCharId(record.charId);
        setRecordMode(record.mode);
        setRecordReference(record.inspirationReference || '');
        setSelectedRecordMemoryIds(record.selectedMemoryIds || []);
        setActiveDraftRecordId(record.id);
        const nextLyricsDraft = {
            title: record.title,
            lyrics: record.lyrics,
            stylePrompt: record.stylePrompt || record.musicPrompt || '',
            negativeStylePrompt: record.negativeStylePrompt || '',
            revisionInstruction: '',
            lyricistReference: '',
        };
        lyricsDraftRef.current = nextLyricsDraft;
        setLyricsDraft(nextLyricsDraft);
        setRecordSongRequest({
            ...createEmptySongRequest(),
            ...(record.songRequest || {}),
        });
        setSingabilityResult(record.singabilityCheck ? {
            score: record.singabilityCheck.score,
            summary: record.singabilityCheck.summary,
            shouldOptimize: record.singabilityCheck.should_optimize,
            issues: record.singabilityCheck.issues,
        } : null);
        if (record.musicDirectorNotes && (record.stylePrompt || record.musicPrompt)) {
            setStylePromptResult({
                musicDirectorNotes: record.musicDirectorNotes,
                stylePrompt: record.stylePrompt || record.musicPrompt || '',
                negativeStylePrompt: record.negativeStylePrompt || '',
            });
        } else {
            setStylePromptResult(null);
        }
        setShowOptimizedLyrics(false);
        setRecordFlowError(record.error || '');
        setRecordFlowStatus(status);
        if (switchToStudio) setActiveTab('studio');
        haptic.light();
    }, []);

    useEffect(() => {
        if (restoredActiveRecordDraftRef.current || !recordsHydrated || !initialActiveRecordDraftId) return;

        restoredActiveRecordDraftRef.current = true;
        const record = records.find(item => item.id === initialActiveRecordDraftId);
        if (record) {
            loadRecordIntoLyricsEditor(record, inferFlowStatus(record), true);
        } else {
            clearActiveRecordDraftId();
            setActiveDraftRecordId(null);
        }
    }, [initialActiveRecordDraftId, loadRecordIntoLyricsEditor, records, recordsHydrated]);

    useEffect(() => {
        if (!recordsHydrated) return;

        if (!selectedCharId) {
            clearActiveRecordDraftId();
            setActiveDraftRecordId(null);
            setLyricsDraft(createEmptyLyricsDraft());
            setRecordSongRequest(createEmptySongRequest());
            setRecordFlowStatus('idle');
            setRecordFlowError('');
            return;
        }

        const currentDraft = activeDraftRecordId ? records.find(record => record.id === activeDraftRecordId) : null;
        if (currentDraft) {
            if (currentDraft.charId !== selectedCharId) {
                setSelectedCharId(currentDraft.charId);
            }
            return;
        }
        if (activeDraftRecordId && !currentDraft) {
            clearActiveRecordDraftId();
        }

        if (suppressedAutoResumeCharId === selectedCharId) {
            clearActiveRecordDraftId();
            setActiveDraftRecordId(null);
            setLyricsDraft(createEmptyLyricsDraft());
            setRecordFlowStatus('idle');
            setRecordFlowError('');
            setSingabilityResult(null);
            setStylePromptResult(null);
            setShowOptimizedLyrics(false);
            return;
        }

        const latestDraft = records.find(record => (
            record.charId === selectedCharId
            && record.status === 'draft'
            && !record.musicAudioId
        ));

        if (latestDraft) {
            loadRecordIntoLyricsEditor(latestDraft, inferFlowStatus(latestDraft), false);
        } else {
            clearActiveRecordDraftId();
            setActiveDraftRecordId(null);
            setLyricsDraft(createEmptyLyricsDraft());
            setRecordSongRequest(createEmptySongRequest());
            setRecordFlowStatus('idle');
            setRecordFlowError('');
            setSingabilityResult(null);
            setStylePromptResult(null);
            setShowOptimizedLyrics(false);
        }
    }, [activeDraftRecordId, loadRecordIntoLyricsEditor, records, recordsHydrated, selectedCharId, suppressedAutoResumeCharId]);

    useEffect(() => {
        if (!recordsHydrated || activeDraftRecord || activeDraftRecordId) return;

        writeNeedleDropFormDraft({
            version: 1,
            charId: selectedCharId,
            mode: recordMode,
            recordReference,
            selectedMemoryIds: selectedRecordMemoryIds,
            songRequest: recordSongRequest,
            updatedAt: Date.now(),
        });
    }, [activeDraftRecord, activeDraftRecordId, recordMode, recordReference, recordSongRequest, recordsHydrated, selectedCharId, selectedRecordMemoryIds]);

    useEffect(() => {
        setSelectedRecordMemoryIds([]);
        setRecordMemoryOptions([]);
        setRecordMemoryOptionsError('');
    }, [selectedCharId, recordMode]);

    useEffect(() => {
        if (recordMode !== 'selected_memory' || !selectedChar) {
            setRecordMemoryOptionsLoading(false);
            return;
        }

        let alive = true;
        setRecordMemoryOptionsLoading(true);
        setRecordMemoryOptionsError('');

        DB.getVectorMemoryHeaders(selectedChar.id)
            .then((headers) => {
                if (!alive) return;
                setRecordMemoryOptions(headers
                    .filter(memory => !memory.deprecated)
                    .sort((a, b) => (b.lastMentioned || b.createdAt || 0) - (a.lastMentioned || a.createdAt || 0)));
            })
            .catch((error) => {
                if (!alive) return;
                setRecordMemoryOptions([]);
                setRecordMemoryOptionsError(error instanceof Error ? error.message : '读取记忆失败');
            })
            .finally(() => {
                if (alive) setRecordMemoryOptionsLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [recordMode, selectedChar]);

    const stopMonologuePreview = useCallback(() => {
        if (monologuePreviewRef.current) {
            monologuePreviewRef.current.pause();
            monologuePreviewRef.current = null;
        }
        if (monologuePreviewUrlRef.current) {
            URL.revokeObjectURL(monologuePreviewUrlRef.current);
            monologuePreviewUrlRef.current = null;
        }
    }, []);

    useEffect(() => stopMonologuePreview, [stopMonologuePreview]);

    const toggleRecordMemorySeed = useCallback((memoryId: string) => {
        setSelectedRecordMemoryIds(previous => (
            previous.includes(memoryId)
                ? previous.filter(id => id !== memoryId)
                : [...previous, memoryId].slice(0, 8)
        ));
        haptic.light();
    }, []);

    const playMemoryRecord = useCallback((record: MemoryRecord, queue?: MemoryRecord[]) => {
        if (!hasPlayableMemoryRecordAudio(record)) {
            addToast(record.monologueAudioId ? '独白已经生成，歌曲分轨还没回来，先重压一次' : '这张还停在内页里，先继续制作', 'info');
            return;
        }

        const playable = memoryRecordToPlayable(record);
        const playableQueue = (queue || [record])
            .filter(hasPlayableMemoryRecordAudio)
            .map(memoryRecordToPlayable);
        void playSong(playable, playableQueue.length > 0 ? playableQueue : [playable]);
        addToast('已放进 Emo Cloud', 'success');
    }, [addToast, playSong]);

    const openMemoryRecordShare = useCallback((record: MemoryRecord) => {
        if (!hasPlayableMemoryRecordAudio(record)) {
            addToast('这首歌还没有可分享的音频', 'info');
            return;
        }

        setShareModalPlayable(memoryRecordToPlayable(record));
        haptic.light();
    }, [addToast]);

    const handleShareMemoryRecordPoster = useCallback(async (playable: MemoryRecordPlayable) => {
        setIsSharingMemoryRecord(true);
        try {
            const result = await shareMemoryRecordPoster(playable);
            setShareModalPlayable(null);
            addToast(result.method === 'download' ? '分享海报已下载' : '已打开系统分享', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : '分享失败', 'error');
        } finally {
            setIsSharingMemoryRecord(false);
        }
    }, [addToast]);

    const saveActiveLyricsSnapshot = useCallback(async (): Promise<MemoryRecord> => {
        if (!activeDraftRecord) throw new Error('还没有可确认的歌词草稿');

        const next: MemoryRecord = {
            ...activeDraftRecord,
            title: lyricsDraft.title.trim(),
            lyrics: lyricsDraft.lyrics.trim(),
            musicPrompt: lyricsDraft.stylePrompt.trim() || activeDraftRecord.musicPrompt,
            stylePrompt: lyricsDraft.stylePrompt.trim() || undefined,
            negativeStylePrompt: lyricsDraft.negativeStylePrompt.trim() || undefined,
            songRequest: normalizeSongRequest(recordSongRequest),
            updatedAt: Date.now(),
        };
        return persistMemoryRecord(next);
    }, [activeDraftRecord, lyricsDraft.lyrics, lyricsDraft.negativeStylePrompt, lyricsDraft.stylePrompt, lyricsDraft.title, persistMemoryRecord, recordSongRequest]);

    const handleLyricsFieldChange = useCallback((field: keyof Pick<LyricsEditorDraft, 'title' | 'stylePrompt' | 'negativeStylePrompt' | 'lyrics' | 'revisionInstruction' | 'lyricistReference'>, value: string) => {
        const nextDraft = { ...lyricsDraftRef.current, [field]: value };
        lyricsDraftRef.current = nextDraft;
        setLyricsDraft(nextDraft);
        if (!activeDraftRecord || field === 'revisionInstruction' || field === 'lyricistReference') return;

        const next: MemoryRecord = {
            ...activeDraftRecord,
            title: nextDraft.title,
            lyrics: nextDraft.lyrics,
            musicPrompt: nextDraft.stylePrompt,
            stylePrompt: nextDraft.stylePrompt || undefined,
            negativeStylePrompt: nextDraft.negativeStylePrompt || undefined,
            musicDirectorNotes: stylePromptResult?.musicDirectorNotes || activeDraftRecord.musicDirectorNotes,
            songRequest: normalizeSongRequest(recordSongRequest),
            updatedAt: Date.now(),
        };
        upsertMemoryRecord(next);
        void DB.saveMemoryRecord(next).catch((error) => {
            addToast(error instanceof Error ? `歌词草稿保存失败: ${error.message}` : '歌词草稿保存失败', 'error');
        });
    }, [activeDraftRecord, addToast, recordSongRequest, stylePromptResult, upsertMemoryRecord]);

    const handleSongRequestChange = useCallback((field: keyof MemoryRecordSongRequest, value: string) => {
        setRecordSongRequest(previous => {
            const nextRequest = { ...previous, [field]: value };
            if (activeDraftRecord) {
                const draft = lyricsDraftRef.current;
                const nextRecord: MemoryRecord = {
                    ...activeDraftRecord,
                    title: draft.title,
                    lyrics: draft.lyrics,
                    musicPrompt: draft.stylePrompt,
                    stylePrompt: draft.stylePrompt || undefined,
                    negativeStylePrompt: draft.negativeStylePrompt || undefined,
                    musicDirectorNotes: stylePromptResult?.musicDirectorNotes || activeDraftRecord.musicDirectorNotes,
                    songRequest: normalizeSongRequest(nextRequest),
                    updatedAt: Date.now(),
                };
                upsertMemoryRecord(nextRecord);
                void DB.saveMemoryRecord(nextRecord).catch((error) => {
                    addToast(error instanceof Error ? `写歌需求保存失败: ${error.message}` : '写歌需求保存失败', 'error');
                });
            }
            return nextRequest;
        });
    }, [activeDraftRecord, addToast, stylePromptResult, upsertMemoryRecord]);

    const removeGeneratedMusicArtifacts = useCallback(async (record: MemoryRecord): Promise<void> => {
        const ids = [record.musicAudioId, record.masterAudioId].filter((id): id is string => Boolean(id));
        await Promise.all(ids.map(id => DB.deleteMemoryRecordAudio(id)));
    }, []);

    const handleCreateMemoryRecord = useCallback(async () => {
        if (!selectedChar) {
            addToast('先选一个人，回声唱片才知道要为谁落针', 'info');
            return;
        }
        if (!recordSongRequest.theme.trim()) {
            addToast('先写一个歌曲主题', 'info');
            return;
        }
        if (recordMode === 'selected_memory' && selectedRecordMemoryIds.length === 0) {
            addToast('亲手封存要先挑至少一段记忆', 'info');
            return;
        }

        setRecordGenerating(true);
        setRecordFlowStatus('generating_lyrics');
        setRecordFlowError('');
        setRecordStatusText('正在生成歌词...');
        setSingabilityResult(null);
        setStylePromptResult(null);
        setShowOptimizedLyrics(false);
        setSuppressedAutoResumeCharId(selectedChar.id);
        writeNeedleDropFormDraft({
            version: 1,
            charId: selectedChar.id,
            mode: recordMode,
            recordReference,
            selectedMemoryIds: selectedRecordMemoryIds,
            songRequest: recordSongRequest,
            updatedAt: Date.now(),
        });

        try {
            const memoryHeaders = await DB.getVectorMemoryHeaders(selectedChar.id);
            const result = await generateLyrics({
                char: selectedChar,
                userProfile,
                mode: recordMode,
                memories: memoryHeaders,
                apiConfig,
                selectedMemoryIds: recordMode === 'selected_memory' ? selectedRecordMemoryIds : undefined,
                inspirationReference: recordReference,
                songRequest: normalizeSongRequest(recordSongRequest),
                contextBudget: 'expanded',
            });

            const now = Date.now();
            const recordId = createRecordId();
            const draft: MemoryRecord = {
                id: recordId,
                charId: selectedChar.id,
                charName: selectedChar.name,
                userName: userProfile.name || '你',
                mode: recordMode,
                status: 'draft',
                title: result.title,
                albumName: '回声唱片',
                artistName: selectedChar.name,
                monologueText: '',
                lyrics: result.lyrics,
                musicPrompt: '',
                lyricIntent: result.lyricIntent,
                songRequest: normalizeSongRequest(recordSongRequest),
                inspirationReference: recordReference.trim() || undefined,
                coverGradient: COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)],
                seedMemoryIds: [],
                selectedMemoryIds: recordMode === 'selected_memory' ? selectedRecordMemoryIds.slice() : undefined,
                createdAt: now,
                updatedAt: now,
            };

            await persistMemoryRecord(draft);
            const nextDraft = {
                title: result.title,
                lyrics: result.lyrics,
                stylePrompt: '',
                negativeStylePrompt: '',
                revisionInstruction: '',
                lyricistReference: '',
            };
            lyricsDraftRef.current = nextDraft;
            setLyricsDraft(nextDraft);
            setActiveDraftRecordId(recordId);
            writeActiveRecordDraftId(recordId);
            setSuppressedAutoResumeCharId(null);
            clearNeedleDropFormDraft();
            setRecordFlowStatus('lyrics_ready');
            addToast('歌词已生成，可以继续打磨', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '歌词生成失败';
            setSuppressedAutoResumeCharId(selectedChar.id);
            setRecordFlowStatus('error');
            setRecordFlowError(message);
            addToast(`歌词生成失败: ${message}`, 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [addToast, apiConfig, persistMemoryRecord, recordMode, recordReference, recordSongRequest, selectedChar, selectedRecordMemoryIds, userProfile]);

    const handleCheckSingability = useCallback(async () => {
        if (!activeDraftRecord || !lyricsDraft.lyrics.trim()) {
            addToast('先生成歌词再检查可唱性', 'info');
            return;
        }

        setRecordGenerating(true);
        setRecordFlowStatus('checking_singability');
        setRecordFlowError('');
        setRecordStatusText('正在检查歌词可唱性...');

        try {
            const result = await checkLyricSingability(
                lyricsDraft.title || activeDraftRecord.title,
                lyricsDraft.lyrics,
                apiConfig,
            );
            setSingabilityResult(result);
            setRecordFlowStatus('singability_checked');
            await persistMemoryRecord({
                ...activeDraftRecord,
                singabilityCheck: {
                    score: result.score,
                    summary: result.summary,
                    should_optimize: result.shouldOptimize,
                    issues: result.issues,
                },
                updatedAt: Date.now(),
            });
            addToast(result.shouldOptimize ? `可唱性评分 ${result.score}/100` : `可唱性评分 ${result.score}/100，结构良好`, result.shouldOptimize ? 'info' : 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '可唱性检查失败';
            setRecordFlowError(message);
            addToast(`可唱性检查失败: ${message}`, 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [activeDraftRecord, addToast, apiConfig, lyricsDraft.lyrics, lyricsDraft.title, persistMemoryRecord]);

    const handleOptimizeLyrics = useCallback(async () => {
        if (!activeDraftRecord || !lyricsDraft.lyrics.trim()) {
            addToast('先生成歌词再优化', 'info');
            return;
        }

        setRecordGenerating(true);
        setRecordFlowStatus('optimizing_lyrics');
        setRecordFlowError('');
        setRecordStatusText('正在优化歌词...');

        try {
            const current = await saveActiveLyricsSnapshot();
            const result = await optimizeLyrics(
                lyricsDraft.title || current.title,
                lyricsDraft.lyrics,
                apiConfig,
                {
                    singabilityReport: singabilityResult,
                    userInstruction: lyricsDraft.revisionInstruction,
                    songRequest: normalizeSongRequest(recordSongRequest),
                    lyricistReference: lyricsDraft.lyricistReference,
                },
            );

            const nextDraft = {
                ...lyricsDraftRef.current,
                optimizedTitle: result.title,
                optimizedLyrics: result.lyrics,
                optimizationNotes: result.optimizationNotes,
            };
            lyricsDraftRef.current = nextDraft;
            setLyricsDraft(nextDraft);
            setShowOptimizedLyrics(true);
            setRecordFlowStatus('lyrics_optimized');
            await persistMemoryRecord({
                ...current,
                optimizationNotes: result.optimizationNotes,
                updatedAt: Date.now(),
            });
            addToast('歌词已优化', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '歌词优化失败';
            setRecordFlowError(message);
            addToast(`歌词优化失败: ${message}`, 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [activeDraftRecord, addToast, apiConfig, lyricsDraft, persistMemoryRecord, recordSongRequest, saveActiveLyricsSnapshot, singabilityResult]);

    const handleAdoptOptimizedLyrics = useCallback(() => {
        if (!lyricsDraft.optimizedLyrics) return;
        const nextDraft = {
            ...lyricsDraftRef.current,
            title: lyricsDraftRef.current.optimizedTitle || lyricsDraftRef.current.title,
            lyrics: lyricsDraftRef.current.optimizedLyrics || lyricsDraftRef.current.lyrics,
            optimizedLyrics: undefined,
            optimizedTitle: undefined,
            revisionInstruction: '',
        };
        lyricsDraftRef.current = nextDraft;
        setLyricsDraft(nextDraft);
        setShowOptimizedLyrics(false);
        setRecordFlowStatus('lyrics_ready');
        addToast('已采用优化版歌词', 'success');
    }, [addToast, lyricsDraft.optimizedLyrics]);

    const handleConfirmLyricsFinal = useCallback(async () => {
        if (!activeDraftRecord) {
            addToast('先生成歌词草稿', 'info');
            return;
        }
        if (!lyricsDraft.title.trim() || !lyricsDraft.lyrics.trim()) {
            addToast('歌名和歌词都不能为空', 'info');
            return;
        }

        try {
            const current = await saveActiveLyricsSnapshot();
            await persistMemoryRecord({
                ...current,
                lyricsConfirmedAt: Date.now(),
                updatedAt: Date.now(),
            });
            setRecordFlowStatus('lyrics_confirmed');
            addToast('歌词已定稿', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败';
            setRecordFlowError(message);
            addToast(`保存失败: ${message}`, 'error');
        }
    }, [activeDraftRecord, addToast, lyricsDraft.lyrics, lyricsDraft.title, persistMemoryRecord, saveActiveLyricsSnapshot]);

    const handleGenerateStylePrompt = useCallback(async () => {
        if (!activeDraftRecord || !lyricsDraft.lyrics.trim()) {
            addToast('先确认歌词定稿', 'info');
            return;
        }

        setRecordGenerating(true);
        setRecordFlowStatus('generating_style');
        setRecordFlowError('');
        setRecordStatusText('正在生成曲风方案...');

        try {
            const current = await saveActiveLyricsSnapshot();
            const result = await generateStylePrompt(
                lyricsDraft.lyrics,
                lyricsDraft.title || current.title,
                apiConfig,
                {
                    lyricIntent: current.lyricIntent,
                    songRequest: normalizeSongRequest(recordSongRequest),
                },
            );

            setStylePromptResult(result);
            const nextDraft = {
                ...lyricsDraftRef.current,
                stylePrompt: result.stylePrompt,
                negativeStylePrompt: result.negativeStylePrompt,
            };
            lyricsDraftRef.current = nextDraft;
            setLyricsDraft(nextDraft);
            setRecordFlowStatus('style_ready');
            await persistMemoryRecord({
                ...current,
                stylePrompt: result.stylePrompt,
                negativeStylePrompt: result.negativeStylePrompt,
                musicPrompt: result.stylePrompt,
                musicDirectorNotes: result.musicDirectorNotes,
                updatedAt: Date.now(),
            });
            addToast('曲风提示词已生成', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : '曲风生成失败';
            setRecordFlowError(message);
            addToast(`曲风生成失败: ${message}`, 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [activeDraftRecord, addToast, apiConfig, lyricsDraft.lyrics, lyricsDraft.title, persistMemoryRecord, recordSongRequest, saveActiveLyricsSnapshot]);

    const handleConfirmLyricsAndGenerateSong = useCallback(async () => {
        const sourceChar = activeDraftRecord ? findCharacterByAnyId(characters, activeDraftRecord.charId) : selectedChar;
        if (!sourceChar) {
            addToast('没有找到这张唱片的角色', 'error');
            return;
        }
        if (!activeDraftRecord) {
            addToast('先生成并确认歌词草稿', 'info');
            return;
        }
        if (!lyricsDraft.title.trim() || !lyricsDraft.lyrics.trim()) {
            addToast('歌名和歌词都不能为空', 'info');
            return;
        }
        if (!lyricsDraft.stylePrompt.trim()) {
            addToast('请先生成曲风提示词', 'info');
            return;
        }

        setRecordGenerating(true);
        setRecordFlowStatus('lyrics_confirmed');
        setRecordFlowError('');
        setRecordStatusText('正在准备谱曲...');

        try {
            const current = await saveActiveLyricsSnapshot();
            await removeGeneratedMusicArtifacts(current);
            const confirmed: MemoryRecord = {
                ...current,
                status: 'draft',
                lyricsConfirmedAt: Date.now(),
                musicAudioId: undefined,
                masterAudioId: undefined,
                model: undefined,
                fallbackUsed: undefined,
                durationMs: undefined,
                error: undefined,
                updatedAt: Date.now(),
            };
            await persistMemoryRecord(confirmed);

            setRecordFlowStatus('generating_song');
            setRecordStatusText('正在压制唱片...');
            const finalRecord = await produceMemoryRecordAudio({
                record: confirmed,
                char: sourceChar,
                ttsConfig,
                onRecordUpdate: (next) => {
                    upsertMemoryRecord(next);
                    setRecordStatusText(getRecordStatusLabel(next));
                },
            });

            upsertMemoryRecord(finalRecord);
            loadRecordIntoLyricsEditor(finalRecord, finalRecord.status === 'ready' ? 'song_ready' : 'error');
            if (finalRecord.status === 'ready') {
                addToast('这张唱片已经压好', 'success');
                playMemoryRecord(finalRecord, playableRecords);
            } else if (finalRecord.error) {
                setRecordFlowError(finalRecord.error);
                addToast(`生成歌曲失败: ${finalRecord.error}`, 'error');
            } else {
                addToast('这张还没压完，内页和分轨都替你留着', 'info');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '生成歌曲失败';
            setRecordFlowStatus('error');
            setRecordFlowError(message);
            addToast(`生成歌曲失败: ${message}`, 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [activeDraftRecord, addToast, characters, loadRecordIntoLyricsEditor, lyricsDraft.lyrics, lyricsDraft.stylePrompt, lyricsDraft.title, persistMemoryRecord, playMemoryRecord, playableRecords, removeGeneratedMusicArtifacts, saveActiveLyricsSnapshot, selectedChar, ttsConfig, upsertMemoryRecord]);

    const handleReturnToLyrics = useCallback(() => {
        if (!activeDraftRecord) return;
        setRecordFlowStatus('lyrics_ready');
        setRecordFlowError(activeDraftRecord.error || '');
        setRecordStatusText('');
    }, [activeDraftRecord]);

    const handleRetryMemoryRecord = useCallback(async (record: MemoryRecord) => {
        const sourceChar = findCharacterByAnyId(characters, record.charId);
        if (!sourceChar) {
            addToast('没有找到这张唱片的角色', 'error');
            return;
        }

        setRecordGenerating(true);
        setRecordStatusText('正在重新压制...');
        try {
            const next = await produceMemoryRecordAudio({
                record,
                char: sourceChar,
                ttsConfig,
                forceRemaster: true,
                onRecordUpdate: (updated) => {
                    upsertMemoryRecord(updated);
                    setRecordStatusText(getRecordStatusLabel(updated));
                },
            });

            upsertMemoryRecord(next);
            if (next.status === 'ready') {
                addToast('重新压好了', 'success');
                playMemoryRecord(next, playableRecords);
            } else if (next.error) {
                addToast(`重压失败: ${next.error}`, 'error');
            } else {
                addToast('这次还没压完，内页和分轨还在', 'info');
            }
        } catch (error) {
            addToast(error instanceof Error ? `重压失败: ${error.message}` : '重压失败', 'error');
        } finally {
            setRecordGenerating(false);
            setRecordStatusText('');
        }
    }, [addToast, characters, playMemoryRecord, playableRecords, ttsConfig, upsertMemoryRecord]);

    const handleDeleteMemoryRecord = useCallback(async (record: MemoryRecord) => {
        const confirmed = window.confirm(`删除《${record.title}》？歌词、独白和音频都会从本机移除。`);
        if (!confirmed) return;

        try {
            await DB.deleteMemoryRecord(record.id);
            setRecords(previous => previous.filter(item => item.id !== record.id));
            if (activeDraftRecordId === record.id) {
                clearActiveRecordDraftId();
                setActiveDraftRecordId(null);
                setLyricsDraft(createEmptyLyricsDraft());
                setRecordFlowStatus('idle');
            }
            addToast('唱片已删除', 'success');
            haptic.medium();
        } catch (error) {
            addToast(error instanceof Error ? `删除失败: ${error.message}` : '删除失败', 'error');
        }
    }, [activeDraftRecordId, addToast]);

    const startFreshDraft = useCallback(() => {
        setSuppressedAutoResumeCharId(selectedCharId);
        clearActiveRecordDraftId();
        setActiveDraftRecordId(null);
        setLyricsDraft(createEmptyLyricsDraft());
        setRecordSongRequest(createEmptySongRequest());
        setRecordMode('blind_box');
        setRecordReference('');
        setSelectedRecordMemoryIds([]);
        setRecordFlowStatus('idle');
        setRecordFlowError('');
        setRecordStatusText('');
        setSingabilityResult(null);
        setStylePromptResult(null);
        setShowOptimizedLyrics(false);
        clearNeedleDropFormDraft();
        setActiveTab('studio');
        haptic.light();
    }, [selectedCharId]);

    const handleReturnToNeedleDrop = useCallback(() => {
        const sourceRecord = activeDraftRecord;
        const nextCharId = sourceRecord?.charId || selectedCharId;

        if (sourceRecord) {
            const nextSongRequest = {
                ...createEmptySongRequest(),
                ...(sourceRecord.songRequest || {}),
            };
            setSelectedCharId(sourceRecord.charId);
            setRecordMode(sourceRecord.mode);
            setRecordReference(sourceRecord.inspirationReference || '');
            setSelectedRecordMemoryIds(sourceRecord.selectedMemoryIds || []);
            setRecordSongRequest(nextSongRequest);
            writeNeedleDropFormDraft({
                version: 1,
                charId: sourceRecord.charId,
                mode: sourceRecord.mode,
                recordReference: sourceRecord.inspirationReference || '',
                selectedMemoryIds: sourceRecord.selectedMemoryIds || [],
                songRequest: nextSongRequest,
                updatedAt: Date.now(),
            });
        }

        setSuppressedAutoResumeCharId(nextCharId);
        clearActiveRecordDraftId();
        setActiveDraftRecordId(null);
        setLyricsDraft(createEmptyLyricsDraft());
        setRecordFlowStatus('idle');
        setRecordFlowError('');
        setRecordStatusText('');
        setSingabilityResult(null);
        setStylePromptResult(null);
        setShowOptimizedLyrics(false);
        setActiveTab('studio');
        haptic.light();
    }, [activeDraftRecord, selectedCharId]);

    const renderRecordList = (items: MemoryRecord[], emptyTitle: string, emptyText: string, compact = false) => (
        items.length > 0 ? (
            <div className="space-y-3">
                {items.map(record => (
                    <RecordCard
                        key={record.id}
                        record={record}
                        compact={compact}
                        disabled={recordGenerating}
                        onDelete={handleDeleteMemoryRecord}
                        onEdit={loadRecordIntoLyricsEditor}
                        onPlay={(target) => playMemoryRecord(target, playableRecords)}
                        onRetry={handleRetryMemoryRecord}
                        onShare={openMemoryRecordShare}
                    />
                ))}
            </div>
        ) : (
            <EmptyState title={emptyTitle} text={emptyText} />
        )
    );

    const hasActiveLyrics = Boolean(activeDraftRecord && lyricsDraft.lyrics.trim());
    const lyricsLocked = ['lyrics_confirmed', 'generating_style', 'style_ready', 'generating_song', 'song_ready'].includes(recordFlowStatus);
    const styleReady = Boolean(lyricsDraft.stylePrompt.trim());
    const studioStage = recordFlowStatus === 'generating_song' || recordFlowStatus === 'song_ready'
        ? 4
        : lyricsLocked
            ? 3
            : hasActiveLyrics
                ? 2
                : 1;
    const activeRecordMode = activeDraftRecord?.mode || recordMode;
    const selectedModeCopy = MEMORY_RECORD_MODE_COPY[activeRecordMode];
    const currentTaskTitle = studioStage === 1
        ? '落针取材'
        : studioStage === 2
            ? '写词定稿'
            : studioStage === 3
                ? '曲风制作'
                : '压制播放';
    const currentTaskText = studioStage === 1
        ? '先选角色、落针方式和写歌方向，生成第一版歌词草稿。'
        : studioStage === 2
            ? '现在的重点是把歌词修到能唱、能留住，再确认定稿。'
            : studioStage === 3
                ? '歌词已经定下，接下来把它翻译成音乐引擎能理解的曲风方案。'
                : '唱片正在进入最后的压制与播放阶段。';
    const nextStepTitle = studioStage === 1
        ? '下一步：写词定稿'
        : studioStage === 2
            ? '下一步：曲风制作'
            : studioStage === 3
                ? '下一步：压制播放'
                : '唱片已进入播放器';
    const nextStepText = studioStage === 1
        ? '歌词草稿生成后，会自动打开编辑和可唱性检查。'
        : studioStage === 2
            ? '歌词定稿后开放曲风提示词与制作人笔记。'
            : studioStage === 3
                ? '曲风方案确认后，就可以生成歌曲音频。'
                : '可以播放、分享，也可以返回歌词继续修改。';
    const studioSteps = [
        { index: 1, label: '落针取材', caption: selectedModeCopy.label, Icon: Needle, complete: studioStage > 1 },
        { index: 2, label: '写词定稿', caption: hasActiveLyrics ? lyricsDraft.title || '歌词草稿' : '等待草稿', Icon: PenNib, complete: studioStage > 2 },
        { index: 3, label: '曲风制作', caption: styleReady ? '提示词已备好' : '定稿后开放', Icon: SlidersHorizontal, complete: studioStage > 3 },
        { index: 4, label: '压制播放', caption: recordFlowStatus === 'song_ready' ? '可以播放' : '最后一步', Icon: VinylRecord, complete: recordFlowStatus === 'song_ready' },
    ];
    const sourceSummaryItems = [
        { label: '唱片归属', value: selectedChar?.name || '未选择' },
        { label: '落针方式', value: selectedModeCopy.label },
        { label: '歌曲主题', value: recordSongRequest.theme.trim() || '待填写' },
        { label: '情绪氛围', value: recordSongRequest.mood.trim() || '待填写' },
    ];

    return (
        <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#08070b] text-[#f7efe4]" style={{ fontFamily: 'var(--app-font, "Quicksand", sans-serif)' }}>
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <img src="/music-skins/skin-ribbon.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.26]" />
                <img src="/images/paper-texture.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.06] mix-blend-soft-light" />
                <img src="/images/cognitive-vinyl/ticket-stack.png" alt="" className="absolute -right-16 top-10 w-56 rotate-[-8deg] opacity-[0.10] mix-blend-screen" />
                <img src="/images/cognitive-vinyl/pressed-flower.png" alt="" className="absolute -left-16 bottom-24 w-52 opacity-[0.10] mix-blend-screen" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,11,0.18),rgba(8,7,11,0.88)_48%,rgba(8,7,11,0.98)),linear-gradient(115deg,rgba(242,210,144,0.16),transparent_34%,rgba(139,184,241,0.12)_74%,transparent)]" />
            </div>

            <header className="relative z-10 shrink-0 px-4 pt-[calc(0.85rem+env(safe-area-inset-top))] sm:px-5">
                <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[24px] border border-[#f2d290]/16 bg-[#100d12]/72 shadow-[0_24px_58px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                    <div className="relative px-4 py-4 sm:px-5">
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.07),transparent_38%,rgba(242,210,144,0.09))]" />
                        <div className="pointer-events-none absolute right-5 top-4 hidden h-24 w-24 rounded-full border border-[#f2d290]/16 bg-[radial-gradient(circle_at_center,#08070b_0_22%,#d8c18d_23%_25%,#1a1518_26%_62%,#060509_63%_100%)] shadow-[0_18px_46px_rgba(0,0,0,0.42)] sm:block" />
                        <div className="relative flex items-start justify-between gap-3 pr-0 sm:pr-28">
                            <div className="min-w-0">
                                <div className="text-[9px] font-bold uppercase tracking-[0.34em] text-[#f2d290]/58">Echo Record</div>
                                <h1 className="mt-1 text-[28px] font-bold tracking-[0.14em] text-[#fff1bd] sm:text-[32px]">回声唱片</h1>
                                <p className="mt-2 max-w-[33rem] text-[11px] leading-relaxed text-white/46">
                                    把聊天里的回声压成歌，唱片、制作、草稿分开放。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeApp}
                                aria-label="退出回声唱片"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.08] bg-white/[0.06] text-white/58 active:scale-95"
                            >
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                    <path fillRule="evenodd" d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <div className="relative mt-4 grid grid-cols-3 gap-2 rounded-[18px] border border-white/[0.08] bg-black/30 p-1.5">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        haptic.light();
                                    }}
                                    className={`rounded-[13px] px-2 py-2 text-center transition-colors ${activeTab === tab.id ? 'bg-[#f2d290] text-[#241814] shadow-[0_8px_22px_rgba(242,210,144,0.16)]' : 'text-white/48 hover:bg-white/[0.045]'}`}
                                >
                                    <span className="block text-[12px] font-bold tracking-[0.12em]">{tab.label}</span>
                                    <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.18em] opacity-60">{tab.caption}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-5">
                <div className="mx-auto max-w-[1120px]">
                {activeTab === 'records' ? (
                    <div className="space-y-4">
                        <section className="relative overflow-hidden rounded-[22px] border border-[#f2d290]/16 bg-[#171116]/78 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
                            <img src="/images/cognitive-vinyl/archive-card.png" alt="" className="pointer-events-none absolute right-2 top-0 w-36 rotate-6 opacity-[0.08] mix-blend-screen" />
                            <div className="relative flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#f2d290]/52">Pressed</div>
                                    <h2 className="mt-1 text-[18px] font-semibold tracking-[0.10em] text-[#fff1bd]">已压好的唱片</h2>
                                    <p className="mt-2 text-[11px] leading-relaxed text-white/42">
                                        {playableRecords.length > 0 ? `${playableRecords.length} 张可以直接播放，仍然会同步给 Emo Cloud。` : '第一张歌生成好以后，会在这里像唱片架一样排开。'}
                                    </p>
                                </div>
                                <button type="button" onClick={startFreshDraft} className="shrink-0 rounded-[12px] bg-[#f2d290] px-3.5 py-2.5 text-[11px] font-bold text-[#241814] shadow-[0_10px_24px_rgba(242,210,144,0.18)] active:scale-[0.97]">
                                    新建
                                </button>
                            </div>
                        </section>
                        {recordsLoading ? <EmptyState title="正在翻唱片架" text="本机唱片正在回温。" /> : renderRecordList(playableRecords, '还没有可播放唱片', '完成一张歌之后，它会出现在这里。')}
                    </div>
                ) : null}

                {activeTab === 'studio' ? (
                    <div className="space-y-4">
                        <section className="relative overflow-hidden rounded-[22px] border border-[#f2d290]/16 bg-[#121015]/84 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(242,210,144,0.11),transparent_38%,rgba(139,184,241,0.10))]" />
                            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-[#f2d290]/10 bg-[radial-gradient(circle_at_center,#08070b_0_20%,#d8c18d_21%_23%,#211a1b_24%_58%,#060509_59%_100%)] opacity-70" />
                            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#f2d290]/56">Studio Guide</div>
                                    <h2 className="mt-1 text-[18px] font-semibold tracking-[0.10em] text-[#fff1bd]">当前任务：{currentTaskTitle}</h2>
                                    <p className="mt-2 max-w-[36rem] text-[11px] leading-relaxed text-white/48">{currentTaskText}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 rounded-[12px] border border-white/[0.08] bg-black/24 px-3 py-2 text-[10px] font-semibold text-white/54">
                                    {recordGenerating ? <Sparkle className="h-3.5 w-3.5 animate-pulse text-[#f2d290]" weight="fill" /> : <FloppyDisk className="h-3.5 w-3.5 text-[#a8d5ba]" weight="bold" />}
                                    <span>{recordGenerating ? recordStatusText || '制作台处理中' : '制作台已自动保存'}</span>
                                </div>
                            </div>

                            <div className="relative mt-4 grid gap-2 sm:grid-cols-4">
                                {studioSteps.map((step) => {
                                    const Icon = step.Icon;
                                    const active = step.index === studioStage;
                                    return (
                                        <div
                                            key={step.index}
                                            className={`relative overflow-hidden rounded-[16px] border px-3 py-3 transition-colors ${active ? 'border-[#f2d290]/52 bg-[#f2d290]/12 text-[#fff1bd] shadow-[0_12px_28px_rgba(242,210,144,0.12)]' : step.complete ? 'border-[#a8d5ba]/24 bg-[#a8d5ba]/[0.055] text-[#cce8d4]' : 'border-white/[0.07] bg-white/[0.035] text-white/36'}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${active ? 'border-[#f2d290]/50 bg-[#f2d290]/12' : step.complete ? 'border-[#a8d5ba]/28 bg-[#a8d5ba]/10' : 'border-white/[0.08] bg-black/20'}`}>
                                                    {step.complete ? <CheckCircle className="h-4 w-4" weight="fill" /> : <Icon className="h-4 w-4" weight={active ? 'bold' : 'regular'} />}
                                                </div>
                                                <span className="text-[10px] font-black">{step.index}</span>
                                            </div>
                                            <div className="mt-2 truncate text-[11px] font-bold tracking-[0.08em]">{step.label}</div>
                                            <div className="mt-1 truncate text-[9px] font-semibold opacity-55">{step.caption}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#111017]/78 p-3 shadow-[0_14px_36px_rgba(0,0,0,0.24)]">
                            <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/24 to-transparent" />
                            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] border border-[#f2d290]/20 bg-black/28">
                                        {selectedChar?.avatar ? <img src={selectedChar.avatar} alt="" className="h-full w-full object-cover" /> : <Disc className="m-3 h-6 w-6 text-[#f2d290]/54" weight="duotone" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#f2d290]/48">Source</div>
                                        <div className="mt-1 truncate text-[15px] font-semibold tracking-[0.06em] text-[#fff1bd]">{selectedChar?.name || '未选择角色'}</div>
                                    </div>
                                </div>
                                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                                    {sourceSummaryItems.map(item => (
                                        <div key={item.label} className="rounded-[12px] border border-white/[0.06] bg-white/[0.035] px-3 py-2">
                                            <div className="text-[9px] font-semibold tracking-[0.10em] text-white/32">{item.label}</div>
                                            <div className="mt-1 truncate text-[11px] font-semibold text-white/66">{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {!activeDraftRecord ? (
                            <>
                        <section className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#121015]/82 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
                            <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/32 to-transparent" />
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#f2d290]/52">Sleeve Owner</div>
                                    <h2 className="mt-1 text-[17px] font-semibold tracking-[0.10em] text-[#fff1bd]">唱片归属</h2>
                                </div>
                                <button type="button" onClick={startFreshDraft} className="rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[10px] font-semibold text-white/54 active:scale-[0.97]">
                                    清空草稿
                                </button>
                            </div>

                            {characters.length > 0 ? (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {characters.map((char: CharacterProfile) => {
                                        const active = char.id === selectedCharId;
                                        return (
                                            <button
                                                key={char.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedCharId(char.id);
                                                    haptic.light();
                                                }}
                                                className={`flex min-w-[116px] items-center gap-2 rounded-[14px] border px-2.5 py-2 text-left transition-colors ${active ? 'border-[#f2d290]/52 bg-[#f2d290]/12 text-[#fff1bd]' : 'border-white/[0.08] bg-white/[0.035] text-white/44 hover:bg-white/[0.055]'}`}
                                            >
                                                <img src={char.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                                                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{char.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState title="还没有角色" text="需要先有角色，才能压一张有归属的回声唱片。" />
                            )}
                        </section>

                        <section className="rounded-[22px] border border-white/[0.08] bg-[#121015]/82 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
                            <div className="mb-4 rounded-[16px] border border-[#f2d290]/16 bg-[#f2d290]/[0.055] px-3 py-3">
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#f2d290]/58">
                                    <Needle className="h-4 w-4" weight="bold" />
                                    Current Step
                                </div>
                                <div className="mt-2 text-[15px] font-semibold tracking-[0.08em] text-[#fff1bd]">先落针，再写词</div>
                                <p className="mt-1 text-[11px] leading-relaxed text-white/44">这一页只负责决定唱片从谁、哪段气味和什么情绪里开始。歌词生成后会自动进入定稿工作区。</p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-[#f2d290]/52">Needle Drop</div>
                                    <div className="grid gap-2 sm:grid-cols-5">
                                        {(Object.keys(MEMORY_RECORD_MODE_COPY) as MemoryRecordMode[]).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => {
                                                    setRecordMode(mode);
                                                    haptic.light();
                                                }}
                                                className={`rounded-md border px-3 py-2 text-left ${recordMode === mode ? 'border-[#f2d290]/52 bg-[#f2d290]/12 text-[#fff1bd]' : 'border-white/[0.08] bg-white/[0.035] text-white/44'}`}
                                            >
                                                <span className="block text-[11px] font-bold">{MEMORY_RECORD_MODE_COPY[mode].label}</span>
                                                <span className="mt-1 block text-[9px] leading-relaxed opacity-60">{MEMORY_RECORD_MODE_COPY[mode].detail}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {recordMode === 'selected_memory' ? (
                                    <div className="rounded-lg border border-white/[0.08] bg-black/18 p-3">
                                        <div className="mb-2 flex items-center justify-between text-[10px] text-white/40">
                                            <span>封存片段</span>
                                            <span>{selectedRecordMemoryIds.length}/8</span>
                                        </div>
                                        {recordMemoryOptionsLoading ? <p className="text-[11px] text-white/38">正在取出记忆...</p> : null}
                                        {recordMemoryOptionsError ? <p className="text-[11px] text-[#ffd0d8]/78">{recordMemoryOptionsError}</p> : null}
                                        {!recordMemoryOptionsLoading && recordMemoryOptions.length > 0 ? (
                                            <div className="flex max-h-[180px] flex-wrap gap-2 overflow-y-auto">
                                                {recordMemoryOptions.map(memory => {
                                                    const picked = selectedRecordMemoryIds.includes(memory.id);
                                                    const label = memory.title || memory.content?.slice(0, 28) || '未命名回忆';
                                                    return (
                                                        <button
                                                            key={memory.id}
                                                            type="button"
                                                            title={label}
                                                            onClick={() => toggleRecordMemorySeed(memory.id)}
                                                            className={`max-w-full rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${picked ? 'border-[#f2d290]/52 bg-[#f2d290]/14 text-[#fff1bd]' : 'border-white/[0.08] bg-white/[0.035] text-white/42'}`}
                                                        >
                                                            <span className="block max-w-[220px] truncate">{label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="grid gap-2 sm:grid-cols-3">
                                    {([
                                        ['theme', '歌曲主题', '雨夜重逢、秘密恋爱、梦醒前的告白'],
                                        ['mood', '情绪/氛围', '暧昧、克制、热烈、失落但不伤感'],
                                        ['perspective', '叙事口吻', '我唱给你听、第三人称旁观、像在讲故事'],
                                    ] as const).map(([field, label, placeholder]) => (
                                        <label key={field} className="block">
                                            <span className="mb-1 block text-[10px] font-semibold text-white/46">{label}</span>
                                            <input
                                                value={String(recordSongRequest[field] || '')}
                                                onChange={event => handleSongRequestChange(field, event.target.value)}
                                                placeholder={placeholder}
                                                className="w-full rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/22 focus:border-[#f2d290]/40"
                                            />
                                        </label>
                                    ))}
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    {([
                                        ['style', '曲风', 'R&B、抒情流行、电子梦核、city pop'],
                                        ['voicePreference', '声线描述', '女声、低沉男声、气声、少年感'],
                                    ] as const).map(([field, label, placeholder]) => (
                                        <label key={field} className="block">
                                            <span className="mb-1 block text-[10px] font-semibold text-white/46">{label}</span>
                                            <input
                                                value={String(recordSongRequest[field] || '')}
                                                onChange={event => handleSongRequestChange(field, event.target.value)}
                                                placeholder={placeholder}
                                                className="w-full rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/22 focus:border-[#f2d290]/40"
                                            />
                                        </label>
                                    ))}
                                </div>

                                <input
                                    value={recordReference}
                                    onChange={event => setRecordReference(event.target.value)}
                                    placeholder="审美参考：歌手、歌曲、电影或年代"
                                    className="w-full rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/24 focus:border-[#f2d290]/40"
                                />

                                <input
                                    value={recordSongRequest.extraRequirements || ''}
                                    onChange={event => handleSongRequestChange('extraRequirements', event.target.value)}
                                    placeholder="额外要求：副歌更有 Hook、不要太伤感、适合睡前听"
                                    className="w-full rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/24 focus:border-[#f2d290]/40"
                                />

                                <div className="flex justify-end">
                                    <button type="button" disabled={recordGenerating || !selectedChar} onClick={handleCreateMemoryRecord} className="rounded-md bg-[#f2d290] px-4 py-2.5 text-[11px] font-bold text-[#241814] disabled:opacity-45">
                                        {recordFlowStatus === 'generating_lyrics' ? '生成中...' : '生成歌词草稿'}
                                    </button>
                                </div>
                            </div>
                        </section>
                            </>
                        ) : null}

                        {activeDraftRecord && studioStage === 2 ? (
                            <section className="relative space-y-4 overflow-hidden rounded-[22px] border border-[#f2d290]/18 bg-[#121015]/84 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
                                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#fff1bd]/34 to-transparent" />
                                <div className="pointer-events-none absolute -right-12 top-12 h-36 w-36 rounded-full border border-[#f2d290]/8" />
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#f2d290]/52">Lyric Desk</div>
                                        <h2 className="mt-1 text-[17px] font-semibold tracking-[0.10em] text-[#fff1bd]">写词定稿</h2>
                                        <p className="mt-1 text-[11px] leading-relaxed text-white/42">改标题、修断句、检查可唱性；满意后再把歌词交给曲风制作。</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#a8d5ba]/18 bg-[#a8d5ba]/[0.06] px-3 py-1.5 text-[10px] font-semibold text-[#bfe5cc]/82">
                                        <FloppyDisk className="h-3.5 w-3.5" weight="bold" />
                                        {recordGenerating ? '处理中' : '自动保存'}
                                    </div>
                                </div>

                                <label className="block">
                                    <span className="mb-1 block text-[10px] font-semibold text-white/46">歌名</span>
                                    <input
                                        value={lyricsDraft.title}
                                        onChange={event => handleLyricsFieldChange('title', event.target.value)}
                                        className="w-full rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 text-[13px] font-semibold text-[#fff1bd] outline-none focus:border-[#f2d290]/40"
                                    />
                                </label>

                                <label className="block">
                                    <span className="mb-1 block text-[10px] font-semibold text-white/46">完整歌词</span>
                                    <textarea
                                        value={lyricsDraft.lyrics}
                                        onChange={event => handleLyricsFieldChange('lyrics', event.target.value)}
                                        className="min-h-[280px] w-full resize-y rounded-md border border-white/[0.08] bg-black/28 px-3 py-3 text-[12px] leading-6 text-[#fff6d8] outline-none focus:border-[#f2d290]/40"
                                        spellCheck={false}
                                    />
                                </label>

                                {singabilityResult ? (
                                    <div className={`rounded-[16px] border p-3 ${singabilityResult.score >= 80 ? 'border-[#81b29a]/28 bg-[#81b29a]/[0.06]' : singabilityResult.score >= 60 ? 'border-[#f2d290]/28 bg-[#f2d290]/[0.06]' : 'border-[#d99aae]/28 bg-[#d99aae]/[0.06]'}`}>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                            <div className="min-w-[132px] rounded-[14px] border border-white/[0.06] bg-black/18 p-3">
                                                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/54">
                                                    <Waveform className="h-3.5 w-3.5" weight="bold" />
                                                    可唱性
                                                </div>
                                                <div className="mt-2 text-[30px] font-black leading-none text-[#fff1bd]">{singabilityResult.score}<span className="ml-1 text-[13px] font-normal text-white/46">/100</span></div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                {singabilityResult.summary ? <p className="text-[11px] leading-relaxed text-white/52">{singabilityResult.summary}</p> : null}
                                                {singabilityResult.issues.length > 0 ? (
                                                    <div className="mt-3 space-y-2">
                                                        {singabilityResult.issues.map((issue, index) => (
                                                            <div key={`${issue.type}-${index}`} className="rounded-[12px] border border-[#f2d290]/16 bg-black/18 px-3 py-2.5">
                                                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[#ffe1a6]/86">
                                                                    <span>{index + 1}. {issue.type || '可唱性问题'}</span>
                                                                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] text-white/44">
                                                                        {SINGABILITY_SEVERITY_COPY[issue.severity] || '需要留意'}
                                                                    </span>
                                                                </div>
                                                                {issue.problem ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/58">{issue.problem}</p> : null}
                                                                {issue.example ? <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/38">例句：{issue.example}</p> : null}
                                                                {issue.suggestion ? <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[#ffe1a6]/72">建议：{issue.suggestion}</p> : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-[16px] border border-white/[0.07] bg-black/18 p-3">
                                        <div className="flex items-center gap-2 text-[11px] font-semibold text-white/52">
                                            <Waveform className="h-4 w-4 text-[#cfe0ff]/66" weight="bold" />
                                            可唱性检查还没开始
                                        </div>
                                        <p className="mt-1.5 text-[10px] leading-relaxed text-white/34">检查后会显示评分、问题句和优化建议，方便决定要不要让系统改稿。</p>
                                    </div>
                                )}

                                {showOptimizedLyrics && lyricsDraft.optimizedLyrics ? (
                                    <div className="rounded-lg border border-[#81b29a]/24 bg-[#81b29a]/[0.06] p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-semibold text-[#a8d5ba]">优化版歌词</span>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={handleAdoptOptimizedLyrics} disabled={recordGenerating} className="rounded-md bg-[#a8d5ba] px-3 py-1.5 text-[10px] font-bold text-[#152033] disabled:opacity-45">
                                                    采用
                                                </button>
                                                <button type="button" onClick={() => setShowOptimizedLyrics(false)} disabled={recordGenerating} className="rounded-md border border-white/[0.12] px-3 py-1.5 text-[10px] font-bold text-white/52">
                                                    保留原版
                                                </button>
                                            </div>
                                        </div>
                                        <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap rounded-md bg-black/22 p-3 text-[11px] leading-5 text-[#dce9ff]/80" style={{ fontFamily: 'inherit' }}>
                                            {lyricsDraft.optimizedLyrics}
                                        </pre>
                                    </div>
                                ) : null}

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <textarea
                                        value={lyricsDraft.revisionInstruction}
                                        onChange={event => handleLyricsFieldChange('revisionInstruction', event.target.value)}
                                        placeholder="修改意见"
                                        className="min-h-[72px] resize-y rounded-md border border-white/[0.08] bg-black/22 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/24 focus:border-[#f2d290]/40"
                                    />
                                    <input
                                        value={lyricsDraft.lyricistReference}
                                        onChange={event => handleLyricsFieldChange('lyricistReference', event.target.value)}
                                        placeholder="想模仿的词作人"
                                        className="rounded-md border border-white/[0.08] bg-black/22 px-3 py-2.5 text-[12px] text-[#fff1bd] outline-none placeholder:text-white/24 focus:border-[#f2d290]/40"
                                    />
                                </div>

                                <div className="flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-3">
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" disabled={recordGenerating} onClick={handleReturnToNeedleDrop} className="inline-flex items-center gap-1.5 rounded-[12px] border border-white/[0.10] bg-white/[0.035] px-3 py-2 text-[10px] font-bold text-white/52 active:scale-[0.97] disabled:opacity-45">
                                            <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
                                            重新落针
                                        </button>
                                        <button type="button" disabled={recordGenerating || !hasActiveLyrics} onClick={handleCheckSingability} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#cfe0ff]/28 bg-[#8bb8f1]/[0.05] px-3 py-2 text-[10px] font-bold text-[#cfe0ff] active:scale-[0.97] disabled:opacity-45">
                                            <Waveform className="h-3.5 w-3.5" weight="bold" />
                                            {recordFlowStatus === 'checking_singability' ? '检查中...' : '可唱性检查'}
                                        </button>
                                        <button type="button" disabled={recordGenerating || !hasActiveLyrics} onClick={handleOptimizeLyrics} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#f2d290]/30 bg-[#f2d290]/[0.045] px-3 py-2 text-[10px] font-bold text-[#fff1bd] active:scale-[0.97] disabled:opacity-45">
                                            <Sparkle className="h-3.5 w-3.5" weight="fill" />
                                            {recordFlowStatus === 'optimizing_lyrics' ? '优化中...' : '优化歌词'}
                                        </button>
                                    </div>
                                    <button type="button" disabled={recordGenerating || !hasActiveLyrics || !lyricsDraft.title.trim()} onClick={handleConfirmLyricsFinal} className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#f2d290] px-4 py-2 text-[10px] font-bold text-[#241814] shadow-[0_10px_24px_rgba(242,210,144,0.18)] active:scale-[0.97] disabled:opacity-45">
                                        <CheckCircle className="h-3.5 w-3.5" weight="bold" />
                                        确认歌词定稿
                                    </button>
                                </div>
                            </section>
                        ) : null}

                        {activeDraftRecord && ['lyrics_confirmed', 'generating_style', 'style_ready', 'generating_song', 'song_ready'].includes(recordFlowStatus) ? (
                            <section className="relative space-y-3 overflow-hidden rounded-[22px] border border-[#8bb8f1]/18 bg-[#0f141d]/78 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
                                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(139,184,241,0.10),transparent_42%,rgba(242,210,144,0.07))]" />
                                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#cfe0ff]/58">Arrangement</div>
                                        <h2 className="mt-1 text-[17px] font-semibold tracking-[0.10em] text-[#dce9ff]">曲风制作</h2>
                                        <p className="mt-1 text-[11px] leading-relaxed text-white/42">把定稿歌词翻译成曲风、编曲和人声质感，再送去压制。</p>
                                    </div>
                                    <button type="button" disabled={recordGenerating} onClick={handleReturnToLyrics} className="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border border-white/[0.10] bg-white/[0.035] px-3 py-2 text-[10px] font-bold text-white/52 active:scale-[0.97] disabled:opacity-45">
                                        <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
                                        返回歌词
                                    </button>
                                </div>
                                <label className="relative block">
                                    <span className="mb-1 block text-[10px] font-semibold text-white/46">style_prompt</span>
                                    <textarea
                                        value={lyricsDraft.stylePrompt}
                                        onChange={event => handleLyricsFieldChange('stylePrompt', event.target.value)}
                                        className="min-h-[86px] w-full resize-y rounded-md border border-white/[0.08] bg-black/24 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#fff1bd] outline-none focus:border-[#cfe0ff]/40"
                                        spellCheck={false}
                                    />
                                </label>
                                {lyricsDraft.negativeStylePrompt ? (
                                    <label className="relative block">
                                        <span className="mb-1 block text-[10px] font-semibold text-white/36">negative_style_prompt</span>
                                        <textarea
                                            value={lyricsDraft.negativeStylePrompt}
                                            onChange={event => handleLyricsFieldChange('negativeStylePrompt', event.target.value)}
                                            className="min-h-[54px] w-full resize-y rounded-md border border-white/[0.06] bg-black/18 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-white/54 outline-none focus:border-[#cfe0ff]/32"
                                            spellCheck={false}
                                        />
                                    </label>
                                ) : null}
                                {stylePromptResult?.musicDirectorNotes ? (
                                    <div className="relative grid grid-cols-2 gap-2 rounded-[16px] border border-white/[0.06] bg-black/16 p-3 text-[10px] text-white/48">
                                        <span>类型：{stylePromptResult.musicDirectorNotes.song_type || '-'}</span>
                                        <span>情绪：{stylePromptResult.musicDirectorNotes.emotional_core || '-'}</span>
                                        <span>人声：{stylePromptResult.musicDirectorNotes.vocal_character || '-'}</span>
                                        <span>动态：{stylePromptResult.musicDirectorNotes.dynamic_curve || '-'}</span>
                                    </div>
                                ) : null}
                                {recordFlowStatus === 'song_ready' ? (
                                    <div className="relative rounded-[16px] border border-[#a8d5ba]/22 bg-[#a8d5ba]/[0.065] p-3">
                                        <div className="flex items-center gap-2 text-[12px] font-bold text-[#bfe5cc]">
                                            <PlayCircle className="h-4 w-4" weight="fill" />
                                            这张唱片已经压好
                                        </div>
                                        <p className="mt-1 text-[10px] leading-relaxed text-white/44">可以直接播放，也可以回到歌词或曲风重新压制。</p>
                                    </div>
                                ) : null}
                                <div className="relative flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3">
                                    {['lyrics_confirmed', 'generating_style', 'style_ready'].includes(recordFlowStatus) ? (
                                        <button type="button" disabled={recordGenerating} onClick={handleGenerateStylePrompt} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#cfe0ff]/30 bg-[#8bb8f1]/[0.055] px-3 py-2 text-[10px] font-bold text-[#dce9ff] active:scale-[0.97] disabled:opacity-45">
                                            <SlidersHorizontal className="h-3.5 w-3.5" weight="bold" />
                                            {recordFlowStatus === 'generating_style' ? '生成中...' : '生成曲风提示词'}
                                        </button>
                                    ) : null}
                                    {recordFlowStatus === 'song_ready' ? (
                                        <button type="button" disabled={!hasPlayableMemoryRecordAudio(activeDraftRecord)} onClick={() => playMemoryRecord(activeDraftRecord, playableRecords)} className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#a8d5ba]/28 bg-[#a8d5ba]/[0.07] px-3 py-2 text-[10px] font-bold text-[#bfe5cc] active:scale-[0.97] disabled:opacity-35">
                                            <PlayCircle className="h-3.5 w-3.5" weight="fill" />
                                            播放
                                        </button>
                                    ) : null}
                                    {['style_ready', 'generating_song', 'song_ready'].includes(recordFlowStatus) ? (
                                        <button type="button" disabled={recordGenerating || !styleReady} onClick={handleConfirmLyricsAndGenerateSong} className="inline-flex items-center gap-1.5 rounded-[12px] bg-[#f2d290] px-4 py-2 text-[10px] font-bold text-[#241814] shadow-[0_10px_24px_rgba(242,210,144,0.18)] active:scale-[0.97] disabled:opacity-45">
                                            <VinylRecord className="h-3.5 w-3.5" weight="bold" />
                                            {recordFlowStatus === 'generating_song' ? '歌曲生成中...' : recordFlowStatus === 'song_ready' ? '重新压制' : '确认并生成歌曲'}
                                        </button>
                                    ) : null}
                                </div>
                            </section>
                        ) : null}

                        <section className="relative overflow-hidden rounded-[18px] border border-[#8bb8f1]/18 bg-[#8bb8f1]/[0.055] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.20)]">
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(139,184,241,0.08),transparent_45%,rgba(242,210,144,0.05))]" />
                            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[#8bb8f1]/28 bg-black/20 text-[#cfe0ff]">
                                        {studioStage >= 4 ? <PlayCircle className="h-5 w-5" weight="fill" /> : <Lock className="h-5 w-5" weight="bold" />}
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#cfe0ff]/54">Next</div>
                                        <h3 className="mt-1 text-[15px] font-semibold tracking-[0.08em] text-[#dce9ff]">{nextStepTitle}</h3>
                                        <p className="mt-1 max-w-[32rem] text-[11px] leading-relaxed text-white/42">{nextStepText}</p>
                                    </div>
                                </div>
                                {studioStage === 4 && activeDraftRecord ? (
                                    <button type="button" disabled={!hasPlayableMemoryRecordAudio(activeDraftRecord)} onClick={() => playMemoryRecord(activeDraftRecord, playableRecords)} className="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border border-[#8bb8f1]/30 bg-[#8bb8f1]/[0.08] px-3 py-2 text-[10px] font-bold text-[#dce9ff] active:scale-[0.97] disabled:opacity-35">
                                        <PlayCircle className="h-3.5 w-3.5" weight="fill" />
                                        立即播放
                                    </button>
                                ) : (
                                    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-[12px] border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-[10px] font-bold text-white/34">
                                        <Lock className="h-3.5 w-3.5" weight="bold" />
                                        按顺序开放
                                    </div>
                                )}
                            </div>
                        </section>

                        {(recordStatusText || recordFlowError || recordFlowStatus === 'song_ready') ? (
                            <section className="rounded-lg border border-[#8bb8f1]/16 bg-[#8bb8f1]/[0.055] p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#cfe0ff]/58">Status</div>
                                        {recordStatusText ? <p className="mt-2 text-[11px] leading-relaxed text-[#dce9ff]/72">{recordStatusText}</p> : null}
                                        {recordFlowError ? <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[#ffd0d8]/82">{recordFlowError}</p> : null}
                                        {recordFlowStatus === 'song_ready' ? <p className="mt-2 text-[11px] leading-relaxed text-[#dce9ff]/72">歌曲已经生成。</p> : null}
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                        <button type="button" disabled={!activeDraftRecord || !hasPlayableMemoryRecordAudio(activeDraftRecord)} onClick={() => activeDraftRecord && playMemoryRecord(activeDraftRecord, playableRecords)} className="rounded-md border border-[#8bb8f1]/30 px-3 py-2 text-[10px] font-bold text-[#dce9ff] disabled:opacity-35">
                                            播放
                                        </button>
                                        <button type="button" disabled={!activeDraftRecord || recordGenerating} onClick={handleReturnToLyrics} className="rounded-md bg-[#dce9ff] px-3 py-2 text-[10px] font-bold text-[#152033] disabled:opacity-45">
                                            返回歌词
                                        </button>
                                    </div>
                                </div>
                            </section>
                        ) : null}
                    </div>
                ) : null}

                {activeTab === 'mine' ? (
                    <div className="space-y-4">
                        <section className="relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#121015]/82 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.26)]">
                            <img src="/images/cognitive-vinyl/clock-postage.png" alt="" className="pointer-events-none absolute -right-6 -top-8 w-36 rotate-[-8deg] opacity-[0.14] mix-blend-screen" />
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-[16px] border border-[#f2d290]/12 bg-[#f2d290]/[0.04] px-2 py-3">
                                    <div className="text-[20px] font-black text-[#fff1bd]">{records.length}</div>
                                    <div className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-white/38">全部</div>
                                </div>
                                <div className="rounded-[16px] border border-[#a8d5ba]/12 bg-[#a8d5ba]/[0.04] px-2 py-3">
                                    <div className="text-[20px] font-black text-[#a8d5ba]">{playableRecords.length}</div>
                                    <div className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-white/38">可播放</div>
                                </div>
                                <div className="rounded-[16px] border border-[#d99aae]/12 bg-[#d99aae]/[0.04] px-2 py-3">
                                    <div className="text-[20px] font-black text-[#ffd0d8]">{failedRecords.length}</div>
                                    <div className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-white/38">待处理</div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <div className="mb-3 flex items-end justify-between">
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#f2d290]/52">Workbench</div>
                                    <h2 className="mt-1 text-[17px] font-semibold tracking-[0.10em] text-[#fff1bd]">草稿与失败记录</h2>
                                </div>
                            </div>
                            {renderRecordList(workbenchRecords, '没有待处理唱片', '所有唱片都安静地归档好了。', true)}
                        </section>

                        <section>
                            <div className="mb-3 flex items-end justify-between">
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#cfe0ff]/52">Recent</div>
                                    <h2 className="mt-1 text-[17px] font-semibold tracking-[0.10em] text-[#dce9ff]">最近编辑</h2>
                                </div>
                            </div>
                            {renderRecordList(recentRecords, '还没有唱片记录', '第一张回声唱片会从制作页开始。', true)}
                        </section>
                    </div>
                ) : null}
                </div>
            </main>

            <MemoryRecordShareModal
                playable={shareModalPlayable}
                isSharing={isSharingMemoryRecord}
                onClose={() => setShareModalPlayable(null)}
                onShare={() => {
                    if (shareModalPlayable) {
                        void handleShareMemoryRecordPoster(shareModalPlayable);
                    }
                }}
            />
        </div>
    );
};

export default EchoRecordApp;
