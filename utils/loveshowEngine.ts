/**
 * Love Show Engine — 恋综导演引擎 + 赛季状态机
 *
 * 导演的核心工作是「按季播日程制造选择」：
 * 节目结构由固定 DayBeat 表控制，AI 只负责填充当前槽位里的演出。
 */

import {
  LOVE_SHOW_APPROACHES,
  clampLoveShowGuestCount,
  getFallbackLoveShowNpcAppearance,
  isLoveShowStrategy,
} from './loveshowCast';
import { extractJson } from './safeApi';
import {
  buildCharacterStateEvalPrompt,
  buildDirectorMissionPrompt,
  buildDirectorBeatPrompt,
  buildNpcBatchExpandPrompt,
  buildImpressionRepairPrompt,
  buildImpressionUpdatePrompt,
  buildNpcExpandPrompt,
  buildNpcGeneratorPrompt,
  buildPrivateSecretEvalPrompt,
  buildSceneSummaryPrompt,
  buildSocialPostsPrompt,
  type DirectorBeatCharacterBrief,
  type SocialPostsGuestBrief,
} from './loveshowPrompts';
import { trackedApiRequest } from './apiRequestLedger';
import { normalizeLoveShowSocialPost } from './loveshowSocial';
import { DATE_LOCATION_POOL } from './loveshowLocations';
export { DATE_LOCATION_POOL, HOUSE_LOCATIONS } from './loveshowLocations';
export type { LoveShowDateLocation } from './loveshowLocations';
import type {
  SeasonState,
  SeasonPhase,
  SeasonStatus,
  DayBeatKind,
  SeasonSchedule,
  EliminationOutcome,
  FinaleOutcome,
  ChoicePoint,
  ChoiceOption,
  CharacterState,
  LoveShowScene,
  LoveShowUserImpression,
  NpcProfile,
  LoveShowSocialPost,
  DirectorMission,
  DirectorBeat,
  DirectorBeatEndingMode,
  DirectorBeatSceneType,
  DirectorShotType,
  DirectorSpeakerRole,
  DirectorUserPosition,
  LoveShowPrivateSecret,
  LoveShowPrivateSecretKind,
  LoveShowSecretIntensity,
  LoveShowStrategy,
  HighlightMemory,
  HighlightMemoryKind,
  SocialSignal,
} from '../types/loveshow';

const DATE_LOCATION_ID_SET = new Set(DATE_LOCATION_POOL.map(location => location.id));

export const DEFAULT_SEASON_SCHEDULE: SeasonSchedule = [
  { day: 1, title: '初见', beats: ['opening', 'group_activity', 'date', 'backstage_sms', 'wind', 'closing'] },
  { day: 2, title: '升温', beats: ['opening', 'group_activity', 'interview', 'date', 'elimination', 'wind', 'closing'] },
  { day: 3, title: '反转', beats: ['opening', 'group_activity', 'mission', 'date', 'elimination', 'wind', 'closing'] },
  { day: 4, title: '压力', beats: ['opening', 'observatory', 'interview', 'date', 'elimination', 'wind', 'closing'] },
  { day: 5, title: '终选', beats: ['opening', 'date', 'interview', 'finale'] },
];

// ═══════════════════════════════════════════════
//  内部工具
// ═══════════════════════════════════════════════

/** 生成简短唯一 ID */
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneDefaultSchedule(): SeasonSchedule {
  return DEFAULT_SEASON_SCHEDULE.map(dayPlan => ({
    ...dayPlan,
    beats: [...dayPlan.beats],
  }));
}

function createScreenTimeSeed(charIds: string[]): Record<string, number> {
  return Object.fromEntries(charIds.map(id => [id, 0]));
}

function normalizeUsedLocationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const validIds = value
    .filter((id): id is string => typeof id === 'string' && DATE_LOCATION_ID_SET.has(id));
  return Array.from(new Set(validIds));
}

function phaseForBeat(beat: DayBeatKind | undefined): SeasonPhase {
  switch (beat) {
    case 'backstage_sms':
    case 'wind':
      return 'phone_time';
    case 'observatory':
      return 'observatory';
    case 'closing':
    case 'elimination':
      return 'day_end';
    case 'finale':
      return 'finale';
    default:
      return 'day_active';
  }
}

function statusForDayAndBeat(day: number, beat: DayBeatKind | undefined): SeasonStatus {
  if (beat === 'finale' || day >= 5) return 'finale';
  return 'running';
}

export function normalizeSeasonState(season: SeasonState): SeasonState {
  const raw = season as Partial<SeasonState>;
  const schedule = raw.schedule?.length ? raw.schedule : cloneDefaultSchedule();
  const day = typeof raw.day === 'number' ? Math.min(Math.max(raw.day, 1), 5) : 1;
  const dayPlan = schedule.find(plan => plan.day === day) || schedule[0] || DEFAULT_SEASON_SCHEDULE[0];
  const beatIndex = typeof raw.beatIndex === 'number'
    ? Math.min(Math.max(raw.beatIndex, 0), Math.max(0, dayPlan.beats.length - 1))
    : 0;
  const beat = dayPlan.beats[beatIndex];

  return {
    ...season,
    targetGuestCount: clampLoveShowGuestCount(raw.targetGuestCount ?? raw.charIds?.length ?? 5),
    day,
    phase: raw.phase || phaseForBeat(beat),
    status: raw.status || statusForDayAndBeat(day, beat),
    beatIndex,
    schedule,
    eliminations: Array.isArray(raw.eliminations) ? raw.eliminations : [],
    eliminationOutcomes: Array.isArray(raw.eliminationOutcomes) ? raw.eliminationOutcomes : [],
    finalChoice: typeof raw.finalChoice === 'string' ? raw.finalChoice : null,
    finaleOutcome: raw.finaleOutcome || null,
    screenTime: raw.screenTime || createScreenTimeSeed(raw.charIds || []),
    usedLocationIds: normalizeUsedLocationIds(raw.usedLocationIds),
  };
}

export function getSeasonDayPlan(season: SeasonState) {
  const normalized = normalizeSeasonState(season);
  return normalized.schedule.find(plan => plan.day === normalized.day) || normalized.schedule[0];
}

export function getCurrentDayBeat(season: SeasonState): DayBeatKind {
  const normalized = normalizeSeasonState(season);
  const plan = getSeasonDayPlan(normalized);
  return plan?.beats[normalized.beatIndex] || 'opening';
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const DIRECTOR_SCENE_TYPES = [
  'opening_group',
  'group_event',
  'date',
  'phone_time',
  'observatory',
  'confession_room',
  'day_end',
] as const satisfies readonly DirectorBeatSceneType[];

const DIRECTOR_SHOT_TYPES = [
  'close_up',
  'reaction',
  'two_shot',
  'wide',
  'cutaway',
] as const satisfies readonly DirectorShotType[];

const DIRECTOR_SPEAKER_ROLES = [
  'lead',
  'respond',
  'interrupt',
  'soft_react',
] as const satisfies readonly DirectorSpeakerRole[];

const DIRECTOR_USER_POSITIONS = [
  'being_addressed',
  'observing',
  'choosing_target',
  'private_moment',
  'silent_pressure',
] as const satisfies readonly DirectorUserPosition[];

const DIRECTOR_ENDING_MODES = [
  'wait_user',
  'continue_scene',
  'open_choice',
  'phone_notification',
  'scene_end',
] as const satisfies readonly DirectorBeatEndingMode[];

function inferDirectorSceneType(scene: LoveShowScene, season: SeasonState): DirectorBeatSceneType {
  if (scene.locationId === 'observatory') return 'observatory';
  if (scene.locationId === 'interview_room') return 'confession_room';
  if (season.phase === 'phone_time') return 'phone_time';
  if (season.phase === 'day_end') return 'day_end';
  if (scene.characterIds.length <= 1 && scene.locationId !== 'living_room') return 'date';
  return season.day === 1 && scene.locationId === 'living_room' ? 'opening_group' : 'group_event';
}

function activeSeasonCharIds(season: SeasonState): string[] {
  const raw = season as Partial<SeasonState>;
  const eliminations = Array.isArray(raw.eliminations) ? raw.eliminations : [];
  return (raw.charIds || []).filter(id => !eliminations.includes(id));
}

function sceneLocationGuestIds(scene: LoveShowScene, season: SeasonState): string[] {
  const activeIds = activeSeasonCharIds(season);
  const rawIds = scene.locationGuestIds && scene.locationGuestIds.length > 0
    ? scene.locationGuestIds
    : scene.characterIds;
  return rawIds.filter(id => activeIds.includes(id));
}

function stableIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

export interface ShowArrangedLocationResult {
  locationId: string;
  locationName: string;
  atmosphere: string;
}

export function pickShowArrangedLocation(input: {
  seasonId: string;
  day: number;
  beatIndex: number;
  sceneType: DirectorBeatSceneType | 'date' | string;
  usedLocationIds?: string[];
}): ShowArrangedLocationResult {
  const usedLocationIds = normalizeUsedLocationIds(input.usedLocationIds);
  const unusedPool = DATE_LOCATION_POOL.filter(location => !usedLocationIds.includes(location.id));
  let candidatePool = unusedPool.length > 0 ? unusedPool : DATE_LOCATION_POOL;

  if (unusedPool.length === 0 && usedLocationIds.length > 0 && DATE_LOCATION_POOL.length > 1) {
    const lastLocationId = usedLocationIds[usedLocationIds.length - 1];
    const noImmediateRepeatPool = DATE_LOCATION_POOL.filter(location => location.id !== lastLocationId);
    if (noImmediateRepeatPool.length > 0) candidatePool = noImmediateRepeatPool;
  }

  const seed = `${input.seasonId}|${input.day}|${input.beatIndex}|${input.sceneType}`;
  const location = candidatePool[stableIndex(seed, candidatePool.length)] || DATE_LOCATION_POOL[0];
  return {
    locationId: location.id,
    locationName: location.name,
    atmosphere: location.atmosphere,
  };
}

const PRIVATE_SECRET_SIGNAL_RE = /(喜欢|心动|偏心|只告诉你|别告诉|不想让别人知道|其实|害怕|怕你|怕被|示弱|撑不住|求你|拜托|答应我|把柄|秘密|不敢说|我承认)/;
const PRIVATE_SECRET_CP_RISK_RE = /(嘉宾\s*CP|CP\s*排名|谁和谁最配|嘉宾互选|互选心动|互相心动|锁死|磕|在一起|最配)/i;
const PRIVATE_SECRET_HARM_RE = /(羞辱|物化|威胁|报复|惩罚|控制你|操控你|驯服|征服|猎物|战利品)/;
const HIGHLIGHT_CP_RISK_RE = /(嘉宾\s*CP|CP\s*排名|谁和谁最配|嘉宾互选|互选心动|恋爱线投票|互相心动|锁死|磕|在一起|最配|×)/i;
const HIGHLIGHT_KINDS = [
  'spark',
  'jealousy',
  'confession',
  'conflict',
  'tease',
  'vulnerability',
  'secret',
] as const satisfies readonly HighlightMemoryKind[];
const PRIVATE_SECRET_KINDS = [
  'confession',
  'vulnerability',
  'request',
  'leverage',
  'private_signal',
] as const satisfies readonly LoveShowPrivateSecretKind[];
const PRIVATE_SECRET_INTENSITIES = [
  'soft',
  'charged',
  'volatile',
] as const satisfies readonly LoveShowSecretIntensity[];

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function compactSecretLine(text: string, maxLength = 90): string {
  const content = text.replace(/\s+/g, ' ').trim();
  return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content;
}

function hasPrivateSecretSafetyRisk(text: string): boolean {
  return PRIVATE_SECRET_CP_RISK_RE.test(text) || PRIVATE_SECRET_HARM_RE.test(text);
}

function hasHighlightSafetyRisk(text: string): boolean {
  return HIGHLIGHT_CP_RISK_RE.test(text) || PRIVATE_SECRET_HARM_RE.test(text);
}

function classifyPrivateSecretKind(text: string): LoveShowPrivateSecretKind {
  if (/(喜欢|心动|偏心|想选你|告白|在意你)/.test(text)) return 'confession';
  if (/(害怕|怕被|怕你|不安|示弱|脆弱|撑不住|难过|不敢说)/.test(text)) return 'vulnerability';
  if (/(求你|拜托|答应我|能不能|希望你|想让你)/.test(text)) return 'request';
  if (/(把柄|别告诉|不想让别人知道|秘密)/.test(text)) return 'leverage';
  return 'private_signal';
}

function secretIntensityForKind(kind: LoveShowPrivateSecretKind, text: string): LoveShowSecretIntensity {
  if (kind === 'leverage' || /(别告诉|不想让别人知道|撑不住|我承认)/.test(text)) return 'volatile';
  if (kind === 'confession' || kind === 'vulnerability' || kind === 'request') return 'charged';
  return 'soft';
}

function summaryForSecret(kind: LoveShowPrivateSecretKind, userName: string): string {
  switch (kind) {
    case 'confession':
      return `他在私聊里向${userName}露出了一次只属于两人的心动或偏心。`;
    case 'vulnerability':
      return `他在私聊里把脆弱和不安交给${userName}看见。`;
    case 'request':
      return `他在私聊里对${userName}提出了一个带情绪重量的请求。`;
    case 'leverage':
      return `他在私聊里把不想被公开的把柄或顾虑交给了${userName}。`;
    default:
      return `他在私聊里给了${userName}一个镜头前不会承认的真实信号。`;
  }
}

function publicHintForSecret(kind: LoveShowPrivateSecretKind): string {
  switch (kind) {
    case 'confession':
      return '公开场里他会把偏心压回玩笑或沉默，用停顿和视线绕开刚才只对用户露出的心动。';
    case 'vulnerability':
      return '公开场里他会比平时更克制，像是在藏起刚才只给用户看过的脆弱。';
    case 'request':
      return '公开场里他会听见相近话题就短暂停住，差点把私下请求带到镜头前。';
    case 'leverage':
      return '公开场里他会下意识回避某个话题，反应比旁人慢半拍，像怕被镜头抓住破绽。';
    default:
      return '公开场里他会用意味深长的反应绕开这段私下信号，不在别人面前说破。';
  }
}

function normalizeSecretTextField(text: unknown, fallback: string, maxLength: number): string {
  const content = typeof text === 'string' ? compactSecretLine(text, maxLength) : '';
  if (!content || hasPrivateSecretSafetyRisk(content)) return fallback;
  return content;
}

function normalizePublicSubtextHint(
  text: unknown,
  kind: LoveShowPrivateSecretKind,
  privateLine: string,
): string {
  const fallback = publicHintForSecret(kind);
  const content = normalizeSecretTextField(text, fallback, 120);
  const corePrivateLine = privateLine.length > 12 ? privateLine.slice(0, 12) : privateLine;
  if (corePrivateLine && content.includes(corePrivateLine)) return fallback;
  if (/直接说破|当众挑明|原话|复述/.test(content)) return fallback;
  return content;
}

function compactHighlightText(text: unknown, fallback: string, maxLength: number): string {
  const content = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  const next = content || fallback;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

function normalizeHighlightKind(value: unknown): HighlightMemoryKind {
  return isOneOf(value, HIGHLIGHT_KINDS) ? value : 'spark';
}

function normalizeHighlightGuestIds(value: unknown, allowedGuestIds: string[]): string[] {
  const allowedSet = new Set(allowedGuestIds);
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((id): id is string => typeof id === 'string' && allowedSet.has(id))));
}

