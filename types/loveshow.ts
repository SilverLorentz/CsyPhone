/**
 * Love Show Types — 恋综 AI 恋爱综艺
 * 赛季状态、导演选择点、统一嘉宾、角色状态卡、印象卡、节目组邀请嘉宾、场景、密令、社交媒体、回忆卡
 */

// ═══════════════════════════════════
//  赛季状态（硬变量，代码控制）
// ═══════════════════════════════════

export type SeasonPhase =
  | 'casting' | 'day_active' | 'phone_time'
  | 'observatory' | 'day_end' | 'finale' | 'completed';

export type SeasonStatus = 'running' | 'finale' | 'completed';

export type DayBeatKind =
  | 'opening'
  | 'group_activity'
  | 'date'
  | 'backstage_sms'
  | 'mission'
  | 'interview'
  | 'observatory'
  | 'wind'
  | 'elimination'
  | 'finale'
  | 'closing';

export interface DayPlan {
  day: number;
  title: string;
  beats: DayBeatKind[];
}

export type SeasonSchedule = DayPlan[];

export interface EliminationOutcome {
  day: number;
  eliminatedGuestId: string;
  farewellInterviewId: string;
  farewellInterview?: string;
}

export interface FinaleOutcome {
  chosenGuestId: string | null;
  chosenResponse?: string;
  unchosenInterviewIds: string[];
  unchosenInterviews?: Record<string, string>;
  closingNote?: string;
}

export interface SeasonState {
  seasonId: string;
  charIds: string[];           // 本季嘉宾 ID（角色库嘉宾 + 节目组邀请嘉宾）
  targetGuestCount: number;    // 本季目标嘉宾数，4-6
  day: number;                 // 1-5
  phase: SeasonPhase;
  status: SeasonStatus;
  beatIndex: number;
  schedule: SeasonSchedule;
  eliminations: string[];
  eliminationOutcomes: EliminationOutcome[];
  finalChoice: string | null;
  finaleOutcome: FinaleOutcome | null;
  screenTime: Record<string, number>;
  usedLocationIds: string[];
  startedAt: number;
  lastActiveAt: number;
}

// ═══════════════════════════════════
//  导演选择点
// ═══════════════════════════════════

export type ChoiceType =
  | 'date_card'       // 约会券给谁
  | 'sms_target'      // 短信发给谁
  | 'sms_content'     // 短信写什么
  | 'group_event'     // 集体活动（必须）
  | 'interview'       // 采访间
  | 'observatory'     // 观察室（偷看谁）
  | 'daily_mission'   // 接不接密令
  | 'wind'            // 心动风向揭晓
  | 'elimination'     // 用户选择送别谁
  | 'finale'          // Day 5 终选
  | 'closing';        // 今日收束

export interface ChoiceOption {
  id: string;
  label: string;
  hint?: string;       // 给用户的小提示
}

export interface ChoicePoint {
  id: string;
  type: ChoiceType;
  prompt: string;            // 节目组风格通知文本
  options?: ChoiceOption[];
  freeInput?: boolean;       // 允许自由输入
  mandatory: boolean;        // 必须响应 vs 可忽略
  consequence?: string;      // 内部备注（不展示）
}

// ═══════════════════════════════════
//  导演镜头调度卡
// ═══════════════════════════════════

// Phase 2A DirectorBeat Stable:
// This structure is the frozen contract between the director sub-model and the
// scene performer. Prefer small validation/prompt fixes over reshaping it.

export type DirectorBeatSceneType =
  | 'opening_group'
  | 'group_event'
  | 'date'
  | 'phone_time'
  | 'observatory'
  | 'confession_room'
  | 'day_end';

export type DirectorShotType =
  | 'close_up'
  | 'reaction'
  | 'two_shot'
  | 'wide'
  | 'cutaway';

export interface CameraPlan {
  charId: string;
  shotType: DirectorShotType;
  reason: string;
}

