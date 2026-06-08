import type { NianNianEventPrototype, NianNianStage, NianNianWorldBible } from '../types/niannian';

export const NIANNIAN_RECENT_EVENT_LIMIT = 5;

export const NIANNIAN_EVENT_PROTOTYPES: NianNianEventPrototype[] = [
    {
        id: 'public_festival',
        名称: '公共节庆',
        功能: '在热闹与人潮里制造初遇或重逢,氛围助推暧昧;失散又寻回是天然的近身由头。',
        情绪: '明亮、雀跃,暗藏一丝心动。',
        适配stage: ['初遇', '拉扯'],
        基础权重: 3,
        跨题材示例: {
            古代: '上元灯会/猜灯谜',
            仙侠: '仙门法会/天灯祈愿',
            武侠: '庙会比武摆擂',
            民国: '舞厅一曲/夜市霓虹',
        },
    },
    {
        id: 'forced_privacy',
        名称: '被迫独处',
        功能: '把两人关进一方狭小天地,推近物理与心理距离;松动平日的分寸。',
        情绪: '局促、心跳、欲言又止。',
        适配stage: ['拉扯', '心意渐明', '情动'],
        基础权重: 4,
        跨题材示例: {
            古代: '檐下避雨/客栈同宿',
            仙侠: '秘境同困/洞府避劫',
            武侠: '雪夜困驿/同舟夜渡',
            民国: '雨中同伞/被困电梯戏院',
        },
    },
    {
        id: 'talent_gathering',
        名称: '雅集才艺',
        功能: '以才情代言,借技艺试探与倾慕;不着一字的默契。',
        情绪: '含蓄、欣赏、暗自较劲。',
        适配stage: ['初遇', '拉扯', '心意渐明'],
        基础权重: 3,
        跨题材示例: {
            古代: '诗会/抚琴/对弈',
            仙侠: '论道/斗法/共参一卷',
            武侠: '月下对练/品剑论招',
            民国: '钢琴一曲/影评笔战/网球场',
        },
    },
    {
        id: 'drunken_truth',
        名称: '醉后吐真言',
        功能: '借酒卸下心防,让平日说不出口的话漏出来;次日的微妙更添张力。',
        情绪: '朦胧、坦露、酒后的羞赧。',
        适配stage: ['心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '对饮失态',
            仙侠: '灵酿乱了道心',
            武侠: '大醉论英雄/吐真心',
            民国: '酒会微醺/洋酒上头',
        },
    },
    {
        id: 'wounded_care',
        名称: '受伤被照顾',
        功能: '脆弱时刻卸下铠甲,照顾与被照顾拉近彼此;近身与触碰的合理由头。',
        情绪: '疼惜、依赖、不设防。',
        适配stage: ['拉扯', '心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '病中侍疾',
            仙侠: '灵泉疗伤/渡灵气',
            武侠: '疗伤运功/包扎刀伤',
            民国: '淋雨发热/枪伤照料',
        },
    },
    {
        id: 'keepsake_exchange',
        名称: '互赠信物',
        功能: '以物寄情,把心意落到一件可触可留的东西上;为后续埋下念想与凭证。',
        情绪: '郑重、甜、藏不住的在意。',
        适配stage: ['心意渐明', '情动', '厮守'],
        基础权重: 3,
        跨题材示例: {
            古代: '玉佩/同心结/亲笔笺',
            仙侠: '本命灵物/护身符箓',
            武侠: '贴身佩剑/一缕发',
            民国: '怀表/钢笔/一张合影',
        },
    },
    {
        id: 'rumor_jealousy',
        名称: '流言吃醋',
        功能: '借第三者或闲言,逼出占有欲与未明的心意;制造拉扯与求证。',
        情绪: '酸、闷、自我怀疑。',
        适配stage: ['拉扯', '心意渐明'],
        基础权重: 3,
        跨题材示例: {
            古代: '说亲传闻/红颜旧识',
            仙侠: '仙侣双修之议',
            武侠: '江湖艳名/旧情纠葛',
            民国: '名媛追求者/绯闻上报',
        },
    },
    {
        id: 'shared_peril',
        名称: '共患难',
        功能: '把两人推进生死与危局,以并肩淬炼信任;沉默里见真情。',
        情绪: '紧张、托付、劫后余生的相依。',
        适配stage: ['拉扯', '情动', '厮守', '别离'],
        基础权重: 4,
        跨题材示例: {
            古代: '水患匪患/卷入是非',
            仙侠: '共抗天劫/闯险境',
            武侠: '雨夜追兵/围杀脱身',
            民国: '战火离乱/避险同逃',
        },
    },
    {
        id: 'identity_reveal',
        名称: '身份暴露',
        功能: '揭开 TA(或主角)藏着的来历/秘密,关系迎来转折--信任的考验或裂痕。',
        情绪: '震动、被欺瞒的痛、和解的余地。',
        适配stage: ['心意渐明', '情动', '别离'],
        基础权重: 4,
        跨题材示例: {
            古代: '世子/钦犯真身',
            仙侠: '谪仙/魔修来历',
            武侠: '正邪立场/仇家之后',
            民国: '地下身份/对立阵营',
        },
    },
    {
        id: 'past_life_echo',
        名称: '前世回响',
        功能: '以似曾相识、旧梦碎片喂养宿命感,推进缘分;跨档解锁前世真相。',
        情绪: '怅惘、莫名熟稔、宿命的牵动。',
        适配stage: ['初遇', '拉扯', '心意渐明', '情动', '厮守', '别离'],
        基础权重: 3,
        跨题材示例: {
            古代: '旧物/旧地触发记忆',
            仙侠: '残梦/三生石/记忆苏醒',
            武侠: '招式默契如旧识',
            民国: '旧照/旧曲唤起既视感',
        },
    },
    {
        id: 'misunderstanding_silence',
        名称: '误会冷战',
        功能: '在关系升温处投下一道裂痕,以疏远与沉默制造拉扯;和解时感情更进一层。',
        情绪: '委屈、别扭、想靠近又拉不下脸。',
        适配stage: ['拉扯', '心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '一句误传的话',
            仙侠: '道心之争/误解心意',
            武侠: '立场误会/赌气离去',
            民国: '理念冲突/赌气数日不见',
        },
    },
    {
        id: 'night_confession',
        名称: '夜话交心',
        功能: '在夜色与静谧里卸下白日的伪装,袒露往事与软肋;低声里距离骤近。',
        情绪: '静、暖、罕见的坦诚。',
        适配stage: ['拉扯', '心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '月下夜谈/守岁围炉',
            仙侠: '星河之畔论身世',
            武侠: '篝火旁吐心事',
            民国: '天台夜谈/电话长谈',
        },
    },
    {
        id: 'timely_rescue',
        名称: '救场解围',
        功能: '一方在窘境/危难中被另一方解围,瞬间拉起好感;经典的初识或转折。',
        情绪: '错愕、感激、心头一动。',
        适配stage: ['初遇', '拉扯'],
        基础权重: 3,
        跨题材示例: {
            古代: '惊马/泼皮解围',
            仙侠: '险些走火入魔被护',
            武侠: '寡不敌众被救',
            民国: '街头纠缠/危局被护',
        },
    },
    {
        id: 'looming_parting',
        名称: '离别在即',
        功能: '以迫近的分别逼出深藏的心意--再不说就来不及;张力与不舍拉满。',
        情绪: '不舍、焦灼、欲说还休。',
        适配stage: ['情动', '别离'],
        基础权重: 3,
        跨题材示例: {
            古代: '外放/远嫁在即',
            仙侠: '闭关/飞升/转世将至',
            武侠: '远行/退隐江湖',
            民国: '远渡/避走他乡',
        },
    },
    {
        id: 'long_awaited_reunion',
        名称: '久别重逢',
        功能: '经历一段分离后再相见,以时间检验感情;重逢时心意更明。',
        情绪: '百感交集、近乡情怯、失而复得。',
        适配stage: ['心意渐明', '情动', '厮守'],
        基础权重: 2,
        跨题材示例: {
            古代: '数载未见再遇',
            仙侠: '一世/百年后重逢',
            武侠: '江湖飘零再聚',
            民国: '战乱别后重逢',
        },
    },
    {
        id: 'marriage_pressure',
        名称: '逼婚催嫁',
        功能: '以父母之命/世俗压力把"在不在一起"摆上台面,逼两人表态或共同抗争。',
        情绪: '焦虑、抗拒、被推到悬崖边的抉择。',
        适配stage: ['情动', '厮守', '别离'],
        基础权重: 3,
        跨题材示例: {
            古代: '议亲/赐婚',
            仙侠: '仙门指婚/门户之见',
            武侠: '门派联姻/长辈做主',
            民国: '包办婚姻/家族联姻',
        },
    },
    {
        id: 'almost_confession',
        名称: '告白未遂',
        功能: '话到嘴边又咽回、或被打断--一次几乎说破的心意;留白吊足张力。',
        情绪: '鼓起勇气、临阵退缩、扼腕。',
        适配stage: ['拉扯', '心意渐明'],
        基础权重: 3,
        跨题材示例: {
            古代: '欲言又止被外人撞断',
            仙侠: '天规当前不敢言',
            武侠: '话到嘴边偏要嘴硬',
            民国: '月台告白被汽笛打断',
        },
    },
    {
        id: 'journey_together',
        名称: '同行远途',
        功能: '把两人带离日常与约束,在路上朝夕相处、相依相护,感情自然滋长。',
        情绪: '松快、亲近、旅途的暧昧。',
        适配stage: ['拉扯', '心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '结伴赶路/同舟',
            仙侠: '下山历练/远赴秘境',
            武侠: '联袂行走江湖',
            民国: '同车远行/避难之旅',
        },
    },
    {
        id: 'silent_guardian',
        名称: '默默守护',
        功能: '让主角无意间发现 TA 一直在暗处护着自己/为自己付出,后知后觉的感动。',
        情绪: '错愕、心疼、暖到鼻酸。',
        适配stage: ['心意渐明', '情动'],
        基础权重: 3,
        跨题材示例: {
            古代: '暗中替你周旋/挡灾',
            仙侠: '默默以道行护你周全',
            武侠: '一路暗中护送/替你顶罪',
            民国: '暗里替你打点时局',
        },
    },
    {
        id: 'mutual_commitment',
        名称: '定情互通',
        功能: '两情终于挑明、心意互通--关系的高光与不可逆里程碑;此后只论厮守或别离。',
        情绪: '释然、滚烫、尘埃落定的安心。',
        适配stage: ['情动', '厮守'],
        基础权重: 4,
        跨题材示例: {
            古代: '月下定情/互许',
            仙侠: '结为道侣/同心同劫',
            武侠: '生死之际互表/结为侠侣',
            民国: '雨中相拥/许下承诺',
        },
    },
];