export function isUserCenteredHighlight(memory: HighlightMemory): boolean {
  if (!memory.guestIds.length) return false;
  const text = `${memory.summary} ${memory.meaning} ${memory.callbackLine || ''}`;
  return !hasHighlightSafetyRisk(text);
}

function buildHighlightMemory(input: {
  seasonId: string;
  day: number;
  beatIndex?: number;
  sceneId?: string;
  source: HighlightMemory['source'];
  guestIds: string[];
  kind: HighlightMemoryKind;
  summary: string;
  meaning: string;
  callbackLine?: string;
  weight: number;
  fromPrivateSecret?: boolean;
  createdAt?: number;
}): HighlightMemory | null {
  const memory: HighlightMemory = {
    id: uid('highlight'),
    seasonId: input.seasonId,
    day: input.day,
    beatIndex: input.beatIndex,
    sceneId: input.sceneId,
    source: input.source,
    guestIds: Array.from(new Set(input.guestIds)).filter(Boolean),
    kind: input.kind,
    summary: compactHighlightText(input.summary, '镜头里出现了一个值得回提的瞬间', 80),
    meaning: compactHighlightText(input.meaning, '这让嘉宾和用户之间多了一层可回望的情绪', 100),
    callbackLine: input.callbackLine ? compactHighlightText(input.callbackLine, '', 90) : undefined,
    weight: clampNumber(Math.round(input.weight), 0, 100),
    fromPrivateSecret: input.fromPrivateSecret || undefined,
    createdAt: input.createdAt || Date.now(),
  };
  return isUserCenteredHighlight(memory) ? memory : null;
}

export function createHighlightFromSceneDraft(
  payload: Record<string, unknown>,
  context: {
    season: Pick<SeasonState, 'seasonId' | 'day' | 'beatIndex' | 'charIds'>;
    sceneId: string;
    guestIds: string[];
    createdAt?: number;
  },
): HighlightMemory | null {
  const guestIds = normalizeHighlightGuestIds(payload.guestIds, context.guestIds);
  if (guestIds.length === 0) return null;
  return buildHighlightMemory({
    seasonId: context.season.seasonId,
    day: context.season.day,
    beatIndex: context.season.beatIndex,
    sceneId: context.sceneId,
    source: 'scene',
    guestIds,
    kind: normalizeHighlightKind(payload.kind),
    summary: compactHighlightText(payload.summary, '', 48),
    meaning: compactHighlightText(payload.meaning, '', 70),
    callbackLine: typeof payload.callbackLine === 'string' ? payload.callbackLine : undefined,
    weight: typeof payload.weight === 'number' ? payload.weight : Number(payload.weight) || 45,
    createdAt: context.createdAt,
  });
}

export function createPrivateSecretHighlight(
  input: LoveShowPrivateSecretDraftInput,
  secret: LoveShowPrivateSecret,
): HighlightMemory | null {
  return buildHighlightMemory({
    seasonId: secret.seasonId,
    day: secret.day,
    source: 'private_chat',
    guestIds: [secret.guestId],
    kind: 'secret',
    summary: secret.summary,
    meaning: `${input.guestName || '这位嘉宾'}在镜头外把一层真实情绪交给了${secret.userName}。`,
    callbackLine: secret.publicSubtextHint,
    weight: secret.intensity === 'volatile' ? 88 : secret.intensity === 'charged' ? 78 : 62,
    fromPrivateSecret: true,
    createdAt: secret.createdAt,
  });
}

export function createFallbackHighlight(input: {
  season: SeasonState;
  scene: LoveShowScene;
  summary: string;
  directorBeat?: DirectorBeat | null;
  characterStates?: CharacterState[];
  createdAt?: number;
}): HighlightMemory | null {
  const presentSet = new Set(input.scene.characterIds);
  const beatGuestIds = [
    ...(input.directorBeat?.speakers.map(speaker => speaker.charId) || []),
    ...(input.directorBeat?.cameraFocus.map(item => item.charId) || []),
  ].filter(id => presentSet.has(id));
  const guestIds = (beatGuestIds.length ? beatGuestIds : input.scene.characterIds).slice(0, 2);
  if (guestIds.length === 0) return null;
  const leadState = input.characterStates?.find(state => state.characterId === guestIds[0]);
  const mood = leadState?.mood || '';
  const kind: HighlightMemoryKind = /吃醋/.test(mood)
    ? 'jealousy'
    : /受伤|冷淡/.test(mood)
      ? 'conflict'
      : /心动|开心/.test(mood)
        ? 'spark'
        : 'tease';
  const affection = leadState?.affection || 0;
  return buildHighlightMemory({
    seasonId: input.season.seasonId,
    day: input.season.day,
    beatIndex: input.season.beatIndex,
    sceneId: input.scene.id,
    source: 'scene',
    guestIds,
    kind,
    summary: input.summary,
    meaning: '这段互动以后可以成为嘉宾回提的共同瞬间。',
    callbackLine: `还记得 Day ${input.season.day} 在${input.scene.locationName}那次吗？`,
    weight: clampNumber(44 + Math.round(affection / 3), 35, 76),
    createdAt: input.createdAt,
  });
}

export interface LoveShowPrivateSecretDraftInput {
  season: Pick<SeasonState, 'seasonId' | 'day'>;
  guestId: string;
  guestName?: string;
  userName: string;
  userMessage: string;
  guestReply: string;
  existingSecrets?: LoveShowPrivateSecret[];
  createdAt?: number;
}

export function createLoveShowPrivateSecret(input: LoveShowPrivateSecretDraftInput): LoveShowPrivateSecret | null {
  const userMessage = compactSecretLine(input.userMessage, 120);
  const guestReply = compactSecretLine(input.guestReply, 140);
  const combined = `${userMessage} ${guestReply}`;
  if (!PRIVATE_SECRET_SIGNAL_RE.test(combined)) return null;
  if (hasPrivateSecretSafetyRisk(combined)) return null;

  const kind = classifyPrivateSecretKind(combined);
  const intensity = secretIntensityForKind(kind, combined);
  return {
    id: uid('secret'),
    seasonId: input.season.seasonId,
    day: input.season.day,
    guestId: input.guestId,
    userName: input.userName,
    kind,
    intensity,
    summary: summaryForSecret(kind, input.userName),
    privateLine: guestReply,
    publicSubtextHint: publicHintForSecret(kind),
    createdAt: input.createdAt || Date.now(),
  };
}

export interface LoveShowPrivateSecretDecisionPayload {
  hasSecret?: unknown;
  kind?: unknown;
  intensity?: unknown;
  summary?: unknown;
  privateLine?: unknown;
  publicSubtextHint?: unknown;
  safety?: {
    guestUserOnly?: unknown;
    hasGuestGuestSecret?: unknown;
    hasCpSemantics?: unknown;
    hasManipulativeHarm?: unknown;
  };
}

export type LoveShowPrivateSecretPlanSource = 'api' | 'fallback' | 'none';

export interface LoveShowPrivateSecretPlan {
  secret: LoveShowPrivateSecret | null;
  highlight: HighlightMemory | null;
  source: LoveShowPrivateSecretPlanSource;
  issues: string[];
}

export function createLoveShowPrivateSecretFromDecision(
  input: LoveShowPrivateSecretDraftInput,
  payload: LoveShowPrivateSecretDecisionPayload,
): LoveShowPrivateSecretPlan {
  const issues: string[] = [];
  const localFallback = createLoveShowPrivateSecret(input);
  if (payload.hasSecret !== true) {
    return localFallback
      ? {
          secret: localFallback,
          highlight: createPrivateSecretHighlight(input, localFallback),
          source: 'fallback',
          issues: ['Structured decision returned no secret; local fallback caught a strong signal'],
        }
      : { secret: null, highlight: null, source: 'api', issues };
  }

  const safety = payload.safety || {};
  if (
    safety.guestUserOnly === false
    || safety.hasGuestGuestSecret === true
    || safety.hasCpSemantics === true
    || safety.hasManipulativeHarm === true
  ) {
    return { secret: null, highlight: null, source: 'api', issues: ['Structured decision failed local relationship safety flags'] };
  }

  const combined = `${input.userMessage} ${input.guestReply}`;
  if (hasPrivateSecretSafetyRisk(combined)) {
    return { secret: null, highlight: null, source: 'api', issues: ['Private chat content failed local safety regex'] };
  }

  const kind = isOneOf(payload.kind, PRIVATE_SECRET_KINDS)
    ? payload.kind
    : classifyPrivateSecretKind(combined);
  if (!isOneOf(payload.kind, PRIVATE_SECRET_KINDS)) {
    issues.push('Repaired invalid private secret kind');
  }

  const intensity = isOneOf(payload.intensity, PRIVATE_SECRET_INTENSITIES)
    ? payload.intensity
    : secretIntensityForKind(kind, combined);
  if (!isOneOf(payload.intensity, PRIVATE_SECRET_INTENSITIES)) {
    issues.push('Repaired invalid private secret intensity');
  }

  const summary = normalizeSecretTextField(payload.summary, summaryForSecret(kind, input.userName), 90);
  const privateLine = normalizeSecretTextField(payload.privateLine, compactSecretLine(input.guestReply, 140), 140);
  const publicSubtextHint = normalizePublicSubtextHint(payload.publicSubtextHint, kind, privateLine);
  const modelText = `${summary} ${privateLine} ${publicSubtextHint}`;
  if (hasPrivateSecretSafetyRisk(modelText)) {
    return localFallback
      ? {
          secret: localFallback,
          highlight: createPrivateSecretHighlight(input, localFallback),
          source: 'fallback',
          issues: ['Structured decision text failed local safety regex; local fallback used'],
        }
      : { secret: null, highlight: null, source: 'api', issues: ['Structured decision text failed local safety regex'] };
  }

  const secret: LoveShowPrivateSecret = {
    id: uid('secret'),
    seasonId: input.season.seasonId,
    day: input.season.day,
    guestId: input.guestId,
    userName: input.userName,
    kind,
    intensity,
    summary,
    privateLine,
    publicSubtextHint,
    createdAt: input.createdAt || Date.now(),
  };
  return {
    secret,
    highlight: createPrivateSecretHighlight(input, secret),
    source: 'api',
    issues,
  };
}

