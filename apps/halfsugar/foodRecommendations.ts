import { type MealType, type NutrientGap, type NutrientKey } from './types';

// ── Food Tag & Style System ──

type FoodTag = 'high_protein' | 'high_carbs' | 'high_fat' | 'high_fiber';
type FoodStyle = 'daily' | 'fitness' | 'snack' | 'soup' | 'dessert' | 'fast_food' | 'street_food';

interface FoodEntry {
    name: string;
    tags: FoodTag[];
    styles: FoodStyle[];
}

/** Public-facing food type returned to UI components */
export interface RecommendedFood {
    name: string;
}

// ── Food Database (~95 items, tagged by dominant nutrient & style) ──

const FOOD_DATABASE: FoodEntry[] = [
    // ── 蛋白质重点 ──
    // 日常家常
    { name: '鸡蛋', tags: ['high_protein'], styles: ['daily'] },
    { name: '牛奶', tags: ['high_protein'], styles: ['daily'] },
    { name: '酸奶', tags: ['high_protein'], styles: ['daily', 'snack'] },
    { name: '豆腐', tags: ['high_protein'], styles: ['daily'] },
    { name: '红烧肉', tags: ['high_protein', 'high_fat'], styles: ['daily'] },
    { name: '卤牛肉', tags: ['high_protein'], styles: ['daily'] },
    { name: '清蒸鱼', tags: ['high_protein'], styles: ['daily'] },
    { name: '红烧鱼', tags: ['high_protein'], styles: ['daily'] },
    { name: '鸡腿', tags: ['high_protein'], styles: ['daily'] },
    { name: '虾', tags: ['high_protein'], styles: ['daily'] },
    { name: '排骨', tags: ['high_protein', 'high_fat'], styles: ['daily'] },
    { name: '猪排', tags: ['high_protein'], styles: ['daily'] },
    { name: '鸭肉', tags: ['high_protein'], styles: ['daily'] },
    { name: '番茄炒蛋', tags: ['high_protein'], styles: ['daily'] },
    { name: '蒸蛋', tags: ['high_protein'], styles: ['daily'] },
    { name: '宫保鸡丁', tags: ['high_protein'], styles: ['daily'] },
    { name: '鱼香肉丝', tags: ['high_protein'], styles: ['daily'] },
    { name: '青椒肉丝', tags: ['high_protein'], styles: ['daily'] },
    // 减脂健身
    { name: '鸡胸肉', tags: ['high_protein'], styles: ['fitness'] },
    { name: '虾仁', tags: ['high_protein'], styles: ['fitness'] },
    { name: '牛肉干', tags: ['high_protein'], styles: ['fitness', 'snack'] },
    // 零食
    { name: '毛豆', tags: ['high_protein', 'high_fiber'], styles: ['snack'] },
    { name: '茶叶蛋', tags: ['high_protein'], styles: ['snack'] },
    { name: '豆干', tags: ['high_protein'], styles: ['snack'] },
    { name: '鱼丸', tags: ['high_protein'], styles: ['snack', 'street_food'] },
    // 快餐
    { name: '炸鸡腿', tags: ['high_protein', 'high_fat'], styles: ['fast_food'] },
    { name: '鸡块', tags: ['high_protein'], styles: ['fast_food'] },
    { name: '炸鸡翅', tags: ['high_protein', 'high_fat'], styles: ['fast_food'] },
    { name: '鸡肉卷', tags: ['high_protein'], styles: ['fast_food'] },
    // 汤
    { name: '排骨汤', tags: ['high_protein'], styles: ['soup'] },
    { name: '鸡汤', tags: ['high_protein'], styles: ['soup'] },

    // ── 碳水重点 ──
    // 日常家常
    { name: '白米饭', tags: ['high_carbs'], styles: ['daily'] },
    { name: '面条', tags: ['high_carbs'], styles: ['daily'] },
    { name: '馒头', tags: ['high_carbs'], styles: ['daily'] },
    { name: '包子', tags: ['high_carbs', 'high_protein'], styles: ['daily'] },
    { name: '饺子', tags: ['high_carbs', 'high_protein'], styles: ['daily'] },
    { name: '白粥', tags: ['high_carbs'], styles: ['daily'] },
    { name: '米粉', tags: ['high_carbs'], styles: ['daily'] },
    { name: '蛋炒饭', tags: ['high_carbs'], styles: ['daily'] },
    { name: '炒河粉', tags: ['high_carbs'], styles: ['daily'] },
    { name: '担担面', tags: ['high_carbs'], styles: ['daily'] },
    { name: '馄饨', tags: ['high_carbs'], styles: ['daily'] },
    { name: '土豆', tags: ['high_carbs', 'high_fiber'], styles: ['daily'] },
    { name: '红薯', tags: ['high_carbs', 'high_fiber'], styles: ['daily', 'snack'] },
    { name: '玉米', tags: ['high_carbs', 'high_fiber'], styles: ['daily', 'snack'] },
    { name: '南瓜', tags: ['high_carbs'], styles: ['daily'] },
    { name: '土豆丝', tags: ['high_carbs'], styles: ['daily'] },
    // 减脂健身
    { name: '糙米饭', tags: ['high_carbs', 'high_fiber'], styles: ['fitness'] },
    { name: '全麦面包', tags: ['high_carbs', 'high_fiber'], styles: ['fitness'] },
    { name: '燕麦', tags: ['high_carbs', 'high_fiber'], styles: ['fitness'] },
    // 零食
    { name: '烤红薯', tags: ['high_carbs', 'high_fiber'], styles: ['snack', 'street_food'] },
    { name: '年糕', tags: ['high_carbs'], styles: ['snack'] },
    { name: '面包', tags: ['high_carbs'], styles: ['snack'] },
    { name: '蛋糕', tags: ['high_carbs', 'high_fat'], styles: ['snack', 'dessert'] },
    // 快餐
    { name: '薯条', tags: ['high_carbs', 'high_fat'], styles: ['fast_food'] },
    { name: '汉堡', tags: ['high_carbs', 'high_protein'], styles: ['fast_food'] },
    // 汤粥
    { name: '小米粥', tags: ['high_carbs'], styles: ['soup'] },
    { name: '八宝粥', tags: ['high_carbs'], styles: ['soup'] },

    // ── 脂肪重点 ──
    { name: '花生', tags: ['high_fat', 'high_protein'], styles: ['snack'] },
    { name: '核桃', tags: ['high_fat'], styles: ['snack'] },
    { name: '腰果', tags: ['high_fat'], styles: ['snack'] },
    { name: '开心果', tags: ['high_fat'], styles: ['snack'] },
    { name: '瓜子', tags: ['high_fat'], styles: ['snack'] },
    { name: '芝麻酱', tags: ['high_fat', 'high_protein'], styles: ['daily'] },
    { name: '巧克力', tags: ['high_fat', 'high_carbs'], styles: ['snack', 'dessert'] },
    { name: '冰淇淋', tags: ['high_fat', 'high_carbs'], styles: ['dessert'] },
    { name: '蛋黄酥', tags: ['high_fat', 'high_carbs'], styles: ['snack', 'dessert'] },
    { name: '薯片', tags: ['high_fat', 'high_carbs'], styles: ['snack'] },
    { name: '牛油果', tags: ['high_fat', 'high_fiber'], styles: ['fitness'] },
    { name: '坚果混合', tags: ['high_fat', 'high_protein'], styles: ['snack', 'fitness'] },

    // ── 膳食纤维重点 ──
    { name: '苹果', tags: ['high_fiber'], styles: ['daily', 'snack'] },
    { name: '香蕉', tags: ['high_fiber', 'high_carbs'], styles: ['daily', 'snack'] },
    { name: '橙子', tags: ['high_fiber'], styles: ['snack'] },
    { name: '猕猴桃', tags: ['high_fiber'], styles: ['snack'] },
    { name: '木耳', tags: ['high_fiber'], styles: ['daily'] },
    { name: '芹菜', tags: ['high_fiber'], styles: ['daily'] },
    { name: '菠菜', tags: ['high_fiber'], styles: ['daily'] },
    { name: '西兰花', tags: ['high_fiber'], styles: ['daily', 'fitness'] },
    { name: '竹笋', tags: ['high_fiber'], styles: ['daily'] },
    { name: '海带', tags: ['high_fiber'], styles: ['daily'] },
    { name: '炒青菜', tags: ['high_fiber'], styles: ['daily'] },

    // ── 街头小吃 ──
    { name: '烤串', tags: ['high_protein', 'high_fat'], styles: ['street_food'] },
    { name: '煎饼果子', tags: ['high_carbs'], styles: ['street_food'] },
    { name: '关东煮', tags: ['high_protein'], styles: ['street_food'] },
    { name: '烤冷面', tags: ['high_carbs'], styles: ['street_food'] },
    { name: '肉夹馍', tags: ['high_carbs', 'high_protein'], styles: ['street_food'] },
    { name: '凉皮', tags: ['high_carbs'], styles: ['street_food'] },
    { name: '麻辣烫', tags: ['high_protein', 'high_fiber'], styles: ['street_food'] },

    // ── 甜品饮品 ──
    { name: '珍珠奶茶', tags: ['high_carbs'], styles: ['dessert'] },
    { name: '杨枝甘露', tags: ['high_carbs'], styles: ['dessert'] },
    { name: '双皮奶', tags: ['high_protein', 'high_carbs'], styles: ['dessert'] },
    { name: '芋圆', tags: ['high_carbs'], styles: ['dessert'] },
    { name: '豆浆', tags: ['high_protein'], styles: ['daily', 'dessert'] },
    { name: '绿豆汤', tags: ['high_carbs'], styles: ['soup', 'dessert'] },
    { name: '蛋挞', tags: ['high_fat', 'high_carbs'], styles: ['fast_food', 'dessert'] },

    // ── 汤品 ──
    { name: '紫菜蛋花汤', tags: ['high_protein'], styles: ['soup'] },
    { name: '番茄蛋汤', tags: ['high_protein'], styles: ['soup'] },
    { name: '酸辣汤', tags: ['high_protein'], styles: ['soup'] },

    // ── 快餐 / 特定 ──
    { name: 'KFC 全家桶', tags: ['high_protein', 'high_fat'], styles: ['fast_food'] },
    { name: '麦辣鸡腿堡', tags: ['high_protein', 'high_carbs'], styles: ['fast_food'] },
];