export interface NianNianEventCandidate {
    id: string;
    名称: string;
    功能: string;
    情绪: string;
    适配stage: NianNianStage[];
    基础权重: number;
    effectiveWeight: number;
    recentlyUsed: boolean;
    跨题材示例: NianNianEventPrototype['跨题材示例'];
}

export interface NianNianEventDeck {
    stage: NianNianStage;
    recentEventIds: string[];
    recommendedEvent: NianNianEventCandidate | null;
    candidates: NianNianEventCandidate[];
}

const STAGE_NAMES: NianNianStage[] = ['初遇', '拉扯', '心意渐明', '情动', '厮守', '别离'];

function getStageWeightOverride(
    world: NianNianWorldBible,
    stage: NianNianStage,
    event: NianNianEventPrototype,
): number | undefined {
    const weights = world.eventWeights || {};
    const stageWeights = weights[stage];
    if (stageWeights && typeof stageWeights === 'object' && !Array.isArray(stageWeights)) {
        const keyed = stageWeights[event.名称] ?? stageWeights[event.id];
        return typeof keyed === 'number' && Number.isFinite(keyed) ? keyed : undefined;
    }

    const flat = weights[event.名称] ?? weights[event.id];
    return typeof flat === 'number' && Number.isFinite(flat) ? flat : undefined;
}