export function mergePrivateSecretIntoGuestState(
  currentState: CharacterState,
  secret: LoveShowPrivateSecret,
): CharacterState {
  const revealedToUser = Array.from(new Set([
    ...(currentState.privateTruth?.revealedToUser || []),
    secret.summary,
  ])).slice(-5);
  const divergenceFloor: Record<LoveShowPrivateSecretKind, number> = {
    confession: 62,
    vulnerability: 68,
    request: 58,
    leverage: 76,
    private_signal: 46,
  };
  const nextDivergence = clampNumber(
    Math.max(currentState.publicPrivateDivergence || 0, divergenceFloor[secret.kind]),
    0,
    100,
  );

  return {
    ...currentState,
    publicPosture: {
      cameraPersona: currentState.publicPosture?.cameraPersona || `镜头前仍维持「${currentState.strategy}」的可控姿态`,
      strategyMask: currentState.publicPosture?.strategyMask || currentState.strategy,
      avoids: currentState.publicPosture?.avoids || '不在公开场承认镜头外私聊的重量',
      lastPublicSceneId: currentState.publicPosture?.lastPublicSceneId,
    },
    privateTruth: {
      emotionalTruth: secret.summary,
      revealedToUser,
      wantsFromUser: currentState.privateTruth?.wantsFromUser || (secret.kind === 'request' ? '一个只在私下成立的回应' : undefined),
      lastPrivateAt: secret.createdAt,
    },
    publicPrivateDivergence: nextDivergence,
  };
}

export function privateSecretsForPublicScene(
  secrets: LoveShowPrivateSecret[],
  presentCharIds: string[],
): LoveShowPrivateSecret[] {
  const presentSet = new Set(presentCharIds);
  return secrets.filter(secret => (
    presentSet.has(secret.guestId)
    && !PRIVATE_SECRET_CP_RISK_RE.test(`${secret.summary} ${secret.publicSubtextHint}`)
    && !PRIVATE_SECRET_HARM_RE.test(`${secret.summary} ${secret.publicSubtextHint}`)
  ));
}

export function buildPublicSecretSubtextForScene(secrets: LoveShowPrivateSecret[]): string {
  if (secrets.length === 0) return '';
  return [
    '公开场只能旁敲侧击这些私聊秘密：回避、停顿、意味深长反应、差点说漏；不能在他人面前明说。',
    secrets.map(secret => `${secret.guestId}: ${secret.publicSubtextHint}`).join('\n'),
  ].join('\n');
}

export function selectHighlightsForContext(
  all: HighlightMemory[],
  opts: {
    presentGuestIds?: string[];
    guestId?: string;
    day: number;
    limit: number;
  },
): HighlightMemory[] {
  const presentSet = new Set(opts.presentGuestIds || []);
  const hasPresentFilter = presentSet.size > 0;
  const scored = all
    .filter(memory => memory.day <= opts.day && isUserCenteredHighlight(memory))
    .filter(memory => (opts.guestId ? memory.guestIds.includes(opts.guestId) : true))
    .filter(memory => (hasPresentFilter ? memory.guestIds.some(id => presentSet.has(id)) : true))
    .map(memory => {
      const matchScore = opts.guestId
        ? (memory.guestIds.includes(opts.guestId) ? 2 : 0)
        : (hasPresentFilter && memory.guestIds.some(id => presentSet.has(id)) ? 1 : 0);
      return { memory, matchScore };
    })
    .sort((a, b) => (
      (b.matchScore - a.matchScore)
      || (b.memory.weight - a.memory.weight)
      || (b.memory.day - a.memory.day)
      || ((b.memory.beatIndex || 0) - (a.memory.beatIndex || 0))
      || (b.memory.createdAt - a.memory.createdAt)
    ));

  const picked: HighlightMemory[] = [];
  const usedGuestIds = new Set<string>();
  const usedKinds = new Set<HighlightMemoryKind>();
  for (const item of scored) {
    if (picked.length >= opts.limit) break;
    const diversityGuestId = opts.guestId || item.memory.guestIds.find(id => !usedGuestIds.has(id)) || item.memory.guestIds[0];
    if (!opts.guestId && diversityGuestId && usedGuestIds.has(diversityGuestId)) continue;
    if (usedKinds.has(item.memory.kind)) continue;
    picked.push(item.memory);
    if (!opts.guestId && diversityGuestId) usedGuestIds.add(diversityGuestId);
    usedKinds.add(item.memory.kind);
  }
  return picked;
}

export function shouldTriggerAlmostExposedBeat(
  state: Pick<CharacterState, 'characterId' | 'publicPrivateDivergence'> | null | undefined,
  secrets: LoveShowPrivateSecret[],
): boolean {
  if (!state || (state.publicPrivateDivergence || 0) < 70) return false;
  return secrets.some(secret => (
    secret.guestId === state.characterId
    && (secret.intensity === 'charged' || secret.intensity === 'volatile')
  ));
}

function findCuedCharacterId(input: DirectorBeatInput, presentCharIds: string[]): string | null {
  const socialCue = (input.socialSignals || [])
    .filter(signal => !signal.consumed && signal.targetGuestId && presentCharIds.includes(signal.targetGuestId))
    .slice(-1)[0]?.targetGuestId;
  if (socialCue) return socialCue;

  let bestMatch: { id: string; index: number } | null = null;
  for (const character of input.characters) {
    if (!presentCharIds.includes(character.id) || !character.name) continue;
    const index = input.recentDialogue.lastIndexOf(character.name);
    if (index < 0) continue;
    if (!bestMatch || index > bestMatch.index) {
      bestMatch = { id: character.id, index };
    }
  }
  return bestMatch?.id || null;
}

// ═══════════════════════════════════════════════
//  1. 赛季生命周期
// ═══════════════════════════════════════════════

