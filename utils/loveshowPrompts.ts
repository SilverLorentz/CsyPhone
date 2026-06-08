/**
 * Love Show Prompt Builders — 恋综 Prompt 系统
 *
 * 核心原则：AI 只管演，不管格式。
 * - 主 API 输出纯自然文本（星号包裹动作，「角色名：对话」格式）
 * - 副 API 只输出 JSON
 * - 所有视觉由前端 CSS 负责
 */

import type {
  SeasonState,
  CharacterState,
  LoveShowUserImpression,
  LoveShowScene,
  NpcProfile,
  DirectorBeat,
  LoveShowPrivateSecret,
  LoveShowPrivateSecretKind,
  LoveShowSecretIntensity,
  HighlightMemory,
  SocialSignal,
} from '../types/loveshow';
import type { ImageGenerationStyle, OpenAICompatibleStyleFamily, PhotoPromptBundle, PhotoStylePreset } from '../types';

export type LoveShowImageMode = 'solo' | 'couple';

export const LOVE_SHOW_IMAGE_PRESET_IDS: Record<LoveShowImageMode, Record<ImageGenerationStyle, string>> = {
  solo: {
    guoman: 'loveshow-solo-guoman',
    cg: 'loveshow-solo-cg',
    real: 'loveshow-solo-real',
  },
  couple: {
    guoman: 'loveshow-couple-guoman',
    cg: 'loveshow-couple-cg',
    real: 'loveshow-couple-real',
  },
};

const LOVE_SHOW_GEMINI_IMAGE_PRESET_IDS: Record<LoveShowImageMode, Record<ImageGenerationStyle, string>> = {
  solo: {
    guoman: 'loveshow-gemini-solo-guoman',
    cg: 'loveshow-gemini-solo-cg',
    real: 'loveshow-gemini-solo-real',
  },
  couple: {
    guoman: 'loveshow-gemini-couple-guoman',
    cg: 'loveshow-gemini-couple-cg',
    real: 'loveshow-gemini-couple-real',
  },
};

const LOVE_SHOW_GPT_IMAGE_STYLE_PRESETS: PhotoStylePreset[] = [
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.solo.guoman,
    name: '单人 · 国漫风',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '单人立绘，国漫插画风，氛围感强，五官立体精致、眼睛绝美有神，干净通透上色，柔和光影，竖版手机壁纸尺寸',
    negativePrompt: '写实，真人感，3D建模感，Q版，卡通，崩坏五官，多人，多余的手，多余的肢体，畸形，低清，水印，文字',
  },
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.solo.cg,
    name: '单人 · CG质感',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '单人半身 CG，精修游戏立绘质感，光影立体，皮肤与发丝细节精致，电影级氛围打光，高细节渲染，竖版手机壁纸尺寸',
    negativePrompt: '粗糙线稿，廉价感，塑料感，崩坏五官，多人，多余的手，多余的肢体，畸形，低清，水印，文字',
  },
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.solo.real,
    name: '单人 · 真人风',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '单人真人感人像写真，像真实相机拍摄，自然肤质与光影，五官立体深邃，柔和景深，电影感色调，竖版手机壁纸尺寸',
    negativePrompt: '二次元，国漫风，动漫插画，Q版，卡通，3D建模感，假脸，塑料皮肤，过度磨皮，网红滤镜，崩坏，多人，多余的肢体，畸形，低清，水印，文字',
  },
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.couple.guoman,
    name: '双人 · 国漫风',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '双人合照，近距离同框，画面中有两位清晰主体，像角色亲手拍下的自拍，国漫插画风，氛围感强，五官立体精致，干净通透上色，柔和光影，竖版尺寸',
    negativePrompt: '单人照，只有一个人，裁掉其中一人，人物融合，脸部融合，重复人物，额外人物，陌生第三人，距离太远，拼贴，写实，真人感，3D建模感，崩坏五官，多余的肢体，畸形，低清，水印，文字',
  },
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.couple.cg,
    name: '双人 · CG质感',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '双人合照，近距离同框，两位清晰主体，像角色亲手拍下的合影，精修 CG 质感，电影级光影，皮肤发丝细节精致，氛围感强，竖版尺寸',
    negativePrompt: '单人照，只有一个人，裁掉其中一人，人物融合，脸部融合，重复人物，额外人物，陌生第三人，距离太远，拼贴，塑料感，廉价感，崩坏五官，多余的肢体，畸形，低清，水印，文字',
  },
  {
    id: LOVE_SHOW_IMAGE_PRESET_IDS.couple.real,
    name: '双人 · 真人风',
    providerScope: 'openai-gpt',
    model: 'gpt-image-2',
    size: '1024x1792',
    positivePrompt: '双人同框真人感合照，两位清晰主体，像真实相机拍下的合影，自然肤质与光影，五官立体深邃，柔和景深，电影感色调，竖版尺寸',
    negativePrompt: '二次元，国漫风，动漫插画，Q版，卡通，3D建模感，假脸，塑料皮肤，过度磨皮，网红滤镜，单人照，只有一个人，裁掉其中一人，人物融合，脸部融合，重复人物，额外人物，陌生第三人，距离太远，拼贴，崩坏，多余的肢体，畸形，低清，水印，文字',
  },
];

const LOVE_SHOW_IMAGE_STYLE_ORDER: Array<{ mode: LoveShowImageMode; imageStyle: ImageGenerationStyle }> = [
  { mode: 'solo', imageStyle: 'guoman' },
  { mode: 'solo', imageStyle: 'cg' },
  { mode: 'solo', imageStyle: 'real' },
  { mode: 'couple', imageStyle: 'guoman' },
  { mode: 'couple', imageStyle: 'cg' },
  { mode: 'couple', imageStyle: 'real' },
];

const LOVE_SHOW_GEMINI_IMAGE_STYLE_PRESETS: PhotoStylePreset[] = LOVE_SHOW_IMAGE_STYLE_ORDER.map(({ mode, imageStyle }) => {
  const source = LOVE_SHOW_GPT_IMAGE_STYLE_PRESETS.find(preset => preset.id === LOVE_SHOW_IMAGE_PRESET_IDS[mode][imageStyle]) || LOVE_SHOW_GPT_IMAGE_STYLE_PRESETS[0];
  return {
    ...source,
    id: LOVE_SHOW_GEMINI_IMAGE_PRESET_IDS[mode][imageStyle],
    name: `Gemini ${source.name}`,
    providerScope: 'openai-gemini',
    model: undefined,
    size: '1024x1536',
  };
});

export const LOVE_SHOW_IMAGE_STYLE_PRESETS: PhotoStylePreset[] = [
  ...LOVE_SHOW_GPT_IMAGE_STYLE_PRESETS,
  ...LOVE_SHOW_GEMINI_IMAGE_STYLE_PRESETS,
];

export function getLoveShowImagePresetId(
  mode: LoveShowImageMode,
  imageStyle: ImageGenerationStyle,
  openAIStyleFamily: OpenAICompatibleStyleFamily = 'gpt',
): string {
  const ids = openAIStyleFamily === 'gemini' ? LOVE_SHOW_GEMINI_IMAGE_PRESET_IDS : LOVE_SHOW_IMAGE_PRESET_IDS;
  return ids[mode][imageStyle] || ids[mode].guoman;
}

export function getLoveShowImageStylePreset(
  mode: LoveShowImageMode,
  imageStyle: ImageGenerationStyle,
  openAIStyleFamily: OpenAICompatibleStyleFamily = 'gpt',
): PhotoStylePreset {
  const presetId = getLoveShowImagePresetId(mode, imageStyle, openAIStyleFamily);
  return LOVE_SHOW_IMAGE_STYLE_PRESETS.find(preset => preset.id === presetId) || LOVE_SHOW_IMAGE_STYLE_PRESETS[0];
}