// ── Meal-Type Style Preferences ──
// Each meal type prioritizes different food styles for more relevant recommendations.

const MEAL_STYLE_PREFERENCES: Record<MealType, FoodStyle[]> = {
    breakfast: ['daily', 'snack'],          // 蛋、粥、面包、牛奶
    lunch: ['daily', 'fast_food'],          // 正餐、炒菜、快餐
    dinner: ['daily', 'soup'],              // 家常、清淡、汤品
    snack: ['snack', 'dessert', 'street_food'],  // 零食、甜品、小吃
    afternoon_tea: ['dessert', 'snack'],    // 甜品、饮品
};

// ── Random Sampling (daily-seeded so recommendations feel fresh but stable within a day) ──

const TAG_MAP: Record<NutrientKey, FoodTag> = {
    protein: 'high_protein',
    carbs: 'high_carbs',
    fat: 'high_fat',
    fiber: 'high_fiber',
};

function dailySeed(): number {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

/** Simple hash for a string, used to mix mealType into the seed */
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
    if (arr.length <= 1) return [...arr];
    const shuffled = [...arr];
    let s = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function sampleFoods(
    nutrient: NutrientKey,
    count: number,
    mealType?: MealType,
): RecommendedFood[] {
    const tag = TAG_MAP[nutrient];
    const preferredStyles = mealType
        ? MEAL_STYLE_PREFERENCES[mealType] || ['daily', 'snack']
        : ['daily', 'snack'];

    // Preferred styles first
    const preferred = FOOD_DATABASE.filter(
        (f) => f.tags.includes(tag) && f.styles.some((s) => preferredStyles.includes(s)),
    );
    // Fallback: any style with the right tag
    const fallback = FOOD_DATABASE.filter(
        (f) => f.tags.includes(tag) && !preferred.includes(f),
    );

    // Mix mealType into the seed so different meals get different results
    const mealSeedOffset = mealType ? simpleHash(mealType) : 0;
    const seed = dailySeed() + nutrient.length + mealSeedOffset;
    const pool = [...seededShuffle(preferred, seed), ...seededShuffle(fallback, seed + 1)];

    return pool.slice(0, count).map((f) => ({ name: f.name }));
}

// ── Public API ──

export function getRecommendations(gaps: NutrientGap[], mealType?: MealType): Array<{
    nutrient: NutrientKey;
    label: string;
    gap: number;
    foods: RecommendedFood[];
}> {
    return gaps
        .filter((gap) => gap.gapPercent > 30)
        .sort((left, right) => right.gapPercent - left.gapPercent)
        .map((gap) => ({
            nutrient: gap.nutrient,
            label: gap.label,
            gap: gap.gap,
            foods: sampleFoods(gap.nutrient, 4, mealType),
        }));
}

// ── Narrations — Literary, poetic, no emoji ──

const POSITIVE_NARRATIONS = [
    '人间烟火气，最抚凡人心。',
    '食事，亦是心事。',
    '日日是好日，餐餐皆欢喜。',
    '认真吃饭的人，懂得善待自己。',
    '一箪食，一瓢饮，乐在其中。',
    '把生活嚼得有滋有味，把日子过得活色生香。',
    '世间万物，唯美食与爱不可辜负。',
    'One cannot think well, love well, sleep well, if one has not dined well.',
    '三餐四季，温柔以待。',
    '且将新火试新茶，诗酒趁年华。',
    '浮生若梦，为欢几何。',
    '食饱饮醉，是人间最朴素的幸福。',
    '小楼一夜听春雨，深巷明朝卖杏花。',
    'Let food be thy medicine, and medicine be thy food.',
    '红泥小火炉，能饮一杯无？',
    '人生得意须尽欢，莫使金樽空对月。',
    '慢慢来，比较快。',
    '此心安处是吾乡。',
    '晚来天欲雪，能饮一杯无。',
    '岁月静好，浅笑安然。',
];

export function getDailyNarration(): string {
    const seed = dailySeed();
    return POSITIVE_NARRATIONS[seed % POSITIVE_NARRATIONS.length];
}

// ── Themed Suggestions (day-of-week / holidays / seasonal / vibes) ──

/** Pick one from an array using the daily seed */
function pickDaily<T>(arr: T[], offset = 0): T {
    const s = dailySeed() + offset;
    return arr[((s * 1103515245 + 12345) & 0x7fffffff) % arr.length];
}

// Chinese lunar festival approximate dates (month-day, rough Gregorian mapping)
// These shift each year but we use 2025-2027 approximate windows
function getChineseFestival(month: number, date: number): string | null {
    // 春节 (late Jan / early Feb)
    if ((month === 1 && date >= 25) || (month === 2 && date <= 5)) return '爆竹声中一岁除，春风送暖入屠苏。';
    // 元宵节 (~Feb 12-15)
    if (month === 2 && date >= 10 && date <= 16) return '众里寻他千百度，蓦然回首，那人却在灯火阑珊处。';
    // 清明 (~Apr 4-6)
    if (month === 4 && date >= 3 && date <= 6) return '清明时节雨纷纷，路上行人欲断魂。';
    // 端午 (~Jun 1-15 range)
    if (month === 6 && date >= 1 && date <= 15) return '轻汗微微透碧纨，明朝端午浴芳兰。';
    // 七夕 (~Aug 1-15)
    if (month === 8 && date >= 1 && date <= 15) return '柔情似水，佳期如梦，忍顾鹊桥归路。';
    // 中秋 (~Sep 10-20)
    if (month === 9 && date >= 10 && date <= 20) return '但愿人长久，千里共婵娟。';
    // 重阳 (~Oct 10-15)
    if (month === 10 && date >= 10 && date <= 15) return '遥知兄弟登高处，遍插茱萸少一人。';
    // 腊八 (~Jan 10-20)
    if (month === 1 && date >= 10 && date <= 20) return '腊月风和意已春，时因散策过吾邻。';
    // 冬至 (~Dec 21-23)
    if (month === 12 && date >= 20 && date <= 23) return '天时人事日相催，冬至阳生春又来。';
    return null;
}

const WEEKDAY_THEMES: Record<number, string[]> = {
    0: [ // 周日
        '偷得浮生半日闲。',
        '闲敲棋子落灯花。',
        '一壶好茶，一段时光，足矣。',
        '无事此静坐，一日似两日。',
    ],
    1: [ // 周一
        '千里之行，始于足下。',
        '每一个不曾起舞的日子，都是对生命的辜负。',
        '长风破浪会有时，直挂云帆济沧海。',
        '天将降大任于斯人，先让他吃饱。',
    ],
    2: [ // 周二
        '路漫漫其修远兮，吾将上下而求索。',
        '不乱于心，不困于情，不畏将来。',
        'To live is the rarest thing. Most people exist, that is all.',
    ],
    3: [ // 周三
        '行到水穷处，坐看云起时。',
        '山重水复疑无路，柳暗花明又一村。',
        '半山腰总是最挤的，你得去山顶看看。',
    ],
    4: [ // 周四
        '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。',
        '莫听穿林打叶声，何妨吟啸且徐行。',
        '明日之事，今日且慢忧。',
        'The only way to do great work is to love what you eat.',
    ],
    5: [ // 周五
        '春风得意马蹄疾，一日看尽长安花。',
        '人生如逆旅，我亦是行人。',
        '且乐生前一杯酒，何须身后千载名。',
        '料峭春风吹酒醒，微冷，山头斜照却相迎。',
    ],
    6: [ // 周六
        '何以解忧，唯有美食与好梦。',
        '清风明月本无价，近水远山皆有情。',
        '人生不过一场绚烂花事。',
        'Life is uncertain. Eat dessert first.',
    ],
};

const SEASONAL_VIBES: Array<{ months: number[]; lines: string[] }> = [
    {
        months: [3, 4],
        lines: [
            '等闲识得东风面，万紫千红总是春。',
            '春水初生，春林初盛，春风十里不如你。',
            '迟日江山丽，春风花草香。',
        ],
    },
    {
        months: [5, 6],
        lines: [
            '接天莲叶无穷碧，映日荷花别样红。',
            '稻花香里说丰年，听取蛙声一片。',
        ],
    },
    {
        months: [7, 8],
        lines: [
            '水晶帘动微风起，满架蔷薇一院香。',
            '懒摇白羽扇，裸袒青林中。',
            '纸屏石枕竹方床，手倦抛书午梦长。',
        ],
    },
    {
        months: [9, 10],
        lines: [
            '空山新雨后，天气晚来秋。',
            '自古逢秋悲寂寥，我言秋日胜春朝。',
            '一年好景君须记，最是橙黄橘绿时。',
        ],
    },
    {
        months: [11, 12],
        lines: [
            '晚来天欲雪，能饮一杯无。',
            '柴门闻犬吠，风雪夜归人。',
            '日暮苍山远，天寒白屋贫。',
        ],
    },
    {
        months: [1, 2],
        lines: [
            '忽如一夜春风来，千树万树梨花开。',
            '寒夜客来茶当酒，竹炉汤沸火初红。',
        ],
    },
];

const PAYDAY_VIBES = [
    '良田千顷，不过一日三餐。',
    '人间有味是清欢。',
    '得之我幸，失之我命，如此而已。',
];

const MONTH_END_VIBES = [
    '粗茶淡饭有真味，明窗净几是安居。',
    '山中何事？松花酿酒，春水煎茶。',
    '简约不是少，而是没有多余。',
];

const DAILY_INSPIRATIONS = [
    '落花人独立，微雨燕双飞。',
    '月落乌啼霜满天，江枫渔火对愁眠。',
    '醉后不知天在水，满船清梦压星河。',
    '试问岭南应不好？却道，此心安处是吾乡。',
    '采菊东篱下，悠然见南山。',
    '问余何意栖碧山，笑而不答心自闲。',
    'The art of dining well is no slight art, the pleasure not a slight pleasure.',
    '一期一会，世当珍惜。',
    '山有木兮木有枝，心悦君兮君不知。',
    '愿你一生温暖纯良，不舍爱与自由。',
];

export function getThemedSuggestion(): string | null {
    const now = new Date();
    const day = now.getDay();
    const month = now.getMonth() + 1;
    const date = now.getDate();

    // Priority 1: Chinese festivals
    const festival = getChineseFestival(month, date);
    if (festival) return festival;

    // Priority 2: Payday / month-end vibes
    if (date >= 1 && date <= 3) return pickDaily(PAYDAY_VIBES);
    if (date >= 28) return pickDaily(MONTH_END_VIBES);

    // Priority 3: Day-of-week
    const weekdayOptions = WEEKDAY_THEMES[day];
    if (weekdayOptions) {
        const weekdayPick = pickDaily(weekdayOptions, 1);
        // 30% chance to show seasonal instead
        const seasonal = SEASONAL_VIBES.find((s) => s.months.includes(month));
        if (seasonal && (dailySeed() % 3 === 0)) {
            return pickDaily(seasonal.lines, 2);
        }
        return weekdayPick;
    }

    // Priority 4: Seasonal fallback
    const seasonal = SEASONAL_VIBES.find((s) => s.months.includes(month));
    if (seasonal) return pickDaily(seasonal.lines, 3);

    // Priority 5: Random daily inspiration
    return pickDaily(DAILY_INSPIRATIONS, 4);
}

