import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceSeasonBeat,
  buildPublicSecretSubtextForScene,
  createFallbackDirectorBeat,
  createFallbackHighlight,
  createLoveShowPrivateSecret,
  createLoveShowPrivateSecretFromDecision,
  createSceneFromChoice,
  createSeason,
  DATE_LOCATION_POOL,
  evaluateLoveShowPrivateSecretWithMeta,
  expandNpcPrompt,
  expandNpcPrompts,
  generateSceneSummaryWithHighlights,
  generateSocialPosts,
  generateNextChoicePoint,
  generateNpcSkeletons,
  isUserCenteredHighlight,
  mergePrivateSecretIntoGuestState,
  normalizeSeasonState,
  pickShowArrangedLocation,
  privateSecretsForPublicScene,
  recordSeasonUsedLocation,
  resolveEliminationChoice,
  resolveFinaleChoice,
  selectHighlightsForContext,
  shouldTriggerAlmostExposedBeat,
} from './loveshowEngine';
import type { ApiConfig } from './loveshowEngine';
import { appendHighlightMemories, getHighlightMemories } from './db/loveshowStore';
import type { CharacterState, HighlightMemory, NpcProfile, SeasonState } from '../types/loveshow';

const emptyStates: CharacterState[] = [];
const apiConfig: ApiConfig = {
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

function chatResponse(content: string, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0): any {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body || '{}'));
}