function normalizeEventLookupText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[·・|｜、，,。；;:：/\\()[\]{}"'“”‘’《》<>-]/g, '');
}

function getEventAliasTokens(event: NianNianEventPrototype): string[] {
    const examples = Object.values(event.跨题材示例)
        .flatMap(value => value.split(/[\/｜|、，,\s]+/))
        .map(value => value.trim())
        .filter(Boolean);
    return [event.id, event.名称, ...examples];
}

export function resolveNianNianEventPrototype(raw: string): NianNianEventPrototype | null {
    const needle = normalizeEventLookupText(raw);
    if (!needle || needle === '无' || needle === 'none') return null;

    return NIANNIAN_EVENT_PROTOTYPES.find(event => {
        return getEventAliasTokens(event).some(token => {
            const alias = normalizeEventLookupText(token);
            return Boolean(alias && (needle.includes(alias) || alias.includes(needle)));
        });
    }) || null;
}

export function buildNianNianEventDeck(input: {
    world: NianNianWorldBible;
    stage: NianNianStage;
    recentEventIds?: string[];
}): NianNianEventDeck {
    const recentEventIds = (input.recentEventIds || []).slice(-NIANNIAN_RECENT_EVENT_LIMIT);
    const recentSet = new Set(recentEventIds);
    const compatible = NIANNIAN_EVENT_PROTOTYPES
        .filter(event => event.适配stage.includes(input.stage))
        .map((event): NianNianEventCandidate => {
            const override = getStageWeightOverride(input.world, input.stage, event);
            const effectiveWeight = Math.max(0, override ?? event.基础权重);
            return {
                ...event,
                effectiveWeight,
                recentlyUsed: recentSet.has(event.id),
            };
        })
        .filter(event => event.effectiveWeight > 0);

    const fresh = compatible.filter(event => !event.recentlyUsed);
    const candidatePool = fresh.length > 0 ? fresh : compatible;
    const candidates = candidatePool
        .sort((a, b) => b.effectiveWeight - a.effectiveWeight || a.id.localeCompare(b.id))
        .slice(0, 8);

    return {
        stage: STAGE_NAMES.includes(input.stage) ? input.stage : '初遇',
        recentEventIds,
        recommendedEvent: candidates[0] || null,
        candidates,
    };
}