export type DirectorSpeakerRole =
  | 'lead'
  | 'respond'
  | 'interrupt'
  | 'soft_react';

export interface DirectorBeatSpeaker {
  charId: string;
  role: DirectorSpeakerRole;
  intent: string;
}

export type DirectorUserPosition =
  | 'being_addressed'
  | 'observing'
  | 'choosing_target'
  | 'private_moment'
  | 'silent_pressure';

export type DirectorBeatEndingMode =
  | 'wait_user'
  | 'continue_scene'
  | 'open_choice'
  | 'phone_notification'
  | 'scene_end';

export interface DirectorBeat {
  beatId: string;
  sceneType: DirectorBeatSceneType;
  presentCharIds: string[];
  cameraFocus: CameraPlan[];
  speakers: DirectorBeatSpeaker[];
  reactionOnlyCharIds: string[];
  userPosition: DirectorUserPosition;
  endingMode: DirectorBeatEndingMode;
  userPromptHint?: string;
  directorNote: string;
  secretSubtextGuestIds?: string[];
  almostExposedSecretId?: string;
}

// ═══════════════════════════════════
//  角色状态卡（副 API 评估）
// ═══════════════════════════════════

export type LoveShowMood =
  | '期待' | '吃醋' | '受伤' | '心动'
  | '试探' | '冷淡' | '紧张' | '开心';

export type LoveShowStrategy =
  | '主动进攻' | '欲擒故纵' | '默默守护'
  | '直球表白' | '观望' | '撤退';

export interface GuestPublicPosture {
  cameraPersona: string;
  strategyMask: LoveShowStrategy;
  avoids?: string;
  lastPublicSceneId?: string;
}

export interface GuestPrivateTruth {
  emotionalTruth: string;
  revealedToUser: string[];
  wantsFromUser?: string;
  lastPrivateAt?: number;
}

export type LoveShowPrivateSecretKind =
  | 'confession'
  | 'vulnerability'
  | 'request'
  | 'leverage'
  | 'private_signal';

export type LoveShowSecretIntensity = 'soft' | 'charged' | 'volatile';

export interface LoveShowPrivateSecret {
  id: string;
  seasonId: string;
  day: number;
  guestId: string;
  userName: string;
  kind: LoveShowPrivateSecretKind;
  intensity: LoveShowSecretIntensity;
  summary: string;
  privateLine?: string;
  publicSubtextHint: string;
  createdAt: number;
  lastReferencedAt?: number;
}

export interface CharacterState {
  characterId: string;
  affection: number;            // 0-100
  mood: LoveShowMood;
  confidence: number;           // 0-100
  strategy: LoveShowStrategy;
  jealousyTarget: string | null;
  innerThought: string;
  publicPosture?: GuestPublicPosture;
  privateTruth?: GuestPrivateTruth;
  publicPrivateDivergence?: number; // 0-100，越高越容易在公开场差点露馅
  lastUpdatedScene: string;
}

export type GuestState = CharacterState;

// ═══════════════════════════════════
//  用户印象卡（副 API 评估）
// ═══════════════════════════════════

export interface ImpressionSnapshot {
  day: number;
  sceneId: string;
  impression: string;
  timestamp: number;
}

export interface LoveShowUserImpression {
  characterId: string;
  perceivedTraits: string[];
  knownFacts: string[];
  tentativeReads: string[];
  /** @deprecated Use tentativeReads. Kept for old local saves and UI compatibility. */
  misconceptions?: string[];
  impression: string;
  history: ImpressionSnapshot[];
}

export type ImpressionCard = LoveShowUserImpression;

// ═══════════════════════════════════
//  节目组邀请嘉宾人设卡
// ═══════════════════════════════════

