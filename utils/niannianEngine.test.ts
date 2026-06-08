import { describe, expect, it } from 'vitest';
import {
    NIANNIAN_MAX_COMPLETION_TOKENS,
    appendNianNianFrozenSegment,
    applyNianNianAssistantOutput,
    applyNianNianCompressionOutput,
    applyNianNianDirectorOutput,
    applyNianNianSettlementOutput,
    applyNianNianStatusPatch,
    buildNianNianTurnPlan,
    createNianNianSession,
    createInitialNianNianStatus,
    createEmptyWorldBible,
    formatNianNianUserInput,
    parseBeats,
    parseNianNianDirectorOutput,
    parseNianNianStatusBlock,
    weave,
} from './niannianEngine';
import { NIANNIAN_EVENT_PROTOTYPES, buildNianNianEventDeck } from './niannianEvents';

describe('niannianEngine', () => {
    it('formats option plus separated action and speech beats', () => {
        const formatted = formatNianNianUserInput({
            selectedOption: { id: 'choice-1', label: '靠近一步' },
            beats: [
                { kind: 'action', text: '把伞往他那边偏了偏' },
                { kind: 'speech', text: '你淋湿了。' },
            ],
        });

        expect(formatted).toBe('【选项】靠近一步\n【动作】把伞往他那边偏了偏\n【台词】你淋湿了。');
    });

    it('parses camera beat markers while keeping status blocks out of the beat text', () => {
        const beats = parseBeats(`未打标的开场行。
‹白|动作›旁白:他的目光顺着那双奉还的手缓缓抬起。
袖口的暗纹在灯下轻轻一闪。
‹话|台词›"物归原主?"他低低重复了一遍。
‹白›漏了锚点的神情仍要留下。
‹话|眼神›未知锚点归到 loose。
<<<STATUS>>>
ta.好感_delta: +2
<<<END>>>`);

        expect(beats).toEqual([
            { type: '白', anchor: '开', text: '未打标的开场行。' },
            { type: '白', anchor: '动作', text: '他的目光顺着那双奉还的手缓缓抬起。\n袖口的暗纹在灯下轻轻一闪。' },
            { type: '话', anchor: '台词', text: '"物归原主?"他低低重复了一遍。' },
            { type: '白', anchor: null, text: '漏了锚点的神情仍要留下。' },
            { type: '话', anchor: null, text: '未知锚点归到 loose。' },
        ]);
    });

    it('weaves player segments with matching response beats and appends loose beats', () => {
        const items = weave([
            { kind: 'player', anchor: '动作', text: '把玉佩递回去' },
            { kind: 'player', anchor: '台词', text: '物归原主。' },
        ], [
            { type: '白', anchor: '开', text: '喧嚣自身后沉落。' },
            { type: '白', anchor: '动作', text: '他垂眼看向那枚玉佩。' },
            { type: '话', anchor: '台词', text: '"物归原主?"' },
            { type: '白', anchor: '收', text: '灯火明灭。' },
            { type: '白', anchor: '选项', text: '没有对应玩家选项的拍接到末尾。' },
            { type: '话', anchor: null, text: '未知锚点也不丢。' },
        ]);

        expect(items.map(item => item.text)).toEqual([
            '喧嚣自身后沉落。',
            '把玉佩递回去',
            '他垂眼看向那枚玉佩。',
            '物归原主。',
            '"物归原主?"',
            '灯火明灭。',
            '没有对应玩家选项的拍接到末尾。',
            '未知锚点也不丢。',
        ]);
    });

    it('falls back to linear beats with player input first when no response anchors exist', () => {
        const items = weave([
            { kind: 'player', anchor: '动作', text: '抬手拂开帘子' },
            { kind: 'player', anchor: '台词', text: '你在想什么？' },
        ], [
            { type: '白', anchor: '开', text: '风声贴着窗纸。' },
            { type: '话', anchor: '收', text: '"没什么。"' },
        ]);

        expect(items.map(item => item.text)).toEqual([
            '抬手拂开帘子',
            '你在想什么？',
            '风声贴着窗纸。',
            '"没什么。"',
        ]);
    });

    it('parses the fixed status block contract', () => {
        const parsed = parseNianNianStatusBlock(`剧情正文
<<<STATUS>>>
ta.好感_delta: +5
ta.心情: 动摇
bad line that should be ignored
scene.地点: 廊下
world.拘束_delta: -1
npc.林公子: 不悦
<<<END>>>`);

        expect(parsed?.statusPatch.ta.好感_delta).toBe(5);
        expect(parsed?.statusPatch.ta.心情).toBe('动摇');
        expect(parsed?.statusPatch.scene.地点).toBe('廊下');
        expect(parsed?.statusPatch.worldExtra.拘束_delta).toBe(-1);
        expect(parsed?.statusPatch.npcs).toEqual([{ name: '林公子', mood: '不悦' }]);
    });

    it('parses status lines with full-width colons and keeps usable truncated tails', () => {
        const parsed = parseNianNianStatusBlock(`正文尚未完全结束
<<<STATUS>>>
ta.好感_delta： +2
ta.心情： 微窘
scene.地点： 长街灯市
bad line`);

        expect(parsed?.statusPatch.ta.好感_delta).toBe(2);
        expect(parsed?.statusPatch.ta.心情).toBe('微窘');
        expect(parsed?.statusPatch.scene.地点).toBe('长街灯市');
    });

    it('applies numeric deltas with clamps and qualitative overwrites', () => {
        const world = createEmptyWorldBible();
        const previous = createInitialNianNianStatus(world);
        const next = applyNianNianStatusPatch(previous, {
            ta: { 好感_delta: 150, 心情: '雀跃', 暧昧度_delta: 8 },
            me: { 体力_delta: -130, 名声: 999 },
            scene: { 地点: '灯会' },
            worldExtra: { 拘束: -20 },
            npcs: [{ name: '林公子', mood: '不悦' }],
        }, [{ key: '拘束', label: '拘束', type: 'number', min: 0, max: 100 }]);

        expect(next.ta.好感).toBe(100);
        expect(next.ta.心情).toBe('雀跃');
        expect(next.ta.暧昧度).toBe(8);
        expect(next.me.体力).toBe(0);
        expect(next.me.名声).toBe(100);
        expect(next.worldExtra.拘束).toBe(0);
        expect(next.scene.地点).toBe('灯会');
        expect(next.npcsOnScene).toEqual([{ name: '林公子', mood: '不悦' }]);
    });

    it('initializes status, hidden vars and opening step from world package fields', () => {
        const world = {
            ...createEmptyWorldBible(),
            protagonistIdentity: '入京暂居的官宦/商贾之女',
            statusSchema: [{ key: '拘束', label: '拘束', type: 'number' as const, min: 0, max: 100 }],
            seedStatus: {
                ta: { 好感: 8, 暧昧度: 5, 心情: '怔忡' },
                me: { 银两: 30, 体力: 90, 名声: 60 },
                scene: { 地点: '长街灯市' },
                worldExtra: { 拘束: 75 },
                npcs: [],
            },
            hiddenVarsSeed: { 缘分: 5 },
            openingStep: {
                sceneText: '上元灯节,人海重逢。',
                options: [{ id: 'a', label: '拾起失物' }],
                allowFreeInput: true,
            },
        };
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world,
            now: 1700000000000,
        });

        expect(session.status.ta.好感).toBe(8);
        expect(session.status.me.银两).toBe(30);
        expect(session.status.worldExtra.拘束).toBe(75);
        expect(session.director.hiddenVars.缘分).toBe(5);
        expect(session.currentStep.sceneText).toBe('上元灯节,人海重逢。');
        expect(session.currentStep.options[0].label).toBe('拾起失物');
    });

    it('builds dual-model turn requests with the maximum token budget', () => {
        const world = createEmptyWorldBible();
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world,
            now: 1700000000000,
        });
        const plan = buildNianNianTurnPlan(session, '【台词】你在想什么？', null, {
            systemPrompt: '温和克制,礼数周全。',
        });

        expect(plan.mainRequest.lane).toBe('main');
        expect(plan.directorRequest.lane).toBe('director');
        expect(plan.mainRequest.max_tokens).toBe(NIANNIAN_MAX_COMPLETION_TOKENS);
        expect(plan.directorRequest.max_tokens).toBe(NIANNIAN_MAX_COMPLETION_TOKENS);
        expect(plan.mainRequest.metadata.statusDelimiter).toEqual(['<<<STATUS>>>', '<<<END>>>']);
        expect(plan.mainRequest.messages[0].content).toContain('你不是在"扮演"谁');
        expect(plan.mainRequest.messages[0].content).toContain('温和克制,礼数周全。');
        expect(plan.mainRequest.messages[0].content).toContain('〔镜头分拍〕');
        expect(plan.mainRequest.messages[0].content).toContain('‹类型|锚点›');
        expect(plan.mainRequest.messages[0].content).toContain('状态块铁律');
        expect(plan.mainRequest.messages[0].content).toContain('<<<STATUS>>>');
        expect(plan.directorRequest.messages[0].content).toContain('你是「天意」');
        expect(plan.directorRequest.messages[0].content).toContain('<<<SCENE>>>');
        expect(plan.directorRequest.messages[1].content).toContain('【事件库候选】');
    });

    it('keeps a complete pending compression buffer beyond the recent raw window', () => {
        let session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world: createEmptyWorldBible(),
            now: 1700000000000,
        });

        for (let index = 0; index < 8; index += 1) {
            session = applyNianNianAssistantOutput(session, `第 ${index + 1} 条回应`, 1700000000000 + index).session;
        }

        expect(session.rawBuffer).toHaveLength(5);
        expect(session.pendingCompressionBuffer).toHaveLength(8);
        expect(session.historyBuffer).toHaveLength(8);

        const compressed = applyNianNianCompressionOutput(session, `<<<SEGMENT>>>
八条回应已被压缩。
<<<END>>>`);

        expect(compressed.session.pendingCompressionBuffer).toHaveLength(0);
        expect(compressed.session.pendingCompressionTurnStart).toBe(session.director.turn + 1);
        expect(compressed.session.historyBuffer).toHaveLength(8);
        expect(compressed.session.historyBuffer?.[0].content).toBe('第 1 条回应');
    });

    it('stores assistant camera markers as beats while raw content remains clean', () => {
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world: createEmptyWorldBible(),
            now: 1700000000000,
        });
        const applied = applyNianNianAssistantOutput(session, `‹白|动作›旁白:他垂眸看向那枚旧玉扣。
‹话|台词›"多谢姑娘。"
<<<STATUS>>>
ta.好感_delta: +2
ta.心情: 微窘
<<<END>>>`, 1700000001000);

        const message = applied.session.rawBuffer[0];
        expect(message.content).toBe('他垂眸看向那枚旧玉扣。\n"多谢姑娘。"');
        expect(message.content).not.toContain('‹');
        expect(message.content).not.toContain('旁白:');
        expect(message.assistantBeats).toEqual([
            { type: '白', anchor: '动作', text: '他垂眸看向那枚旧玉扣。' },
            { type: '话', anchor: '台词', text: '"多谢姑娘。"' },
        ]);
    });

    it('loads the common event deck and avoids recently used prototypes', () => {
        const world = createEmptyWorldBible();
        const deck = buildNianNianEventDeck({
            world,
            stage: '拉扯',
            recentEventIds: ['forced_privacy'],
        });

        expect(NIANNIAN_EVENT_PROTOTYPES).toHaveLength(20);
        expect(deck.candidates.some(event => event.id === 'forced_privacy')).toBe(false);
        expect(deck.recommendedEvent?.适配stage).toContain('拉扯');
    });

    it('parses and applies Tianyi director output into the next interaction step', () => {
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world: {
                ...createEmptyWorldBible(),
                hiddenVarsSeed: { 缘分: 5 },
            },
            now: 1700000000000,
        });
        const raw = `<<<SCENE>>>
（旁白：今日天阴,你才从书肆出来,豆大的雨点便砸了下来。）
<<<OPTIONS>>>
A | 先开口打破这局促 | 玩家主动,TA 可顺势多说两句
B | 不说话,只借雨声悄悄打量他 |
<<<DIRECTOR>>>
stage: 拉扯
hidden.缘分_delta: +2
event_used: 檐下避雨
milestone: 无
ending_ready: false
<<<END>>>`;

        const parsed = parseNianNianDirectorOutput(raw);
        const applied = applyNianNianDirectorOutput(session, raw, {
            fallbackStep: session.currentStep,
            now: 1700000001000,
        });

        expect(parsed?.options[0].directorHint).toContain('玩家主动');
        expect(parsed?.sceneText).toBe('今日天阴,你才从书肆出来,豆大的雨点便砸了下来。');
        expect(applied.parsed?.eventUsed).toBe('檐下避雨');
        expect(applied.session.currentStep.sceneText).toContain('豆大的雨点');
        expect(applied.session.currentStep.sceneText).not.toContain('旁白');
        expect(applied.session.currentStep.options[0].label).toBe('先开口打破这局促');
        expect(applied.session.currentStep.options[0].directorHint).toContain('顺势');
        expect(applied.session.director.stage).toBe('拉扯');
        expect(applied.session.director.hiddenVars.缘分).toBe(7);
        expect(applied.session.director.recentEventIds).toContain('forced_privacy');
        expect(applied.session.rawBuffer[applied.session.rawBuffer.length - 1]?.role).toBe('director');
    });

    it('applies compression and settlement outputs by delimiter', () => {
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world: createEmptyWorldBible(),
            now: 1700000000000,
        });
        const compressed = applyNianNianCompressionOutput(session, `<<<SEGMENT>>>
两人在灯市重逢,因一件失物生出微妙牵连。
<<<END>>>`, {
            turnRange: [1, 20],
            now: 1700000001000,
        });
        const settled = applyNianNianSettlementOutput(compressed.session, `<<<RETROSPECT>>>
这一世自灯市始。
<<<ENDING>>>
灯火尽处,二人终得并肩。
<<<END>>>`, 1700000002000);

        expect(compressed.session.segments[0].summary).toContain('灯市重逢');
        expect(settled.session.ended).toBe(true);
        expect(settled.session.retrospect).toContain('灯市');
        expect(settled.session.ending).toContain('并肩');
    });

    it('keeps frozen segments append-only and applies assistant status output', () => {
        const session = createNianNianSession({
            charId: 'char-1',
            charName: '念念',
            userName: '测试用户',
            world: createEmptyWorldBible(),
            now: 1700000000000,
        });
        const withSegment = appendNianNianFrozenSegment(session, {
            summary: 'TODO(人工)：压缩摘要',
            turnRange: [0, 20],
            now: 1700000001000,
        });
        const applied = applyNianNianAssistantOutput(withSegment, `他垂眸看了你一眼。
<<<STATUS>>>
ta.好感_delta: +7
ta.心情: 动摇
<<<END>>>`, 1700000002000);

        expect(session.segments).toHaveLength(0);
        expect(withSegment.segments).toEqual([{
            idx: 0,
            turnRange: [0, 20],
            summary: 'TODO(人工)：压缩摘要',
        }]);
        expect(applied.parsedStatus?.statusPatch.ta.好感_delta).toBe(7);
        expect(applied.session.status.ta.好感).toBe(7);
        expect(applied.session.rawBuffer[0].content).toBe('他垂眸看了你一眼。');
    });
});
