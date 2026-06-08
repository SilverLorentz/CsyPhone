/**
 * 念念浮生 — self-contained VN instance types.
 *
 * Creative content, prompt wording, world packets, balance values and art style
 * are intentionally left as TODO(人工) fields.
 */

export type NianNianStage = '初遇' | '拉扯' | '心意渐明' | '情动' | '厮守' | '别离';

export type NianNianStatusFieldType = 'number' | 'text';
export type NianNianEventWeights = Record<string, number | Record<string, number>>;

export interface NianNianEventPrototype {
    id: string;
    名称: string;
    功能: string;
    情绪: string;
    适配stage: NianNianStage[];
    基础权重: number;
    跨题材示例: {
        古代: string;
        仙侠: string;
        武侠: string;
        民国: string;
    };
}

export interface NianNianStatusField {
    key: string;
    label: string;
    type: NianNianStatusFieldType;
    min?: number;
    max?: number;
}

export interface NianNianWorldBible {
    theme: string;
    tone: string;
    charIdentity: string;
    protagonistIdentity: string;
    opening: string;
    statusSchema: NianNianStatusField[];
    eventWeights: NianNianEventWeights;
    customPrompt?: string;
    worldStyle?: string;
    seedStatus?: Record<string, any>;
    openingStep?: NianNianWorldOpeningStep;
    hiddenVarsSeed?: Record<string, number>;
}

export interface NianNianWorldOpeningStep {
    sceneText: string;
    options: NianNianChoiceOption[];
    allowFreeInput?: boolean;
}

export interface NianNianStatusState {
    ta: {
        好感: number;
        心情: string;
        神态: string;
        暧昧度: number;
        心声: string;
    };
    me: {
        身份: string;
        银两: number;
        体力: number;
        名声: number;
    };
    scene: {
        时辰: string;
        地点: string;
        情境: string;
    };
    npcsOnScene: Array<{ name: string; mood: string }>;
    worldExtra: Record<string, number | string>;
}

export interface NianNianFrozenSegment {
    idx: number;
    turnRange: [number, number];
    summary: string;
}

export interface NianNianDirectorState {
    turn: number;
    stage: NianNianStage;
    hiddenVars: Record<string, number>;
    recentEventIds?: string[];
    eventHistory?: NianNianDirectorEventRecord[];
    endingReady?: boolean;
}

export interface NianNianDirectorEventRecord {
    id: string;
    name: string;
    raw: string;
    turn: number;
}

export type NianNianInputBeatKind = 'speech' | 'action';

export interface NianNianInputBeat {
    kind: NianNianInputBeatKind;
    text: string;
}

export type BeatType = '白' | '话';
export type BeatAnchor = '开' | '动作' | '台词' | '选项' | '收';
export type PlayerSegmentAnchor = '选项' | '动作' | '台词';

export interface Beat {
    type: BeatType;
    anchor: BeatAnchor | null;
    text: string;
}

export interface PlayerSegment {
    kind: 'player';
    anchor: PlayerSegmentAnchor;
    text: string;
}

export type DisplayItem =
    | PlayerSegment
    | {
        kind: 'beat';
        type: BeatType;
        anchor: BeatAnchor | null;
        text: string;
    };

export interface NianNianChoiceOption {
    id: string;
    label: string;
    hint?: string;
    directorHint?: string;
}

export interface NianNianInteractionStep {
    id: string;
    sceneText: string;
    options: NianNianChoiceOption[];
    allowFreeInput: boolean;
    createdAt: number;
    source: 'director' | 'fallback' | 'manual';
}

export interface NianNianRawMessage {
    id: string;
    role: 'user' | 'assistant' | 'director' | 'system';
    content: string;
    createdAt: number;
    beats?: NianNianInputBeat[];
    playerSegments?: PlayerSegment[];
    assistantBeats?: Beat[];
    choiceId?: string;
}

export interface NianNianSession {
    id: string;
    charId: string;
    charName: string;
    userName: string;
    world: NianNianWorldBible;
    status: NianNianStatusState;
    milestones: string[];
    segments: NianNianFrozenSegment[];
    rawBuffer: NianNianRawMessage[];
    // UI-only full original backlog. Prompting and compression still use rawBuffer/pendingCompressionBuffer.
    historyBuffer?: NianNianRawMessage[];
    pendingCompressionBuffer?: NianNianRawMessage[];
    pendingCompressionTurnStart?: number;
    director: NianNianDirectorState;
    currentStep: NianNianInteractionStep;
    ended: boolean;
    retrospect?: string;
    ending?: string;
    createdAt: number;
    updatedAt: number;
}

export type NianNianModelLane = 'main' | 'director';

export type NianNianModelPurpose = 'roleplay' | 'event_landing' | 'compression' | 'settlement';

export interface NianNianModelMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface NianNianModelRequest {
    lane: NianNianModelLane;
    purpose: NianNianModelPurpose;
    max_tokens: number;
    messages: NianNianModelMessage[];
    metadata: {
        sessionId: string;
        charId: string;
        turn: number;
        statusDelimiter: ['<<<STATUS>>>', '<<<END>>>'];
    };
}

export interface NianNianTurnPlan {
    userInput: string;
    mainRequest: NianNianModelRequest;
    directorRequest: NianNianModelRequest;
    compressionRequest?: NianNianModelRequest;
    fallbackStep: NianNianInteractionStep;
}

export interface NianNianParsedStatusBlock {
    statusPatch: Record<string, any>;
    raw: string;
}

export interface NianNianParsedDirectorOption {
    key: string;
    label: string;
    directorHint?: string;
    raw: string;
}

export interface NianNianParsedDirectorOutput {
    sceneText: string;
    options: NianNianParsedDirectorOption[];
    stage?: NianNianStage;
    hiddenDeltas: Record<string, number>;
    eventUsed?: string;
    milestone?: string;
    endingReady?: boolean;
    rawDirector: string;
}

export interface NianNianParsedCompressionOutput {
    segment: string;
}

export interface NianNianParsedSettlementOutput {
    retrospect: string;
    ending: string;
}
