/**
 * Tarot Data Dictionary — 78 Cards (Major + Minor Arcana)
 *
 * No images needed: each card is rendered dynamically with a border + font.
 * Border images are randomly assigned (shuffle-then-pick prevents repeats).
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ArcanaType = 'major' | 'wands' | 'cups' | 'swords' | 'pentacles';

export interface TarotCardDef {
    id: string;
    nameEn: string;
    nameZh: string;
    type: ArcanaType;
    number: number;        // 0-21 for major, 1-14 for minor
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Border Images (transparent PNG frames)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const TAROT_BORDERS: string[] = [
    'https://i.postimg.cc/Vv51V0vH/ta-luo-bian-kuang-(100).png',
    'https://i.postimg.cc/D0DFkfb7/ta-luo-bian-kuang-(103).png',
    'https://i.postimg.cc/QNnjWmYn/ta-luo-bian-kuang-(17).png',
    'https://i.postimg.cc/9XNcqbN2/ta-luo-bian-kuang-(65).png',
    'https://i.postimg.cc/vTjMF868/ta-luo-bian-kuang-(7).png',
    'https://i.postimg.cc/j29K0qJx/ta-luo-bian-kuang-(72).png',
    'https://i.postimg.cc/XNDnyL1t/ta-luo-bian-kuang-(83).png',
    'https://i.postimg.cc/Y0VkK2m0/ta-luo-bian-kuang-(86).png',
    'https://i.postimg.cc/L40mZDQw/ta-luo-bian-kuang-(88).png',
    'https://i.postimg.cc/WpfsJ8Yy/ta-luo-bian-kuang-(96).png',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Card Back Images
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CARD_BACK_USER = 'https://i.postimg.cc/59390CXZ/com-xingin-xhs-20260227004737.png';
export const CARD_BACK_CHAR = 'https://i.postimg.cc/BQnS1nDs/com-xingin-xhs-20260227004829.png';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All image URLs for preloading
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PRELOAD_IMAGES: string[] = [
    ...TAROT_BORDERS,
    CARD_BACK_USER,
    CARD_BACK_CHAR,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Spread Definitions (牌阵配置)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SpreadPosition {
    label: string;        // Chinese label shown under each card in the UI
    labelEn: string;      // English position name (e.g. "Past", "Present")
    oracle: string;       // Mystical pre-flip guidance shown in overlay panel
    x: number;            // Relative X position (0-100 range, % of container)
    y: number;            // Relative Y position (0-100 range, % of container)
}

export interface SpreadDef {
    id: string;
    name: string;         // Chinese name for display
    nameEn: string;       // English subtitle
    cardCount: number;
    positions: SpreadPosition[];
    userOnly?: boolean;   // If true, only available for User (求道者)
    charOnly?: boolean;   // If true, only available for Char (角色)
    ephemeris?: boolean;  // If true, this is a Star Calendar spread (星历牌阵)
}

export const SPREADS: SpreadDef[] = [
    // ── 单牌（仅 User 可用）──
    {
        id: 'single',
        name: '每日指引',
        nameEn: 'Daily Guidance',
        cardCount: 1,
        userOnly: true,
        positions: [
            { label: '启示', labelEn: 'Revelation', oracle: '闭上眼睛，深吸一口气。让思绪沉淀，像夜空归于寂静。不要想任何具体的问题——只是感受此刻你心底最微弱的那个声音。当内心平静下来时，翻开这张牌。', x: 50, y: 50 },
        ],
    },
    // ── 三牌阵 (Past / Present / Future) ──
    {
        id: 'three',
        name: '时光之镜',
        nameEn: 'Past · Present · Future',
        cardCount: 3,
        positions: [
            { label: '过去', labelEn: 'The Past', oracle: '闭上眼，深呼吸。在心中回溯那段已经沉淀的旧日时光——那些塑造了如今的你的经历与选择。感受它们留在你身上的重量。当你准备好面对它时——翻开这张牌。', x: 20, y: 50 },
            { label: '现在', labelEn: 'The Present', oracle: '将注意力拉回此刻。感受你当下的心跳，留意你此刻的呼吸。在心中默念：我现在真正面对的是什么？带着这个疑问，触碰面前的星光。', x: 50, y: 50 },
            { label: '未来', labelEn: 'The Future', oracle: '不要急于求答案。在心中轻轻描绘你最渴望到达的彼岸，或者最不敢面对的深渊。带着对未知的敬畏与好奇，揭开命运的一角。', x: 80, y: 50 },
        ],
    },
    // ── 二选一牌阵 (V-shape, 5 cards) ──
    {
        id: 'choice',
        name: '二选一牌阵',
        nameEn: 'Two Paths',
        cardCount: 5,
        userOnly: true,
        positions: [
            { label: '真实需求', labelEn: 'True Desire', oracle: '在思考选择之前，先聆听你的心。闭眼默念：在这个选择背后，我真正渴望的是什么？不是表面的答案——是更深处的那个需要。感受到了吗？翻开这张牌。', x: 50, y: 78 },
            { label: '选项A发展', labelEn: 'Path A Unfolds', oracle: '现在，在心中清晰地想象第一条路。走上它，感受它的风景、气味和温度。这条路会把你带向什么样的旅程？带着这份想象，翻开这张牌。', x: 28, y: 50 },
            { label: '选项B发展', labelEn: 'Path B Unfolds', oracle: '换一个方向。在心中清晰地想象第二条路。它的风景不同、节奏不同。沿着它往前走几步——你感受到了什么？带着这份感觉，翻开这张牌。', x: 72, y: 50 },
            { label: '选项A结果', labelEn: 'Path A\'s End', oracle: '回到第一条路，这次走到尽头。在心中默念：如果我选了这条路，最终会收获什么、又会失去什么？带着这个问题，翻开这张牌。', x: 15, y: 20 },
            { label: '选项B结果', labelEn: 'Path B\'s End', oracle: '再走向第二条路的尽头。在心中默念：如果我选了这条路，等待我的是什么？什么会盛放、什么会凋零？带着答案的渴望，翻开这张牌。', x: 85, y: 20 },
        ],
    },
    // ── X牌阵 (Cross, 5 cards) ──
    {
        id: 'cross',
        name: 'X牌阵',
        nameEn: 'Cross Spread',
        cardCount: 5,
        userOnly: true,
        positions: [
            { label: '当前状态', labelEn: 'Current State', oracle: '深呼吸，感受你此刻脚踩的地面。它是坚实的还是在动摇？在心中默念：我现在处于怎样的境地？带着这份觉知，翻开这张牌。', x: 50, y: 50 },
            { label: '眼前时机', labelEn: 'Timing', oracle: '感受时间的流动。现在是蓄势待发的时刻，还是应该继续等待的时刻？不要用头脑分析——用直觉去感受。然后翻开这张牌。', x: 20, y: 20 },
            { label: '成功几率', labelEn: 'Prospect', oracle: '在心中坦诚地面对你想要的结果。你觉得它会实现吗？先感受那份信心或不安，然后带着这份真实的情绪，翻开这张牌。', x: 80, y: 20 },
            { label: '影响因素', labelEn: 'Influence', oracle: '想一想，在你没有注意到的地方，有什么人、什么力量正在影响这件事的走向？闭上眼感受周围隐藏的暗流。然后翻开这张牌。', x: 20, y: 80 },
            { label: '未来趋势', labelEn: 'Trajectory', oracle: '不要试图控制结果，只是去感受水流的方向。在心中默念：事情正在往哪个方向发展？带着这份敏锐的直觉，翻开这张牌。', x: 80, y: 80 },
        ],
    },
    // ── 解梦牌阵 (Grid, 7 cards) ──
    {
        id: 'dream',
        name: '解梦牌阵',
        nameEn: 'Dream Oracle',
        cardCount: 7,
        userOnly: true,
        positions: [
            { label: '现实情况', labelEn: 'Waking Reality', oracle: '在回忆梦境之前，先回到现实。想想你最近醒着时的生活——发生了什么事？什么让你感到不安或兴奋？带着这份清醒，翻开这张牌。', x: 20, y: 25 },
            { label: '现实感受', labelEn: 'Waking Emotion', oracle: '抛开事件本身，只关注你的感受。你白天压抑了什么情绪？什么感觉一直挥之不去？在心中感受那份重量，然后翻开这张牌。', x: 50, y: 25 },
            { label: '梦的成因', labelEn: 'Dream\'s Origin', oracle: '现在，往更深处探寻。是什么记忆、恐惧或渴望催生了这个梦？不需要确切的答案，只需要感受那个模糊的源头。然后翻开这张牌。', x: 80, y: 25 },
            { label: '梦中画面', labelEn: 'Dream Image', oracle: '闭上眼睛，让梦境中最深刻的那个画面重新浮现。它的颜色、形状、光线——尽可能地看清它。当画面清晰时，翻开这张牌。', x: 15, y: 72 },
            { label: '梦中感受', labelEn: 'Dream Emotion', oracle: '不是画面本身，而是它留给你的感觉。恐惧？温暖？失落？渴望？找到那份情感的余震，握住它，然后翻开这张牌。', x: 38, y: 72 },
            { label: '行动指引', labelEn: 'Guidance', oracle: '梦境在向你传递一个信息。在心中问自己：这个梦希望我做什么？它在推动我走向何方？带着这个追问，翻开这张牌。', x: 62, y: 72 },
            { label: '行动阻碍', labelEn: 'Obstacle', oracle: '最后，想想有什么在阻止你听从梦的指引。是恐惧？习惯？还是某种外在的力量？感受那份阻力的质地，然后翻开这张牌。', x: 85, y: 72 },
        ],
    },
    // ━━━━━━━━━━ Char 专属情感牌阵 ━━━━━━━━━━
    // ── 恋人金字塔 (Pyramid, 4 cards) ──
    {
        id: 'lover-pyramid',
        name: '恋人金字塔',
        nameEn: 'Lover\'s Pyramid',
        cardCount: 4,
        charOnly: true,
        positions: [
            { label: '你们未来的发展', labelEn: 'Shared Horizon', oracle: '闭上眼，想象你和ta并肩站在一条长路的起点。前方是雾，看不清终点。在心中默念：我们将一起走向何方？带着这份期待与不安，翻开这张牌。', x: 50, y: 25 },
            { label: '代表你的恋人', labelEn: 'Your Beloved', oracle: '在心中浮现ta的面庞。不是你想象的ta，而是真实的ta——ta的笑容、ta的沉默、ta说话时的语气。感受ta的存在。当ta的形象清晰时，翻开这张牌。', x: 22, y: 72 },
            { label: '代表你自己', labelEn: 'Your Self', oracle: '现在把目光转向自己。在这段感情中，你是怎样的人？不是你希望成为的样子，而是你真实的样子。诚实地面对自己，然后翻开这张牌。', x: 50, y: 72 },
            { label: '你们彼此的关系', labelEn: 'The Bond', oracle: '想象你和ta之间有一条无形的丝线。感受它——它是温暖的还是冰冷的？紧绷的还是松弛的？带着对这条纽带的感知，翻开这张牌。', x: 78, y: 72 },
        ],
    },
    // ── 爱情八大字 (Cross, 5 cards) ──
    {
        id: 'love-cross',
        name: '爱情八大字',
        nameEn: 'Love Cross',
        cardCount: 5,
        charOnly: true,
        positions: [
            { label: '彼此现在的状况', labelEn: 'Current Bond', oracle: '深呼吸，感受你们此刻的关系状态。不要美化，也不要悲观——只是如实地感受。你们现在距离有多近？带着这份觉察，翻开这张牌。', x: 50, y: 18 },
            { label: '自己的心情想法', labelEn: 'Your Heart', oracle: '将注意力收回到自己身上。你对这段感情真正的感受是什么？是甜蜜、焦虑、还是疲倦？找到那个最真实的情绪，握住它，翻开这张牌。', x: 18, y: 50 },
            { label: '周遭环境情况', labelEn: 'Surroundings', oracle: '抬起头看看你们周围的世界。朋友怎么看？家人怎么说？有什么外在的压力在影响你们？感受那些来自外界的力量，然后翻开这张牌。', x: 50, y: 50 },
            { label: '对方心理及态度', labelEn: 'Their Heart', oracle: '现在，试着站在ta的位置。如果你是ta，你会怎么想？ta心里在担心什么？在期待什么？带着对ta内心的好奇，翻开这张牌。', x: 82, y: 50 },
            { label: '关系最后的结果', labelEn: 'Outcome', oracle: '所有的线索都将汇聚于此。在心中默念：这段感情最终会走向哪里？不要害怕答案——真相永远比迷雾更有力量。翻开这张牌。', x: 50, y: 82 },
        ],
    },
    // ── 灵感对应牌阵 (2×3 Grid, 6 cards) ──
    {
        id: 'mirror-grid',
        name: '灵感对应牌阵',
        nameEn: 'Mirror Grid',
        cardCount: 6,
        charOnly: true,
        positions: [
            { label: '你对他的看法', labelEn: 'Your View of Them', oracle: '在心中想象ta站在你面前。你看到了什么？你欣赏ta的什么？又对ta的什么感到不安？带着你对ta的印象，翻开这张牌。', x: 20, y: 30 },
            { label: '你认为的关系', labelEn: 'Your View of the Bond', oracle: '用一个画面来形容你们的关系。是平静的湖面？是摇曳的烛光？还是暴风雨中的小船？找到那个画面，然后翻开这张牌。', x: 50, y: 30 },
            { label: '你期望的发展', labelEn: 'Your Hope', oracle: '如果一切按你心中最美好的剧本发展，你和ta会变成什么样？闭上眼描绘那个画面。感受到内心的渴望了吗？翻开这张牌。', x: 80, y: 30 },
            { label: '他对你的看法', labelEn: 'Their View of You', oracle: '镜子翻转了。想象ta在看着你——ta眼中的你是什么样的？也许和你认为的自己不同。带着好奇而非恐惧，翻开这张牌。', x: 20, y: 70 },
            { label: '他认为的关系', labelEn: 'Their View of the Bond', oracle: '如果ta也用一个画面来形容你们的关系，那会是什么？试着从ta的角度感受这段联结。然后翻开这张牌。', x: 50, y: 70 },
            { label: '他期望的发展', labelEn: 'Their Hope', oracle: 'ta心里的剧本是什么样的？ta希望你们走向哪里？带着对ta内心渴望的探寻之心，翻开这张牌。', x: 80, y: 70 },
        ],
    },
    // ── 维纳斯牌阵 (Diamond, 8 cards) ──
    {
        id: 'venus',
        name: '维纳斯牌阵',
        nameEn: 'Venus Spread',
        cardCount: 8,
        charOnly: true,
        positions: [
            { label: '关系对你的影响', labelEn: 'Impact on You', oracle: '想想自从遇见ta之后，你有什么变化？你变得更好了还是更脆弱了？感受爱在你身上留下的痕迹，然后翻开这张牌。', x: 50, y: 12 },
            { label: '你的真实想法', labelEn: 'Your Truth', oracle: '放下你对ta说过的话，只听你对自己说的话。你心里对这段关系真正的想法是什么？诚实地对自己承认它，然后翻开这张牌。', x: 28, y: 32 },
            { label: '对方真实想法', labelEn: 'Their Truth', oracle: 'ta在人前说的和心里想的一样吗？试着感受ta沉默背后的真实。不需要确定，只需要直觉。然后翻开这张牌。', x: 72, y: 32 },
            { label: '关系对他的影响', labelEn: 'Impact on Them', oracle: '你的存在如何改变了ta？ta因为你变得更完整了，还是更迷茫了？在心中感受你在ta生命中留下的印记，翻开这张牌。', x: 50, y: 50 },
            { label: '将来你的心情', labelEn: 'Your Future Heart', oracle: '想象一个月后的自己。你的心情会是怎样的？是更加安定，还是依然在波动中？感受那份未来的情绪，然后翻开这张牌。', x: 28, y: 68 },
            { label: '将遇到的障碍', labelEn: 'The Obstacle', oracle: '每段感情都有它的荆棘。在心中默念：什么是我们无法回避的挑战？不要逃避那份不适感——面对它，然后翻开这张牌。', x: 50, y: 68 },
            { label: '将来他的心情', labelEn: 'Their Future Heart', oracle: '把目光投向ta的未来。当时间继续流淌，ta会怎样看待你们之间发生的一切？带着这份好奇，翻开这张牌。', x: 72, y: 68 },
            { label: '最后的结果', labelEn: 'Final Outcome', oracle: '这是最后一张牌。深深地吸一口气。在心中默念：这段感情的终章会写着什么？带着全然的接纳和勇气，翻开这张牌。', x: 50, y: 88 },
        ],
    },
    // ── x情人复合牌阵 (X-shape, 9 cards) ──
    {
        id: 'ex-reunion',
        name: 'x情人复合牌阵',
        nameEn: 'Ex Reunion',
        cardCount: 9,
        charOnly: true,
        positions: [
            { label: '你现在的状况', labelEn: 'Your State', oracle: '在想ta之前，先想想你自己。你现在过得怎样？你的生活、你的心情、你的状态——诚实地感受，然后翻开这张牌。', x: 18, y: 15 },
            { label: '阻碍你的', labelEn: 'Your Obstacle', oracle: '为什么你还没有迈出那一步？是骄傲？是恐惧？还是某种你说不清的东西？在心中触碰那个障碍，感受它的质地，然后翻开这张牌。', x: 82, y: 15 },
            { label: '你和他的过去', labelEn: 'Shared Past', oracle: '闭上眼，让你们共同的记忆浮现。不要只想快乐的部分——也让痛苦的部分出场。完整地感受那段过去，然后翻开这张牌。', x: 32, y: 33 },
            { label: '帮助你的', labelEn: 'Your Ally', oracle: '在逆流中也有顺风。想想你身边有什么力量在帮助你——一个朋友、一次巧合、或者你自己内心的某种坚韧。感受到了吗？翻开这张牌。', x: 68, y: 33 },
            { label: '他现在的状况', labelEn: 'Their State', oracle: '在沉默的另一端，ta在过着什么样的生活？ta变了吗？ta还会想起你吗？带着这些疑问——现在就只是疑问——翻开这张牌。', x: 50, y: 50 },
            { label: '不知道的重要事', labelEn: 'Hidden Truth', oracle: '有些事情你不知道，ta也不知道，但它们至关重要。在心中默念：在这段关系里，什么是我们都没看见的？带着这份谦卑，翻开这张牌。', x: 32, y: 67 },
            { label: '你对复合的感受', labelEn: 'Your Feelings', oracle: '诚实到底。你真的想复合吗？是爱，还是不甘心？是想念ta，还是想念被爱的感觉？找到那个真实的答案，然后翻开这张牌。', x: 68, y: 67 },
            { label: '整体结果', labelEn: 'Overall Outcome', oracle: '所有的线索即将汇聚。深吸一口气，在心中默念：这个故事最可能的结局是什么？不要害怕——无论答案是什么，它都是你需要知道的。翻开这张牌。', x: 18, y: 85 },
            { label: '他对复合的感受', labelEn: 'Their Feelings', oracle: '最后一个问题——ta的心里在想什么？ta对重新开始持什么态度？带着对答案的尊重，无论它是希望还是放手——翻开这最后一张牌。', x: 82, y: 85 },
        ],
    },
    // ━━━━━━━━━━ 星历 · 天象牌阵 ━━━━━━━━━━

    // ── 常驻：今日星辰护符（1牌）──
    {
        id: 'ephemeris-single',
        name: '星辰护符',
        nameEn: 'Transit Talisman',
        cardCount: 1,
        ephemeris: true,
        positions: [
            { label: '今日护符', labelEn: 'Today\'s Talisman', oracle: '闭上眼，感受今天从你踏出家门起就笼罩着你的那股无形之力。它是推力还是阻力？是灼热还是清凉？当你触碰到那股能量的质地时——翻开这张牌。', x: 50, y: 50 },
        ],
    },
    // ── 常驻：七曜指引（7牌）──
    {
        id: 'seven-stars',
        name: '七曜指引',
        nameEn: 'Seven Stars Guidance',
        cardCount: 7,
        ephemeris: true,
        positions: [
            { label: '情绪·直觉', labelEn: 'Moon · Emotion', oracle: '月亮主宰你的潜意识与直觉之海。闭上眼，感受此刻你内心最深处那股潮汐般的涌动——它是平静的还是翻涌的？带着这份觉察，翻开月亮之牌。', x: 15, y: 82 },
            { label: '思维·沟通', labelEn: 'Mercury · Mind', oracle: '水星掌管你的言语、思考和学习。想想最近你的头脑是清晰如镜还是杂乱如风？你的话语是否被正确地接收了？翻开水星之牌。', x: 27, y: 55 },
            { label: '爱情·审美', labelEn: 'Venus · Love', oracle: '金星编织着美与爱的丝线。你最近是否感到被爱包围，还是渴望着某种温柔？你的审美和价值观在向你诉说什么？翻开金星之牌。', x: 38, y: 34 },
            { label: '核心·意志', labelEn: 'Sun · Self', oracle: '太阳是你灵魂的火焰，是你存在的核心。在心中默念：我是谁？我此刻最想成为什么？感受那团火焰的温度和明暗——翻开太阳之牌。', x: 50, y: 22 },
            { label: '行动·勇气', labelEn: 'Mars · Action', oracle: '火星是战士的星，它掌管你的行动力和勇气。你最近在为什么而战？还是你正在回避某场必须面对的冲突？感受那股炽热——翻开火星之牌。', x: 62, y: 34 },
            { label: '成长·机遇', labelEn: 'Jupiter · Growth', oracle: '木星是慷慨的巨人，带来扩张与幸运。在心中感受你的生命中哪个领域正在向你敞开一扇更大的门——翻开木星之牌。', x: 73, y: 55 },
            { label: '考验·纪律', labelEn: 'Saturn · Trial', oracle: '土星是严厉的导师，它的考验即是馈赠。在心中诚实地面对你一直在拖延的责任、一直在逃避的功课——翻开土星之牌。', x: 85, y: 82 },
        ],
    },
    // ── 新月触发：朔月播种许愿阵（3牌）──
    {
        id: 'new-moon',
        name: '朔月·播种许愿',
        nameEn: 'New Moon Seeding',
        cardCount: 3,
        ephemeris: true,
        positions: [
            { label: '此刻的种子', labelEn: 'The Seed', oracle: '新月是黑暗中酝酿的力量。闭上眼，想象你手中握着一颗尚未发芽的种子。它代表什么？你最渴望在接下来的时间里播种什么？感受到它的重量了吗——翻开这张牌。', x: 20, y: 50 },
            { label: '需要放下的', labelEn: 'What to Release', oracle: '每一次播种之前，土壤需要被清理。什么旧的模式、信念或执念在占据你内心的空间，让新种子无处扎根？感受那份需要被放手的重量——翻开这张牌。', x: 50, y: 50 },
            { label: '即将发芽的', labelEn: 'What Sprouts', oracle: '如果你勇敢地播种并放手，什么将在这个月亮周期中萌芽？不要试图控制它的形状，只是去信任。带着这份信任——翻开这张牌。', x: 80, y: 50 },
        ],
    },
    // ── 满月触发：望月断舍离释怀阵（4牌）──
    {
        id: 'full-moon',
        name: '望月·断舍离',
        nameEn: 'Full Moon Release',
        cardCount: 4,
        ephemeris: true,
        positions: [
            { label: '月光照见的真相', labelEn: 'Truth Revealed', oracle: '满月的光芒不留死角。在心中默念：我的生活中，有什么一直被我回避、却在今夜的月光下无处藏匿？面对那道光——翻开这张牌。', x: 50, y: 15 },
            { label: '已经丰收的', labelEn: 'The Harvest', oracle: '从上一个新月到现在，你已经走了多远？回望这段旅程，什么成果已经在你手中——即使你尚未意识到？带着感恩——翻开这张牌。', x: 22, y: 50 },
            { label: '需要释放的', labelEn: 'Let Go', oracle: '满月是释放的时刻。什么情绪、关系、习惯或恐惧已经完成了它的使命，不再需要你背负？在月光下诚实地面对它——翻开这张牌。', x: 78, y: 50 },
            { label: '释放后的礼物', labelEn: 'The Gift', oracle: '当你真正放手之后，宇宙会在腾出的空间里放入什么？想象你的双手终于松开了，它们空了——但空不是虚无，是容器。翻开这张牌。', x: 50, y: 85 },
        ],
    },
    // ── 水逆触发：水逆急救阵（4牌）──
    {
        id: 'mercury-retrograde',
        name: '水逆急救',
        nameEn: 'Mercury Rx Rescue',
        cardCount: 4,
        ephemeris: true,
        positions: [
            { label: '沟通盲区', labelEn: 'Blind Spot', oracle: '水星正在倒流，语言的河道变得浑浊。在心中想想最近你说出口的话、发出的消息——有什么被误解了、或者你误解了别人？在沉默中感受——翻开这张牌。', x: 15, y: 50 },
            { label: '回溯的旧事', labelEn: 'Resurfacing Past', oracle: '水逆总是会把过去拉回水面。什么旧人、旧事、旧的未完成之事正在敲你的门？不要急着关门——先看看它带来了什么。翻开这张牌。', x: 38, y: 50 },
            { label: '需要修正的', labelEn: 'Revise', oracle: '水逆不是灾难，是宇宙按下的暂停键。它在邀请你重新审视什么？一个计划？一段关系？一个你以为已经做完的决定？翻开这张牌。', x: 62, y: 50 },
            { label: '破局关键', labelEn: 'The Key', oracle: '在混乱中总有一把钥匙。它可能是耐心，可能是一个被忽略的细节，也可能是一次推迟到水逆结束后再行动的智慧。翻开这最后一张牌。', x: 85, y: 50 },
        ],
    },
    // ── 金星换座触发：情感潮汐阵（3牌）──
    {
        id: 'venus-ingress',
        name: '金星·情感潮汐',
        nameEn: 'Venus Ingress',
        cardCount: 3,
        ephemeris: true,
        positions: [
            { label: '旧潮退去', labelEn: 'Fading Tide', oracle: '金星刚刚离开了一片海域。回想最近你在爱情和美感上的感受——那种已经开始褪色的氛围是什么？带着告别的温柔——翻开这张牌。', x: 20, y: 50 },
            { label: '新潮涌来', labelEn: 'Rising Tide', oracle: '新的金星能量正在涌入。你能感受到它吗？一种不同的温度、不同的渴望、不同的吸引力。别分析，只是去感受那股新浪——翻开这张牌。', x: 50, y: 50 },
            { label: '顺流之匙', labelEn: 'How to Flow', oracle: '每股潮汐都有它的节奏。在心中默念：我该如何顺应这股新的金星能量，让爱与美在我的生活中自然流动？翻开这张牌。', x: 80, y: 50 },
        ],
    },
    // ── 火星换座触发：行动力转型阵（3牌）──
    {
        id: 'mars-ingress',
        name: '火星·行动力转型',
        nameEn: 'Mars Ingress',
        cardCount: 3,
        ephemeris: true,
        positions: [
            { label: '旧战场', labelEn: 'Old Battlefield', oracle: '火星刚从一片战场撤离。最近你为什么事情耗费了大量的精力和斗志？那场战役可以收兵了吗？感受那份疲劳和释然——翻开这张牌。', x: 20, y: 50 },
            { label: '新战鼓', labelEn: 'New Rally', oracle: '火星进入了新的领地，新的战鼓正在擂响。你能感受到一股不同方向的冲动吗？你的拳头想要挥向哪里？翻开这张牌。', x: 50, y: 50 },
            { label: '制胜策略', labelEn: 'Winning Strategy', oracle: '蛮力不是唯一的武器。在心中默念：如何用最聪明的方式运用这股新的火星能量？什么策略能让你事半功倍？翻开这张牌。', x: 80, y: 50 },
        ],
    },
    // ── 星体对冲触发：内在张力阵（4牌）──
    {
        id: 'planet-opposition',
        name: '星体对冲·张力',
        nameEn: 'Opposition Tension',
        cardCount: 4,
        ephemeris: true,
        positions: [
            { label: '拉扯的A面', labelEn: 'Force A', oracle: '两颗星正在天穹的两端对望，它们的拉扯穿过你的身体。先感受第一股力量——它想把你拉向什么方向？是什么样的渴望或信念？翻开这张牌。', x: 15, y: 50 },
            { label: '拉扯的B面', labelEn: 'Force B', oracle: '现在转身，面对相反的方向。第二股力量同样强烈，但指向完全不同的彼岸。它在召唤你什么？翻开这张牌。', x: 85, y: 50 },
            { label: '撕裂点', labelEn: 'Tension Point', oracle: '当两股力量同时拉扯一个人，最脆弱的地方会首先裂开。在你的生活中，哪个领域正在承受这种撕裂？翻开这张牌。', x: 50, y: 25 },
            { label: '整合之路', labelEn: 'Integration', oracle: '对立不是终局，整合才是。在心中默念：我如何同时拥抱这两股看似矛盾的力量？答案不是选择其一，而是找到它们共舞的节奏。翻开这张牌。', x: 50, y: 75 },
        ],
    },
];

// 星历牌阵 ID 列表（供 StarCalendar 筛选使用）
export const EPHEMERIS_SPREAD_IDS = [
    'ephemeris-single', 'seven-stars',
    'new-moon', 'full-moon',
    'mercury-retrograde',
    'venus-ingress', 'mars-ingress',
    'planet-opposition',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 22 Major Arcana
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAJOR_ARCANA: TarotCardDef[] = [
    { id: 'maj-00', number: 0, type: 'major', nameEn: 'The Fool', nameZh: '愚者' },
    { id: 'maj-01', number: 1, type: 'major', nameEn: 'The Magician', nameZh: '魔术师' },
    { id: 'maj-02', number: 2, type: 'major', nameEn: 'The High Priestess', nameZh: '女祭司' },
    { id: 'maj-03', number: 3, type: 'major', nameEn: 'The Empress', nameZh: '女皇' },
    { id: 'maj-04', number: 4, type: 'major', nameEn: 'The Emperor', nameZh: '皇帝' },
    { id: 'maj-05', number: 5, type: 'major', nameEn: 'The Hierophant', nameZh: '教皇' },
    { id: 'maj-06', number: 6, type: 'major', nameEn: 'The Lovers', nameZh: '恋人' },
    { id: 'maj-07', number: 7, type: 'major', nameEn: 'The Chariot', nameZh: '战车' },
    { id: 'maj-08', number: 8, type: 'major', nameEn: 'Strength', nameZh: '力量' },
    { id: 'maj-09', number: 9, type: 'major', nameEn: 'The Hermit', nameZh: '隐者' },
    { id: 'maj-10', number: 10, type: 'major', nameEn: 'Wheel of Fortune', nameZh: '命运之轮' },
    { id: 'maj-11', number: 11, type: 'major', nameEn: 'Justice', nameZh: '正义' },
    { id: 'maj-12', number: 12, type: 'major', nameEn: 'The Hanged Man', nameZh: '倒吊人' },
    { id: 'maj-13', number: 13, type: 'major', nameEn: 'Death', nameZh: '死神' },
    { id: 'maj-14', number: 14, type: 'major', nameEn: 'Temperance', nameZh: '节制' },
    { id: 'maj-15', number: 15, type: 'major', nameEn: 'The Devil', nameZh: '恶魔' },
    { id: 'maj-16', number: 16, type: 'major', nameEn: 'The Tower', nameZh: '塔' },
    { id: 'maj-17', number: 17, type: 'major', nameEn: 'The Star', nameZh: '星星' },
    { id: 'maj-18', number: 18, type: 'major', nameEn: 'The Moon', nameZh: '月亮' },
    { id: 'maj-19', number: 19, type: 'major', nameEn: 'The Sun', nameZh: '太阳' },
    { id: 'maj-20', number: 20, type: 'major', nameEn: 'Judgement', nameZh: '审判' },
    { id: 'maj-21', number: 21, type: 'major', nameEn: 'The World', nameZh: '世界' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Minor Arcana helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MINOR_NAMES: { num: number; en: string; zh: string }[] = [
    { num: 1, en: 'Ace', zh: '王牌' },
    { num: 2, en: 'Two', zh: '二' },
    { num: 3, en: 'Three', zh: '三' },
    { num: 4, en: 'Four', zh: '四' },
    { num: 5, en: 'Five', zh: '五' },
    { num: 6, en: 'Six', zh: '六' },
    { num: 7, en: 'Seven', zh: '七' },
    { num: 8, en: 'Eight', zh: '八' },
    { num: 9, en: 'Nine', zh: '九' },
    { num: 10, en: 'Ten', zh: '十' },
    { num: 11, en: 'Page', zh: '侍从' },
    { num: 12, en: 'Knight', zh: '骑士' },
    { num: 13, en: 'Queen', zh: '王后' },
    { num: 14, en: 'King', zh: '国王' },
];

const SUITS: { key: ArcanaType; en: string; zh: string }[] = [
    { key: 'wands', en: 'Wands', zh: '权杖' },
    { key: 'cups', en: 'Cups', zh: '圣杯' },
    { key: 'swords', en: 'Swords', zh: '宝剑' },
    { key: 'pentacles', en: 'Pentacles', zh: '星币' },
];

const MINOR_ARCANA: TarotCardDef[] = SUITS.flatMap(suit =>
    MINOR_NAMES.map(rank => ({
        id: `${suit.key}-${String(rank.num).padStart(2, '0')}`,
        number: rank.num,
        type: suit.key,
        nameEn: `${rank.en} of ${suit.en}`,
        nameZh: `${suit.zh}${rank.zh}`,
    }))
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Full 78-card deck
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const TAROT_DECK: TarotCardDef[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shuffle utility (Fisher-Yates)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Draw N unique cards from the deck, each with a unique border.
 * Returns an array of { card, borderUrl, isReversed }.
 */
export function drawCards(count: number): { card: TarotCardDef; borderUrl: string; isReversed: boolean }[] {
    const shuffledDeck = shuffle(TAROT_DECK);
    const shuffledBorders = shuffle(TAROT_BORDERS);
    return shuffledDeck.slice(0, count).map((card, i) => ({
        card,
        borderUrl: shuffledBorders[i % shuffledBorders.length],
        isReversed: Math.random() < 0.35, // ~35% chance of reversal
    }));
}