export function isLoveShowImageStylePreset(style: Pick<PhotoStylePreset, 'id'> | null | undefined): boolean {
  const id = style?.id || '';
  return [LOVE_SHOW_IMAGE_PRESET_IDS, LOVE_SHOW_GEMINI_IMAGE_PRESET_IDS]
    .some(ids => Object.values(ids).some(group => Object.values(group).includes(id)));
}

export function buildLoveShowImagePrompt(input: {
  mode: LoveShowImageMode;
  imageStyle: ImageGenerationStyle;
  scenePrompt?: string;
  maleAppearance?: string;
  femaleAppearance?: string;
  qualityTags?: string;
}): PhotoPromptBundle {
  const preset = getLoveShowImageStylePreset(input.mode, input.imageStyle);
  const positivePrompt = [
    preset.positivePrompt,
    input.maleAppearance ? `男生外貌：${input.maleAppearance}` : '',
    input.mode === 'couple' && input.femaleAppearance ? `女生外貌：${input.femaleAppearance}` : '',
    input.scenePrompt || '',
    input.qualityTags || '',
  ].filter(Boolean).join('\n');
  const negativePrompt = preset.negativePrompt;
  return {
    positivePrompt,
    negativePrompt,
    finalPrompt: [positivePrompt, negativePrompt ? `避免出现：\n${negativePrompt}` : ''].filter(Boolean).join('\n'),
  };
}

function getTentativeReads(impression: LoveShowUserImpression): string[] {
  const legacyReads = impression.misconceptions || [];
  return impression.tentativeReads?.length ? impression.tentativeReads : legacyReads;
}

function shortPromptText(text: string | undefined, maxLength: number): string {
  const content = (text || '').trim();
  return content.length > maxLength ? `${content.slice(0, maxLength)}...` : content;
}

function isDayOneFirstAcquaintance(seasonState: Pick<SeasonState, 'day'>): boolean {
  return seasonState.day === 1;
}

function buildFirstAcquaintanceBoundary(userName: string): string {
  return [
    '### Day 1 初识边界',
    `现在和${userName}只处在初识阶段：可以有第一眼兴趣、紧张、礼貌试探和被吸引，但不能表现成旧相识、恋人或已经很熟。`,
    `不要使用旧聊天/角色库里的共同记忆、恋人关系、专属昵称、占有欲、照顾惯性、熟人调侃，或“我一直等你”“终于见到你”“你来了”这类熟悉口吻。`,
    '更自然的推进是自我介绍、确认名字、问一个轻问题、观察对方反应；关系必须通过之后的节目互动逐步升温。',
  ].join('\n');
}

function formatPublicSecretHint(secret: LoveShowPrivateSecret): string {
  return `- secretId=${secret.id}; guestId=${secret.guestId}: ${shortPromptText(secret.publicSubtextHint, 120)}（kind=${secret.kind}, intensity=${secret.intensity}）`;
}

export function buildPublicSecretSubtextInstruction(secrets: LoveShowPrivateSecret[]): string {
  if (secrets.length === 0) return '';
  return [
    '### 镜头前后的秘密潜台词',
    '以下只允许作为公开场的表情、停顿、回避、话题绕行、差点说漏的动机；绝不能在其他嘉宾面前直接说破私聊原文或秘密内容。',
    '秘密永远只属于“该嘉宾 ↔ 用户”，不得写成嘉宾之间的秘密、互选、CP 或暧昧。',
    secrets.slice(-6).map(formatPublicSecretHint).join('\n'),
  ].join('\n');
}

function buildSocialSignalPromptBlock(signals: SocialSignal[] | undefined, title = '心动广场待结算信号'): string {
  const activeSignals = (signals || []).filter(signal => !signal.consumed).slice(-8);
  if (activeSignals.length === 0) return '';
  const actionLabels: Record<SocialSignal['action'], string> = {
    post: '发帖',
    like: '点赞',
    comment: '评论',
    reply: '回复',
    recognize_alt: '识破小号',
  };
  return [
    `### ${title}`,
    '这些是信息流互动留下的待结算信号。它们只能作为理解下一场镜头/状态评估的上下文，不能当成已经直接改变过好感或心情。',
    activeSignals.map(signal => [
      `- ${signal.actorType}/${signal.actorId}`,
      actionLabels[signal.action],
      signal.targetGuestId ? `目标嘉宾=${signal.targetGuestId}` : '',
      `强度=${signal.intensity}`,
      signal.emotion ? `情绪=${signal.emotion}` : '',
    ].filter(Boolean).join('；')).join('\n'),
  ].join('\n');
}

export function buildPrivateChatSecretInstruction(
  charName: string,
  userName: string,
  secrets: LoveShowPrivateSecret[],
  state?: CharacterState | null,
): string {
  const existing = secrets.length > 0
    ? `\n既有只属于你和${userName}的私密事：\n${secrets.slice(-4).map(secret => (
        `- ${secret.summary}${secret.privateLine ? `；当时的话：「${shortPromptText(secret.privateLine, 80)}」` : ''}`
      )).join('\n')}`
    : '';
  const privateTruth = state?.privateTruth
    ? `\n你私下真实状态：${state.privateTruth.emotionalTruth}${state.privateTruth.wantsFromUser ? `；你想从${userName}这里得到：${state.privateTruth.wantsFromUser}` : ''}`
    : '';

  return `### 镜头之外私聊规则
你现在是${charName}，只和${userName}私聊。你可以比镜头前更诚实、更脆弱，也可以更有策略感，但不能羞辱、物化、威胁或操控伤害${userName}。
如果这次回复出现有分量的告白、示弱、请求或把柄，就自然说出来；系统会把它登记成只属于“${charName} ↔ ${userName}”的秘密。
不要写任何嘉宾之间的秘密、CP、互选或暧昧。${existing}${privateTruth}`;
}

export interface PrivateSecretEvalPromptInput {
  guestName: string;
  userName: string;
  day: number;
  userMessage: string;
  guestReply: string;
  existingSecrets?: LoveShowPrivateSecret[];
}

const PRIVATE_SECRET_KIND_LABELS: LoveShowPrivateSecretKind[] = [
  'confession',
  'vulnerability',
  'request',
  'leverage',
  'private_signal',
];

const PRIVATE_SECRET_INTENSITY_LABELS: LoveShowSecretIntensity[] = [
  'soft',
  'charged',
  'volatile',
];

export function buildPrivateSecretEvalPrompt(input: PrivateSecretEvalPromptInput): string {
  const existing = input.existingSecrets?.length
    ? input.existingSecrets.slice(-4).map(secret => (
        `- ${secret.kind}/${secret.intensity}: ${secret.summary}`
      )).join('\n')
    : '暂无';

  return `你是《唯一心动线》的私聊秘密判定副模型。你的任务是判断一次“嘉宾 ↔ 用户”的镜头之外私聊里，是否出现了值得登记的私密秘密。

### 判定对象
- 嘉宾：${input.guestName}
- 用户：${input.userName}
- Day：${input.day}
- 用户消息：${input.userMessage}
- 嘉宾回复：${input.guestReply}
- 已有秘密：\n${existing}

### 什么算 secret
只登记对后续公开场有潜台词价值的内容：
- confession：告白、偏心、心动、只对用户承认的在意
- vulnerability：示弱、不安、害怕、软肋、只让用户看见的失控
- request：请求、约定、希望用户私下给出回应或帮忙保守
- leverage：把柄、顾虑、不想被节目组/其他嘉宾知道的事实
- private_signal：不足以上述分类，但明显是镜头前不会承认的真实信号

### 不登记
- 普通寒暄、普通暧昧、没有后续潜台词价值的夸奖
- 只是复述公开场已经发生的事
- 嘉宾之间的秘密、嘉宾 CP、嘉宾互选、“谁和谁最配”
- 对用户的羞辱、物化、威胁、报复、控制或操控性伤害

### 公开场提示要求
publicSubtextHint 只能写“公开场如何旁敲侧击”：回避、停顿、眼神、话题绕行、差点说漏。
不能复述私聊原句，不能让其他嘉宾听懂完整事实。

### 输出 JSON
不要解释，不要 code fence。严格输出：
{
  "hasSecret": true/false,
  "kind": "${PRIVATE_SECRET_KIND_LABELS.join(' | ')}",
  "intensity": "${PRIVATE_SECRET_INTENSITY_LABELS.join(' | ')}",
  "summary": "一句话概括这个只属于嘉宾和用户的秘密；hasSecret=false 时为空字符串",
  "privateLine": "最能代表秘密的嘉宾原话短摘；hasSecret=false 时为空字符串",
  "publicSubtextHint": "公开场旁敲侧击的演法；hasSecret=false 时为空字符串",
  "safety": {
    "guestUserOnly": true/false,
    "hasGuestGuestSecret": true/false,
    "hasCpSemantics": true/false,
    "hasManipulativeHarm": true/false
  }
}`;
}