/** 创建新赛季 */
export function createSeason(charIds: string[], targetGuestCount = charIds.length): SeasonState {
  return {
    seasonId: uid('season'),
    charIds: [...charIds],
    targetGuestCount: clampLoveShowGuestCount(targetGuestCount),
    day: 1,
    phase: 'day_active' as SeasonPhase,
    status: 'running',
    beatIndex: 0,
    schedule: cloneDefaultSchedule(),
    eliminations: [],
    eliminationOutcomes: [],
    finalChoice: null,
    finaleOutcome: null,
    screenTime: createScreenTimeSeed(charIds),
    usedLocationIds: [],
    startedAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

/** 推进到下一天 */
export function advanceDay(season: SeasonState): SeasonState {
  const normalized = normalizeSeasonState(season);
  const nextDay = normalized.day + 1;
  const isFinalDay = nextDay > 5;
  const day = isFinalDay ? normalized.day : nextDay;
  const beat = DEFAULT_SEASON_SCHEDULE.find(plan => plan.day === day)?.beats[0];
  return {
    ...normalized,
    day,
    beatIndex: 0,
    phase: isFinalDay ? 'completed' : phaseForBeat(beat),
    status: isFinalDay ? 'completed' : statusForDayAndBeat(day, beat),
    lastActiveAt: Date.now(),
  };
}

/** 更新赛季阶段 */
export function updatePhase(season: SeasonState, phase: SeasonPhase): SeasonState {
  return {
    ...normalizeSeasonState(season),
    phase,
    status: phase === 'completed' ? 'completed' : phase === 'finale' ? 'finale' : normalizeSeasonState(season).status,
    lastActiveAt: Date.now(),
  };
}

export function advanceSeasonBeat(season: SeasonState): SeasonState {
  const normalized = normalizeSeasonState(season);
  if (normalized.status === 'completed') return normalized;

  const plan = getSeasonDayPlan(normalized);
  const nextBeatIndex = normalized.beatIndex + 1;
  if (plan && nextBeatIndex < plan.beats.length) {
    const nextBeat = plan.beats[nextBeatIndex];
    return {
      ...normalized,
      beatIndex: nextBeatIndex,
      phase: phaseForBeat(nextBeat),
      status: statusForDayAndBeat(normalized.day, nextBeat),
      lastActiveAt: Date.now(),
    };
  }

  if (normalized.day >= 5) {
    return {
      ...normalized,
      phase: 'completed',
      status: 'completed',
      lastActiveAt: Date.now(),
    };
  }

  const nextDay = normalized.day + 1;
  const nextPlan = normalized.schedule.find(item => item.day === nextDay);
  const nextBeat = nextPlan?.beats[0] || 'opening';
  return {
    ...normalized,
    day: nextDay,
    beatIndex: 0,
    phase: phaseForBeat(nextBeat),
    status: statusForDayAndBeat(nextDay, nextBeat),
    lastActiveAt: Date.now(),
  };
}

export function recordSeasonScreenTime(season: SeasonState, presentCharIds: string[]): SeasonState {
  const normalized = normalizeSeasonState(season);
  const nextScreenTime = { ...normalized.screenTime };
  for (const id of normalized.charIds) {
    if (nextScreenTime[id] === undefined) nextScreenTime[id] = 0;
  }
  for (const id of presentCharIds) {
    if (!normalized.charIds.includes(id) || normalized.eliminations.includes(id)) continue;
    nextScreenTime[id] = (nextScreenTime[id] || 0) + 1;
  }
  return {
    ...normalized,
    screenTime: nextScreenTime,
    lastActiveAt: Date.now(),
  };
}

export function recordSeasonUsedLocation(season: SeasonState, locationId: string | undefined): SeasonState {
  const normalized = normalizeSeasonState(season);
  if (!locationId || !DATE_LOCATION_ID_SET.has(locationId) || normalized.usedLocationIds.includes(locationId)) {
    return normalized;
  }
  return {
    ...normalized,
    usedLocationIds: [...normalized.usedLocationIds, locationId],
    lastActiveAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════
//  2. 导演选择点生成（核心）
// ═══════════════════════════════════════════════

function shouldRunElimination(season: SeasonState): boolean {
  const normalized = normalizeSeasonState(season);
  if (normalized.day < 2 || normalized.day > 4) return false;
  if (normalized.charIds.length <= 4 && normalized.day === 2) return false;
  const targetFinalists = normalized.charIds.length >= 6 ? 3 : 2;
  return activeSeasonCharIds(normalized).length > targetFinalists;
}

function choiceOptionsForGuests(
  guestIds: string[],
  charStates: CharacterState[],
  hintForGuest?: (id: string, state?: CharacterState) => string | undefined,
): ChoiceOption[] {
  return guestIds.map(id => {
    const state = charStates.find(item => item.characterId === id);
    return {
      id,
      label: id,
      hint: hintForGuest?.(id, state),
    };
  });
}

/**
 * 根据当前赛季日程生成下一个选择点。
 * 节目结构由 DEFAULT_SEASON_SCHEDULE 控制，同一天内 beat 顺序稳定可复现。
 */
export function generateNextChoicePoint(
  season: SeasonState,
  charStates: CharacterState[],
  completedChoiceIds: string[],
): ChoicePoint {
  const normalized = normalizeSeasonState(season);
  const { day } = normalized;
  const beat = getCurrentDayBeat(normalized);
  const dayPrefix = `d${day}_b${normalized.beatIndex}_${beat}`;
  const activeGuestIds = activeSeasonCharIds(normalized);
  const screenTime = getScreenTimeMap(normalized);
  const lowScreenTimeFirst = [...activeGuestIds].sort(
    (a, b) => (screenTime.get(a) || 0) - (screenTime.get(b) || 0),
  );
  const optionsWithAffection = choiceOptionsForGuests(
    lowScreenTimeFirst,
    charStates,
    (_id, state) => state ? `好感 ${state.affection}/100` : '节目资料正在更新',
  );
  const hasDone = (type: string) =>
    completedChoiceIds.some(id => id.startsWith(`d${day}_`) && id.includes(type));

  switch (beat) {
    case 'opening':
      return {
        id: `${dayPrefix}_opening_group`,
        type: 'group_event',
        prompt: day === 1
          ? '放送通知：全体嘉宾请到客厅集合，今晚是《唯一心动线》的初见片段。'
          : `放送通知：Day ${day} 开始录制，今天的第一支镜头会重新把大家带回合宿屋。`,
        mandatory: true,
        consequence: '开启今日节目片头',
      };

    case 'group_activity':
      return {
        id: `${dayPrefix}_group_activity`,
        type: 'group_event',
        prompt: `放送通知：Day ${day} 集体活动开始。节目组会把镜头给到最近出现较少的嘉宾。`,
        mandatory: true,
        consequence: '推进集体活动，平衡嘉宾出镜',
      };

    case 'date':
      return {
        id: `${dayPrefix}_date_card`,
        type: 'date_card',
        prompt: day === 5
          ? '最终约会卡送达。终选前，你想先和谁完成最后一次单独约会？'
          : '你收到了一张单独约会邀请卡。今天你想把镜头推近谁？',
        options: optionsWithAffection,
        mandatory: true,
        consequence: '获选嘉宾获得独处约会场景',
      };

    case 'backstage_sms':
      if (hasDone('sms_target') && !hasDone('sms_content')) {
        return {
          id: `${dayPrefix}_sms_content`,
          type: 'sms_content',
          prompt: '写点什么吧。（镜头之外短信，对方会认真看见。）',
          freeInput: true,
          mandatory: false,
          consequence: '短信内容会影响对方的 innerThought 和 mood',
        };
      }
      return {
        id: `${dayPrefix}_sms_target`,
        type: 'sms_target',
        prompt: '镜头之外的短信时间到了。今晚你想把这条消息发给谁？',
        options: choiceOptionsForGuests(lowScreenTimeFirst, charStates, () => '镜头之外发送'),
        mandatory: false,
        consequence: '收到短信的嘉宾会产生对应情绪变化',
      };

    case 'mission':
      return {
        id: `${dayPrefix}_daily_mission`,
        type: 'daily_mission',
        prompt: '隐藏心令已送达。你要现在打开看看吗？',
        options: [
          { id: 'accept', label: '接受心令' },
          { id: 'reject', label: '稍后再看' },
        ],
        mandatory: false,
        consequence: '完成心令会解锁特殊嘉宾反应',
      };

    case 'interview':
      return {
        id: `${dayPrefix}_interview`,
        type: 'interview',
        prompt: day === 5
          ? '终选前，放送组请你去单采间，留下最后一段只属于你的表达。'
          : '放送组请你去单采间坐坐，聊聊今天的感受。',
        freeInput: true,
        mandatory: false,
        consequence: '采访内容会被记录，影响后续剧情走向',
      };

    case 'observatory':
      return {
        id: `${dayPrefix}_observatory`,
        type: 'observatory',
        prompt: '观察室开放了。你想查看谁的单采独白？',
        options: choiceOptionsForGuests(activeGuestIds, charStates, () => '查看 TA 的独白'),
        mandatory: false,
        consequence: '可以看到该嘉宾当天的 innerThought',
      };

    case 'elimination':
      if (!shouldRunElimination(normalized)) {
        return {
          id: `${dayPrefix}_no_elimination`,
          type: 'closing',
          prompt: '今晚不设置送别环节。放送组会把所有仍在场的嘉宾继续留到明天。',
          mandatory: false,
          consequence: '跳过今日送别',
        };
      }
      return {
        id: `${dayPrefix}_elimination`,
        type: 'elimination',
        prompt: '今晚需要做一次温柔但明确的选择：你想把哪位嘉宾送到告别单采，让其他人继续走下去？',
        options: choiceOptionsForGuests(activeGuestIds, charStates, () => '送到告别单采'),
        mandatory: true,
        consequence: '被送别嘉宾退出后续录制，并留下体面的告别单采',
      };

    case 'wind':
      return {
        id: `${dayPrefix}_wind`,
        type: 'wind',
        prompt: '心动风向已经揭晓。观众只会起哄，不会替你决定下一步。',
        mandatory: false,
        consequence: '展示今日心动风向',
      };

    case 'finale':
      return {
        id: `${dayPrefix}_finale`,
        type: 'finale',
        prompt: '终选时刻到了。你可以选择一位决赛嘉宾，也可以主动选择不选任何人，把这一季收束在自己的节奏里。',
        options: [
          ...choiceOptionsForGuests(activeGuestIds, charStates, (_id, state) => state ? `好感 ${state.affection}/100` : '决赛嘉宾'),
          { id: 'open_end', label: '不选择任何人', hint: '开放式结局，由你主动决定' },
        ],
        mandatory: true,
        consequence: '完成 Day 5 终选并进入季终总结',
      };

    case 'closing':
    default:
      return {
        id: `${dayPrefix}_closing`,
        type: 'closing',
        prompt: day >= 5
          ? '本季正片已经收束，放送组准备生成季终回顾。'
          : `Day ${day} 的正片到这里收束。确认后进入下一天。`,
        mandatory: false,
        consequence: '推进到下一天',
      };
  }
}

/**
 * 处理用户对选择点的回应，返回更新后的赛季状态。
 */
export function resolveChoice(
  season: SeasonState,
  choiceId: string,
  selectedOptionId?: string,
  _freeInputText?: string,
): SeasonState {
  // 基本的状态更新逻辑（具体副作用由调用方处理）
  let updated = { ...normalizeSeasonState(season), lastActiveAt: Date.now() };

  // 根据选择类型做特定处理
  if (choiceId.includes('date_card') && selectedOptionId) {
    // 约会券：没有直接的 season 变化，由场景系统处理
  }

  if (choiceId.includes('observatory')) {
    // 观察室结束 → 推进 phase
    updated = updatePhase(updated, 'day_end');
  }

  // 如果当天所有阶段已结束，标记
  if (updated.phase === 'day_end') {
    // 日结束，等 advanceDay() 调用
  }

  return updated;
}

function formatHighlightRecall(memory: HighlightMemory): string {
  return `Day ${memory.day} 的${memory.summary}${memory.callbackLine ? `，还有那句「${memory.callbackLine}」` : ''}`;
}

export function createFarewellInterviewText(guestName: string, day: number, highlights: HighlightMemory[] = []): string {
  const recalled = highlights[0];
  if (recalled) {
    return `${guestName}在 Day ${day} 的告别单采里没有把遗憾说成责怪。他回想起${formatHighlightRecall(recalled)}，只说那一刻让他确认自己真的被你认真看见过，所以离开也会把这段心动带走。`;
  }
  return `${guestName}在 Day ${day} 的告别单采里把遗憾说得很轻：能被你认真看见过，已经是这一季很珍贵的片段。他会带着这段心动体面离开，后面的选择继续交还给你。`;
}

export function resolveEliminationChoice(
  season: SeasonState,
  eliminatedGuestId: string,
  guestName: string,
  highlights: HighlightMemory[] = [],
): SeasonState {
  const normalized = normalizeSeasonState(season);
  if (!shouldRunElimination(normalized) || !activeSeasonCharIds(normalized).includes(eliminatedGuestId)) {
    return advanceSeasonBeat(normalized);
  }
  const farewellInterviewId = uid('farewell');
  const guestHighlights = selectHighlightsForContext(highlights, {
    guestId: eliminatedGuestId,
    day: normalized.day,
    limit: 3,
  });
  const outcome: EliminationOutcome = {
    day: normalized.day,
    eliminatedGuestId,
    farewellInterviewId,
    farewellInterview: createFarewellInterviewText(guestName, normalized.day, guestHighlights),
  };
  return advanceSeasonBeat({
    ...normalized,
    eliminations: Array.from(new Set([...normalized.eliminations, eliminatedGuestId])),
    eliminationOutcomes: [...normalized.eliminationOutcomes, outcome],
    lastActiveAt: Date.now(),
  });
}

export function createFinaleOutcome(
  season: SeasonState,
  chosenGuestId: string | null,
  guestNamesById: Record<string, string>,
  highlights: HighlightMemory[] = [],
): FinaleOutcome {
  const normalized = normalizeSeasonState(season);
  const activeIds = activeSeasonCharIds(normalized);
  const chosenName = chosenGuestId ? guestNamesById[chosenGuestId] || '这位嘉宾' : '';
  const unchosenIds = activeIds.filter(id => id !== chosenGuestId);
  const unchosenInterviewIds = unchosenIds.map(id => uid(`finale_unpicked_${id}`));
  const unchosenInterviews = Object.fromEntries(unchosenIds.map(id => {
    const name = guestNamesById[id] || '这位嘉宾';
    const guestHighlights = selectHighlightsForContext(highlights, {
      guestId: id,
      day: normalized.day,
      limit: 2,
    });
    const recalled = guestHighlights[0];
    return [
      id,
      recalled
        ? `${name}在终选后的单采里提起${formatHighlightRecall(recalled)}。他没有把遗憾说成责怪，只说这一季能陪你走到这里，就已经是一段会被反复回看的记忆。`
        : `${name}在终选后的单采里没有把遗憾说成责怪，只说这一季能陪你走到这里，就已经是一段会被反复回看的记忆。`,
    ];
  }));

  if (!chosenGuestId) {
    return {
      chosenGuestId: null,
      unchosenInterviewIds,
      unchosenInterviews,
      closingNote: '你主动选择把这一季停在自己的节奏里。这不是失败结局，镜头只记录你把选择权收回到自己手中。',
    };
  }

  const chosenHighlights = chosenGuestId
    ? selectHighlightsForContext(highlights, {
        guestId: chosenGuestId,
        day: normalized.day,
        limit: 3,
      })
    : [];
  const chosenRecall = chosenHighlights[0];

  return {
    chosenGuestId,
    chosenResponse: chosenRecall
      ? `${chosenName}听完你的选择后没有急着说漂亮话。他先提起${formatHighlightRecall(chosenRecall)}，然后认真看着你：如果这是你给他的最后一支镜头，他会把它当成这一季最郑重的开始。`
      : `${chosenName}听完你的选择后没有急着说漂亮话，只认真看着你：如果这是你给他的最后一支镜头，他会把它当成这一季最郑重的开始。`,
    unchosenInterviewIds,
    unchosenInterviews,
    closingNote: `你选择了${chosenName}，本季《唯一心动线》在被你确认的心动里完成收束。`,
  };
}

export function resolveFinaleChoice(
  season: SeasonState,
  selectedOptionId: string,
  guestNamesById: Record<string, string>,
  highlights: HighlightMemory[] = [],
): SeasonState {
  const normalized = normalizeSeasonState(season);
  const chosenGuestId = selectedOptionId === 'open_end' ? null : selectedOptionId;
  const outcome = createFinaleOutcome(normalized, chosenGuestId, guestNamesById, highlights);
  return {
    ...normalized,
    finalChoice: chosenGuestId,
    finaleOutcome: outcome,
    phase: 'completed',
    status: 'completed',
    lastActiveAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════
//  3. 场景管理
// ═══════════════════════════════════════════════

/** 根据选择结果创建场景 */
export function createSceneFromChoice(
  season: SeasonState,
  choice: ChoicePoint,
  selectedOption?: string,
): LoveShowScene {
  const normalized = normalizeSeasonState(season);
  const activeCharIds = activeSeasonCharIds(normalized);
  // 确定地点
  let locationId = 'living_room';
  let locationName = '客厅';
  let atmosphere = '公开热闹，群聊破冰';

  switch (choice.type) {
    case 'group_event':
      locationId = 'living_room';
      locationName = '客厅';
      atmosphere = '全员集合，氛围热烈';
      break;

    case 'date_card':
      if (selectedOption) {
        const dateLocation = pickShowArrangedLocation({
          seasonId: normalized.seasonId,
          day: normalized.day,
          beatIndex: normalized.beatIndex,
          sceneType: 'date',
          usedLocationIds: normalized.usedLocationIds,
        });
        locationId = dateLocation.locationId;
        locationName = dateLocation.locationName;
        atmosphere = dateLocation.atmosphere;
      }
      break;

    case 'interview':
      locationId = 'interview_room';
      locationName = '单采间';
      atmosphere = '独处真实，对镜头说心里话';
      break;

    case 'observatory':
      locationId = 'observatory';
      locationName = '观察室';
      atmosphere = '暗处窥探，内心翻涌';
      break;

    case 'elimination':
      locationId = 'interview_room';
      locationName = '告别单采间';
      atmosphere = '体面告别，把选择权交还给你';
      break;

    case 'finale':
      locationId = 'finale_stage';
      locationName = '终选露台';
      atmosphere = '最终选择，尊重你的答案';
      break;

    default:
      break;
  }

  // 确定出场角色
  let characterIds = selectSceneCharacters(
    normalized,
    choice.type === 'group_event' ? 4 : 3,
    undefined,
  );

  if (choice.type === 'date_card' && selectedOption) {
    characterIds = [selectedOption];
  } else if (choice.type === 'sms_target' && selectedOption && !characterIds.includes(selectedOption)) {
    characterIds = [selectedOption, ...characterIds].slice(0, 3);
  } else if ((choice.type === 'observatory' || choice.type === 'interview') && selectedOption) {
    characterIds = [selectedOption];
  }

  const locationGuestIds = choice.type === 'group_event'
    ? activeCharIds
    : characterIds;

  return {
    id: uid('scene'),
    dayNumber: normalized.day,
    locationId,
    locationName,
    characterIds,
    locationGuestIds,
    atmosphere,
    status: 'pending',
  };
}

// ═══════════════════════════════════════════════
//  4. 角色调度
// ═══════════════════════════════════════════════

/** 计算每个角色的戏份（简易版：基于 charIds 出现频次） */
export function getScreenTimeMap(season: SeasonState): Map<string, number> {
  const normalized = normalizeSeasonState(season);
  const map = new Map<string, number>();
  for (const id of normalized.charIds) {
    map.set(id, normalized.screenTime[id] || 0);
  }
  for (const id of normalized.eliminations) {
    map.set(id, Number.POSITIVE_INFINITY);
  }
  return map;
}

/** 选择场景出场角色（基于戏份平衡） */
export function selectSceneCharacters(
  season: SeasonState,
  maxCharacters: number,
  excludeIds?: string[],
): string[] {
  const normalized = normalizeSeasonState(season);
  const excludeSet = new Set(excludeIds || []);
  const available = normalized.charIds.filter(
    (id) => !normalized.eliminations.includes(id) && !excludeSet.has(id),
  );

  const sceneLimit = Math.max(1, Math.min(maxCharacters, 4));
  if (available.length <= sceneLimit) {
    return [...available];
  }

  // 按戏份从少到多排序，优先选低戏份角色
  const screenTime = getScreenTimeMap(normalized);
  const sorted = [...available].sort(
    (a, b) => (screenTime.get(a) || 0) - (screenTime.get(b) || 0),
  );

  return sorted.slice(0, sceneLimit);
}

// ═══════════════════════════════════════════════
//  4.5 导演镜头卡
// ═══════════════════════════════════════════════

export interface DirectorBeatInput {
  season: SeasonState;
  scene: LoveShowScene;
  characters: DirectorBeatCharacterBrief[];
  sceneSummaries: string[];
  recentDialogue: string;
  choiceContext?: string;
  privateSecrets?: LoveShowPrivateSecret[];
  highlightMemories?: HighlightMemory[];
  socialSignals?: SocialSignal[];
}

export type DirectorBeatPlanSource = 'api' | 'fallback';

export interface DirectorBeatPlan {
  beat: DirectorBeat;
  source: DirectorBeatPlanSource;
  issues: string[];
}

export function createFallbackDirectorBeat(input: DirectorBeatInput): DirectorBeat {
  const availableIds = activeSeasonCharIds(input.season);
  const sceneIds = sceneLocationGuestIds(input.scene, input.season);
  const presentCharIds = (sceneIds.length > 0 ? sceneIds : availableIds).slice(0, 4);
  const cuedId = findCuedCharacterId(input, presentCharIds);
  const leadIndex = cuedId
    ? Math.max(0, presentCharIds.indexOf(cuedId))
    : stableIndex(
        `${input.scene.id}|${input.sceneSummaries.length}|${input.recentDialogue.length}|${input.choiceContext || ''}`,
        presentCharIds.length,
      );
  const leadId = presentCharIds[leadIndex] || input.characters[0]?.id || 'unknown';
  const secondId = presentCharIds.length > 1
    ? presentCharIds[(leadIndex + 1) % presentCharIds.length]
    : undefined;
  const speakerIds = [leadId, secondId].filter((id): id is string => Boolean(id));
  let speakers: DirectorBeat['speakers'] = speakerIds.slice(0, 2).map((charId, index) => ({
    charId,
    role: index === 0 ? 'lead' as const : 'respond' as const,
    intent: index === 0
      ? (cuedId === charId ? '回应用户刚刚给出的明确 cue' : '主动接住当前气氛，把话题递给用户')
      : '用一句克制回应补出多人现场感',
  }));
  const allPrivateSecrets = input.privateSecrets?.length
    ? input.privateSecrets
    : input.characters.flatMap(character => character.privateSecrets || []);
  const scenePrivateSecrets = privateSecretsForPublicScene(allPrivateSecrets, presentCharIds);
  const stateById = new Map(input.characters.map(character => [character.id, character.state || null]));
  const almostExposedSecret = scenePrivateSecrets.find(secret => (
    shouldTriggerAlmostExposedBeat(stateById.get(secret.guestId), [secret])
  ));
  const subtextSecret = almostExposedSecret
    || scenePrivateSecrets.find(secret => secret.guestId === leadId)
    || scenePrivateSecrets[0];
  const baseCameraFocus: DirectorBeat['cameraFocus'] = [
    {
      charId: leadId,
      shotType: cuedId ? 'close_up' : (presentCharIds.length > 2 ? 'wide' : 'close_up'),
      reason: cuedId ? '用户刚刚 cue 到这位嘉宾，镜头顺势切过去' : '保底镜头，轮换一位嘉宾接住这一小拍',
    },
    ...(secondId ? [{
      charId: secondId,
      shotType: 'reaction' as const,
      reason: '给第二位嘉宾一个明确的反应机会',
    }] : []),
  ];
  if (subtextSecret && !baseCameraFocus.some(item => item.charId === subtextSecret.guestId)) {
    baseCameraFocus.push({
      charId: subtextSecret.guestId,
      shotType: 'reaction',
      reason: '这位嘉宾有镜头外秘密，公开场需要给出只让用户读懂的反应',
    });
  }
  if (almostExposedSecret && !speakers.some(speaker => speaker.charId === almostExposedSecret.guestId)) {
    speakers = [
      ...speakers,
      {
        charId: almostExposedSecret.guestId,
        role: 'soft_react' as const,
        intent: '差点顺着公开话题说漏镜头外秘密，立刻收住',
      },
    ].slice(0, 3);
  }
  const secretSubtextGuestIds = subtextSecret
    ? Array.from(new Set(scenePrivateSecrets.map(secret => secret.guestId))).slice(0, 3)
    : undefined;

  return {
    beatId: uid('beat'),
    sceneType: inferDirectorSceneType(input.scene, input.season),
    presentCharIds,
    cameraFocus: baseCameraFocus.slice(0, 4),
    speakers,
    reactionOnlyCharIds: presentCharIds.filter(id => !speakers.some(speaker => speaker.charId === id)),
    userPosition: presentCharIds.length > 1 ? 'being_addressed' : 'private_moment',
    endingMode: 'wait_user',
    userPromptHint: '轮到你回应镜头里的这一小拍。',
    secretSubtextGuestIds,
    almostExposedSecretId: almostExposedSecret?.id,
    directorNote: almostExposedSecret
      ? '保底调度：让多人现场稳定，同时安排一次差点露馅的公开反应，秘密只能被用户读懂。'
      : '保底调度：让多人现场稳定，停在用户可以接话的位置。',
  };
}

function fallbackDirectorBeatPlan(input: DirectorBeatInput, issue: string): DirectorBeatPlan {
  return {
    beat: createFallbackDirectorBeat(input),
    source: 'fallback',
    issues: [issue],
  };
}

export function validateDirectorBeat(raw: Partial<DirectorBeat>, input: DirectorBeatInput): DirectorBeatPlan {
  if (!raw || typeof raw !== 'object') {
    return fallbackDirectorBeatPlan(input, 'DirectorBeat is not a JSON object');
  }

  const fallback = createFallbackDirectorBeat(input);
  const activeIds = activeSeasonCharIds(input.season);
  const sceneAllowedIds = sceneLocationGuestIds(input.scene, input.season);
  const allowedPresentSet = new Set(sceneAllowedIds.length > 0 ? sceneAllowedIds : activeIds);
  const issues: string[] = [];

  const rawPresent = Array.isArray(raw.presentCharIds) ? raw.presentCharIds : [];
  const presentCharIds = rawPresent
    .filter((id): id is string => typeof id === 'string' && allowedPresentSet.has(id));
  if (!Array.isArray(raw.presentCharIds)) {
    return fallbackDirectorBeatPlan(input, 'presentCharIds is missing or not an array');
  }
  if (presentCharIds.length === 0) {
    return fallbackDirectorBeatPlan(input, 'presentCharIds has no valid season characters');
  }
  if (presentCharIds.length !== rawPresent.length) {
    issues.push('Removed presentCharIds that are not allowed in the current scene');
  }

  const safePresent = presentCharIds.slice(0, 4);
  if (presentCharIds.length > safePresent.length) {
    issues.push('Trimmed presentCharIds to 4 characters');
  }
  if (!isOneOf(raw.sceneType, DIRECTOR_SCENE_TYPES)) {
    return fallbackDirectorBeatPlan(input, 'sceneType is invalid');
  }
  if (!isOneOf(raw.endingMode, DIRECTOR_ENDING_MODES)) {
    return fallbackDirectorBeatPlan(input, 'endingMode is invalid');
  }

  const presentSet = new Set(safePresent);
  const fallbackForPresent = createFallbackDirectorBeat({
    ...input,
    scene: { ...input.scene, characterIds: safePresent },
  });

  const rawFocus = Array.isArray(raw.cameraFocus) ? raw.cameraFocus : [];
  if (!Array.isArray(raw.cameraFocus)) {
    issues.push('cameraFocus is missing or not an array; using fallback focus');
  }
  const cameraFocus = rawFocus
    .filter(item => item && typeof item === 'object')
    .map(item => item as DirectorBeat['cameraFocus'][number])
    .filter(item => {
      const valid = presentSet.has(item.charId);
      if (!valid) issues.push(`Removed cameraFocus for non-present character: ${String(item.charId)}`);
      return valid;
    })
    .slice(0, 4)
    .map(item => {
      const shotType = isOneOf(item.shotType, DIRECTOR_SHOT_TYPES) ? item.shotType : 'reaction';
      if (shotType !== item.shotType) {
        issues.push(`Repaired invalid shotType for ${item.charId}`);
      }
      return {
        charId: item.charId,
        shotType,
        reason: typeof item.reason === 'string' && item.reason.trim() ? item.reason.trim() : '镜头需要给出反应',
      };
    });

  const rawSpeakers = Array.isArray(raw.speakers) ? raw.speakers : [];
  if (!Array.isArray(raw.speakers)) {
    issues.push('speakers is missing or not an array; using fallback speakers');
  }
  if (rawSpeakers.length > 3) {
    issues.push('Trimmed speakers to 3 characters');
  }
  const speakers = rawSpeakers
    .filter(item => item && typeof item === 'object')
    .map(item => item as DirectorBeat['speakers'][number])
    .filter(item => {
      const valid = presentSet.has(item.charId);
      if (!valid) issues.push(`Removed speaker for non-present character: ${String(item.charId)}`);
      return valid;
    })
    .slice(0, 3)
    .map(item => {
      const role = isOneOf(item.role, DIRECTOR_SPEAKER_ROLES) ? item.role : 'respond';
      if (role !== item.role) {
        issues.push(`Repaired invalid speaker role for ${item.charId}`);
      }
      return {
        charId: item.charId,
        role,
        intent: typeof item.intent === 'string' && item.intent.trim() ? item.intent.trim() : '自然回应这一小拍',
      };
    });

  const speakerSet = new Set(speakers.map(speaker => speaker.charId));
  const rawReactions = Array.isArray(raw.reactionOnlyCharIds) ? raw.reactionOnlyCharIds : [];
  if (!Array.isArray(raw.reactionOnlyCharIds)) {
    issues.push('reactionOnlyCharIds is missing or not an array; inferred reaction slots');
  }
  const reactionOnlyCharIds = Array.from(new Set([
    ...rawReactions.filter((id): id is string => {
      const valid = typeof id === 'string' && presentSet.has(id) && !speakerSet.has(id);
      if (!valid) issues.push(`Removed invalid or speaking reactionOnly character: ${String(id)}`);
      return valid;
    }),
    ...safePresent.filter(id => !speakerSet.has(id)),
  ]));

  const allPrivateSecrets = input.privateSecrets?.length
    ? input.privateSecrets
    : input.characters.flatMap(character => character.privateSecrets || []);
  const scenePrivateSecrets = privateSecretsForPublicScene(allPrivateSecrets, safePresent);
  const allowedSecretGuestIds = new Set(scenePrivateSecrets.map(secret => secret.guestId));
  const allowedSecretIds = new Set(scenePrivateSecrets.map(secret => secret.id));
  const rawSecretGuests = Array.isArray(raw.secretSubtextGuestIds) ? raw.secretSubtextGuestIds : [];
  const secretSubtextGuestIds = rawSecretGuests.length > 0
    ? Array.from(new Set(rawSecretGuests.filter((id): id is string => {
        const valid = typeof id === 'string' && presentSet.has(id) && allowedSecretGuestIds.has(id);
        if (!valid) issues.push(`Removed invalid secretSubtextGuestId: ${String(id)}`);
        return valid;
      }))).slice(0, 3)
    : fallbackForPresent.secretSubtextGuestIds;
  const rawAlmostExposedSecretId = typeof raw.almostExposedSecretId === 'string'
    ? raw.almostExposedSecretId
    : '';
  const almostExposedSecretId = rawAlmostExposedSecretId && allowedSecretIds.has(rawAlmostExposedSecretId)
    ? rawAlmostExposedSecretId
    : fallbackForPresent.almostExposedSecretId;
  if (rawAlmostExposedSecretId && !allowedSecretIds.has(rawAlmostExposedSecretId)) {
    issues.push('Removed invalid almostExposedSecretId');
  }

  if (cameraFocus.length === 0) {
    issues.push('cameraFocus had no valid entries; using fallback focus');
  }
  if (speakers.length === 0) {
    issues.push('speakers had no valid entries; using fallback speakers');
  }

  const userPosition = isOneOf(raw.userPosition, DIRECTOR_USER_POSITIONS)
    ? raw.userPosition
    : fallback.userPosition;
  if (userPosition !== raw.userPosition) {
    issues.push('Repaired invalid userPosition');
  }

  return {
    beat: {
      beatId: typeof raw.beatId === 'string' && raw.beatId.trim() ? raw.beatId.trim() : fallback.beatId,
      sceneType: raw.sceneType,
      presentCharIds: safePresent,
      cameraFocus: cameraFocus.length > 0 ? cameraFocus : fallbackForPresent.cameraFocus,
      speakers: speakers.length > 0 ? speakers : fallbackForPresent.speakers,
      reactionOnlyCharIds,
      userPosition,
      endingMode: raw.endingMode,
      userPromptHint: typeof raw.userPromptHint === 'string' ? raw.userPromptHint : fallback.userPromptHint,
      secretSubtextGuestIds,
      almostExposedSecretId,
      directorNote: typeof raw.directorNote === 'string' && raw.directorNote.trim()
        ? raw.directorNote.trim()
        : fallback.directorNote,
    },
    source: 'api',
    issues,
  };
}

// ═══════════════════════════════════════════════
//  5. 副模型调用封装
// ═══════════════════════════════════════════════

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const SUB_MODEL_SYSTEM_PROMPT = '你是恋综副模型。严格遵守用户提示中的输出格式，不要添加解释。';
const SUB_MODEL_TIMEOUT_MS = 60000;
const SUB_MODEL_MAX_TOKENS = 65536;
const NPC_SKELETON_MAX_TOKENS = SUB_MODEL_MAX_TOKENS;
const NPC_EXPAND_MAX_TOKENS = SUB_MODEL_MAX_TOKENS;
const GUEST_GUEST_CP_RISK_RE = /(谁和谁最配|嘉宾\s*CP|CP\s*排名|互选心动|嘉宾互选|恋爱线投票|互相心动|锁死|在一起|最配)/i;
const SOCIAL_POLL_TEMPLATE_RE = /(单独约会投票|本轮最想看的单独约会|温柔庇护组|真迹拆穿组|宿命拉扯组|推倒重来组|A[\.、].*B[\.、].*C[\.、])/i;
const SOCIAL_STOCK_COMMENT_RE = /(遗憾留给|心动留给|被看见|留给昨天|我选[ABCDＡＢＣＤ]|大家怎么看|呼声最高|心动风向标|Day\s*\d+\s*总结|总结：|温柔庇护组|真迹拆穿组|宿命拉扯组|推倒重来组|投票|^[^，。！？]{0,8}留给[^，。！？]{0,12}[，,][^，。！？]{0,12}留给)/i;

function sanitizeUserCenteredAudienceText(
  text: unknown,
  userName: string,
  kind: 'post' | 'comment' = 'post',
): string | null {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return null;
  if (GUEST_GUEST_CP_RISK_RE.test(content) && !content.includes(userName)) {
    return null;
  }
  if (SOCIAL_POLL_TEMPLATE_RE.test(content)) {
    return null;
  }
  if (kind === 'comment') {
    if (content.length < 8 || content.length > 120) return null;
    if (SOCIAL_STOCK_COMMENT_RE.test(content)) return null;
  }
  return content;
}

function sanitizeUserCenteredMissionText(text: string, fallback: string): string {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content) return fallback;
  if (GUEST_GUEST_CP_RISK_RE.test(content)) {
    return fallback;
  }
  return content;
}

/**
 * 通用的 OpenAI 兼容 API 调用器。
 * 使用标准 fetch，不引入新 HTTP 库。
 */
async function callSubModel(
  config: ApiConfig,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  requestLabel = '副模型',
  maxTokens = SUB_MODEL_MAX_TOKENS,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SUB_MODEL_TIMEOUT_MS);
  let resp: Response;

  try {
    resp = await trackedApiRequest({
      feature: 'love_show',
      reason: requestLabel,
      model: config.model,
      url,
      userInitiated: false,
    }, () => fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`${requestLabel} 请求超时（${Math.round(SUB_MODEL_TIMEOUT_MS / 1000)} 秒）：${url}`);
    }
    throw new Error(`${requestLabel} 请求失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    const suffix = detail.trim() ? ` - ${detail.trim().slice(0, 400)}` : '';
    throw new Error(`${requestLabel} API error: ${resp.status} ${resp.statusText}${suffix}`);
  }

  const data = await resp.json().catch((err) => {
    throw new Error(`${requestLabel} 响应不是合法 JSON：${err instanceof Error ? err.message : String(err)}`);
  });
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() || '';
  const finishReason = String(choice?.finish_reason || '');
  if (/length|max_tokens|max_output_tokens/i.test(finishReason)) {
    throw new Error(`${requestLabel} 输出达到 max_tokens 上限（finish_reason: ${finishReason}）`);
  }
  return content;
}

/**
 * 安全地解析 JSON 响应。
 * 容忍模型在 JSON 前后加 markdown 代码块标记。
 */
export function cleanSubModelText(raw: string): string {
  const trimmed = (raw || '').trim();
  const fullFence = trimmed.match(/^```(?:json|text)?\s*\n?([\s\S]*?)\n?\s*```$/i);
  return (fullFence ? fullFence[1] : trimmed)
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonCandidate(raw: string): string {
  const cleaned = cleanSubModelText(raw);
  const firstArray = cleaned.indexOf('[');
  const firstObject = cleaned.indexOf('{');
  const starts: number[] = [firstArray, firstObject].filter(index => index >= 0);
  if (starts.length === 0) return cleaned;
  const start = Math.min(...starts);
  const opening = cleaned[start];
  const closing = opening === '[' ? ']' : '}';
  const end = cleaned.lastIndexOf(closing);
  return end >= start ? cleaned.slice(start, end + 1).trim() : cleaned;
}

function safeParseJson<T>(raw: string): T {
  const cleaned = cleanSubModelText(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const candidate = extractJsonCandidate(cleaned);
    try {
      return JSON.parse(candidate);
    } catch {
      const extracted = extractJson(raw, { logFailure: false });
      if (extracted !== null) return extracted as T;
      throw new Error(`Failed to parse JSON from sub-model response: ${raw.slice(0, 200)}`);
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unwrapSocialPostRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isPlainRecord);
  }
  if (!isPlainRecord(parsed)) return [];
  const candidates = [
    parsed.posts,
    parsed.items,
    parsed.data,
    parsed.result,
    parsed.results,
    parsed.socialPosts,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isPlainRecord);
    }
  }
  return [];
}

function readStringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeSocialGuestLookupKey(value: string): string {
  return value.replace(/\s+/g, '').trim().toLocaleLowerCase();
}

function resolveGeneratedSocialGuest(
  record: Record<string, unknown>,
  guestBriefs: SocialPostsGuestBrief[],
): SocialPostsGuestBrief | null {
  if (guestBriefs.length === 0) return null;
  const id = normalizeSocialGuestLookupKey(readStringField(record, [
    'authorGuestId',
    'guestId',
    'guest_id',
    'authorId',
  ]));
  const name = normalizeSocialGuestLookupKey(readStringField(record, [
    'authorName',
    'username',
    'name',
    'nickname',
  ]));

  return guestBriefs.find(guest => {
    const guestId = normalizeSocialGuestLookupKey(guest.id);
    const guestName = normalizeSocialGuestLookupKey(guest.name);
    return (id && id === guestId) || (name && name === guestName);
  }) || null;
}

function isGeneratedGuestSocialRecord(
  record: Record<string, unknown>,
  guestBriefs: SocialPostsGuestBrief[],
): boolean {
  const authorType = readStringField(record, ['authorType', 'type', 'role']);
  if (/guest|嘉宾/i.test(authorType)) return true;
  if (readStringField(record, ['authorGuestId', 'guestId', 'guest_id'])) return true;
  return Boolean(resolveGeneratedSocialGuest(record, guestBriefs));
}

function isSocialGuestDisplayName(authorName: string, guestBriefs: SocialPostsGuestBrief[]): boolean {
  const normalized = normalizeSocialGuestLookupKey(authorName);
  if (!normalized) return false;
  return guestBriefs.some(guest => normalizeSocialGuestLookupKey(guest.name) === normalized);
}

function sanitizeGeneratedGuestSocialText(
  text: unknown,
  userName: string,
  kind: 'post' | 'comment' = 'post',
): string | null {
  const content = sanitizeUserCenteredAudienceText(text, userName, kind);
  if (!content) return null;
  if (content.includes('心动风向标')) return null;
  const minLength = kind === 'comment' ? 4 : 8;
  const maxLength = kind === 'comment' ? 120 : 220;
  if (content.length < minLength || content.length > maxLength) return null;
  return content;
}

function normalizeGeneratedSocialComments(
  rawComments: unknown,
  postId: string,
  userName: string,
  createdAt: number,
  guestBriefs: SocialPostsGuestBrief[] = [],
): LoveShowSocialPost['comments'] {
  if (!Array.isArray(rawComments)) return [];
  return rawComments
    .map((comment, index): LoveShowSocialPost['comments'][number] | null => {
      const record = typeof comment === 'string'
        ? { content: comment }
        : isPlainRecord(comment)
          ? comment
          : null;
      if (!record) return null;
      const rawContent = readStringField(record, ['content', 'text', 'body', 'comment']);
      const wantsGuestVoice = isGeneratedGuestSocialRecord(record, guestBriefs);
      const guest = wantsGuestVoice ? resolveGeneratedSocialGuest(record, guestBriefs) : null;
      if (wantsGuestVoice && !guest) return null;

      if (guest) {
        const content = sanitizeGeneratedGuestSocialText(rawContent, userName, 'comment');
        if (!content) return null;
        return {
          id: uid('comment_ai'),
          postId,
          authorType: 'guest',
          authorId: guest.id,
          authorName: guest.name,
          authorGuestId: guest.id,
          content,
          createdAt: createdAt + index + 1,
        };
      }

      const content = sanitizeUserCenteredAudienceText(rawContent, userName, 'comment');
      if (!content) return null;
      const authorName = readStringField(record, ['authorName', 'username', 'name', 'nickname']) || '心动观众';
      if (isSocialGuestDisplayName(authorName, guestBriefs)) return null;
      return {
        id: readStringField(record, ['id']) || uid('comment_ai'),
        postId,
        authorType: 'audience',
        authorId: readStringField(record, ['authorId']) || `audience_${index}`,
        authorName,
        content,
        createdAt: createdAt + index + 1,
      };
    })
    .filter((comment): comment is LoveShowSocialPost['comments'][number] => Boolean(comment));
}

export async function evaluateLoveShowPrivateSecretWithMeta(
  apiConfig: ApiConfig | null,
  input: LoveShowPrivateSecretDraftInput,
): Promise<LoveShowPrivateSecretPlan> {
  const localFallback = createLoveShowPrivateSecret(input);
  if (!apiConfig) {
    return localFallback
      ? {
          secret: localFallback,
          highlight: createPrivateSecretHighlight(input, localFallback),
          source: 'fallback',
          issues: ['No secondary API configured'],
        }
      : { secret: null, highlight: null, source: 'none', issues: ['No secondary API configured'] };
  }

  const userPrompt = buildPrivateSecretEvalPrompt({
    guestName: input.guestName || input.guestId,
    userName: input.userName,
    day: input.season.day,
    userMessage: input.userMessage,
    guestReply: input.guestReply,
    existingSecrets: input.existingSecrets,
  });

  try {
    const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.2, `${input.guestName || input.guestId} 私聊秘密判定`);
    const parsed = safeParseJson<LoveShowPrivateSecretDecisionPayload>(raw);
    return createLoveShowPrivateSecretFromDecision(input, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return localFallback
      ? {
          secret: localFallback,
          highlight: createPrivateSecretHighlight(input, localFallback),
          source: 'fallback',
          issues: [`Structured secret decision failed; local fallback used: ${message}`],
        }
      : { secret: null, highlight: null, source: 'none', issues: [`Structured secret decision failed: ${message}`] };
  }
}

export async function evaluateLoveShowPrivateSecret(
  apiConfig: ApiConfig | null,
  input: LoveShowPrivateSecretDraftInput,
): Promise<LoveShowPrivateSecret | null> {
  const plan = await evaluateLoveShowPrivateSecretWithMeta(apiConfig, input);
  return plan.secret;
}

const IMPRESSION_RISK_TERMS = [
  '危险',
  '猎物',
  '奖品',
  '战利品',
  '征服',
  '驯服',
  '拿捏',
  '心机',
  '难搞',
  '不安分',
  '很会',
  '会玩',
  '吊着',
  '勾人',
  '搅乱',
  '争夺',
  '变量',
  '破坏规则',
  '重新定义规则',
  '让人想靠近',
  '让人忍不住',
  '看不透',
  '执棋',
  '入局',
  '掌控感',
  '反客为主',
  '攻略',
  '占有',
  '被争夺',
] as const;

const SAFE_IMPRESSION_FALLBACKS = [
  '她没有急着回应，但态度很稳。',
  '她有自己的节奏，不太会被气氛推着走。',
  '她说话不重，但能把意思讲明白。',
  '相处起来比一开始轻松一点。',
];

function textLength(text: string): number {
  return Array.from(text).length;
}

function truncateText(text: string, maxLength: number): string {
  const chars = Array.from(text.trim());
  return chars.length > maxLength ? chars.slice(0, maxLength).join('') : chars.join('');
}

function hasImpressionRisk(text: string): string | null {
  return IMPRESSION_RISK_TERMS.find(term => text.includes(term)) || null;
}

function stringArrayFrom(value: unknown, fallback: string[], maxItems: number): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function currentTentativeReads(current: LoveShowUserImpression): string[] {
  return current.tentativeReads?.length ? current.tentativeReads : current.misconceptions || [];
}

function normalizeImpressionPayload(
  payload: Record<string, unknown>,
  current: LoveShowUserImpression,
): LoveShowUserImpression {
  const tentativeReads = stringArrayFrom(
    payload.tentativeReads ?? payload.misconceptions,
    currentTentativeReads(current),
    4,
  );
  const impression = typeof payload.impression === 'string' && payload.impression.trim()
    ? payload.impression.trim()
    : current.impression;

  return {
    ...current,
    perceivedTraits: stringArrayFrom(payload.perceivedTraits, current.perceivedTraits || [], 4),
    knownFacts: stringArrayFrom(payload.knownFacts, current.knownFacts || [], 4),
    tentativeReads,
    misconceptions: tentativeReads,
    impression,
  };
}

function collectImpressionIssues(candidate: LoveShowUserImpression): string[] {
  const issues: string[] = [];
  const checkText = (field: string, text: string) => {
    const term = hasImpressionRisk(text);
    if (term) issues.push(`${field} 含高风险表达「${term}」`);
  };

  candidate.perceivedTraits.forEach((trait, index) => {
    checkText(`perceivedTraits[${index}]`, trait);
    if (textLength(trait) > 8) issues.push(`perceivedTraits[${index}] 过长，应是 2-6 个字左右`);
  });
  candidate.knownFacts.forEach((fact, index) => {
    checkText(`knownFacts[${index}]`, fact);
    if (textLength(fact) > 18) issues.push(`knownFacts[${index}] 过长，应不超过 18 字`);
  });
  candidate.tentativeReads.forEach((read, index) => {
    checkText(`tentativeReads[${index}]`, read);
    if (textLength(read) > 36) issues.push(`tentativeReads[${index}] 过长，应具体但克制`);
  });
  checkText('impression', candidate.impression);
  if (textLength(candidate.impression) > 32) issues.push('impression 过长，应不超过 32 字');

  return issues;
}

function filterSafeImpressionItems(items: string[], maxItems: number, maxLength: number): string[] {
  return items
    .filter(item => !hasImpressionRisk(item))
    .map(item => truncateText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function createSafeImpressionFallback(
  current: LoveShowUserImpression,
  sceneSummary: string,
): LoveShowUserImpression {
  const perceivedTraits = filterSafeImpressionItems(current.perceivedTraits || [], 4, 8);
  const knownFacts = filterSafeImpressionItems(current.knownFacts || [], 4, 18);
  const tentativeReads = filterSafeImpressionItems(currentTentativeReads(current), 4, 32);
  const fallbackIndex = stableIndex(`${current.characterId}|${sceneSummary}`, SAFE_IMPRESSION_FALLBACKS.length);

  return {
    ...current,
    perceivedTraits: perceivedTraits.length > 0 ? perceivedTraits : ['有分寸'],
    knownFacts: knownFacts.length > 0 ? knownFacts : ['参与了刚才的互动'],
    tentativeReads: tentativeReads.length > 0 ? tentativeReads : ['可能还在观察气氛'],
    misconceptions: tentativeReads.length > 0 ? tentativeReads : ['可能还在观察气氛'],
    impression: SAFE_IMPRESSION_FALLBACKS[fallbackIndex],
  };
}

async function repairImpressionPayload(
  apiConfig: ApiConfig,
  charName: string,
  userName: string,
  rawOutput: string,
  issues: string[],
  currentImpression: LoveShowUserImpression,
): Promise<LoveShowUserImpression> {
  const repairPrompt = buildImpressionRepairPrompt(charName, userName, rawOutput, issues);
  const repairedRaw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, repairPrompt, 0.25, `${charName} 印象修正`);
  const repairedParsed = safeParseJson<Record<string, unknown>>(repairedRaw);
  return normalizeImpressionPayload(repairedParsed, currentImpression);
}

/** 生成下一小拍导演镜头卡（带校验元信息） */
export async function generateDirectorBeatWithMeta(
  apiConfig: ApiConfig,
  input: DirectorBeatInput,
): Promise<DirectorBeatPlan> {
  const userPrompt = buildDirectorBeatPrompt(
    input.season,
    input.scene,
    input.characters,
    input.sceneSummaries,
    input.recentDialogue,
    input.choiceContext,
    input.highlightMemories,
    input.socialSignals,
  );

  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.45, 'DirectorBeat');
  try {
    const parsed = safeParseJson<Partial<DirectorBeat>>(raw);
    return validateDirectorBeat(parsed, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DirectorBeat JSON parse failed';
    return fallbackDirectorBeatPlan(input, message);
  }
}

/** 生成下一小拍导演镜头卡 */
export async function generateDirectorBeat(
  apiConfig: ApiConfig,
  input: DirectorBeatInput,
): Promise<DirectorBeat> {
  const plan = await generateDirectorBeatWithMeta(apiConfig, input);
  return plan.beat;
}

/** 评估角色状态变化 */
export async function evaluateCharacterState(
  apiConfig: ApiConfig,
  charName: string,
  userName: string,
  sceneSummary: string,
  currentState: CharacterState,
  socialSignals: SocialSignal[] = [],
): Promise<CharacterState> {
  const userPrompt = buildCharacterStateEvalPrompt(charName, userName, sceneSummary, currentState, socialSignals);

  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.5, `${charName} 状态评估`);
  const parsed = safeParseJson<Partial<CharacterState>>(raw);

  return {
    ...currentState,
    ...parsed,
    characterId: currentState.characterId, // 不可覆盖
    lastUpdatedScene: sceneSummary.slice(0, 50),
  };
}

/** 更新印象卡 */
export async function updateImpression(
  apiConfig: ApiConfig,
  charName: string,
  userName: string,
  sceneSummary: string,
  currentImpression: LoveShowUserImpression,
  socialSignals: SocialSignal[] = [],
): Promise<LoveShowUserImpression> {
  const userPrompt = buildImpressionUpdatePrompt(charName, userName, sceneSummary, currentImpression, socialSignals);

  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.5, `${charName} 印象更新`);
  let candidate: LoveShowUserImpression;

  try {
    const parsed = safeParseJson<Record<string, unknown>>(raw);
    candidate = normalizeImpressionPayload(parsed, currentImpression);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      candidate = await repairImpressionPayload(
        apiConfig,
        charName,
        userName,
        raw,
        [`印象卡返回内容不是合法 JSON：${message}`],
        currentImpression,
      );
    } catch (repairErr) {
      console.warn('[LoveShow] Impression JSON repair failed; using local fallback.', repairErr);
      return createSafeImpressionFallback(currentImpression, sceneSummary);
    }
  }

  const issues = collectImpressionIssues(candidate);
  if (issues.length === 0) return candidate;

  try {
    const repaired = await repairImpressionPayload(
      apiConfig,
      charName,
      userName,
      JSON.stringify(candidate),
      issues,
      currentImpression,
    );
    const repairedIssues = collectImpressionIssues(repaired);
    if (repairedIssues.length === 0) return repaired;
    console.warn('[LoveShow] Impression repair still unsafe; using local fallback.', repairedIssues);
  } catch (err) {
    console.warn('[LoveShow] Impression repair failed; using local fallback.', err);
  }

  return createSafeImpressionFallback(currentImpression, sceneSummary);
}

export interface SceneSummaryHighlightContext {
  season: Pick<SeasonState, 'seasonId' | 'day' | 'beatIndex' | 'charIds'>;
  sceneId: string;
  guestIds: string[];
  createdAt?: number;
}

export interface SceneSummaryWithHighlights {
  summary: string;
  highlights: HighlightMemory[];
}

function parseSceneSummaryWithHighlights(
  raw: string,
  context: SceneSummaryHighlightContext,
): SceneSummaryWithHighlights {
  try {
    const parsed = safeParseJson<Record<string, unknown>>(raw);
    const summary = compactHighlightText(parsed.summary, cleanSubModelText(raw), 80);
    const highlightPayloads = Array.isArray(parsed.highlights) ? parsed.highlights : [];
    const highlights = highlightPayloads
      .map(item => (item && typeof item === 'object'
        ? createHighlightFromSceneDraft(item as Record<string, unknown>, context)
        : null))
      .filter((item): item is HighlightMemory => Boolean(item))
      .slice(0, 2);
    return { summary, highlights };
  } catch {
    return {
      summary: compactHighlightText(cleanSubModelText(raw), '这段互动留下了一次值得回看的变化', 80),
      highlights: [],
    };
  }
}

/** 生成场景摘要和可回调高光 */
export async function generateSceneSummaryWithHighlights(
  apiConfig: ApiConfig,
  charName: string,
  userName: string,
  rawDialogue: string,
  context: SceneSummaryHighlightContext,
): Promise<SceneSummaryWithHighlights> {
  const userPrompt = buildSceneSummaryPrompt(charName, userName, rawDialogue, context.guestIds);
  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.4, '场景摘要');
  return parseSceneSummaryWithHighlights(raw, context);
}

/** 生成场景摘要 */
export async function generateSceneSummary(
  apiConfig: ApiConfig,
  charName: string,
  userName: string,
  rawDialogue: string,
): Promise<string> {
  const userPrompt = buildSceneSummaryPrompt(charName, userName, rawDialogue);
  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.4, '场景摘要');
  return parseSceneSummaryWithHighlights(raw, {
    season: { seasonId: 'legacy', day: 1, beatIndex: 0, charIds: [] },
    sceneId: 'legacy',
    guestIds: [],
  }).summary;
}

/** 批量生成社交媒体帖子 */
export async function generateSocialPosts(
  apiConfig: ApiConfig,
  day: number,
  seasonSummary: string,
  charNames: string[],
  userName?: string,
  guestBriefs: SocialPostsGuestBrief[] = [],
): Promise<LoveShowSocialPost[]> {
  const safeUserName = userName || '用户';
  const userPrompt = buildSocialPostsPrompt(day, seasonSummary, charNames, safeUserName, guestBriefs);

  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.8, '热搜生成');
  const parsed = safeParseJson<unknown>(raw);
  const posts = unwrapSocialPostRecords(parsed);

  return posts.map((post, i): LoveShowSocialPost | null => {
    const wantsGuestVoice = isGeneratedGuestSocialRecord(post, guestBriefs);
    const guest = wantsGuestVoice ? resolveGeneratedSocialGuest(post, guestBriefs) : null;
    if (wantsGuestVoice && !guest) return null;
    const authorType: LoveShowSocialPost['authorType'] = guest ? 'guest' : 'audience';
    const fallbackAudienceName = `心动观众${i + 1}`;
    const username = guest
      ? guest.name
      : readStringField(post, ['username', 'authorName', 'name', 'nickname']) || fallbackAudienceName;
    const authorName = guest
      ? guest.name
      : readStringField(post, ['authorName', 'username', 'name', 'nickname']) || username;
    if (`${username} ${authorName}`.includes('心动风向标')) return null;
    const likes = typeof post.likes === 'number' ? post.likes : undefined;
    if (!guest && isSocialGuestDisplayName(authorName, guestBriefs)) return null;
    const rawContent = readStringField(post, ['content', 'text', 'body']);
    const content = guest
      ? sanitizeGeneratedGuestSocialText(rawContent, safeUserName, 'post')
      : sanitizeUserCenteredAudienceText(rawContent, safeUserName);
    if (!content) return null;
    const id = readStringField(post, ['id']) || uid('post');
    const createdAt = Date.now() + i * 100;
    return normalizeLoveShowSocialPost({
      id,
      dayNumber: day,
      platform: (post.platform as LoveShowSocialPost['platform']) || 'weibo',
      username,
      authorType,
      authorId: guest ? guest.id : `audience_${i}`,
      authorName,
      authorGuestId: guest?.id,
      content,
      comments: normalizeGeneratedSocialComments(post.comments, id, safeUserName, createdAt, guestBriefs),
      likes,
      likeCount: likes,
      source: guest ? 'scene_end' : 'system',
      createdAt,
    }, day);
  }).filter((post): post is LoveShowSocialPost => Boolean(post));
}

/** 生成 NPC 骨架 */
type NpcSkeletonPayload = Record<string, unknown>;

const NPC_APPEARANCE_STYLE_TERMS_RE = /(写实|二次元|国漫|CG|插画|照片|真人|3D|3d|卡通|Q版|q版|画风|摄影|镜头|壁纸)/i;

function normalizeNpcAppearance(value: unknown, index: number): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length < 12 || NPC_APPEARANCE_STYLE_TERMS_RE.test(text)) {
    return getFallbackLoveShowNpcAppearance(index);
  }
  return text.length > 220 ? text.slice(0, 220) : text;
}

function readNpcString(payload: NpcSkeletonPayload, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNpcNumber(payload: NpcSkeletonPayload, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function readNpcApproach(payload: NpcSkeletonPayload): LoveShowStrategy | undefined {
  const raw = readNpcString(payload, ['approach', 'strategy', 'loveStrategy', '恋爱打法', '打法', '策略']);
  if (isLoveShowStrategy(raw)) return raw;
  if (/直球/.test(raw)) return '直球表白';
  if (/主动|进攻|强势/.test(raw)) return '主动进攻';
  if (/欲擒故纵|忽冷忽热|拉扯/.test(raw)) return '欲擒故纵';
  if (/守护|行动派|默默/.test(raw)) return '默默守护';
  if (/撤退|退让|体面/.test(raw)) return '撤退';
  if (/观望|慢热|观察/.test(raw)) return '观望';
  return undefined;
}

function normalizeNpcSkeletonPayload(payload: NpcSkeletonPayload, index: number): NpcProfile {
  const rawAge = readNpcNumber(payload, ['age', '年龄']);
  const age = rawAge !== null
    ? Math.min(32, Math.max(22, Math.round(rawAge)))
    : 22 + (index % 8);
  const fallbackApproach: LoveShowStrategy = LOVE_SHOW_APPROACHES[index % LOVE_SHOW_APPROACHES.length] || '观望';
  const name = readNpcString(payload, ['name', '姓名', '名字']);
  const job = readNpcString(payload, ['job', 'occupation', 'career', '职业', '工作']);
  const memorableDetail = readNpcString(payload, [
    'memorableDetail',
    'memorable_detail',
    'detail',
    'specificDetail',
    'habit',
    '记忆点',
    '具体细节',
    '细节',
    '习惯',
  ]);
  const sampleLine = readNpcString(payload, [
    'sampleLine',
    'sample_line',
    'line',
    'quote',
    'dialogue',
    '说话示例',
    '台词',
    '口头禅',
  ]);
  const motivation = readNpcString(payload, ['motivation', 'reason', 'backstory', '参加动机', '动机', '来节目原因']);
  const appearance = readNpcString(payload, ['appearance', 'look', 'looks', 'visual', '外貌', '长相', '外形']);
  return {
    id: `npc_${crypto.randomUUID()}`,
    name: name || `空降嘉宾${index + 1}`,
    age,
    job: job || '自由职业',
    memorableDetail,
    sampleLine,
    motivation,
    approach: readNpcApproach(payload) || fallbackApproach,
    appearance: normalizeNpcAppearance(appearance, index),
    generatedPrompt: '',
  };
}

function appearanceKey(appearance: string | undefined): string {
  return String(appearance || '').replace(/\s+/g, '').toLowerCase();
}

function ensureDistinctNpcAppearances(npcs: NpcProfile[]): NpcProfile[] {
  const seen = new Set<string>();
  return npcs.map((npc, index) => {
    const key = appearanceKey(npc.appearance);
    if (key && !seen.has(key)) {
      seen.add(key);
      return npc;
    }
    const appearance = getFallbackLoveShowNpcAppearance(index);
    seen.add(appearanceKey(appearance));
    return { ...npc, appearance };
  });
}

function extractNpcSkeletonItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const candidateKeys = ['npcs', 'guests', 'characters', 'items', 'data', 'result', '嘉宾', '男嘉宾', '补位嘉宾', '邀请嘉宾'];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function parseNpcSkeletonArray(raw: string, neededCount: number): NpcProfile[] {
  const parsed = safeParseJson<unknown>(raw);
  const items = extractNpcSkeletonItems(parsed);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('NPC skeleton response is not a JSON array');
  }
  if (items.length < neededCount) {
    throw new Error(`NPC skeleton response returned ${items.length}/${neededCount} items`);
  }
  return ensureDistinctNpcAppearances(items
    .slice(0, neededCount)
    .map((item, index) => normalizeNpcSkeletonPayload(
      item && typeof item === 'object' ? item as NpcSkeletonPayload : {},
      index,
    )));
}

export async function generateNpcSkeletons(
  apiConfig: ApiConfig,
  neededCount: number,
  existingCharacterSummaries: string[],
): Promise<NpcProfile[]> {
  const userPrompt = buildNpcGeneratorPrompt(neededCount, existingCharacterSummaries);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callSubModel(
        apiConfig,
        SUB_MODEL_SYSTEM_PROMPT,
        userPrompt,
        0.9,
        attempt === 0 ? 'NPC骨架批量生成' : 'NPC骨架批量生成重试',
        NPC_SKELETON_MAX_TOKENS,
      );
      return parseNpcSkeletonArray(raw, neededCount);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('NPC skeleton generation failed');
}

export async function generateNpcSkeleton(
  apiConfig: ApiConfig,
  existingCharacterSummaries: string[],
): Promise<NpcProfile> {
  const skeletons = await generateNpcSkeletons(apiConfig, 1, existingCharacterSummaries);
  return skeletons[0];
}

/** 将 NPC 骨架展开为完整 prompt */
type NpcExpandedPromptPayload = Record<string, unknown>;

function createNpcPromptFromSkeleton(skeleton: NpcProfile): string {
  return [
    `${skeleton.name}是《唯一心动线》的节目组邀请嘉宾，${skeleton.age}岁，职业是${skeleton.job}。`,
    skeleton.appearance ? `他的固定外貌：${skeleton.appearance}。` : '',
    skeleton.memorableDetail ? `他的记忆点是：${skeleton.memorableDetail}。` : '',
    skeleton.sampleLine ? `他的说话示例是：「${skeleton.sampleLine}」。` : '',
    skeleton.motivation ? `他来参加恋综的动机是：${skeleton.motivation}。` : '',
    `这季他的恋爱打法偏向「${skeleton.approach}」，但不要把这个词当标签直接说出口，要用具体行为表现。`,
    '本季只有用户一位主角。他可以和其他嘉宾较劲、助攻、误解或吃醋，但不能和任何嘉宾互相心动、互选或组成 CP，所有情绪与选择最终都回到用户身上。',
  ].filter(Boolean).join('\n');
}

function readExpandedPromptString(payload: NpcExpandedPromptPayload): string {
  const keys = ['generatedPrompt', 'generated_prompt', 'prompt', 'systemPrompt', 'system_prompt', 'profile', 'text', '人设文本', '人设', '角色设定'];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return cleanSubModelText(value);
  }
  return '';
}

function extractNpcExpandedItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const candidateKeys = ['prompts', 'expandedPrompts', 'characters', 'items', 'data', 'result', '人设', '角色设定', '嘉宾'];
  for (const key of candidateKeys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function parseNpcExpandedPrompts(raw: string, skeletons: NpcProfile[]): string[] {
  const parsed = safeParseJson<unknown>(raw);
  const items = extractNpcExpandedItems(parsed);
  if (!items.length) throw new Error('NPC expanded prompt response is not a JSON array');

  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const payload = item as NpcExpandedPromptPayload;
    const prompt = readExpandedPromptString(payload);
    if (!prompt) return;
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (id) byId.set(id, prompt);
    if (name) byName.set(name, prompt);
  });

  return skeletons.map((skeleton, index) => {
    const item = items[index];
    const orderedPrompt = item && typeof item === 'object'
      ? readExpandedPromptString(item as NpcExpandedPromptPayload)
      : '';
    return byId.get(skeleton.id)
      || byName.get(skeleton.name)
      || orderedPrompt
      || createNpcPromptFromSkeleton(skeleton);
  });
}

export async function expandNpcPrompts(
  apiConfig: ApiConfig,
  skeletons: NpcProfile[],
): Promise<string[]> {
  if (skeletons.length === 0) return [];
  if (skeletons.length === 1) {
    return [await expandNpcPrompt(apiConfig, skeletons[0])];
  }

  const userPrompt = buildNpcBatchExpandPrompt(skeletons);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callSubModel(
        apiConfig,
        SUB_MODEL_SYSTEM_PROMPT,
        userPrompt,
        0.7,
        attempt === 0 ? 'NPC人设批量展开' : 'NPC人设批量展开重试',
        NPC_EXPAND_MAX_TOKENS,
      );
      return parseNpcExpandedPrompts(raw, skeletons);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NPC expanded prompts failed');
}

export async function expandNpcPrompt(
  apiConfig: ApiConfig,
  skeleton: NpcProfile,
): Promise<string> {
  const userPrompt = buildNpcExpandPrompt(skeleton);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callSubModel(
        apiConfig,
        SUB_MODEL_SYSTEM_PROMPT,
        userPrompt,
        0.7,
        attempt === 0 ? `${skeleton.name} 人设展开` : `${skeleton.name} 人设展开重试`,
        NPC_EXPAND_MAX_TOKENS,
      );
      const cleaned = cleanSubModelText(raw);
      if (!cleaned) throw new Error('NPC expanded prompt is empty');
      return cleaned;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('NPC expanded prompt failed');
}

/** 生成导演密令 */
export async function generateDirectorMission(
  apiConfig: ApiConfig,
  day: number,
  charNames: string[],
  seasonContext: string,
): Promise<DirectorMission> {
  const userPrompt = buildDirectorMissionPrompt(day, charNames, seasonContext);

  const raw = await callSubModel(apiConfig, SUB_MODEL_SYSTEM_PROMPT, userPrompt, 0.7);
  const parsed = safeParseJson<Partial<DirectorMission>>(raw);

  return {
    id: parsed.id || uid('mission'),
    dayNumber: typeof parsed.dayNumber === 'number' ? parsed.dayNumber : day,
    description: sanitizeUserCenteredMissionText(
      parsed.description || '',
      `在下一段互动里，主动选择一位嘉宾完成一次镜头之外的真心话。`,
    ),
    reward: sanitizeUserCenteredMissionText(
      parsed.reward || '',
      '解锁一次镜头之外提示',
    ),
    completed: parsed.completed === true,
  };
}
