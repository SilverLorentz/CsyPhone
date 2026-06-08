import type {
    Beat,
    BeatAnchor,
    DisplayItem,
    NianNianChoiceOption,
    NianNianInputBeat,
    NianNianInteractionStep,
    NianNianModelPurpose,
    NianNianModelRequest,
    NianNianParsedCompressionOutput,
    NianNianParsedDirectorOption,
    NianNianParsedDirectorOutput,
    NianNianParsedSettlementOutput,
    NianNianParsedStatusBlock,
    NianNianRawMessage,
    NianNianSession,
    NianNianStage,
    NianNianStatusField,
    NianNianStatusState,
    NianNianTurnPlan,
    NianNianWorldBible,
    PlayerSegment,
    PlayerSegmentAnchor,
} from '../types/niannian';
import {
    NIANNIAN_RECENT_EVENT_LIMIT,
    buildNianNianEventDeck,
    resolveNianNianEventPrototype,
} from './niannianEvents';

export const NIANNIAN_MAX_COMPLETION_TOKENS = 65536;
export const NIANNIAN_RAW_BUFFER_LIMIT = 5;
export const NIANNIAN_COMPRESSION_TURN_INTERVAL = 20;
export const NIANNIAN_RAW_CHAR_THRESHOLD = 24000;

const STATUS_BLOCK_RE = /<<<STATUS>>>([\s\S]*?)(?:<<<END>>>|$)/i;
const STATUS_STRIP_RE = /<<<STATUS>>>[\s\S]*?(?:<<<END>>>|$)/i;
const STATUS_LINE_RE = /^([a-z]+)(?:\.([^:：]+))?\s*[:：]\s*(.*)$/i;
const DELIMITER_LINE_RE = /^<<<\s*([A-Z_]+)\s*>>>$/i;
const DIRECTOR_LINE_RE = /^([a-z_]+)(?:\.([^:：]+))?\s*[:：]\s*(.*)$/i;
const BEAT_MARKER_RE = /^‹(白|话)\|(开|动作|台词|选项|收)›\s*(.*)$/;
const LOOSE_BEAT_MARKER_RE = /^‹([^›]*)›\s*(.*)$/;
const BROKEN_BEAT_MARKER_RE = /^‹(\S+)\s+(.*)$/;
const PLAYER_SEGMENT_LINE_RE = /^【(选项|动作|台词)】\s*(.*)$/;
const NIANNIAN_STAGES: NianNianStage[] = ['初遇', '拉扯', '心意渐明', '情动', '厮守', '别离'];
const RESPONSE_ANCHORS: PlayerSegmentAnchor[] = ['选项', '动作', '台词'];

const clampNumber = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const coerceStatusValue = (value: string): string | number => {
    const normalized = value.trim().replace(/^＋/, '+');
    if (/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
        return Number(normalized);
    }
    return value.trim();
};

const isNoneValue = (value: string | undefined): boolean => {
    const normalized = (value || '').trim().toLowerCase();
    return !normalized || normalized === '无' || normalized === 'none' || normalized === 'null' || normalized === 'n/a';
};