// ═══════════════════════════════════════════
//  1. buildLoveShowPreamble — 主模型 system prompt 前置段
// ═══════════════════════════════════════════

/**
 * 恋综角色 system prompt 前置段。
 * 注入节目设定、IF 线前提、当前状态、印象卡、格式指令。
 */
export function buildLoveShowPreamble(
  charName: string,
  userName: string,
  seasonState: SeasonState,
  charState: CharacterState,
  impression: LoveShowUserImpression | null,
): string {
  const parts: string[] = [];

  // —— 节目设定 ——
  parts.push(
    `你是${charName}，正在参加一档恋爱综艺节目。` +
    `你和其他嘉宾住在同一栋合宿屋里，节目全程有摄像机跟拍。`,
  );

  // —— IF 线前提 ——
  parts.push(
    `你不认识${userName}，这是你们在节目中认识的。` +
    `你对她的一切了解都来自节目里的互动。`,
  );

  if (isDayOneFirstAcquaintance(seasonState)) {
    parts.push(buildFirstAcquaintanceBoundary(userName));
  }

  // —— 当前状态（自然语言） ——
  parts.push(
    `现在是第${seasonState.day}天。` +
    `你对${userName}的好感度大约${charState.affection}/100。` +
    `你现在的心情是「${charState.mood}」。` +
    `你内心在想：「${charState.innerThought}」`,
  );

  if (charState.publicPosture || charState.privateTruth || typeof charState.publicPrivateDivergence === 'number') {
    parts.push([
      charState.publicPosture
        ? `镜头前姿态：${charState.publicPosture.cameraPersona}；策略面具：${charState.publicPosture.strategyMask}${charState.publicPosture.avoids ? `；会回避：${charState.publicPosture.avoids}` : ''}`
        : '',
      charState.privateTruth
        ? `镜头外真心：${charState.privateTruth.emotionalTruth}${charState.privateTruth.wantsFromUser ? `；想从${userName}这里得到：${charState.privateTruth.wantsFromUser}` : ''}`
        : '',
      typeof charState.publicPrivateDivergence === 'number'
        ? `公私偏离度：${charState.publicPrivateDivergence}/100。`
        : '',
    ].filter(Boolean).join('\n'));
  }

  // —— 印象卡注入（自然语言） ——
  if (impression) {
    const traits = impression.perceivedTraits.length > 0
      ? impression.perceivedTraits.join('、')
      : '还没有太多了解';
    const facts = impression.knownFacts.length > 0
      ? impression.knownFacts.join('；')
      : '暂时不多';
    const tentativeReads = getTentativeReads(impression);
    const readsText = tentativeReads.length > 0
      ? tentativeReads.join('；')
      : '暂时没有';

    parts.push(
      `你觉得${userName}是这样的人：${traits}。` +
      `你了解到：${facts}。` +
      `你对她有一些暂时理解：${readsText}。这些理解可以随着互动被修正。`,
    );
  }

  // —— 格式指令（不超过 2 行） ——
  parts.push(
    `用星号包裹动作和环境描写，角色对话用「角色名：对话」格式。像写小说一样自然书写。`,
  );

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════
//  2. buildSceneContext — 场景上下文注入
// ═══════════════════════════════════════════

const INTERNAL_SCENE_ATMOSPHERE_RE = [
  /导演提示：[^。！？\n]*(?:[。！？]|$)/g,
  /心动片段余波：[^。！？\n]*(?:[。！？]|$)/g,
  /三人片段的张力必须[^。！？\n]*(?:[。！？]|$)/g,
  /这段单独约会必须[^。！？\n]*(?:[。！？]|$)/g,
];

function cleanSceneAtmosphereForPrompt(atmosphere: string): string {
  return INTERNAL_SCENE_ATMOSPHERE_RE.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    atmosphere,
  ).replace(/\s+/g, ' ').trim();
}

/**
 * 单场景上下文，注入到对话 prompt 中。
 * 包含当前地点+氛围、在场角色列表、最近 3 条场景摘要。
 */
