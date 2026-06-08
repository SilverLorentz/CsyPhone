export type MemoryRecordMode =
    | 'blind_box'
    | 'relationship_theme'
    | 'selected_memory'
    | 'char_to_user'
    | 'dream_mix';

export type MemoryRecordStatus =
    | 'draft'
    | 'monologue_ready'
    | 'music_ready'
    | 'mastering'
    | 'ready'
    | 'failed';

export type MemoryRecordAudioKind = 'monologue' | 'music' | 'master';

// ── 四阶段 AI 写歌类型 ──

export interface LyricIntent {
    song_type: string;
    core_emotion: string;
    narrative_angle: string;
    hook: string;
    structure_plan: string;
    singability_strategy: string;
}

export interface SingabilityIssue {
    type: string;
    severity: 'low' | 'medium' | 'high';
    problem: string;
    example: string;
    suggestion: string;
}

export interface SingabilityCheck {
    score: number;
    summary: string;
    should_optimize: boolean;
    issues: SingabilityIssue[];
}

export interface OptimizationNotes {
    kept: string[];
    changed: string[];
    reason: string;
}

export interface MusicDirectorNotes {
    song_type: string;
    emotional_core: string;
    vocal_character: string;
    dynamic_curve: string;
    arrangement_strategy: string;
    chorus_strategy: string;
    bridge_strategy: string;
    final_chorus_strategy: string;
    outro_strategy: string;
    avoid: string[];
}

export interface MemoryRecordSongRequest {
    theme: string;
    mood: string;
    style: string;
    perspective: string;
    voicePreference?: string;
    extraRequirements?: string;
}

export interface MemoryRecordLyricTiming {
    sourceHash: string;
    lineTimesMs: number[];
    updatedAt: number;
}

export interface MemoryRecord {
    id: string;
    charId: string;
    charName: string;
    userName: string;
    mode: MemoryRecordMode;
    status: MemoryRecordStatus;
    title: string;
    albumName: string;
    artistName: string;
    monologueText: string;
    lyrics: string;
    musicPrompt: string;
    stylePrompt?: string;
    negativeStylePrompt?: string;
    lyricIntent?: LyricIntent;
    singabilityCheck?: SingabilityCheck;
    optimizationNotes?: OptimizationNotes;
    musicDirectorNotes?: MusicDirectorNotes;
    songRequest?: MemoryRecordSongRequest;
    lyricsOffsetMs?: number;
    lyricTiming?: MemoryRecordLyricTiming;
    lyricsConfirmedAt?: number;
    inspirationReference?: string;
    coverImageUrl?: string;
    coverOriginalAssetId?: string;
    coverPrompt?: string;
    coverStyle?: string;
    coverTone?: string;
    coverGradient: string;
    seedMemoryIds: string[];
    selectedMemoryIds?: string[];
    error?: string;
    model?: string;
    fallbackUsed?: boolean;
    durationMs?: number;
    monologueAudioId?: string;
    musicAudioId?: string;
    masterAudioId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface MemoryRecordAudio {
    id: string;
    recordId: string;
    kind: MemoryRecordAudioKind;
    blob: Blob;
    mimeType: string;
    durationMs?: number;
    createdAt: number;
}

export interface SerializedMemoryRecordAudio extends Omit<MemoryRecordAudio, 'blob'> {
    dataUrl?: string;
}

export const MEMORY_RECORD_MODE_LABELS: Record<MemoryRecordMode, string> = {
    blind_box: '暗格来信',
    relationship_theme: '长镜头',
    selected_memory: '折进信里',
    char_to_user: '他的独白诗',
    dream_mix: '未醒混音',
};

export const MEMORY_RECORD_STATUS_LABELS: Record<MemoryRecordStatus, string> = {
    draft: '内页已写好',
    monologue_ready: '他的独白已落下',
    music_ready: '旋律已成形',
    mastering: '正在压制',
    ready: '可以播放',
    failed: '待重压',
};