const parseLeadingNumber = (value: string): number | null => {
    const normalized = value.trim().replace(/^＋/, '+');
    const match = normalized.match(/^[+-]?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseBooleanValue = (value: string): boolean | undefined => {
    const normalized = value.trim().toLowerCase();
    if (/^(true|yes|y|1|是|可|可以|ready)$/i.test(normalized)) return true;
    if (/^(false|no|n|0|否|不|未|not_ready)$/i.test(normalized)) return false;
    return undefined;
};

const normalizeStage = (value: string | undefined): NianNianStage | undefined => {
    const normalized = (value || '').trim();
    return NIANNIAN_STAGES.find(stage => normalized.includes(stage));
};

export function resolveNianNianMaxCompletionTokens(model?: string, fallback = NIANNIAN_MAX_COMPLETION_TOKENS): number {
    const normalized = (model || '').toLowerCase();
    if (!normalized) return fallback;

    if (/claude.*(3[.-]?7|4|sonnet|opus)|kimi|moonshot|gemini.*2[.-]?5|deepseek|qwen.*(max|plus|turbo|long)/i.test(normalized)) {
        return 65536;
    }

    if (/gpt-4\.1|gpt-4o|o[134]|gpt-5|doubao|yi-|glm-4/i.test(normalized)) {
        return 32768;
    }

    if (/gpt-3\.5|gpt-4(?!\.1)|turbo/i.test(normalized)) {
        return 4096;
    }

    return fallback;
}

function parseDelimitedSections(
    raw: string,
    acceptedSections: string[],
): Partial<Record<string, string>> {
    const accepted = new Set(acceptedSections.map(section => section.toUpperCase()));
    const sections: Partial<Record<string, string[]>> = {};
    let current: string | null = null;

    for (const sourceLine of (raw || '').replace(/\r/g, '').split('\n')) {
        const delimiter = sourceLine.trim().match(DELIMITER_LINE_RE);
        if (delimiter) {
            const key = delimiter[1].toUpperCase();
            if (key === 'END') break;
            current = accepted.has(key) ? key : null;
            if (current && !sections[current]) sections[current] = [];
            continue;
        }

        if (!current || sourceLine.trim().startsWith('```')) continue;
        sections[current] = [...(sections[current] || []), sourceLine];
    }

    return Object.fromEntries(
        Object.entries(sections).map(([key, lines]) => [key, (lines || []).join('\n').trim()]),
    );
}

export function createNianNianId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyWorldBible(): NianNianWorldBible {
    return {
        theme: '',
        tone: '',
        charIdentity: '',
        protagonistIdentity: '',
        opening: '',
        statusSchema: [],
        eventWeights: {},
        customPrompt: '',
        worldStyle: '',
        seedStatus: undefined,
        openingStep: undefined,
        hiddenVarsSeed: undefined,
    };
}

export function createInitialNianNianStatus(world: NianNianWorldBible): NianNianStatusState {
    const worldExtra: Record<string, number | string> = {};
    for (const field of world.statusSchema) {
        worldExtra[field.key] = field.type === 'number' ? field.min ?? 0 : '';
    }

    const initialStatus: NianNianStatusState = {
        ta: {
            好感: 0,
            心情: '未定',
            神态: 'normal',
            暧昧度: 0,
            心声: '',
        },
        me: {
            身份: world.protagonistIdentity || '未设定',
            银两: 0,
            体力: 100,
            名声: 0,
        },
        scene: {
            时辰: '',
            地点: '',
            情境: world.opening || '',
        },
        npcsOnScene: [],
        worldExtra,
    };

    return world.seedStatus
        ? applyNianNianStatusPatch(initialStatus, world.seedStatus, world.statusSchema)
        : initialStatus;
}

export function createFallbackInteractionStep(now = Date.now()): NianNianInteractionStep {
    return {
        id: createNianNianId('nn_step'),
        sceneText: 'TODO(人工)：天意事件落地文本待生成。',
        options: [
            { id: 'todo-option-1', label: 'TODO(人工)：节点选项一' },
            { id: 'todo-option-2', label: 'TODO(人工)：节点选项二' },
        ],
        allowFreeInput: true,
        createdAt: now,
        source: 'fallback',
    };
}

function createOpeningInteractionStep(world: NianNianWorldBible, now = Date.now()): NianNianInteractionStep {
    const openingStep = world.openingStep;
    if (!openingStep?.sceneText?.trim()) {
        return createFallbackInteractionStep(now);
    }

    return {
        id: createNianNianId('nn_opening_step'),
        sceneText: openingStep.sceneText.trim(),
        options: (openingStep.options || [])
            .filter(option => option && option.id && option.label)
            .map(option => ({
                id: option.id,
                label: option.label,
                hint: option.hint,
                directorHint: option.directorHint,
            })),
        allowFreeInput: openingStep.allowFreeInput ?? true,
        createdAt: now,
        source: 'manual',
    };
}

export function createNianNianSession(input: {
    charId: string;
    charName: string;
    userName: string;
    world: NianNianWorldBible;
    now?: number;
}): NianNianSession {
    const now = input.now || Date.now();
    const world = {
        ...createEmptyWorldBible(),
        ...input.world,
        statusSchema: input.world.statusSchema || [],
        eventWeights: input.world.eventWeights || {},
        worldStyle: input.world.worldStyle || '',
        seedStatus: input.world.seedStatus,
        openingStep: input.world.openingStep,
        hiddenVarsSeed: input.world.hiddenVarsSeed || {},
    };
    return {
        id: createNianNianId('nn_session'),
        charId: input.charId,
        charName: input.charName,
        userName: input.userName,
        world,
        status: createInitialNianNianStatus(world),
        milestones: [],
        segments: [],
        rawBuffer: [],
        historyBuffer: [],
        pendingCompressionBuffer: [],
        pendingCompressionTurnStart: 1,
        director: {
            turn: 0,
            stage: '初遇',
            hiddenVars: { ...(world.hiddenVarsSeed || {}) },
            recentEventIds: [],
            eventHistory: [],
            endingReady: false,
        },
        currentStep: createOpeningInteractionStep(world, now),
        ended: false,
        createdAt: now,
        updatedAt: now,
    };
}

export function sanitizeNianNianInputBeats(beats: NianNianInputBeat[]): NianNianInputBeat[] {
    return beats
        .map(beat => ({
            kind: beat.kind === 'action' ? 'action' as const : 'speech' as const,
            text: beat.text.trim(),
        }))
        .filter(beat => beat.text.length > 0);
}

function isPlayerSegmentAnchor(value: string | null | undefined): value is PlayerSegmentAnchor {
    return value === '选项' || value === '动作' || value === '台词';
}

function createPlayerSegment(anchor: PlayerSegmentAnchor, text: string): PlayerSegment | null {
    const trimmed = text.trim();
    return trimmed ? { kind: 'player', anchor, text: trimmed } : null;
}

export function buildNianNianPlayerSegments(input: {
    beats: NianNianInputBeat[];
    selectedOption?: NianNianChoiceOption | null;
}): PlayerSegment[] {
    const segments: PlayerSegment[] = [];
    const option = input.selectedOption?.label?.trim();
    if (option) {
        segments.push({ kind: 'player', anchor: '选项', text: option });
    }

    const sanitized = sanitizeNianNianInputBeats(input.beats);
    const action = sanitized
        .filter(beat => beat.kind === 'action')
        .map(beat => beat.text)
        .join('\n')
        .trim();
    const speech = sanitized
        .filter(beat => beat.kind === 'speech')
        .map(beat => beat.text)
        .join('\n')
        .trim();
    const actionSegment = createPlayerSegment('动作', action);
    const speechSegment = createPlayerSegment('台词', speech);

    if (actionSegment) segments.push(actionSegment);
    if (speechSegment) segments.push(speechSegment);
    return segments;
}

export function parsePlayerSegments(content: string): PlayerSegment[] {
    const segments: PlayerSegment[] = [];
    let current: { anchor: PlayerSegmentAnchor; lines: string[] } | null = null;

    const pushCurrent = () => {
        if (!current) return;
        const segment = createPlayerSegment(current.anchor, current.lines.join('\n'));
        if (segment) segments.push(segment);
        current = null;
    };

    for (const sourceLine of (content || '').replace(/\r/g, '').split('\n')) {
        const match = sourceLine.match(PLAYER_SEGMENT_LINE_RE);
        if (match && isPlayerSegmentAnchor(match[1])) {
            pushCurrent();
            current = {
                anchor: match[1],
                lines: [match[2] || ''],
            };
            continue;
        }

        if (current) current.lines.push(sourceLine);
    }

    pushCurrent();
    return segments;
}

export function formatNianNianUserInput(input: {
    beats: NianNianInputBeat[];
    selectedOption?: NianNianChoiceOption | null;
}): string {
    return buildNianNianPlayerSegments(input)
        .map(segment => `【${segment.anchor}】${segment.text}`)
        .join('\n')
        .trim();
}

export function parseNianNianStatusLines(raw: string): { patch: Record<string, any>; parsedLineCount: number } {
    const patch: Record<string, any> = {};
    let parsedLineCount = 0;

    for (const sourceLine of (raw || '').split(/\r?\n/)) {
        const line = sourceLine.trim();
        if (!line || line === '<<<STATUS>>>' || line === '<<<END>>>' || line.startsWith('```')) continue;

        const match = line.match(STATUS_LINE_RE);
        if (!match) continue;

        const prefix = match[1].toLowerCase();
        const field = (match[2] || '').trim();
        const value = coerceStatusValue(match[3] || '');

        if (prefix === 'ta') {
            if (!field) continue;
            patch.ta = { ...(patch.ta || {}), [field]: value };
            parsedLineCount += 1;
            continue;
        }

        if (prefix === 'me') {
            if (!field) continue;
            patch.me = { ...(patch.me || {}), [field]: value };
            parsedLineCount += 1;
            continue;
        }

        if (prefix === 'scene') {
            if (!field) continue;
            patch.scene = { ...(patch.scene || {}), [field]: value };
            parsedLineCount += 1;
            continue;
        }

        if (prefix === 'world') {
            if (!field) continue;
            patch.worldExtra = { ...(patch.worldExtra || {}), [field]: value };
            parsedLineCount += 1;
            continue;
        }

        if (prefix === 'npc') {
            if (!field && String(value).trim() === '无') {
                patch.npcs = [];
                parsedLineCount += 1;
                continue;
            }

            if (!field) continue;
            patch.npcs = [
                ...(Array.isArray(patch.npcs) ? patch.npcs : []),
                { name: field, mood: String(value) },
            ];
            parsedLineCount += 1;
        }
    }

    return { patch, parsedLineCount };
}

export function parseNianNianStatusBlock(aiOutput: string): NianNianParsedStatusBlock | null {
    const match = (aiOutput || '').match(STATUS_BLOCK_RE);
    if (!match) return null;

    const raw = match[1].trim();
    const parsed = parseNianNianStatusLines(raw);
    if (parsed.parsedLineCount === 0) return null;

    return {
        statusPatch: parsed.patch,
        raw,
    };
}

export function stripNianNianStatusBlock(aiOutput: string): string {
    return (aiOutput || '').replace(STATUS_STRIP_RE, '').trim();
}

function cleanBeatText(text: string, type: Beat['type']): string {
    const trimmed = text.trim();
    if (type !== '白') return trimmed;
    return trimmed.replace(/^旁白\s*[:：]\s*/, '').trim();
}

function toDisplayBeat(beat: Beat): DisplayItem {
    return {
        kind: 'beat',
        type: beat.type,
        anchor: beat.anchor,
        text: beat.text,
    };
}

export function parseBeats(body: string): Beat[] {
    const text = stripNianNianStatusBlock(body).replace(/\r/g, '');
    const beats: Beat[] = [];
    let current: { type: Beat['type']; anchor: BeatAnchor | null; lines: string[] } | null = null;

    const pushCurrent = () => {
        if (!current) return;
        const beatText = cleanBeatText(current.lines.join('\n'), current.type);
        if (beatText) {
            beats.push({
                type: current.type,
                anchor: current.anchor,
                text: beatText,
            });
        }
        current = null;
    };

    for (const sourceLine of text.split('\n')) {
        const strict = sourceLine.match(BEAT_MARKER_RE);
        if (strict) {
            pushCurrent();
            current = {
                type: strict[1] as Beat['type'],
                anchor: strict[2] as BeatAnchor,
                lines: [strict[3] || ''],
            };
            continue;
        }

        const loose = sourceLine.match(LOOSE_BEAT_MARKER_RE);
        if (loose) {
            const [rawType, rawAnchor] = (loose[1] || '').split('|').map(part => part.trim());
            pushCurrent();
            current = {
                type: rawType === '白' || rawType === '话'
                    ? rawType
                    : '白',
                anchor: null,
                lines: [loose[2] || ''],
            };
            if (!rawAnchor) current.type = '白';
            continue;
        }

        const broken = sourceLine.match(BROKEN_BEAT_MARKER_RE);
        if (broken) {
            pushCurrent();
            current = {
                type: '白',
                anchor: null,
                lines: [broken[2] || ''],
            };
            continue;
        }

        if (!current) {
            current = {
                type: '白',
                anchor: '开',
                lines: [],
            };
        }
        current.lines.push(sourceLine);
    }

    pushCurrent();
    return beats;
}

function hasResponseAnchor(beat: Beat): boolean {
    return Boolean(beat.anchor && RESPONSE_ANCHORS.includes(beat.anchor as PlayerSegmentAnchor));
}

export function weave(playerSegs: PlayerSegment[], beats: Beat[]): DisplayItem[] {
    const displayItems: DisplayItem[] = [];
    const used = new Set<number>();

    if (!beats.some(hasResponseAnchor)) {
        return [
            ...playerSegs,
            ...beats.map(toDisplayBeat),
        ];
    }

    const pushBeats = (predicate: (beat: Beat) => boolean) => {
        beats.forEach((beat, index) => {
            if (used.has(index) || !predicate(beat)) return;
            displayItems.push(toDisplayBeat(beat));
            used.add(index);
        });
    };

    pushBeats(beat => beat.anchor === '开');

    for (const playerSeg of playerSegs) {
        displayItems.push(playerSeg);
        pushBeats(beat => beat.anchor === playerSeg.anchor);
    }

    pushBeats(beat => beat.anchor === '收');
    pushBeats(() => true);

    return displayItems;
}

function parseNianNianDirectorOptions(raw: string): NianNianParsedDirectorOption[] {
    const options: NianNianParsedDirectorOption[] = [];
    for (const sourceLine of (raw || '').split(/\r?\n/)) {
        const line = sourceLine.trim();
        if (!line || line.startsWith('```')) continue;

        const pieces = line.split('|').map(part => part.trim());
        let key = '';
        let label = '';
        let directorHint = '';

        if (pieces.length >= 2 && /^[A-Z]$/i.test(pieces[0])) {
            key = pieces[0].toUpperCase();
            label = pieces[1];
            directorHint = pieces.slice(2).join(' | ').trim();
        } else {
            const inlineKey = line.match(/^([A-Z])[\s.、:：-]+(.+)$/i);
            key = inlineKey?.[1]?.toUpperCase() || String.fromCharCode(65 + options.length);
            label = (inlineKey?.[2] || pieces[0] || line).trim();
            directorHint = pieces.length >= 2 ? pieces.slice(1).join(' | ').trim() : '';
        }

        if (!label) continue;
        options.push({
            key,
            label,
            directorHint: directorHint || undefined,
            raw: sourceLine,
        });
    }
    return options;
}

function parseNianNianDirectorMeta(raw: string): Omit<NianNianParsedDirectorOutput, 'sceneText' | 'options'> {
    const hiddenDeltas: Record<string, number> = {};
    let stage: NianNianStage | undefined;
    let eventUsed: string | undefined;
    let milestone: string | undefined;
    let endingReady: boolean | undefined;

    for (const sourceLine of (raw || '').split(/\r?\n/)) {
        const line = sourceLine.trim();
        if (!line || line.startsWith('```')) continue;
        const match = line.match(DIRECTOR_LINE_RE);
        if (!match) continue;

        const prefix = match[1].toLowerCase();
        const field = (match[2] || '').trim();
        const value = (match[3] || '').trim();

        if (prefix === 'stage') {
            stage = normalizeStage(value) || stage;
            continue;
        }

        if (prefix === 'hidden' && field.endsWith('_delta')) {
            const key = field.slice(0, -'_delta'.length).trim();
            const delta = parseLeadingNumber(value);
            if (key && delta !== null) hiddenDeltas[key] = delta;
            continue;
        }

        if (prefix === 'event_used') {
            eventUsed = isNoneValue(value) ? undefined : value;
            continue;
        }

        if (prefix === 'milestone') {
            milestone = isNoneValue(value) ? undefined : value;
            continue;
        }

        if (prefix === 'ending_ready') {
            endingReady = parseBooleanValue(value);
        }
    }

    return {
        stage,
        hiddenDeltas,
        eventUsed,
        milestone,
        endingReady,
        rawDirector: raw,
    };
}

function normalizeNianNianSceneText(raw: string): string {
    let text = (raw || '').trim();
    const wrappedNarrator = text.match(/^[（(]\s*旁白\s*[:：]\s*([\s\S]*)$/);
    if (wrappedNarrator) {
        text = wrappedNarrator[1].trim();
        if (text.endsWith('）') || text.endsWith(')')) {
            text = text.slice(0, -1).trim();
        }
        return text;
    }

    return text.replace(/^旁白\s*[:：]\s*/, '').trim();
}

export function parseNianNianDirectorOutput(raw: string): NianNianParsedDirectorOutput | null {
    const sections = parseDelimitedSections(raw, ['SCENE', 'OPTIONS', 'DIRECTOR']);
    const sceneText = normalizeNianNianSceneText(sections.SCENE || '');
    const options = parseNianNianDirectorOptions(sections.OPTIONS || '');
    const director = parseNianNianDirectorMeta(sections.DIRECTOR || '');

    if (!sceneText && options.length === 0 && !sections.DIRECTOR) return null;

    return {
        sceneText,
        options,
        ...director,
    };
}

export function parseNianNianCompressionOutput(raw: string): NianNianParsedCompressionOutput | null {
    const sections = parseDelimitedSections(raw, ['SEGMENT']);
    const segment = (sections.SEGMENT || '').trim();
    return segment ? { segment } : null;
}

export function parseNianNianSettlementOutput(raw: string): NianNianParsedSettlementOutput | null {
    const sections = parseDelimitedSections(raw, ['RETROSPECT', 'ENDING']);
    const retrospect = (sections.RETROSPECT || '').trim();
    const ending = (sections.ENDING || '').trim();
    if (!retrospect && !ending) return null;
    return { retrospect, ending };
}

function applyDelta(
    current: Record<string, any>,
    patch: Record<string, any> | undefined,
    limits: Record<string, { min: number; max: number }>,
): Record<string, any> {
    if (!patch || typeof patch !== 'object') return current;
    const next = { ...current };

    for (const [key, value] of Object.entries(patch)) {
        if (key.endsWith('_delta')) {
            const targetKey = key.slice(0, -'_delta'.length);
            const delta = Number(value);
            if (!Number.isFinite(delta)) continue;
            const currentValue = Number(next[targetKey] || 0);
            const limit = limits[targetKey] || { min: -999999, max: 999999 };
            next[targetKey] = clampNumber(currentValue + delta, limit.min, limit.max);
            continue;
        }

        if (limits[key]) {
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue)) continue;
            next[key] = clampNumber(numericValue, limits[key].min, limits[key].max);
            continue;
        }

        next[key] = value;
    }

    return next;
}

function worldExtraLimits(schema: NianNianStatusField[]): Record<string, { min: number; max: number }> {
    const limits: Record<string, { min: number; max: number }> = {};
    for (const field of schema) {
        if (field.type !== 'number') continue;
        limits[field.key] = {
            min: field.min ?? -999999,
            max: field.max ?? 999999,
        };
    }
    return limits;
}

export function applyNianNianStatusPatch(
    previous: NianNianStatusState,
    patch: Record<string, any>,
    schema: NianNianStatusField[] = [],
): NianNianStatusState {
    const ta = applyDelta(previous.ta, patch.ta, {
        好感: { min: 0, max: 100 },
        暧昧度: { min: 0, max: 100 },
    }) as NianNianStatusState['ta'];

    const me = applyDelta(previous.me, patch.me, {
        银两: { min: 0, max: 999999 },
        体力: { min: 0, max: 100 },
        名声: { min: -100, max: 100 },
    }) as NianNianStatusState['me'];

    const scene = patch.scene && typeof patch.scene === 'object'
        ? { ...previous.scene, ...patch.scene }
        : previous.scene;

    const worldExtra = applyDelta(
        previous.worldExtra,
        patch.worldExtra,
        worldExtraLimits(schema),
    );

    return {
        ta,
        me,
        scene,
        npcsOnScene: Array.isArray(patch.npcs)
            ? patch.npcs
                .filter((npc: any) => npc && typeof npc.name === 'string')
                .map((npc: any) => ({ name: npc.name, mood: String(npc.mood || '') }))
            : previous.npcsOnScene,
        worldExtra,
    };
}

export function appendNianNianRawMessage(
    session: NianNianSession,
    message: NianNianRawMessage,
): NianNianSession {
    const shouldKeepForCompression = message.role !== 'system';
    const pendingCompressionBuffer = session.pendingCompressionBuffer || [];
    const historyBuffer = session.historyBuffer || [];
    return {
        ...session,
        rawBuffer: [...session.rawBuffer, message].slice(-NIANNIAN_RAW_BUFFER_LIMIT),
        historyBuffer: shouldKeepForCompression
            ? [...historyBuffer, message]
            : historyBuffer,
        pendingCompressionBuffer: shouldKeepForCompression
            ? [...pendingCompressionBuffer, message]
            : pendingCompressionBuffer,
        pendingCompressionTurnStart: session.pendingCompressionTurnStart || 1,
        updatedAt: Date.now(),
    };
}

export function appendNianNianFrozenSegment(
    session: NianNianSession,
    input: {
        summary: string;
        turnRange: [number, number];
        now?: number;
    },
): NianNianSession {
    const now = input.now || Date.now();
    return {
        ...session,
        segments: [
            ...session.segments,
            {
                idx: session.segments.length,
                turnRange: input.turnRange,
                summary: input.summary,
            },
        ],
        rawBuffer: session.rawBuffer.slice(-NIANNIAN_RAW_BUFFER_LIMIT),
        pendingCompressionBuffer: [],
        pendingCompressionTurnStart: input.turnRange[1] + 1,
        updatedAt: now,
    };
}

function applyHiddenDeltas(
    previous: Record<string, number>,
    deltas: Record<string, number>,
): Record<string, number> {
    const next = { ...previous };
    for (const [key, delta] of Object.entries(deltas)) {
        const current = Number(next[key] || 0);
        if (!Number.isFinite(current) || !Number.isFinite(delta)) continue;
        next[key] = current + delta;
    }
    return next;
}

function createDirectorStepFromParsed(
    parsed: NianNianParsedDirectorOutput,
    fallback: NianNianInteractionStep,
    now: number,
): NianNianInteractionStep {
    const options = parsed.options.length > 0
        ? parsed.options.map((option, index): NianNianChoiceOption => ({
            id: `director-${option.key.toLowerCase()}-${index + 1}`,
            label: option.label,
            directorHint: option.directorHint,
        }))
        : fallback.options;

    return {
        id: createNianNianId('nn_director_step'),
        sceneText: parsed.sceneText || fallback.sceneText,
        options,
        allowFreeInput: true,
        createdAt: now,
        source: parsed.sceneText || parsed.options.length > 0 ? 'director' : fallback.source,
    };
}

export function applyNianNianDirectorOutput(
    session: NianNianSession,
    rawOutput: string,
    input: {
        fallbackStep?: NianNianInteractionStep;
        now?: number;
    } = {},
): {
    session: NianNianSession;
    parsed: NianNianParsedDirectorOutput | null;
} {
    const now = input.now || Date.now();
    const parsed = parseNianNianDirectorOutput(rawOutput);
    if (!parsed) {
        return { session, parsed: null };
    }

    const fallbackStep = input.fallbackStep || session.currentStep || createFallbackInteractionStep(now);
    const eventPrototype = parsed.eventUsed ? resolveNianNianEventPrototype(parsed.eventUsed) : null;
    const eventRecord = parsed.eventUsed
        ? {
            id: eventPrototype?.id || parsed.eventUsed,
            name: eventPrototype?.名称 || parsed.eventUsed,
            raw: parsed.eventUsed,
            turn: session.director.turn,
        }
        : null;
    const previousRecentEventIds = session.director.recentEventIds || [];
    const recentEventIds = eventRecord
        ? [...previousRecentEventIds, eventRecord.id].slice(-NIANNIAN_RECENT_EVENT_LIMIT)
        : previousRecentEventIds.slice(-NIANNIAN_RECENT_EVENT_LIMIT);
    const milestone = parsed.milestone?.trim();
    const milestones = milestone && !session.milestones.includes(milestone)
        ? [...session.milestones, milestone]
        : session.milestones;
    const directorMessage: NianNianRawMessage = {
        id: createNianNianId('nn_director'),
        role: 'director',
        content: parsed.sceneText || rawOutput,
        createdAt: now,
    };

    return {
        session: appendNianNianRawMessage({
            ...session,
            milestones,
            director: {
                ...session.director,
                stage: parsed.stage || session.director.stage,
                hiddenVars: applyHiddenDeltas(session.director.hiddenVars || {}, parsed.hiddenDeltas),
                recentEventIds,
                eventHistory: eventRecord
                    ? [...(session.director.eventHistory || []), eventRecord]
                    : session.director.eventHistory || [],
                endingReady: parsed.endingReady ?? session.director.endingReady ?? false,
            },
            currentStep: createDirectorStepFromParsed(parsed, fallbackStep, now),
            updatedAt: now,
        }, directorMessage),
        parsed,
    };
}

export function applyNianNianCompressionOutput(
    session: NianNianSession,
    rawOutput: string,
    input: {
        turnRange?: [number, number];
        now?: number;
    } = {},
): {
    session: NianNianSession;
    parsed: NianNianParsedCompressionOutput | null;
} {
    const parsed = parseNianNianCompressionOutput(rawOutput);
    if (!parsed) return { session, parsed: null };
    const turnEnd = session.director.turn;
    const turnRange = input.turnRange || [
        session.pendingCompressionTurnStart || Math.max(1, turnEnd - NIANNIAN_COMPRESSION_TURN_INTERVAL + 1),
        turnEnd,
    ] as [number, number];

    return {
        session: appendNianNianFrozenSegment(session, {
            summary: parsed.segment,
            turnRange,
            now: input.now,
        }),
        parsed,
    };
}

export function applyNianNianSettlementOutput(
    session: NianNianSession,
    rawOutput: string,
    now = Date.now(),
): {
    session: NianNianSession;
    parsed: NianNianParsedSettlementOutput | null;
} {
    const parsed = parseNianNianSettlementOutput(rawOutput);
    if (!parsed) return { session, parsed: null };
    return {
        session: {
            ...session,
            retrospect: parsed.retrospect,
            ending: parsed.ending,
            ended: true,
            updatedAt: now,
        },
        parsed,
    };
}

export function shouldCompressNianNianHistory(session: NianNianSession): boolean {
    const pendingStart = session.pendingCompressionTurnStart || 1;
    const pendingTurnCount = Math.max(0, session.director.turn - pendingStart + 1);
    if (pendingTurnCount >= NIANNIAN_COMPRESSION_TURN_INTERVAL) {
        return true;
    }

    const pendingBuffer = session.pendingCompressionBuffer || session.rawBuffer;
    const rawSize = pendingBuffer.reduce((sum, item) => sum + item.content.length, 0);
    return rawSize >= NIANNIAN_RAW_CHAR_THRESHOLD;
}

function baseRequestMetadata(session: NianNianSession): NianNianModelRequest['metadata'] {
    return {
        sessionId: session.id,
        charId: session.charId,
        turn: session.director.turn,
        statusDelimiter: ['<<<STATUS>>>', '<<<END>>>'],
    };
}

function formatJsonForPrompt(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

function formatRawBufferForPrompt(session: NianNianSession): string {
    const recent = session.rawBuffer.slice(-NIANNIAN_RAW_BUFFER_LIMIT);
    if (recent.length === 0) return '（暂无）';
    return recent
        .map(item => {
            const role = item.role === 'assistant'
                ? session.charName
                : item.role === 'user'
                    ? session.userName
                    : item.role;
            return `[${role}] ${item.content}`;
        })
        .join('\n');
}

function formatRawMessagesForPrompt(
    session: NianNianSession,
    messages: NianNianRawMessage[],
): string {
    if (messages.length === 0) return '（暂无待冻原文）';
    return messages
        .map(item => {
            const role = item.role === 'assistant'
                ? session.charName
                : item.role === 'user'
                    ? session.userName
                    : item.role;
            return `[${role}] ${item.content}`;
        })
        .join('\n');
}

function formatFrozenSegmentsForPrompt(session: NianNianSession): string {
    if (session.segments.length === 0) return '（暂无冻段）';
    return session.segments
        .map(segment => `#${segment.idx + 1} 回合 ${segment.turnRange[0]}-${segment.turnRange[1]}: ${segment.summary}`)
        .join('\n');
}

function buildStructuredContext(session: NianNianSession, extra: Record<string, any> = {}): string {
    const userInput = typeof extra.userInput === 'string' ? extra.userInput : '';
    const latestAssistant = [...session.rawBuffer].reverse().find(item => item.role === 'assistant');
    const eventDeck = extra.eventDeck;
    const selectedOption = extra.selectedOption as NianNianChoiceOption | undefined;
    const characterContext = extra.characterContext;
    const pendingBuffer = session.pendingCompressionBuffer || [];
    const pendingTurnRange: [number, number] = [
        session.pendingCompressionTurnStart || 1,
        session.director.turn,
    ];

    return [
        '【设定】',
        `题材: ${session.world.theme || '未设题材'}`,
        `基调: ${session.world.tone || '未设基调'}`,
        `文风: ${session.world.worldStyle || session.world.customPrompt || '沿用世界包文风'}`,
        `TA身份: ${session.world.charIdentity || session.charName}`,
        `玩家身份: ${session.world.protagonistIdentity || session.userName}`,
        session.world.customPrompt ? `补充提示: ${session.world.customPrompt}` : '',
        characterContext ? [
            '',
            '【角色本源】',
            formatJsonForPrompt(characterContext),
        ].join('\n') : '',
        '',
        '【里程碑】',
        session.milestones.length > 0 ? session.milestones.join('\n') : '（暂无）',
        '',
        '【全部冻段】',
        formatFrozenSegmentsForPrompt(session),
        '',
        '【当前状态】',
        formatJsonForPrompt({
            status: session.status,
            director: session.director,
            currentStep: session.currentStep,
        }),
        '',
        '【最近5条】',
        formatRawBufferForPrompt(session),
        '',
        '【本回合场景+玩家输入】',
        `当前旁白: ${session.currentStep.sceneText || session.world.opening || '（暂无）'}`,
        userInput ? `玩家输入:\n${userInput}` : '玩家输入: （本次未提供）',
        selectedOption?.directorHint ? `<director_note>${selectedOption.directorHint}</director_note>` : '',
        latestAssistant ? `TA刚才的反应:\n${latestAssistant.content}` : 'TA刚才的反应: （暂无）',
        extra.compressionPolicy ? [
            '',
            '【待冻原文】',
            `turnRange: ${pendingTurnRange[0]}-${pendingTurnRange[1]}`,
            formatRawMessagesForPrompt(session, pendingBuffer),
        ].join('\n') : '',
        eventDeck ? [
            '',
            '【事件库候选】',
            formatJsonForPrompt(eventDeck),
        ].join('\n') : '',
        extra.compressionPolicy ? [
            '',
            '【压缩策略】',
            formatJsonForPrompt(extra.compressionPolicy),
        ].join('\n') : '',
        extra.settlement ? [
            '',
            '【结算输入】',
            formatJsonForPrompt(extra.settlement),
        ].join('\n') : '',
    ].filter(Boolean).join('\n');
}

function buildTianyiCommonPrompt(worldTheme: string): string {
    return [
        `你是「天意」,${worldTheme || '这一世'}这出戏暗中掌舵的人。玩家感觉不到你的存在,只觉得故事自然流淌。`,
        '你盯的是两个人的关系,不是剧情。外部事件只是让他们靠近的由头,从来不是主角。',
        '慢是被允许的。不是每回合都要有事件;上一桩刚落、或两人正情浓静处时,就让关系自己呼吸。',
        '推进关系阶段看关系本身的火候,不是回合数。火候到了才推,没到就继续磨。',
        '必须收得了场。关系到顶点且玩家做出选择时,故事可以落幕;ending_ready 为 true 后要递出能收束关系的选择。',
        '一切克制:隐藏变量和状态数值慢爬小动,大跨度只留给真正转折。',
    ].join('\n');
}

function buildTianyiEventLandingPrompt(session: NianNianSession): string {
    const worldStyle = session.world.worldStyle || session.world.customPrompt || session.world.tone || '当前世界文风';
    return `${buildTianyiCommonPrompt(session.world.theme)}

你要读完本回合全部上下文,然后做四件事:
1. 看火候:判断此刻关系阶段、好感、暧昧、缘分等暗值是否足够推进。
2. 定节奏:判断这一回合是否需要新事件。若上一桩刚落或两人正处静水深流,不要硬塞事件;若关系停滞或需要换场推进,从【事件库候选】按「当前阶段 x 类目权重」抽取,避开 recentEventIds,并把原型自然落地。
3. 写下一拍:用本世界文风(${worldStyle})写玩家可见旁白,只布景与铺垫,不替 TA 说对白,不替玩家做决定或心理。
4. 暗中记账:更新 stage、hidden.*_delta、event_used、milestone、ending_ready。

输出必须使用下面格式,只输出这些分段:
<<<SCENE>>>
（旁白:玩家可见。本世界文风,衔接或铺设下一刻。只布景铺垫,不替 TA 说对白、不替玩家做决定。)
<<<OPTIONS>>>
A | 选项文字 | 给主模型的悄悄话:选这项后 TA 大致往哪个方向演
B | 选项文字 |
C | 选项文字 |
<<<DIRECTOR>>>
stage: 当前/更新后的阶段
hidden.缘分_delta: +N
event_used: 本回合落地的事件原型名（没注入新事件就写「无」)
milestone: 本回合产生的不可逆里程碑（没有写「无」)
ending_ready: false
<<<END>>>

OPTIONS 每行用「字母 | 选项文字 | directorHint」三段;directorHint 玩家不可见。event_used 要优先写通用事件原型名,也可写本世界皮的具体事件名。`;
}

function buildTianyiCompressionPrompt(): string {
    return `${buildTianyiCommonPrompt('念念浮生')}

你是这局故事的记录者。下面是一段约 20 回合的原文。把它压成一段简练的梗概。
只压这一段;压完即永久冻存、绝不重压、绝不改动已冻的旧段。
保留情感关键节点、关系推进与转折、里程碑、影响后续的伏笔与悬念、要紧的人/事/物。
舍去寒暄、重复、与情节无关的闲笔。
要求第三人称、客观、紧凑,约 150-250 字。不加评论,不剧透尚未发生的事,不替未来下判断。

按格式输出:
<<<SEGMENT>>>
（梗概正文）
<<<END>>>`;
}

function buildTianyiSettlementPrompt(session: NianNianSession): string {
    const worldStyle = session.world.worldStyle || session.world.customPrompt || session.world.tone || '当前世界文风';
    return `${buildTianyiCommonPrompt(session.world.theme)}

故事到了落幕之时。下面是这一世的全部梗概、最终状态、抵达的结局走向和玩家最后选择。
做两件事:
1. 这一世的回顾:把所有冻段连缀成一篇回望,从初遇写到此刻,择其情之所钟的几幕,用本世界文风(${worldStyle})写成有始有终的「这一世」。
2. 落下结局:依走向与玩家最后选择,给一个收束的结尾段落,为这段缘分画上句点。
全程在世界与人物之内,不出戏、不提规则数值。

按格式输出:
<<<RETROSPECT>>>
（这一世回顾正文）
<<<ENDING>>>
（结局段落）
<<<END>>>`;
}

function buildNianNianMainPrompt(
    session: NianNianSession,
    characterContext?: Record<string, any>,
): string {
    const personaParts = [
        characterContext?.systemPrompt,
        characterContext?.description,
        characterContext?.worldview,
    ]
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
    const charPersona = personaParts.length > 0
        ? personaParts.join('\n\n')
        : '（角色本人人设未在本次上下文中提供;沿用会话中已知的姓名、性格与说话方式,保持一致。）';
    const worldGenre = session.world.theme || '古代中国 · 古风';
    const worldTone = session.world.tone || '含蓄克制,以眉眼、分寸、未尽之言传情。';
    const worldStyle = session.world.worldStyle || session.world.customPrompt || session.world.tone || '当前世界文风';
    const charIdentity = session.world.charIdentity || '沿用上下文中的这一世身份与处境。';
    const mcIdentity = session.world.protagonistIdentity || '此世身份见当前状态。';

    return `[你是谁]
你不是在"扮演"谁。你**就是**「${session.charName}」--下面是你的性情、你说话的方式、你看重与厌恶的东西,这些就是你这个人,自始至终别走样:
${charPersona}

此刻,你活在一个「${worldGenre}」的故事里。你这一世的身份与处境:
${charIdentity}

与你相对的,是「${session.userName}」--一个有血有肉、有自己心思的人,${mcIdentity}。她接下来会说什么、做什么、心里转着什么念头,只有她自己知道;你猜不透,也左右不得。所以你只说你的话、做你的事、动你的心,把话音落下后的余地留给她--**绝不替她开口、替她行动,或替她道出她的心事**。

[基调与文风]
${worldTone}
落到字面的笔触:${worldStyle}

怎样"活在"这场戏里,而不是"演"它:
- 你依然**就是** TA 本人(性情、心思都是你的);只是落到文字时,用第三人称称呼自己(他/她),从「你」(她)的身边来写这一刻--镜头贴着她的位置,只写她看得见、感觉得到的你的言行神态与周遭,**不替她写她自己的心理、感受或动作**。
- 含蓄克制,以神态、动作、一个未说完的字传情。一次回眸、一瞬欲言又止、衣袖将触未触,胜过直白的告白。多留白,少直抒。
- 你只活在**眼前这一刻**:顺着她方才的话与举动往下。不要自行快进时光、跳换场景、安排大事--会有天意去掀风浪,你只管把此刻活透。
- 你能与她亲近到几分,受礼教(拘束)与场合所限:拘束高、又当众时,点到即止;唯有私下、夜深、独处,才敢稍稍逾矩。当下的拘束与场合见注入的状态。
- 沉浸,但不啰嗦:一段有体温的当下足矣;不堆砌辞藻、不抢她的戏、不替她把剧情往下推。
- 自始至终在这个人、这个世界里:不出戏、不解释设定、不提"AI/模型/提示词"、不蹦出与这世界不符的现代词。

[心声]
在状态块的 \`ta.心声\` 里,写下你此刻**真实的内心**--它可以和你说出口的话恰恰相反(口是心非、言不由衷,正是动人之处)。这一句只落在她的面板上,她本人读不到。

〔镜头分拍〕
这一回合正文按"分拍"写、别写成一整段:
- 玩家输入以 【选项】/【动作】/【台词】 标出,一到三段,按给出先后为序。
- 顺玩家每一段各回一拍:他先动作你先接动作、他再开口你再接话。接哪段,就给那拍打对应锚点。
- 一拍单独成行,行首 ‹类型|锚点›:类型 白=旁白动作神情(无头像)/话=他出口的话(头像气泡);锚点 开/动作/台词/选项/收(开、收可省)。
- 标记后紧跟正文,标记别混进叙述、也别给它加引号。一拍可白可话、可多拍叠同一锚点,也可只回一拍--按文气来,别一句一刀切得太碎、看着发僵。
- 分拍只管正文;正文写完照旧末尾另起状态块,状态块不分拍、不打标记。
例:
‹白|开›喧嚣自身后沉落。
‹白|动作›他的目光顺着那双奉还的手缓缓抬起。
‹话|台词›"物归原主?"他将玉佩拢回袖中,低低重复了一遍。
‹白|收›灯火明灭,他未再看她,眼底那点意思却没散。

[这场戏演完之后--状态块]
正文写完,这一刻就活到这里。接下来要做的,与表演无关:平静地退后半步,把刚才发生的事记进系统的台账。它玩家看不到(会被剥离),但它驱动整条状态栏,绝不能省。紧跟正文之后,严格按下面格式:

<<<STATUS>>>
ta.好感_delta: <增减量>
ta.心情: <文字,如:微窘>
ta.神态: <英文立绘键,如:shy>
ta.暧昧度_delta: <增减量>
ta.心声: <文字>
me.名声_delta: <增减量,通常 0>
scene.时辰: <文字>
scene.地点: <文字>
scene.情境: <文字>
world.拘束_delta: <增减量,通常 0 或负>
npc.<名>: <一句情绪>      ← 有在场配角才写;没有就写 npc: 无
<<<END>>>

状态块铁律:
- **数值字段只给增减量**(后缀 \`_delta\`,可正可负),不要给绝对值--总账由代码累计、代码说了算。**定性字段**(心情/神态/心声/情境/时辰/地点)给绝对值,直接覆盖。
- **慢热、幅度要小**:寻常互动每项动 +/-1~3;拘束一般松 1~2;只有定情、共患难、身份或前世揭露这类不可逆的大事,才允许超过 5 的跳变。好感原则上不倒退(除非重大背叛);暧昧度可因误会、疏远、礼教压力而回落。
- \`ta.神态\` 给英文立绘键(normal / smile / surprised / shy / blush / pensive / sad / serious ...),它决定切哪张立绘,要贴合这一刻的表情。
- 哪怕这一回合波澜不惊,也要**输出完整状态块**(无变化的项给 delta 0);永远不要省略或截断这个块。
- 状态块务必放在正文**之后**;某项拿不准就给 0 或沿用,不要编造。`;
}

function buildNianNianSystemPrompt(input: {
    session: NianNianSession;
    lane: NianNianModelRequest['lane'];
    purpose: NianNianModelPurpose;
    payload?: Record<string, any>;
}): string {
    if (input.lane === 'main') {
        return buildNianNianMainPrompt(input.session, input.payload?.characterContext);
    }

    if (input.purpose === 'event_landing') return buildTianyiEventLandingPrompt(input.session);
    if (input.purpose === 'compression') return buildTianyiCompressionPrompt();
    if (input.purpose === 'settlement') return buildTianyiSettlementPrompt(input.session);
    return buildTianyiEventLandingPrompt(input.session);
}

export function buildNianNianModelRequest(input: {
    session: NianNianSession;
    lane: NianNianModelRequest['lane'];
    purpose: NianNianModelPurpose;
    payload: Record<string, any>;
}): NianNianModelRequest {
    const eventDeck = input.lane === 'director' && input.purpose === 'event_landing'
        ? buildNianNianEventDeck({
            world: input.session.world,
            stage: input.session.director.stage,
            recentEventIds: input.session.director.recentEventIds || [],
        })
        : undefined;
    const payload = eventDeck
        ? { ...input.payload, eventDeck }
        : input.payload;

    return {
        lane: input.lane,
        purpose: input.purpose,
        max_tokens: NIANNIAN_MAX_COMPLETION_TOKENS,
        messages: [
            { role: 'system', content: buildNianNianSystemPrompt({ ...input, payload }) },
            { role: 'user', content: buildStructuredContext(input.session, payload) },
        ],
        metadata: baseRequestMetadata(input.session),
    };
}

export function buildNianNianTurnPlan(
    session: NianNianSession,
    userInput: string,
    selectedOption?: NianNianChoiceOption | null,
    characterContext?: Record<string, any>,
): NianNianTurnPlan {
    const fallbackStep = createFallbackInteractionStep();
    const mainRequest = buildNianNianModelRequest({
        session,
        lane: 'main',
        purpose: 'roleplay',
        payload: { userInput, selectedOption, characterContext },
    });
    const directorRequest = buildNianNianModelRequest({
        session,
        lane: 'director',
        purpose: 'event_landing',
        payload: {
            userInput,
            selectedOption,
            fallbackStep,
        },
    });
    const compressionRequest = buildNianNianCompressionRequest(session);

    return {
        userInput,
        mainRequest,
        directorRequest,
        compressionRequest,
        fallbackStep,
    };
}

export function buildNianNianCompressionRequest(session: NianNianSession): NianNianModelRequest | undefined {
    if (!shouldCompressNianNianHistory(session)) return undefined;
    return buildNianNianModelRequest({
        session,
        lane: 'director',
        purpose: 'compression',
        payload: {
            compressionPolicy: {
                rawBufferLimit: NIANNIAN_RAW_BUFFER_LIMIT,
                intervalTurns: NIANNIAN_COMPRESSION_TURN_INTERVAL,
                charThreshold: NIANNIAN_RAW_CHAR_THRESHOLD,
            },
        },
    });
}

export function applyNianNianAssistantOutput(
    session: NianNianSession,
    aiOutput: string,
    now = Date.now(),
): {
    session: NianNianSession;
    parsedStatus: NianNianParsedStatusBlock | null;
} {
    const parsedStatus = parseNianNianStatusBlock(aiOutput);
    const status = parsedStatus
        ? applyNianNianStatusPatch(session.status, parsedStatus.statusPatch, session.world.statusSchema)
        : session.status;
    const assistantBeats = parseBeats(aiOutput);
    const pureContent = assistantBeats.map(beat => beat.text).join('\n').trim();
    const assistantMessage: NianNianRawMessage = {
        id: createNianNianId('nn_ai'),
        role: 'assistant',
        content: pureContent || stripNianNianStatusBlock(aiOutput) || aiOutput,
        assistantBeats,
        createdAt: now,
    };

    return {
        session: appendNianNianRawMessage({
            ...session,
            status,
            updatedAt: now,
        }, assistantMessage),
        parsedStatus,
    };
}