export interface NpcProfile {
  id: string;                    // 'npc_' + uuid
  name: string;
  age: number;
  job: string;
  memorableDetail: string;       // 一个让人记住他的细节
  sampleLine: string;            // 一句示例台词体现说话方式
  motivation: string;            // 为什么来上恋综
  approach: LoveShowStrategy;     // 这季的恋爱打法
  appearance?: string;            // 自然语言生图锁脸，只描述长相本身
  generatedPrompt: string;       // 完整角色 prompt（副模型展开）
  avatar?: string;
  avatarAssetId?: string;         // 大图存在 IndexedDB assets，避免 localStorage 存 base64
}

export interface LoveShowCastingDraft {
  draftId: string;
  targetGuestCount: number;
  selectedCharacterIds: string[];
  npcs: NpcProfile[];
  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════════════════
//  嘉宾运行态适配
// ═══════════════════════════════════

export type GuestSource = 'user_char' | 'program_invited';

export interface Guest {
  id: string;
  source: GuestSource;
  promoted: boolean;
  characterId?: string;
  programGuestId?: string;
  /** @deprecated Use programGuestId. Kept for old local saves and migration compatibility. */
  npcId?: string;
  name: string;
  avatar?: string;
  avatarAssetId?: string;
  appearance?: string;
  profileSummary: string;
  personalityTags?: string[];
  roleInShow?: string;
  state: GuestState;
  impression: ImpressionCard;
}

export type LoveShowGuest = Guest;

// ═══════════════════════════════════
//  场景
// ═══════════════════════════════════

export interface LoveShowScene {
  id: string;
  dayNumber: number;
  locationId: string;
  locationName: string;
  characterIds: string[];
  locationGuestIds?: string[];   // 当前地点在场嘉宾；characterIds 只表示本拍镜头重点
  atmosphere: string;
  summary?: string;              // 场景摘要（结束后填）
  status: 'pending' | 'active' | 'completed';
}

// ═══════════════════════════════════
//  导演密令
// ═══════════════════════════════════

export interface DirectorMission {
  id: string;
  dayNumber: number;
  description: string;
  reward: string;                // 奖励描述
  completed: boolean;
}

// ═══════════════════════════════════
//  心动广场 / 虚拟社交媒体
// ═══════════════════════════════════

export type LoveShowFeedAuthorType =
  | 'user'
  | 'guest'
  | 'guest_alt'
  | 'program'
  | 'audience';

export type LoveShowFeedSource =
  | 'scene_end'
  | 'wind'
  | 'program_notice'
  | 'private_secret'
  | 'user_action'
  | 'system';

export type SocialImageIntent =
  | 'guest_selfie'
  | 'guest_couple_moment'
  | 'program_still'
  | 'date_scene'
  | 'object_clue'
  | 'alt_account_mood'
  | 'user_post_image';

export interface LoveShowFeedImage {
  intent: SocialImageIntent;
  stylePresetId: string;
  prompt: string;
  assetId?: string;
  status: 'pending' | 'ready' | 'failed';
}

export interface LoveShowFeedComment {
  id: string;
  postId: string;
  authorType: LoveShowFeedAuthorType;
  authorId: string;
  authorName: string;
  authorGuestId?: string;
  content: string;
  createdAt: number;
}

export interface LoveShowFeedPost {
  id: string;
  platform: 'weibo' | 'xhs';
  username: string;
  content: string;
  likes?: number;
  dayNumber: number;
  authorType: LoveShowFeedAuthorType;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorGuestId?: string;
  hiddenOwnerGuestId?: string;
  image?: LoveShowFeedImage;
  source: LoveShowFeedSource;
  comments: LoveShowFeedComment[];
  likeCount: number;
  likedByUser: boolean;
  recognizedByUser?: boolean;
  createdAt: number;
  guestRefs?: LoveShowTheaterGuestRef[];
  sourceTicketId?: string;
  locationId?: string;
}

export type LoveShowSocialPost = LoveShowFeedPost;

export interface SocialSignal {
  id: string;
  sourcePostId: string;
  sourceCommentId?: string;
  actorId: string;
  actorType: LoveShowFeedAuthorType;
  targetGuestId?: string;
  action: 'post' | 'like' | 'comment' | 'reply' | 'recognize_alt';
  emotion?: string;
  intensity: 'weak' | 'medium' | 'strong';
  consumed: boolean;
  createdAt: number;
}

// ═══════════════════════════════════
//  心动风向
// ═══════════════════════════════════

export type LoveShowWindType =
  | 'solo_date'
  | 'most_obvious'
  | 'jealous_hint'
  | 'famous_scene'
  | 'tomorrow_lens'
  | 'message_prompt';

export interface LoveShowWindItem {
  id: string;
  type: LoveShowWindType;
  guestId?: string;
  title: string;
  body: string;
  effectHint?: string;
}

// ═══════════════════════════════════
//  心动片段剧场
// ═══════════════════════════════════

export type LoveShowTheaterMode = 'solo' | 'triangle';

export type LoveShowTheaterSource =
  | 'wind'
  | 'mission'
  | 'notice'
  | 'private_message'
  | 'confessional'
  | 'manual';

export type LoveShowTheaterGuestType = 'cast' | 'program_invited';

export interface LoveShowTheaterGuestRef {
  guestId: string;
  guestType: LoveShowTheaterGuestType;
  displayName: string;
  avatar?: string;
  color?: string;
  shortBio?: string;
}

export interface LoveShowTheaterEffectState {
  id: string;
  source: LoveShowTheaterSource | 'result';
  text: string;
  createdAt: number;
  expiresAfterScene: number;
}

export interface LoveShowTheaterTicket {
  id: string;
  seasonId: string;
  day: number;
  episodeDayId: string;
  mode: LoveShowTheaterMode;
  source: LoveShowTheaterSource;
  title: string;
  description: string;
  suggestedGuestIds?: string[];
  suggestedGuestRefs?: LoveShowTheaterGuestRef[];
  requiredGuestCount: 1 | 2;
  suggestedLocationId?: string;
  effectHint?: string;
  createdAt: number;
}

export interface LoveShowTheaterResult {
  ticketId: string;
  seasonId: string;
  day: number;
  episodeDayId: string;
  mode: LoveShowTheaterMode;
  guestIds: string[];
  guestRefs: LoveShowTheaterGuestRef[];
  locationId?: string;
  locationName?: string;
  summary: string;
  memoryTitle?: string;
  memoryBody?: string;
  echoText: string;
  effectHint?: string;
  createdAt: number;
}

export interface LoveShowTheaterEcho {
  id: string;
  ticketId: string;
  seasonId: string;
  day: number;
  episodeDayId: string;
  mode: LoveShowTheaterMode;
  guestRefs: LoveShowTheaterGuestRef[];
  locationId?: string;
  locationName?: string;
  title: string;
  body: string;
  echoText: string;
  effectHint?: string;
  createdAt: number;
}

// ═══════════════════════════════════
//  回忆卡片
// ═══════════════════════════════════

export interface MemoryCard {
  sceneId: string;
  dayNumber: number;
  description: string;           // 一句话剧照描述
  characters: string[];
  guestRefs?: LoveShowTheaterGuestRef[];
  sourceTicketId?: string;
  locationId?: string;
  locationName?: string;
  timestamp: number;
}

// ═══════════════════════════════════
//  赛季高光记忆
// ═══════════════════════════════════

export type HighlightMemorySource = 'scene' | 'private_chat' | 'elimination' | 'theater';

export type HighlightMemoryKind =
  | 'spark'
  | 'jealousy'
  | 'confession'
  | 'conflict'
  | 'tease'
  | 'vulnerability'
  | 'secret';

export interface HighlightMemory {
  id: string;
  seasonId: string;
  day: number;
  beatIndex?: number;
  sceneId?: string;
  source: HighlightMemorySource;
  guestIds: string[];
  kind: HighlightMemoryKind;
  summary: string;
  meaning: string;
  callbackLine?: string;
  weight: number;
  fromPrivateSecret?: boolean;
  createdAt: number;
}