function skeleton(input: Partial<NpcProfile> = {}) {
  return {
    name: input.name || '陆时年',
    age: input.age || 27,
    job: input.job || '纪录片剪辑师',
    memorableDetail: input.memorableDetail || '随身揣一个磨损的 Zippo',
    sampleLine: input.sampleLine || '我想想怎么接才不像在敷衍你。',
    motivation: input.motivation || '前女友的结婚请帖寄到了公司，他想着该往前走。',
    approach: input.approach || '撤退',
    appearance: input.appearance || '二十七岁，窄长脸，黑色短发，眉眼深，高鼻梁，身形清瘦肩线利落，肤色偏白，右手虎口有一道浅疤',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function seasonAt(day: number, beatIndex: number, ids = ['a', 'b', 'c', 'd']): SeasonState {
  return {
    ...createSeason(ids),
    day,
    beatIndex,
  };
}

function highlight(input: Partial<HighlightMemory> = {}): HighlightMemory {
  return {
    id: input.id || `highlight_${Math.random().toString(36).slice(2)}`,
    seasonId: input.seasonId || 'season_highlight',
    day: input.day || 1,
    beatIndex: input.beatIndex ?? 0,
    sceneId: input.sceneId || 'scene_1',
    source: input.source || 'scene',
    guestIds: input.guestIds || ['guest_a'],
    kind: input.kind || 'spark',
    summary: input.summary || '用户和阿序在雨里共撑一把伞',
    meaning: input.meaning || '阿序确认自己被认真看见',
    callbackLine: input.callbackLine,
    weight: input.weight ?? 70,
    fromPrivateSecret: input.fromPrivateSecret,
    createdAt: input.createdAt || 1000,
  };
}

describe('LoveShow season schedule', () => {
  it('generates stable fixed beats instead of heuristic next choices', () => {
    let season = createSeason(['a', 'b', 'c', 'd']);

    expect(generateNextChoicePoint(season, emptyStates, [])).toMatchObject({
      type: 'group_event',
      id: expect.stringContaining('d1_b0_opening'),
    });

    season = advanceSeasonBeat(season);
    expect(generateNextChoicePoint(season, emptyStates, [])).toMatchObject({
      type: 'group_event',
      id: expect.stringContaining('d1_b1_group_activity'),
    });

    season = advanceSeasonBeat(season);
    expect(generateNextChoicePoint(season, emptyStates, [])).toMatchObject({
      type: 'date_card',
      id: expect.stringContaining('d1_b2_date'),
    });
  });

  it('keeps camera focus capped while preserving all location guests for a six-person cast', () => {
    const season = createSeason(['a', 'b', 'c', 'd', 'e', 'f']);
    const choice = generateNextChoicePoint(season, emptyStates, []);
    const scene = createSceneFromChoice(season, choice);

    expect(scene.characterIds).toHaveLength(4);
    expect(scene.locationGuestIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('uses the planned elimination rhythm and keeps farewell outcomes', () => {
    const dayTwoForFourGuests = seasonAt(2, 4);
    expect(generateNextChoicePoint(dayTwoForFourGuests, emptyStates, [])).toMatchObject({
      type: 'closing',
    });

    const dayThreeForFourGuests = seasonAt(3, 4);
    const eliminationChoice = generateNextChoicePoint(dayThreeForFourGuests, emptyStates, []);
    expect(eliminationChoice.type).toBe('elimination');

    const next = resolveEliminationChoice(dayThreeForFourGuests, 'a', '阿序');
    expect(next.eliminations).toEqual(['a']);
    expect(next.eliminationOutcomes[0]).toMatchObject({
      day: 3,
      eliminatedGuestId: 'a',
    });
    expect(next.eliminationOutcomes[0].farewellInterview).toContain('体面离开');
  });

  it('completes Day 5 finale without a rejection ending', () => {
    const season = seasonAt(5, 3, ['a', 'b']);
    const completed = resolveFinaleChoice(season, 'open_end', { a: '阿序', b: '白榆' });

    expect(completed.status).toBe('completed');
    expect(completed.finalChoice).toBeNull();
    expect(completed.finaleOutcome?.closingNote).toContain('主动选择');
    expect(completed.finaleOutcome?.closingNote).not.toContain('拒绝你');
  });
});

describe('LoveShow arranged date locations', () => {
  it('keeps a rich legal external date pool', () => {
    expect(DATE_LOCATION_POOL.length).toBeGreaterThanOrEqual(10);
    expect(DATE_LOCATION_POOL.every(location => (
      Boolean(location.id)
      && Boolean(location.name)
      && Boolean(location.nameZh)
      && Boolean(location.nameEn)
      && Boolean(location.description)
      && Boolean(location.backgroundImage)
      && Boolean(location.gradientFallback)
      && location.tags.length > 0
    ))).toBe(true);
  });

  it('picks a legal stable location from season, day, beat, and scene type', () => {
    const input = {
      seasonId: 'season_seed_alpha',
      day: 2,
      beatIndex: 3,
      sceneType: 'date',
      usedLocationIds: [],
    };
    const first = pickShowArrangedLocation(input);
    const second = pickShowArrangedLocation(input);

    expect(DATE_LOCATION_POOL.map(location => location.id)).toContain(first.locationId);
    expect(second).toEqual(first);
  });

  it('avoids used locations until the pool is exhausted', () => {
    const remaining = DATE_LOCATION_POOL[0];
    const usedLocationIds = DATE_LOCATION_POOL.slice(1).map(location => location.id);
    const picked = pickShowArrangedLocation({
      seasonId: 'season_only_one_remaining',
      day: 4,
      beatIndex: 3,
      sceneType: 'date',
      usedLocationIds,
    });

    expect(picked.locationId).toBe(remaining.id);
  });

  it('falls back safely after every date location has been used', () => {
    const usedLocationIds = DATE_LOCATION_POOL.map(location => location.id);
    const picked = pickShowArrangedLocation({
      seasonId: 'season_exhausted',
      day: 5,
      beatIndex: 1,
      sceneType: 'date',
      usedLocationIds,
    });

    expect(DATE_LOCATION_POOL.map(location => location.id)).toContain(picked.locationId);
    expect(picked.locationId).not.toBe(usedLocationIds[usedLocationIds.length - 1]);
  });

  it('normalizes old seasons and records date locations once', () => {
    const rawSeason = createSeason(['guest_a', 'guest_b']) as unknown as Record<string, unknown>;
    delete rawSeason.usedLocationIds;

    const normalized = normalizeSeasonState(rawSeason as unknown as SeasonState);
    const picked = pickShowArrangedLocation({
      seasonId: normalized.seasonId,
      day: normalized.day,
      beatIndex: normalized.beatIndex,
      sceneType: 'date',
      usedLocationIds: normalized.usedLocationIds,
    });
    const recorded = recordSeasonUsedLocation(normalized, picked.locationId);
    const recordedAgain = recordSeasonUsedLocation(recorded, picked.locationId);

    expect(normalized.usedLocationIds).toEqual([]);
    expect(recorded.usedLocationIds).toEqual([picked.locationId]);
    expect(recordedAgain.usedLocationIds).toEqual([picked.locationId]);
  });

  it('creates stable date scenes without reusing the legacy house-location choice type', () => {
    const legacyType = ['location', 'visit'].join('_');
    const season = seasonAt(1, 2, ['guest_a', 'guest_b', 'guest_c']);
    const dateChoice = generateNextChoicePoint(season, emptyStates, []);
    const sceneA = createSceneFromChoice(season, dateChoice, 'guest_a');
    const sceneB = createSceneFromChoice(season, dateChoice, 'guest_a');

    for (const dayPlan of season.schedule) {
      dayPlan.beats.forEach((_beat, beatIndex) => {
        const choice = generateNextChoicePoint(seasonAt(dayPlan.day, beatIndex), emptyStates, []);
        expect(choice.type).not.toBe(legacyType);
      });
    }

    expect(dateChoice.type).toBe('date_card');
    expect(sceneA.locationId).toBe(sceneB.locationId);
    expect(sceneA.locationName).toBe(sceneB.locationName);
    expect(DATE_LOCATION_POOL.map(location => location.id)).toContain(sceneA.locationId);
  });
});

describe('LoveShow highlight memory callbacks', () => {
  it('parses scene summary highlights from the existing summary call', async () => {
    const payload = {
      summary: '阿序在雨夜巴士站替用户挡住了风',
      highlights: [
        {
          guestIds: ['guest_a'],
          kind: 'spark',
          summary: '用户和阿序在雨夜巴士站共撑一把伞',
          meaning: '阿序第一次把照顾做得很明显',
          callbackLine: '还记得那把伞吗？',
          weight: 82,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generateSceneSummaryWithHighlights(
      apiConfig,
      '阿序',
      '小满',
      '阿序：伞给你。小满：那你呢？',
      {
        season: { ...seasonAt(2, 3, ['guest_a', 'guest_b']), seasonId: 'season_hl' },
        sceneId: 'scene_rain',
        guestIds: ['guest_a', 'guest_b'],
        createdAt: 1000,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(plan.summary).toBe(payload.summary);
    expect(plan.highlights[0]).toMatchObject({
      seasonId: 'season_hl',
      sceneId: 'scene_rain',
      guestIds: ['guest_a'],
      kind: 'spark',
      summary: '用户和阿序在雨夜巴士站共撑一把伞',
    });
  });

  it('creates a legal fallback highlight when the secondary API is absent', () => {
    const season = seasonAt(2, 3, ['guest_a', 'guest_b']);
    const scene = createSceneFromChoice(season, generateNextChoicePoint(season, emptyStates, []), 'guest_a');
    const fallback = createFallbackHighlight({
      season,
      scene,
      summary: '阿序和用户在海边完成了一次很轻的靠近',
      characterStates: [{
        characterId: 'guest_a',
        affection: 66,
        mood: '心动',
        confidence: 50,
        strategy: '观望',
        jealousyTarget: null,
        innerThought: '',
        lastUpdatedScene: '',
      }],
      createdAt: 1000,
    });

    expect(fallback).toMatchObject({
      seasonId: season.seasonId,
      day: 2,
      kind: 'spark',
      source: 'scene',
    });
    expect(fallback?.guestIds).toContain('guest_a');
  });

  it('filters guest-guest CP semantics before highlights can be selected', () => {
    const unsafe = highlight({
      summary: 'guest_a 和 guest_b 最配，观众都在磕这对 CP',
      meaning: '两位嘉宾互相心动',
    });
    const safe = highlight({
      id: 'safe',
      guestIds: ['guest_a'],
      summary: '用户把约会卡递给阿序时他明显愣住',
      meaning: '阿序意识到自己被用户选择',
      weight: 80,
    });

    expect(isUserCenteredHighlight(unsafe)).toBe(false);
    expect(selectHighlightsForContext([unsafe, safe], {
      presentGuestIds: ['guest_a'],
      day: 3,
      limit: 3,
    })).toEqual([safe]);
  });

  it('marks private-chat highlights as subtext-only material', async () => {
    const season = createSeason(['guest_a']);
    const plan = await evaluateLoveShowPrivateSecretWithMeta(null, {
      season,
      guestId: 'guest_a',
      guestName: '阿序',
      userName: '小满',
      userMessage: '这是只告诉我的吗？',
      guestReply: '只告诉你。我怕镜头拍到我在意你。',
      createdAt: 1000,
    });

    expect(plan.secret).not.toBeNull();
    expect(plan.highlight).toMatchObject({
      source: 'private_chat',
      guestIds: ['guest_a'],
      kind: 'secret',
      fromPrivateSecret: true,
    });
  });

  it('selects top highlights by present guest, weight, recency, and diversity', () => {
    const selected = selectHighlightsForContext([
      highlight({ id: 'old-heavy', guestIds: ['guest_a'], kind: 'spark', day: 1, weight: 95, createdAt: 100 }),
      highlight({ id: 'same-kind', guestIds: ['guest_b'], kind: 'spark', day: 3, weight: 94, createdAt: 300 }),
      highlight({ id: 'fresh-conflict', guestIds: ['guest_b'], kind: 'conflict', day: 3, weight: 78, createdAt: 400 }),
      highlight({ id: 'offscreen', guestIds: ['guest_c'], kind: 'tease', day: 3, weight: 100, createdAt: 500 }),
    ], {
      presentGuestIds: ['guest_a', 'guest_b'],
      day: 3,
      limit: 3,
    });

    expect(selected.map(item => item.id)).toEqual(['old-heavy', 'fresh-conflict']);
  });

  it('persists highlights by season id and trims to a light top-N set', () => {
    appendHighlightMemories('season_a', Array.from({ length: 20 }, (_item, index) => highlight({
      id: `a_${index}`,
      seasonId: 'season_a',
      guestIds: [`guest_${index}`],
      weight: index,
      createdAt: index,
    })));
    appendHighlightMemories('season_b', [highlight({ id: 'b_1', seasonId: 'season_b', guestIds: ['guest_b'], weight: 90 })]);

    const seasonA = getHighlightMemories('season_a');
    const seasonB = getHighlightMemories('season_b');

    expect(seasonA).toHaveLength(15);
    expect(seasonA.map(item => item.id)).not.toContain('a_0');
    expect(seasonB.map(item => item.id)).toEqual(['b_1']);
  });

  it('uses highlights in farewell and finale text when available', () => {
    const season = seasonAt(3, 4, ['guest_a', 'guest_b', 'guest_c', 'guest_d']);
    const memories = [
      highlight({
        id: 'farewell_hl',
        seasonId: season.seasonId,
        guestIds: ['guest_a'],
        day: 1,
        summary: '用户在厨房替阿序解围',
        callbackLine: '你那天没有让我一个人站在镜头里',
        weight: 86,
      }),
      highlight({
        id: 'finale_hl',
        seasonId: season.seasonId,
        guestIds: ['guest_b'],
        day: 2,
        kind: 'confession',
        summary: '白榆在书店把书签留给用户',
        weight: 90,
      }),
    ];
    const eliminated = resolveEliminationChoice(season, 'guest_a', '阿序', memories);
    const finale = resolveFinaleChoice(seasonAt(5, 3, ['guest_b', 'guest_c']), 'guest_b', {
      guest_b: '白榆',
      guest_c: '闻烈',
    }, memories);

    expect(eliminated.eliminationOutcomes[0].farewellInterview).toContain('厨房替阿序解围');
    expect(finale.finaleOutcome?.chosenResponse).toContain('书店把书签留给用户');
  });
});

describe('LoveShow NPC generation pipeline', () => {
  it('generates multiple NPC skeletons with one batch sub-model call', async () => {
    const fencedJson = [
      '```json',
      JSON.stringify([
        skeleton({ name: '陆时年', approach: '撤退' }),
        skeleton({ name: '江停', approach: '直球表白' }),
        skeleton({ name: '沈既白', approach: '默默守护' }),
      ]),
      '```',
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(fencedJson));
    vi.stubGlobal('fetch', fetchMock);

    const npcs = await generateNpcSkeletons(apiConfig, 3, ['阿序：真实角色嘉宾']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock).max_tokens).toBe(65536);
    expect(npcs).toHaveLength(3);
    expect(npcs.map(npc => npc.name)).toEqual(['陆时年', '江停', '沈既白']);
    expect(npcs.map(npc => npc.approach)).toEqual(['撤退', '直球表白', '默默守护']);
    expect(npcs.every(npc => Boolean(npc.appearance))).toBe(true);
    expect(new Set(npcs.map(npc => npc.appearance))).toHaveLength(3);
  });

  it('parses wrapped localized NPC payloads instead of dropping the batch to fallback', async () => {
    const wrapped = [
      '选角如下：',
      JSON.stringify({
        男嘉宾: [
          {
            姓名: '闻烈',
            年龄: '28',
            职业: '山地救援队员',
            记忆点: '右手腕系着一段褪色的红色伞绳，焦躁时会反复拆解再重打结',
            台词: '他们都在演那种深情体面的戏码，你不累吗？如果想听真话，现在就跟我走。',
            动机: '一次救援结束后他发现自己只会照顾所有人，却很少允许别人靠近他。',
            打法: '主动进攻',
            外貌: '二十八岁，轮廓锋利的窄方脸，眉骨高，眼神很黑，黑色短发贴近额头，身形高而结实，肤色被晒成小麦色，右手腕有红色伞绳',
          },
          {
            姓名: '夏鸣星',
            年龄: '25',
            职业: '舞台灯光师',
            记忆点: '说话时会先看灯影落在哪个角度，像在给每个人找一束光',
            台词: '你站这里会好看一点，不是镜头好看，是你会舒服一点。',
            动机: '一直躲在舞台暗处看别人告白，这次被同事推到光里。',
            打法: '默默守护',
            外貌: '二十五岁，清瘦鹅蛋脸，浅棕色短发微卷，鼻梁挺直，唇色偏淡，身形修长肩颈线漂亮，肤色冷白，右耳戴一枚小银色耳钉',
          },
        ],
      }),
      '请确认。',
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(wrapped));
    vi.stubGlobal('fetch', fetchMock);

    const npcs = await generateNpcSkeletons(apiConfig, 2, ['阿序：真实角色嘉宾']);

    expect(npcs.map(npc => npc.name)).toEqual(['闻烈', '夏鸣星']);
    expect(npcs.map(npc => npc.approach)).toEqual(['主动进攻', '默默守护']);
    expect(npcs[0].memorableDetail).toContain('红色伞绳');
    expect(npcs[1].sampleLine).toContain('舒服一点');
  });

  it('retries once when skeleton JSON parsing fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse('不是 JSON'))
      .mockResolvedValueOnce(chatResponse(JSON.stringify([skeleton({ name: '重试嘉宾', approach: '观望' })])));
    vi.stubGlobal('fetch', fetchMock);

    const npcs = await generateNpcSkeletons(apiConfig, 1, []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(npcs[0]).toMatchObject({ name: '重试嘉宾', approach: '观望' });
    expect(npcs[0].appearance).toContain('二十七岁');
  });

  it('falls back to non-empty distinct appearances when skeleton appearance is missing or style-like', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(JSON.stringify([
      { ...skeleton({ name: '缺外貌一' }), appearance: '' },
      { ...skeleton({ name: '缺外貌二' }), appearance: '写实照片风格的高冷帅哥' },
    ])));
    vi.stubGlobal('fetch', fetchMock);

    const npcs = await generateNpcSkeletons(apiConfig, 2, []);

    expect(npcs.map(npc => npc.appearance).filter(Boolean)).toHaveLength(2);
    expect(new Set(npcs.map(npc => npc.appearance))).toHaveLength(2);
    expect(npcs[1].appearance).not.toContain('写实');
  });

  it('strips code fences from expanded NPC prompts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('```text\n他会把喜欢藏在很具体的行动里。\n```'));
    vi.stubGlobal('fetch', fetchMock);

    const prompt = await expandNpcPrompt(apiConfig, {
      id: 'npc-1',
      ...skeleton({ name: '陆时年', approach: '撤退' }),
      generatedPrompt: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prompt).toBe('他会把喜欢藏在很具体的行动里。');
  });

  it('expands multiple NPC prompts in one batch call', async () => {
    const npcA = { id: 'npc-a', ...skeleton({ name: '闻烈', approach: '主动进攻' }), generatedPrompt: '' };
    const npcB = { id: 'npc-b', ...skeleton({ name: '裴予', approach: '欲擒故纵' }), generatedPrompt: '' };
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(JSON.stringify([
      { id: 'npc-a', generatedPrompt: '闻烈会把焦躁压进行动里，所有靠近都指向用户。' },
      { id: 'npc-b', generatedPrompt: '裴予习惯测量距离，却会在用户面前放慢防御。' },
    ])));
    vi.stubGlobal('fetch', fetchMock);

    const prompts = await expandNpcPrompts(apiConfig, [npcA, npcB]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBody(fetchMock).max_tokens).toBe(65536);
    expect(prompts).toEqual([
      '闻烈会把焦躁压进行动里，所有靠近都指向用户。',
      '裴予习惯测量距离，却会在用户面前放慢防御。',
    ]);
  });

  it('keeps generated skeleton identity when one batch expanded prompt is missing', async () => {
    const npcA = { id: 'npc-a', ...skeleton({ name: '闻烈', approach: '主动进攻' }), generatedPrompt: '' };
    const npcB = { id: 'npc-b', ...skeleton({ name: '裴予', approach: '欲擒故纵' }), generatedPrompt: '' };
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(JSON.stringify([
      { id: 'npc-a', generatedPrompt: '闻烈会把焦躁压进行动里，所有靠近都指向用户。' },
      { id: 'npc-b', generatedPrompt: '' },
    ])));
    vi.stubGlobal('fetch', fetchMock);

    const prompts = await expandNpcPrompts(apiConfig, [npcA, npcB]);

    expect(prompts[0]).toContain('闻烈');
    expect(prompts[1]).toContain('裴予');
    expect(prompts[1]).toContain('本季只有用户一位主角');
  });
});

describe('LoveShow social post generation', () => {
  it('keeps persona-verified guest posts/comments and filters poll templates, fake guests, and slogans', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      posts: [
        {
          platform: 'xhs',
          username: '心动风向标',
          content: 'Day4 总结：本轮最想看的单独约会投票！A. 陆沉（温柔庇护组） B. 宋逾（真迹拆穿组）',
          comments: [
            { authorType: 'guest', authorName: '陈望舒', content: '遗憾留给昨天，心动留给被看见的那一刻。' },
          ],
        },
        {
          platform: 'weibo',
          username: '暂停键按烂',
          content: '厨房那段我真的想倒回去，小满没接话以后阿序手还停在杯沿上。',
          comments: [
            { authorType: 'guest', authorGuestId: 'guest-a', authorName: '阿序', content: '那一下不是等镜头，是我自己慢了。' },
            { authorType: 'guest', authorName: '陈望舒', content: '刚才那段我也看见了，但我不该在这里替她决定。' },
            { authorType: 'audience', authorName: '嗑学家', content: '遗憾留给昨天，心动留给被看见的那一刻。' },
            { authorType: 'audience', authorName: '慢放三遍', content: '他那个手停住不是剪辑吧，像等她先开口。' },
          ],
        },
        {
          platform: 'xhs',
          authorType: 'guest',
          authorGuestId: 'guest-a',
          authorName: '阿序',
          username: '阿序',
          content: '刚才那句我没接，不是没听见。她看过来的时候，我忽然不想把话说得太像营业。',
          comments: [
            { authorType: 'audience', authorName: '慢放到凌晨', content: '这条就是在解释杯沿那一下吧，太不像营业了。' },
          ],
        },
        {
          platform: 'xhs',
          authorType: 'guest',
          authorGuestId: 'guest-z',
          authorName: '不存在的嘉宾',
          username: '不存在的嘉宾',
          content: '我也在现场，所以我想解释一下刚才的沉默。',
          comments: [],
        },
      ],
    })));
    vi.stubGlobal('fetch', fetchMock);

    const posts = await generateSocialPosts(
      apiConfig,
      4,
      '小满和阿序在厨房短暂停顿，镜头捕捉到杯沿上的手',
      ['阿序', '陈望舒'],
      '小满',
      [{
        id: 'guest-a',
        name: '阿序',
        profile: '慢热，紧张时会把话收回去，用动作补偿。',
        state: '心情：克制；内心：刚才没接话不是不在意',
        impression: '觉得小满会注意到别人藏起来的小动作',
      }],
    );

    expect(posts).toHaveLength(2);
    const audiencePost = posts.find(post => post.username === '暂停键按烂');
    expect(audiencePost?.comments).toEqual([
      expect.objectContaining({
        authorType: 'guest',
        authorGuestId: 'guest-a',
        authorName: '阿序',
        content: '那一下不是等镜头，是我自己慢了。',
      }),
      expect.objectContaining({
        authorType: 'audience',
        authorName: '慢放三遍',
        content: '他那个手停住不是剪辑吧，像等她先开口。',
      }),
    ]);
    const guestPost = posts.find(post => post.authorType === 'guest');
    expect(guestPost).toEqual(expect.objectContaining({
      authorGuestId: 'guest-a',
      authorName: '阿序',
      username: '阿序',
      source: 'scene_end',
    }));
    expect(guestPost?.content).toContain('不是没听见');
  });
});

