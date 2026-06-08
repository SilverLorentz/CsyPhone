import type { GameSettings } from '../types';

export const TRPG_MAX_OUTPUT_TOKENS = 65536;
export const TRPG_DEFAULT_TEMPERATURE = 0.9;

export interface TrpgWritingStylePreset {
    key: string;
    label: string;
    desc: string;
    prompt: string;
}

export const TRPG_WRITING_STYLE_PRESETS: TrpgWritingStylePreset[] = [
    {
        key: 'hardcore',
        label: '硬核冒险',
        desc: '冲突、代价、线索和抉择都更明确',
        prompt: `【TRPG文风：硬核冒险】
- 保持 GM 的压迫感和规则感，行动要有代价，成功也要留下新的问题。
- 每轮推进都给出清晰的环境线索、风险提示和可执行选择。
- 角色吐槽可以活泼，但世界反馈要扎实，避免万事顺遂。`
    },
    {
        key: 'epic',
        label: '史诗幻想',
        desc: '更宏大、更有命运感和传说气质',
        prompt: `【TRPG文风：史诗幻想】
- 使用庄重但不冗长的叙述，强调古老传说、誓言、命运回响和场景尺度。
- 战斗和抉择要有仪式感，角色台词可以更具誓约、信念和牺牲意味。
- 不要堆砌空泛形容词，必须让宏大感落在具体物件、地貌、敌人和后果上。`
    },
    {
        key: 'horror',
        label: '诡秘惊悚',
        desc: '慢性不安、感官异样、SAN 压力',
        prompt: `【TRPG文风：诡秘惊悚】
- 氛围从细小异常开始发酵：声音、气味、影子、记忆错位，比直接怪物更优先。
- SAN 变化要反映在感知偏差、犹疑、幻听或对队友的不确定感里。
- 恐惧要保留悬念，不要过早解释真相。`
    },
    {
        key: 'comedy',
        label: '轻喜剧跑团',
        desc: '更有队友吐槽和乐子人展开',
        prompt: `【TRPG文风：轻喜剧跑团】
- 增加队友之间的吐槽、接话和临场反应，让小队像真的在同桌跑团。
- 可以出现意外的搞笑后果，但不要让主线彻底失去危险和推进。
- 玩家离谱行动可以被世界认真接住，形成荒诞但合理的连锁反应。`
    },
    {
        key: 'noir',
        label: '冷雨黑色',
        desc: '城市、阴谋、短句、灰色选择',
        prompt: `【TRPG文风：冷雨黑色】
- 叙述偏短句和低饱和画面，强调雨、霓虹、旧楼、烟尘、疲惫和秘密交易。
- 每个 NPC 都可以有所隐瞒，信息要像剥洋葱一样逐层露出。
- 道德选择不要非黑即白，尽量制造利益、情感和真相之间的拉扯。`
    },
    {
        key: 'romance',
        label: '羁绊心动',
        desc: '冒险中更重视关系张力',
        prompt: `【TRPG文风：羁绊心动】
- 保留冒险危险，但把角色之间的保护、吃醋、默契、试探和欲言又止写得更细。
- 不要把心动写成直白告白，优先放在动作、站位、称呼、临危反应和短暂停顿里。
- 关系升温必须跟剧情压力绑定：越危险，越能看出谁在乎谁。`
    }
];

export const resolveTrpgWritingStylePreset = (style?: string) =>
    style ? TRPG_WRITING_STYLE_PRESETS.find(preset => preset.key === style) : undefined;

export const getTrpgWritingStyleLabel = (style?: string) => {
    if (!style) return '默认';
    return resolveTrpgWritingStylePreset(style)?.label || '自定义';
};

export const buildTrpgWritingStylePrompt = (style?: string) => {
    if (!style) return '';
    const preset = resolveTrpgWritingStylePreset(style);
    if (preset) return preset.prompt;
    return `【TRPG自定义文风】\n${style.trim()}`;
};

export const normalizeTrpgSettings = (settings?: GameSettings): Required<Pick<GameSettings, 'temperature' | 'showTokenHud'>> & Pick<GameSettings, 'writingStyle'> => ({
    temperature: settings?.temperature ?? TRPG_DEFAULT_TEMPERATURE,
    showTokenHud: settings?.showTokenHud ?? true,
    writingStyle: settings?.writingStyle
});