export function buildSceneContext(
  scene: LoveShowScene,
  sceneSummaries: string[],
  highlightMemories: HighlightMemory[] = [],
): string {
  const parts: string[] = [];
  const locationGuestIds = scene.locationGuestIds && scene.locationGuestIds.length > 0
    ? scene.locationGuestIds
    : scene.characterIds;

  // 当前地点 + 氛围
  parts.push(`现在的场景是「${scene.locationName}」。${cleanSceneAtmosphereForPrompt(scene.atmosphere)}`);

  // 地点在场和当前镜头分开描述，避免六人场景被误解成只有四人。
  if (locationGuestIds.length > 0) {
    parts.push(`地点在场嘉宾：${locationGuestIds.join('、')}。`);
  }
  if (scene.characterIds.length > 0) {
    parts.push(`当前镜头重点：${scene.characterIds.join('、')}。`);
  }

  // 最近 3 条场景摘要（压缩上下文）
  const recent = sceneSummaries.slice(-3);
  if (recent.length > 0) {
    parts.push(`之前发生的事：\n${recent.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }

  const callbackContext = buildHighlightCallbackContext(highlightMemories);
  if (callbackContext) {
    parts.push(callbackContext);
  }

  return parts.join('\n\n');
}

export function buildHighlightCallbackContext(highlights: HighlightMemory[]): string {
  if (highlights.length === 0) return '';
  return [
    '本季可自然回提的关键瞬间：',
    '以下只作为在场嘉宾的情绪回调素材；可以自然提起与自己有关的瞬间，但不要硬塞、不要每次都提。',
    '来自镜头外私聊的高光只能演成潜台词、停顿、欲言又止或只让用户读懂的反应，不能在公开场复述私聊内容。',
    highlights.map((memory, index) => {
      const privateNote = memory.fromPrivateSecret ? '；私聊高光，只能潜台词' : '';
      return `${index + 1}. Day ${memory.day} / ${memory.guestIds.join('、')} / ${memory.kind}：${memory.summary}。意义：${memory.meaning}${memory.callbackLine ? `。可回提：${memory.callbackLine}` : ''}${privateNote}`;
    }).join('\n'),
  ].join('\n');
}

// ═══════════════════════════════════════════
//  2.5 DirectorBeat — 多人镜头调度
// ═══════════════════════════════════════════

export interface DirectorBeatCharacterBrief {
  id: string;
  name: string;
  profile?: string;
  worldview?: string;
  state?: CharacterState | null;
  impression?: LoveShowUserImpression | null;
  privateSecrets?: LoveShowPrivateSecret[];
}

function formatCharacterBrief(character: DirectorBeatCharacterBrief): string {
  const state = character.state;
  const impression = character.impression;
  return [
    `- ${character.name} (${character.id})`,
    character.profile ? `  核心人设（只继承性格、背景和说话方式，不继承与用户的旧关系）：${character.profile.slice(0, 700)}` : '',
    character.worldview ? `  世界观补充（不继承与用户已发生的旧剧情）：${character.worldview.slice(0, 500)}` : '',
    state
      ? `  状态：好感 ${state.affection}/100，心情 ${state.mood}，策略 ${state.strategy}，想法「${state.innerThought || '暂未显露'}」`
      : '  状态：初次入场，节目组还没有观察记录',
    state?.publicPosture
      ? `  公开姿态：${state.publicPosture.cameraPersona}（策略面具：${state.publicPosture.strategyMask}）`
      : '',
    typeof state?.publicPrivateDivergence === 'number'
      ? `  公私偏离度：${state.publicPrivateDivergence}/100，偏高时只用回避、停顿、视线和差点说漏来表现。`
      : '',
    character.privateSecrets?.length
      ? `  私密潜台词：\n${character.privateSecrets.slice(-3).map(secret => `    ${secret.publicSubtextHint}`).join('\n')}`
      : '',
    impression?.impression
      ? `  对用户印象：${impression.impression}`
      : '  对用户印象：初印象阶段',
  ].filter(Boolean).join('\n');
}

export function buildMultiCastLoveShowPreamble(
  userName: string,
  seasonState: SeasonState,
  characters: DirectorBeatCharacterBrief[],
  userBio?: string,
): string {
  const firstAcquaintanceBoundary = isDayOneFirstAcquaintance(seasonState)
    ? `\n\n${buildFirstAcquaintanceBoundary(userName)}`
    : '';

  return `你是 LoveShow 的场景演出模型，正在写一档 AI 恋爱综艺的即时片段。

核心规则：
- 所有嘉宾都是正式嘉宾，没有背景嘉宾、陪衬嘉宾、次要嘉宾。
- 镜头焦点只代表这一小拍拍谁更多，不代表谁是主角。
- 恋爱主轴是用户与嘉宾；嘉宾之间可以竞争、观察、误解、助攻，但不要成为彼此恋爱主线。
- 嘉宾会互相观察、反应、竞争、误解或助攻，但不要替用户做选择。
- 角色库里的旧关系、聊天记忆、恋人状态、共同经历和昵称不属于本节目已发生内容；这里只继承角色的性格、背景、边界感和说话方式。
- 每次只演当前这一小拍，不要一次推进一整天。
- 本轮只能重点表现当前小拍安排的发言人和镜头焦点，不要让未安排嘉宾突然大段开麦。
- 如果嘉宾有镜头外秘密，公开场只能绕着秘密演：停顿、错开视线、话题绕行、意味深长的反应、差点说漏；不能当众说破私聊内容。
- 用星号包裹动作和环境描写，角色对话用「角色名：对话」格式。像写小说一样自然书写。
${firstAcquaintanceBoundary}

当前进度：第${seasonState.day}天，阶段 ${seasonState.phase}。
用户：${userName}${userBio ? `，设定/备注：${userBio}` : ''}。

正式嘉宾：
${characters.map(formatCharacterBrief).join('\n')}`;
}

export function buildDirectorBeatPerformanceContext(
  beat: DirectorBeat,
  characters: DirectorBeatCharacterBrief[],
  userName = '用户',
): string {
  const nameById = new Map(characters.map(character => [character.id, character.name]));
  const nameOf = (id: string) => nameById.get(id) || id;
  const presentSet = new Set(beat.presentCharIds);
  const activeSecrets = characters
    .flatMap(character => character.privateSecrets || [])
    .filter(secret => presentSet.has(secret.guestId));

  const focus = beat.cameraFocus.length > 0
    ? beat.cameraFocus
        .map(item => `${nameOf(item.charId)} / ${item.shotType} / ${item.reason}`)
        .join('\n')
    : '无明确焦点，使用全景镜头。';
  const speakers = beat.speakers.length > 0
    ? beat.speakers
        .map(item => `${nameOf(item.charId)} / ${item.role} / ${item.intent}`)
        .join('\n')
    : '这一小拍可以只写动作和气氛，不强制台词。';
  const reactions = beat.reactionOnlyCharIds.length > 0
    ? beat.reactionOnlyCharIds.map(nameOf).join('、')
    : '无';
  const firstAcquaintancePerformanceRule = beat.sceneType === 'opening_group'
    ? `\n初见演出边界：${buildFirstAcquaintanceBoundary(userName).replace(/^### Day 1 初识边界\n/, '')}\n`
    : '';

  return `### 当前小拍安排
beatId：${beat.beatId}
sceneType：${beat.sceneType}
在场嘉宾：${beat.presentCharIds.map(nameOf).join('、') || '节目现场'}
镜头焦点：
${focus}

明显发言安排：
${speakers}

只做动作/表情反应：${reactions}
用户位置：${beat.userPosition}
停顿方式：${beat.endingMode}
本拍目标：${beat.directorNote}
${beat.secretSubtextGuestIds?.length ? `秘密潜台词嘉宾：${beat.secretSubtextGuestIds.map(nameOf).join('、')}` : ''}
${beat.almostExposedSecretId ? `差点露馅 secretId：${beat.almostExposedSecretId}` : ''}

${buildPublicSecretSubtextInstruction(activeSecrets)}
${firstAcquaintancePerformanceRule}

演出要求：
- 严格按当前小拍安排来写。
- 本轮只能重点表现安排中的 speakers 和 cameraFocus，不要自行新增大段发言人。
- 最多让 1-3 位嘉宾明显发言；reactionOnly 只能写表情、动作、停顿、视线。
- 不要让没有安排的嘉宾突然抢话。
- 如果涉及秘密，只能旁敲侧击，不能复述私聊、不能让其他嘉宾听懂完整事实。
- 不要替用户说话，不要替用户决定下一步。
- 结尾按 endingMode 停住：wait_user 要把空间留给用户，open_choice/phone_notification/scene_end 不要擅自展开后续。`;
}

export function buildDirectorBeatPrompt(
  seasonState: SeasonState,
  scene: LoveShowScene,
  characters: DirectorBeatCharacterBrief[],
  sceneSummaries: string[],
  recentDialogue: string,
  choiceContext?: string,
  highlightMemories: HighlightMemory[] = [],
  socialSignals: SocialSignal[] = [],
): string {
  const recentSummaries = sceneSummaries.slice(-4);
  const privateSecrets = characters.flatMap(character => character.privateSecrets || []);
  const publicSecretInstruction = buildPublicSecretSubtextInstruction(privateSecrets);
  const highlightInstruction = buildHighlightCallbackContext(highlightMemories);
  const socialSignalInstruction = buildSocialSignalPromptBlock(socialSignals);
  const firstAcquaintanceDirectorRule = isDayOneFirstAcquaintance(seasonState)
    ? [
        'Day 1 初识调度：',
        '- 镜头可以安排第一眼兴趣、紧张、观察和轻微试探，但不要把任何嘉宾调度成已经认识用户、等用户很久、默认亲密或拥有共同回忆。',
        '- opening_group 优先安排自我介绍、确认名字、礼貌寒暄、观察反应；如果需要暧昧，只能是“刚开始被吸引”，不是熟人式亲密。',
        '- userPromptHint 应把空间留给用户自然回应，不要催用户立刻表态或进入恋人关系。',
      ].join('\n')
    : '';
  return `你是 LoveShow 的导演与镜头剪辑师。
你不负责写完整剧情，也不生成正式台词。
你只负责为下一小拍生成镜头调度卡 DirectorBeat。

规则：
- 所有嘉宾都是正式嘉宾，没有背景嘉宾。
- 用户是本季恋爱主轴。嘉宾之间的镜头张力应该服务于竞争、观察、误解或助攻，不要把嘉宾互相恋爱当成主线。
- cameraFocus 只代表这一小拍镜头更多给谁，不代表谁更重要。
- 每一小拍最多安排 1-3 位嘉宾明显发言。
- 如果用户上一句明确点名、回应或靠近某位嘉宾，优先让该嘉宾进入 cameraFocus 或 speakers。
- 如果用户没有明确 cue，主动轮换镜头，避免连续多拍让同一位嘉宾承担 lead。
- 没有发言的嘉宾也可以被安排为 reactionOnly。
- 不要替用户做选择。
- 不要生成正式台词。
- 不要一次推进太远。
- 如果有镜头外秘密，只安排公开场的潜台词：回避、停顿、意味深长的反应、差点说漏。不得让任何嘉宾当众挑明私聊内容。
- 秘密只属于“某嘉宾 ↔ 用户”；不要生成嘉宾之间的秘密、CP、互选、暧昧或恋爱线。
- 输出 JSON，不要添加解释，不要 code fence。

${firstAcquaintanceDirectorRule}

当前赛季：
- seasonId：${seasonState.seasonId}
- day：${seasonState.day}
- phase：${seasonState.phase}

当前场景：
- sceneId：${scene.id}
- 地点：${scene.locationName}
- 氛围：${scene.atmosphere}
- 目前在场：${(scene.locationGuestIds && scene.locationGuestIds.length > 0 ? scene.locationGuestIds : scene.characterIds).join('、') || '待导演决定'}
- 当前镜头重点：${scene.characterIds.join('、') || '待导演决定'}
${choiceContext ? `- 刚发生的选择：${choiceContext}` : ''}

正式嘉宾状态：
${characters.map(formatCharacterBrief).join('\n')}

${publicSecretInstruction}

${highlightInstruction}

${socialSignalInstruction}

最近摘要：
${recentSummaries.length > 0 ? recentSummaries.map((item, index) => `${index + 1}. ${item}`).join('\n') : '暂无'}

最近对话：
${recentDialogue || '暂无'}

请输出一个 DirectorBeat JSON：
{
  "beatId": "beat_xxx",
  "sceneType": "opening_group | group_event | date | phone_time | observatory | confession_room | day_end",
  "presentCharIds": ["角色ID"],
  "cameraFocus": [
    {"charId": "角色ID", "shotType": "close_up | reaction | two_shot | wide | cutaway", "reason": "为什么给这个镜头"}
  ],
  "speakers": [
    {"charId": "角色ID", "role": "lead | respond | interrupt | soft_react", "intent": "这一小拍他的表达意图，不是台词"}
  ],
  "reactionOnlyCharIds": ["角色ID"],
  "userPosition": "being_addressed | observing | choosing_target | private_moment | silent_pressure",
  "endingMode": "wait_user | continue_scene | open_choice | phone_notification | scene_end",
  "userPromptHint": "可选，给用户输入框/下一步的提示",
  "secretSubtextGuestIds": ["可选，只能填本场在场且需要绕着秘密演的嘉宾ID"],
  "almostExposedSecretId": "可选，只有公私偏离度高且需要差点露馅时填写",
  "directorNote": "一句话说明这一小拍要制造什么张力"
}`;
}

// ═══════════════════════════════════════════
//  3. buildCharacterStateEvalPrompt — 副模型：角色状态评估
// ═══════════════════════════════════════════

/**
 * 副模型专用。场景结束后评估角色状态变化。
 * 输出纯 JSON（不带 code fence）。
 */
export function buildCharacterStateEvalPrompt(
  charName: string,
  userName: string,
  sceneSummary: string,
  currentState: CharacterState,
  socialSignals: SocialSignal[] = [],
): string {
  return `你是一个恋爱综艺节目的心理分析师。你的任务是根据刚才发生的场景，评估「${charName}」对「${userName}」的状态变化。

### 场景摘要
${sceneSummary}

${buildSocialSignalPromptBlock(socialSignals, `${charName}相关心动广场信号`)}

### ${charName}当前状态
- 好感度：${currentState.affection}/100
- 心情：${currentState.mood}
- 自信度：${currentState.confidence}/100
- 策略：${currentState.strategy}
- 嫉妒对象：${currentState.jealousyTarget || '无'}
- 内心独白：${currentState.innerThought}

### 你的任务
根据场景中发生的互动，重新评估${charName}的状态。注意：
- 好感度变化通常在 ±5 以内，除非发生了重大事件
- 心情要反映场景结束时的即时情绪
- 策略要根据互动走向做出合理调整
- innerThought 写一句${charName}此刻脑海里闪过的话

### 输出格式
直接输出 JSON，不要添加任何其他内容，不要用 code fence 包裹：
{"affection": 42, "mood": "心动", "confidence": 65, "strategy": "主动进攻", "jealousyTarget": null, "innerThought": "她刚才看我的眼神..."}

mood 只能从以下选择：期待、吃醋、受伤、心动、试探、冷淡、紧张、开心
strategy 只能从以下选择：主动进攻、欲擒故纵、默默守护、直球表白、观望、撤退`;
}

// ═══════════════════════════════════════════
//  4. buildImpressionUpdatePrompt — 副模型：印象卡更新
// ═══════════════════════════════════════════

/**
 * 副模型专用。更新角色对用户的印象卡。
 * 强调「同一用户在不同角色眼里是不同形象」。
 */
export function buildImpressionUpdatePrompt(
  charName: string,
  userName: string,
  sceneSummary: string,
  currentImpression: LoveShowUserImpression,
  socialSignals: SocialSignal[] = [],
): string {
  const tentativeReads = getTentativeReads(currentImpression);
  return `你是恋爱综艺的幕后印象记录员。
你的任务不是做心理分析，不是写人物鉴定，也不是替嘉宾审判任何人。
你的任务是站在「${charName}」的视角，根据刚才的互动，小幅更新他对「${userName}」的印象卡。

重要：同一个人在不同嘉宾眼里会是完全不同的人。
你只能使用「${charName}」的性格、价值观、关系距离和刚才看到/经历到的互动，去理解「${userName}」。
不要站在上帝视角判断${userName}真实是什么样的人。
不要替${userName}下最终定义。
不要把一次互动拔高成命运、规则、危险变量、奖品、猎物、征服对象。
不要用攻略女性、审判女性、物化女性的口吻。

### 刚才发生的事
${sceneSummary}

${buildSocialSignalPromptBlock(socialSignals, `${charName}看到/感知到的信息流信号`)}

### ${charName}目前对${userName}的印象
- 感知到的特质：${currentImpression.perceivedTraits.join('、') || '还不了解'}
- 已知事实：${currentImpression.knownFacts.join('；') || '暂无'}
- 暂时理解：${tentativeReads.join('；') || '暂无'}
- 整体印象：${currentImpression.impression || '初印象阶段'}

### 允许的角色张力
嘉宾可以心动、犹豫、吃醋、防备、嘴硬、误会、产生距离感。
但必须保留基本尊重，只描述自己感受到的互动，不评价${userName}的人格高低，不道德审判她的社交方式、亲密选择或魅力。

### 禁止方向
- 不要写心理鉴定、小说旁白、霸总判词、修罗场金句
- 不要把${userName}写成奖品、猎物、危险变量、被攻略对象、被争夺对象
- 不要把女性的主动写成轻浮，把边界感写成装，把魅力写成心机
- 避免这些表达方向：她让我意识到、不能只按我的节奏靠近、她打乱了局面、她让所有人都、她很危险、她很会拿捏、她不是……而是……、我想征服/看穿/靠近她、她让我忍不住

### 字段要求
perceivedTraits：
- 写${charName}主观感知到的特质
- 每条 2-6 个字，最多 4 条
- 要具体、日常、可感知
- 例如：会接话、有分寸、反应快、慢热、直接、观察很细、有自己的节奏

knownFacts：
- 只能写互动中明确出现、${charName}可以确认的客观信息
- 不要写推测
- 每条不超过 18 字

tentativeReads：
- 写${charName}基于有限互动产生的暂时理解
- 可以不完全准确，但必须温和、具体、可修正
- 不要写成偏见、审判或人格定罪
- 例如：可能还没完全放松、好像不喜欢被催着表态、似乎会先观察气氛、对不熟的人会留一点距离

impression：
- 一句自然短评，不超过 32 字
- 像嘉宾心里留下的印象，不像旁白金句
- 禁止攻略口吻、征服口吻、审判口吻、男凝修罗场口吻

### 更希望的 impression 方向
- 她回得很稳，没被气氛带着走。
- 她有自己的节奏，不太会被催着表态。
- 她没有急着回应，但态度不算冷。
- 相处起来比一开始轻松一点。
- 她边界感挺清楚，反而让人安心。
- 她说话不重，但能把意思讲明白。

### 输出格式
直接输出 JSON，不要添加任何其他内容，不要用 code fence 包裹：
{"perceivedTraits": ["有分寸", "反应快"], "knownFacts": ["参与了破冰环节"], "tentativeReads": ["可能不喜欢被催着表态"], "impression": "她有自己的节奏，不太会被气氛推着走。"}`;
}

export function buildImpressionRepairPrompt(
  charName: string,
  userName: string,
  rawOutput: string,
  issues: string[],
): string {
  return `你是 LoveShow 的印象卡修正器。
下面这份「${charName}」对「${userName}」的印象卡存在审判、攻略、物化、霸总修罗场或过度拔高的问题。
你的任务是把它改写成「具体互动观察」，保留角色感和暧昧张力，但整体尊重、自然、克制。

### 发现的问题
${issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}

### 待修正 JSON
${rawOutput}

### 修正规则
- 不要用危险、猎物、奖品、战利品、征服、驯服、拿捏、心机、难搞、不安分、会玩、吊着、勾人、搅乱、争夺、变量、破坏规则、重新定义规则、让人想靠近、让人忍不住、看不透等表达
- 把“审判/攻略女性”的句子改成“刚才互动里可观察到的具体感受”
- 不要把${userName}写成被评估、被攻略、被争夺的对象
- tentativeReads 必须温和、具体、可修正
- impression 不超过 32 字，像自然短评，不像金句

### 输出格式
直接输出 JSON，不要添加任何其他内容，不要用 code fence 包裹：
{"perceivedTraits": ["有分寸", "反应快"], "knownFacts": ["参与了破冰环节"], "tentativeReads": ["可能还没完全放松"], "impression": "她没有急着回应，但态度很稳。"}`;
}

// ═══════════════════════════════════════════
//  5. buildSceneSummaryPrompt — 副模型：场景摘要
// ═══════════════════════════════════════════

/**
 * 副模型专用。生成 20-30 字场景摘要，并顺带提取 0-2 条本季高光。
 */
export function buildSceneSummaryPrompt(
  charName: string,
  userName: string,
  rawDialogue: string,
  guestIdHints: string[] = [],
): string {
  return `你是一个恋爱综艺节目的字幕编辑。你的任务是把下面这段对话浓缩成一句话摘要，并提取可在本季后续自然回提的高光记忆。

### 对话内容
${rawDialogue}

### 要求
- 用 20-30 个字概括这段对话的核心事件和情绪变化
- 格式：「谁做了什么 + 结果/氛围」
- 要包含${charName}和${userName}的互动关键点
- highlights 最多 2 条，可以为 []；必须是“${userName} × 某位嘉宾”的瞬间
- guestIds 只能从这些在场嘉宾 ID 中选择：${guestIdHints.join('、') || charName}
- jealousy/conflict 可以存在，但必须是围绕${userName}产生的张力，不能写成嘉宾互相暧昧、互选或 CP
- callbackLine 是未来可被自然回提的一句话；私聊内容不要在这里复述
- guestIds 填参与该瞬间的嘉宾 ID；如果原文里没有明确 ID，可用角色名原文，调用方会过滤不合法项

### 输出 JSON
不要解释，不要 code fence。严格输出：
{
  "summary": "20-30字场景摘要",
  "highlights": [
    {
      "guestIds": ["嘉宾ID"],
      "kind": "spark | jealousy | confession | conflict | tease | vulnerability | secret",
      "summary": "20-40字，用户视角共同瞬间",
      "meaning": "一句话说明关系上意味着什么",
      "callbackLine": "以后可自然回提的一句话",
      "weight": 0-100
    }
  ]
}

示例：
${charName}在厨房做早餐时和${userName}聊起了小时候的事，气氛变得温暖
${userName}在天台偶遇${charName}，两人沉默地看了一会儿星星`;
}

// ═══════════════════════════════════════════
//  6. buildNpcGeneratorPrompt — 副模型：节目组邀请嘉宾生成
// ═══════════════════════════════════════════

/**
 * 副模型专用。生成节目组邀请嘉宾基础骨架。
 * 要求与现有角色形成差异，不使用标签词，人设有深度。
 */
export function buildNpcGeneratorPrompt(
  neededCount: number,
  existingCharacterSummaries: string[],
): string {
  const lockedGuestsBlock = existingCharacterSummaries.length > 0
    ? existingCharacterSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '目前还没有其他嘉宾';

  return `你是《唯一心动线》的选角导演,要为一档「用户中心向」恋综一次性设计 ${neededCount} 位节目组邀请的男嘉宾。

### 节目核心
- 本季只有用户一位主角,所有镜头最终都回到用户身上。
- 新嘉宾入组即正式嘉宾:有自己的动机、边界和选择张力,可以对用户产生兴趣、竞争、观察、试探。
- 嘉宾之间可以较劲、吃醋、助攻、误解,但绝不互相心动、互选或组成 CP,也不能脱离用户单开一条恋爱线。

### 已在阵容
${lockedGuestsBlock}

### 你的任务:为「反差」选角,不是凑人头
这 ${neededCount} 位彼此要不同,更要和已在阵容形成对手戏。给每人指定一种恋爱打法(approach),并让这 ${neededCount} 位的打法明显铺开、去补已在阵容缺的那几种,别扎堆同一种。打法只能从这六种里选:
- 主动进攻:强势制造机会和独处
- 欲擒故纵:忽冷忽热,让对方来追
- 默默守护:不抢戏,用行动
- 直球表白:喜欢就直接说、直接做
- 观望:慢热,先看清再投入
- 撤退:用退让和体面去制造心动

### 每位要给四件事 + 一个打法 + appearance
1. 基本信息:名字、年龄(22–32)、职业。名字自然,别太文艺也别太大众。
2. 一个让人记住他的具体细节——习惯、癖好、随身的东西、说话时的小动作,具体到能想象出画面,不要"很温柔""很高冷"这种。
3. 说话方式:不要贴标签,用一句他真会说的台词来体现,这句话要能让人听出他是谁。
4. 他为什么来上恋综:动机要真、要具体,不要"想找到真爱"这种空话(失恋了想翻篇?被朋友起哄报的名?忙到没机会认识人?)。
5. approach:从上面六种里选一个,作为他这季的恋爱打法。

在每位嘉宾要输出的字段里加一项 appearance，JSON 里加 "appearance" 字段。

appearance：用自然语言写这位嘉宾的长相，能直接当生图锁脸用。要求：
- 只写长相本身——脸型、五官、发型发色、身形体格、肤色、气质、一两个标志性外形细节；
- 不写任何画风/媒介词（不准出现"写实""二次元""国漫""CG""插画""照片"这类——画风由风格预设决定，这里只负责"长什么样"）；
- 和这个人的记忆点、气质对得上（揣 Zippo 戒了烟的人，跟急诊夜班医生，长相气场就该不一样）；
- 这一批人的长相明显铺开、互不撞型：发型、脸型、体格、气质、年龄段都拉开，别全是"高瘦清冷"。

示例（仅示意，别照抄）："appearance":"三十出头，骨相硬朗的方脸，浓眉深目高鼻梁，黑色短发利落往后梳、鬓角微长，身形高大结实肩背宽，常年户外晒出的小麦色皮肤，眼神沉静带点疲惫"

### 硬规则
- 不准用性格标签词描述人(不能写"他是一个 XX 型的人")。
- 每人要有撑得住五天互动的深度,不能一句话概括完。
- 这 ${neededCount} 位之间、以及和已在阵容之间,性格 / 职业 / 说话方式 / 打法都不能撞型。
- 不设计嘉宾互相心动、互选或 CP;任何人的互动最终都回到用户。

### 输出格式
只输出一个长度为 ${neededCount} 的 JSON 数组,不要任何解释、不要 code fence:
[{"name":"陆时年","age":27,"job":"纪录片剪辑师","memorableDetail":"随身揣一个磨损的 Zippo,其实已经戒烟三年","sampleLine":"你说的这个……等一下,我想想怎么接才不像在敷衍你。","motivation":"前女友的结婚请帖寄到了公司,同事起哄帮他报了名,他想着反正也该往前走","approach":"撤退","appearance":"二十七岁，骨相偏硬的窄长脸，眉眼深、鼻梁高，黑色短发有点乱，身形清瘦肩线利落，肤色偏白，右手虎口有一道浅疤"},{"name":"江停","age":24,"job":"急诊科住院医","memorableDetail":"手机壁纸是张拍糊的猫,谁问都说不是他的猫","sampleLine":"我没空绕弯子——我现在就想坐你旁边,可以吗?","motivation":"连轴转的夜班把上一段感情熬没了,他不想再把喜欢拖到没时间说","approach":"直球表白","appearance":"二十四岁，眉骨清晰的短方脸，眼神明亮直接，高鼻梁薄唇，黑色短发剪得很短，身形高挑结实，肤色健康，笑起来露一点犬齿"}]`;
}

// ═══════════════════════════════════════════
//  7. buildNpcExpandPrompt — 副模型：节目组邀请嘉宾骨架展开
// ═══════════════════════════════════════════

/**
 * 副模型专用。将节目组邀请嘉宾骨架 JSON 展开为完整角色 system prompt（自然语言）。
 * 输出纯文本，可直接作为角色的 system prompt 使用。
 */
export function buildNpcExpandPrompt(
  npcSkeleton: Pick<NpcProfile, 'name' | 'age' | 'job' | 'memorableDetail' | 'sampleLine' | 'motivation' | 'approach' | 'appearance'>,
): string {
  return `你是《唯一心动线》的编剧,把下面这个节目组邀请嘉宾的骨架,展开成一段直接用作 AI 角色 system prompt 的人设文本。

### 骨架
- 名字:${npcSkeleton.name}
- 年龄:${npcSkeleton.age}
- 职业:${npcSkeleton.job}
- 记忆点:${npcSkeleton.memorableDetail}
- 说话示例:「${npcSkeleton.sampleLine}」
- 参加动机:${npcSkeleton.motivation}
- 恋爱打法:${npcSkeleton.approach}
${npcSkeleton.appearance ? `- 外貌:${npcSkeleton.appearance}` : ''}

### 写成 300–500 字,连贯成段(别分点),包含这些层次
1. 他是谁——两三句让人看到一个活人,不是简历。
2. 性格怎么在日常里露出来——别写"他很 XX",写他会做什么、不会做什么。
3. 说话方式——语气、节奏、口头禅、会不会开玩笑、紧张时怎么说话。
4. 他这季的恋爱打法是「${npcSkeleton.approach}」,用行为体现,别把这个词写进文本:他怎么靠近喜欢的人、面对竞争对手会怎么做、被冷落或尴尬时又怎么反应。
5. 他的软肋 / 不为人知的一面——给角色留一层,别一眼看穿。

### 节目边界
- 本季只有用户一位主角,他的心动、试探、吃醋最终都指向用户。
- 他可以和别的嘉宾较劲、助攻、误解,但不和任何嘉宾互相心动、互选或组 CP,也不能自己单开一条恋爱线。

### 格式
- 直接输出人设文本,不要前缀、标题或任何格式标记。
- 自然流畅的中文,像在跟另一个编剧介绍这个人。
- 不用任何性格标签词,不分点。`;
}

export function buildNpcBatchExpandPrompt(
  npcSkeletons: Array<Pick<NpcProfile, 'id' | 'name' | 'age' | 'job' | 'memorableDetail' | 'sampleLine' | 'motivation' | 'approach' | 'appearance'>>,
): string {
  const skeletonBlock = npcSkeletons.map((npc, index) => [
    `${index + 1}. id:${npc.id}`,
    `名字:${npc.name}`,
    `年龄:${npc.age}`,
    `职业:${npc.job}`,
    `记忆点:${npc.memorableDetail}`,
    `说话示例:「${npc.sampleLine}」`,
    `参加动机:${npc.motivation}`,
    `恋爱打法:${npc.approach}`,
    npc.appearance ? `外貌:${npc.appearance}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  return `你是《唯一心动线》的编剧,把下面 ${npcSkeletons.length} 位节目组邀请嘉宾骨架,一次性展开成可直接用作 AI 角色 system prompt 的人设文本。

### 骨架
${skeletonBlock}

### 每位写成 260–420 字,连贯成段(别分点),包含这些层次
1. 他是谁——两三句让人看到一个活人,不是简历。
2. 性格怎么在日常里露出来——别写"他很 XX",写他会做什么、不会做什么。
3. 说话方式——语气、节奏、口头禅、会不会开玩笑、紧张时怎么说话。
4. 他这季的恋爱打法,用行为体现,别把打法词直接写成标签:他怎么靠近喜欢的人、面对竞争对手会怎么做、被冷落或尴尬时又怎么反应。
5. 他的软肋 / 不为人知的一面——给角色留一层,别一眼看穿。

### 节目边界
- 本季只有用户一位主角,每位嘉宾的心动、试探、吃醋最终都指向用户。
- 可以和别的嘉宾较劲、助攻、误解,但不和任何嘉宾互相心动、互选或组 CP,也不能自己单开一条恋爱线。

### 输出格式
只输出 JSON 数组,长度必须是 ${npcSkeletons.length},顺序与上面骨架一致。不要解释、不要 code fence:
[{"id":"npc_xxx","generatedPrompt":"完整人设文本..."}]`;
}

// ═══════════════════════════════════════════
//  8. buildSocialPostsPrompt — 副模型：虚拟社交媒体帖子
// ═══════════════════════════════════════════

/**
 * 副模型专用。生成虚拟社交媒体帖子。
 * 帖子有不同立场，分析可能对也可能错，制造信息不对称。
 */
export interface SocialPostsGuestBrief {
  id: string;
  name: string;
  profile?: string;
  state?: string;
  impression?: string;
}

function formatSocialPostsGuestBriefs(guestBriefs: SocialPostsGuestBrief[]): string {
  if (guestBriefs.length === 0) {
    return '暂无可用嘉宾档案。本次只能生成观众帖子和观众热评。';
  }

  return guestBriefs.map((guest, index) => {
    const details = [
      `id=${guest.id}`,
      `姓名=${guest.name}`,
      guest.profile ? `人设=${guest.profile}` : '',
      guest.state ? `当前状态=${guest.state}` : '',
      guest.impression ? `对主角印象=${guest.impression}` : '',
    ].filter(Boolean).join('；');
    return `${index + 1}. ${details}`;
  }).join('\n');
}

export function buildSocialPostsPrompt(
  day: number,
  seasonSummary: string,
  charNames: string[],
  userName = '用户',
  guestBriefs: SocialPostsGuestBrief[] = [],
): string {
  const guestBriefBlock = formatSocialPostsGuestBriefs(guestBriefs);
  const guestInstruction = guestBriefs.length > 0
    ? `- 必须生成至少 1 条嘉宾本人发出的帖子，或至少 1 条嘉宾本人留下的评论；嘉宾内容只能使用「可发言嘉宾档案」里的 id 与姓名。`
    : `- 没有可发言嘉宾档案时，不允许生成 authorType=guest。`;
  const firstGuest = guestBriefs[0];
  const outputExample = firstGuest
    ? `[{"platform": "weibo", "authorType": "audience", "username": "暂停键按烂", "content": "${userName}没接话那半秒我倒回去看了三遍，${firstGuest.name}手还停在杯沿上。", "comments": [{"authorType": "audience", "authorName": "显微镜在线", "content": "他不是忘了递杯子，是在等她先抬头吧。"}, {"authorType": "guest", "authorGuestId": "${firstGuest.id}", "authorName": "${firstGuest.name}", "content": "那一下不是等镜头，是我自己慢了。"}]}, {"platform": "xhs", "authorType": "guest", "authorGuestId": "${firstGuest.id}", "authorName": "${firstGuest.name}", "username": "${firstGuest.name}", "content": "刚才那句我没接，不是没听见。只是她看过来的时候，我忽然不想把话说得太像营业。", "likes": 2341, "comments": [{"authorType": "audience", "authorName": "慢放三遍", "content": "这条比正片还明显，他真的在解释刚才那个停顿。"}]}]`
    : `[{"platform": "weibo", "authorType": "audience", "username": "暂停键按烂", "content": "${userName}没接话那半秒我倒回去看了三遍，阿序手还停在杯沿上。", "comments": [{"authorType": "audience", "authorName": "显微镜在线", "content": "他不是忘了递杯子，是在等她先抬头吧。"}]}, {"platform": "xhs", "authorType": "audience", "username": "慢放糖渣", "content": "今天这段不是工业糖，是两个人同时不知道怎么把话接下去。", "likes": 2341, "comments": [{"authorType": "audience", "authorName": "慢放三遍", "content": "不是眼神大，是他后面那半秒没接话太明显。"}]}]`;

  return `你是一个社交媒体内容模拟器。你的任务是为《唯一心动线》生成「心动广场」里的社交动态。

### 节目信息
- 当前进度：第${day}天
- 唯一主角：${userName}
- 嘉宾：${charNames.join('、')}
- 今天发生的事：${seasonSummary}

### 可发言嘉宾档案
${guestBriefBlock}

### 关系主轴
本节目的恋爱主轴是「${userName} × 嘉宾」。
嘉宾之间默认是竞争者、观察者、助攻者、误解制造者，不是彼此恋爱对象。
可以写网友误读两位嘉宾之间的火药味、比较、试探或助攻，但必须落回他们都在围绕${userName}产生反应。
不要生成「嘉宾 × 嘉宾」CP 锁定、互相心动、互相恋爱主线的内容。

### 你的任务
生成 4-6 条来自不同平台、不同账号的帖子。要求：
- 平台只能是 weibo 或 xhs
- 观众账号的用户名要有网感（像真实的社交媒体昵称）；嘉宾账号必须使用档案里的姓名
- 帖子要有不同立场：有站「${userName} × 某位嘉宾」的、有理性分析的、有纯吃瓜起哄的，也可以有嘉宾本人发的一句动态
- 每条帖子必须带 comments 数组，生成 2-4 条热评；热评可以来自观众，也可以来自嘉宾本人，但嘉宾评论必须有 authorGuestId
${guestInstruction}
- 评论要像普通网友刚刷到这条时随手打的短评：抓一个具体动作、眼神、停顿、台词反应或镜头细节；可以有“我怎么感觉”“不是吧”“这句不像营业”“他刚才是不是”等口语
- 嘉宾帖子/嘉宾评论要像这个人真的刚录完节目后发的：贴合他的人设、当前心情、对${userName}的误解或在意，只写他会说的话
- 嘉宾发言要具体，不要替观众总结节目；可以写“刚才那句我没接，是因为……”“我以为她没看见，结果镜头比我诚实”这种有现场余温的话
- 禁止抽象口号、金句、标语式总结，例如“遗憾留给昨天，心动留给被看见”这类句式不要出现
- 可出现「心动风向」「今日风向」「观众正在起哄」「明日镜头倾向」等说法
- 不要写投票题、选项题、A/B/C/D 分组题、榜单题；不要使用“心动风向标”这类像系统模板的用户名
- 风向只能围绕${userName}，例如谁今天最在意${userName}、谁和${userName}最有张力、谁最像在吃醋
- 分析可能是对的，也可能是完全错误的解读——观众永远只能看到表面
- xhs 帖子可以附带点赞数
- 语气要像真的网友在讨论，不要太书面
- 不要生成“谁和谁最配”、嘉宾 CP 排名、嘉宾互选心动对象、嘉宾之间的恋爱线投票

### 输出格式
字段要求：
- 观众帖子：authorType="audience"，username 是观众昵称，不要 authorGuestId
- 嘉宾帖子：authorType="guest"，authorGuestId 必须等于档案 id，authorName 和 username 必须等于档案姓名
- 观众评论：authorType="audience"，authorName 是观众昵称
- 嘉宾评论：authorType="guest"，authorGuestId 必须等于档案 id，authorName 必须等于档案姓名

直接输出 JSON 数组，不要添加任何其他内容，不要用 code fence 包裹：
${outputExample}`;
}

// ═══════════════════════════════════════════
//  9. buildDirectorMissionPrompt — 副模型：导演密令
// ═══════════════════════════════════════════

/**
 * 副模型专用。生成导演密令（给用户的隐藏任务）。
 */
export function buildDirectorMissionPrompt(
  day: number,
  charNames: string[],
  seasonContext: string,
): string {
  return `你是《唯一心动线》的放送组成员。你要为用户设计一个「隐藏心令」——一个只有用户知道的心动任务。

### 节目信息
- 当前进度：第${day}天
- 嘉宾：${charNames.join('、')}
- 目前为止的情况：${seasonContext}

### 隐藏心令设计原则
- 任务要具体、可执行：不是"增进感情"这种抽象目标，而是"在明天的集体活动中找机会单独和某人说一句安慰的话"
- 任务要制造有趣的局面：让用户不得不做一些平时不会做的事
- 奖励要有吸引力但不破坏平衡：比如解锁某个角色的隐藏信息、获得一次偷看观察室的机会
- 任务难度适中：不要太容易完成（"和某人说句话"），也不要太难（"让某人当众表白"）
- 任务必须围绕用户与嘉宾，不安排嘉宾互选、嘉宾 CP、淘汰裁判或最终归属决定
- 风向只会推近关系、制造明日镜头倾向，不会替用户决定心动归属

### 输出格式
直接输出 JSON，不要添加任何其他内容，不要用 code fence 包裹：
{"description": "在明天的集体活动中找机会单独和阿昊说一句安慰的话", "reward": "解锁阿昊的隐藏档案"}`;
}