describe('LoveShow public/private tension', () => {
  it('turns one private chat disclosure into a guest-user secret', () => {
    const season = createSeason(['guest_a', 'guest_b']);
    const secret = createLoveShowPrivateSecret({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '你刚才为什么突然沉默？',
      guestReply: '其实我有点喜欢你，这句话别告诉镜头前的我。',
      createdAt: 1000,
    });

    expect(secret).toMatchObject({
      seasonId: season.seasonId,
      day: 1,
      guestId: 'guest_a',
      userName: '小满',
      kind: 'confession',
    });
    expect(Object.keys(secret || {})).not.toEqual(expect.arrayContaining([
      'otherGuestId',
      'guestPairIds',
      'cpGuestIds',
    ]));

    const nextState = mergePrivateSecretIntoGuestState({
      characterId: 'guest_a',
      affection: 36,
      mood: '试探',
      confidence: 50,
      strategy: '观望',
      jealousyTarget: null,
      innerThought: '先别让镜头看出来',
      lastUpdatedScene: '',
    }, secret!);

    expect(nextState.privateTruth?.revealedToUser).toContain(secret!.summary);
    expect(nextState.publicPosture?.avoids).toContain('公开场');
    expect(nextState.publicPrivateDivergence).toBeGreaterThan(0);
  });

  it('keeps public-scene secret handling oblique instead of spelling out the private line', () => {
    const season = createSeason(['guest_a']);
    const secret = createLoveShowPrivateSecret({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '可以诚实一点吗？',
      guestReply: '我其实很害怕被你看穿，但又只想让你看穿。',
      createdAt: 1000,
    });

    const publicPrompt = buildPublicSecretSubtextForScene(privateSecretsForPublicScene([secret!], ['guest_a']));

    expect(publicPrompt).toContain('旁敲侧击');
    expect(publicPrompt).toContain(secret!.publicSubtextHint);
    expect(publicPrompt).not.toContain(secret!.privateLine!);
    expect(publicPrompt).not.toContain('我其实很害怕被你看穿');
  });

  it('can trigger an almost-exposed director beat when divergence is high', () => {
    const season = createSeason(['guest_a', 'guest_b']);
    const secret = createLoveShowPrivateSecret({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '刚才那句算什么？',
      guestReply: '算我承认我偏心你，但拜托别让别人知道。',
      createdAt: 1000,
    });
    const highDivergenceState: CharacterState = {
      characterId: 'guest_a',
      affection: 72,
      mood: '紧张',
      confidence: 42,
      strategy: '欲擒故纵',
      jealousyTarget: null,
      innerThought: '公开场要装得没发生',
      publicPrivateDivergence: 84,
      lastUpdatedScene: '',
    };
    const beat = createFallbackDirectorBeat({
      season,
      scene: {
        id: 'public_scene',
        dayNumber: 1,
        locationId: 'living_room',
        locationName: '客厅',
        characterIds: ['guest_a', 'guest_b'],
        atmosphere: '公开群像',
        status: 'active',
      },
      characters: [
        { id: 'guest_a', name: '阿序', state: highDivergenceState, privateSecrets: [secret!] },
        { id: 'guest_b', name: '白榆' },
      ],
      privateSecrets: [secret!],
      sceneSummaries: [],
      recentDialogue: '',
    });

    expect(shouldTriggerAlmostExposedBeat(highDivergenceState, [secret!])).toBe(true);
    expect(beat.almostExposedSecretId).toBe(secret!.id);
    expect(beat.secretSubtextGuestIds).toContain('guest_a');
    expect(beat.directorNote).toContain('差点露馅');
  });

  it('does not create guest-guest secrets or CP semantics', () => {
    const season = createSeason(['guest_a', 'guest_b']);
    const cpAttempt = createLoveShowPrivateSecret({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '你在观察什么？',
      guestReply: '我觉得 guest_a 和 guest_b 最配，CP 锁死。',
      createdAt: 1000,
    });
    const safeSecret = createLoveShowPrivateSecret({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '这是只告诉我的事吗？',
      guestReply: '只告诉你。我怕镜头拍到我在意你。',
      createdAt: 1000,
    });
    const publicPrompt = buildPublicSecretSubtextForScene(privateSecretsForPublicScene([safeSecret!], ['guest_a', 'guest_b']));

    expect(cpAttempt).toBeNull();
    expect(Object.keys(safeSecret || {})).not.toEqual(expect.arrayContaining([
      'otherGuestId',
      'guestPairIds',
      'cpGuestIds',
    ]));
    expect(publicPrompt).not.toMatch(/CP|互选|最配|锁死/);
  });

  it('accepts a structured sub-model secret decision even when keyword fallback would miss it', () => {
    const season = createSeason(['guest_a']);
    const plan = createLoveShowPrivateSecretFromDecision({
      season,
      guestId: 'guest_a',
      guestName: '阿序',
      userName: '小满',
      userMessage: '刚才那把伞是给我的吗？',
      guestReply: '不是给节目看的。我只是把伞留在门口，等你回头的时候能看见。',
      createdAt: 1000,
    }, {
      hasSecret: true,
      kind: 'private_signal',
      intensity: 'soft',
      summary: '他把一个不会在镜头前承认的照顾留给了小满。',
      privateLine: '我只是把伞留在门口，等你回头的时候能看见。',
      publicSubtextHint: '公开场里他会把照顾伪装成顺手，用视线确认用户有没有读懂。',
      safety: {
        guestUserOnly: true,
        hasGuestGuestSecret: false,
        hasCpSemantics: false,
        hasManipulativeHarm: false,
      },
    });

    expect(plan.source).toBe('api');
    expect(plan.secret).toMatchObject({
      guestId: 'guest_a',
      kind: 'private_signal',
      summary: '他把一个不会在镜头前承认的照顾留给了小满。',
    });
  });

  it('rejects unsafe structured secret decisions before local fallback', () => {
    const season = createSeason(['guest_a', 'guest_b']);
    const plan = createLoveShowPrivateSecretFromDecision({
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '你刚才在看谁？',
      guestReply: '我觉得 guest_a 和 guest_b 最配，CP 锁死。',
      createdAt: 1000,
    }, {
      hasSecret: true,
      kind: 'private_signal',
      intensity: 'charged',
      summary: '他透露了嘉宾之间的 CP 倾向。',
      privateLine: 'guest_a 和 guest_b 最配。',
      publicSubtextHint: '公开场继续暗示这对 CP。',
      safety: {
        guestUserOnly: false,
        hasGuestGuestSecret: true,
        hasCpSemantics: true,
        hasManipulativeHarm: false,
      },
    });

    expect(plan.secret).toBeNull();
    expect(plan.issues.join(' ')).toContain('safety');
  });

  it('falls back to local heuristic when no secondary API is configured', async () => {
    const season = createSeason(['guest_a']);
    const plan = await evaluateLoveShowPrivateSecretWithMeta(null, {
      season,
      guestId: 'guest_a',
      userName: '小满',
      userMessage: '你能说真话吗？',
      guestReply: '其实我喜欢你，但现在还不想让镜头知道。',
      createdAt: 1000,
    });

    expect(plan.source).toBe('fallback');
    expect(plan.secret?.kind).toBe('confession');
    expect(plan.issues).toContain('No secondary API configured');
  });
});
