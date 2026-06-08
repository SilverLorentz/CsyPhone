export interface NianNianSceneVisual {
    key: string;
    label: string;
    imageUrl: string;
    a: string;
    b: string;
    c: string;
    keywords: string[];
}

const SCENE_ASSET_BASE = '/images/niannian-fusheng-scenes';

const scene = (
    key: string,
    label: string,
    file: string,
    colors: [string, string, string],
    keywords: string[],
): NianNianSceneVisual => ({
    key,
    label,
    imageUrl: `${SCENE_ASSET_BASE}/${file}`,
    a: colors[0],
    b: colors[1],
    c: colors[2],
    keywords,
});

export const NIANNIAN_SCENE_VISUALS: NianNianSceneVisual[] = [
    scene('gui-fang', '闺房', 'scene-01-gui-fang.png', ['#f8dfdf', '#d9c3b6', '#f6efe5'], ['闺房', '绣房', '香闺', '内室', '卧房']),
    scene('shu-fang', '书房', 'scene-02-shu-fang.png', ['#fff4db', '#d9c1a3', '#dceaf0'], ['书房', '书斋', '书案', '书阁', '书卷']),
    scene('zheng-ting', '正厅', 'scene-03-zheng-ting.png', ['#f7dfbf', '#caa37f', '#e8d7c5'], ['正厅', '厅堂', '堂前', '前厅', '花厅']),
    scene('nuan-ge', '暖阁', 'scene-04-nuan-ge.png', ['#fae3c4', '#d7af8c', '#f1d9c7'], ['暖阁', '暖房', '小阁', '阁中']),
    scene('ke-zhan-fang', '客栈房', 'scene-05-ke-zhan-fang.png', ['#ffe9cf', '#cda179', '#d7e4e8'], ['客栈', '客房', '旅舍', '驿馆', '投宿']),
    scene('tang-chi', '汤池', 'scene-06-tang-chi.png', ['#e9f4ef', '#bad6cf', '#f9dfca'], ['汤池', '温泉', '浴池', '池汤']),
    scene('ting-yuan', '庭院', 'scene-07-ting-yuan.png', ['#edf8ee', '#bddfc8', '#fff2dc'], ['庭院', '小院', '院中', '院落', '天井']),
    scene('qu-lang-shui-xie', '曲廊水榭', 'scene-08-qu-lang-shui-xie.png', ['#e8f5f1', '#bcded8', '#f5e8c9'], ['水榭', '曲廊', '回廊水', '临水', '廊桥']),
    scene('yan-xia-hui-lang', '檐下回廊', 'scene-09-yan-xia-hui-lang.png', ['#eef2ef', '#c7d8d5', '#f3dfcc'], ['檐下', '回廊', '廊下', '雨廊', '避雨', '雨巷']),
    scene('hua-yuan-qiu-qian', '花园秋千', 'scene-10-hua-yuan-qiu-qian.png', ['#f5eadf', '#d8c8aa', '#e6f0d8'], ['秋千', '花园', '园中', '后园', '园子']),
    scene('he-tang', '荷塘', 'scene-11-he-tang.png', ['#e8f6ed', '#b7dbca', '#f8e8c8'], ['荷塘', '莲池', '池边', '荷叶', '莲花']),
    scene('jie-shi', '街市', 'scene-12-jie-shi.png', ['#ffe6c6', '#d9a872', '#d8edf1'], ['街市', '市集', '市井', '集市', '街边', '铺面']),
    scene('deng-hui-ye-shi', '灯会夜市', 'scene-13-deng-hui-ye-shi.png', ['#fff1c7', '#f2a66f', '#c9e8ff'], ['灯会', '灯市', '上元', '夜市', '河灯', '花灯', '莲花灯']),
    scene('cha-si-jiu-lou', '茶肆酒楼', 'scene-14-cha-si-jiu-lou.png', ['#fff2d0', '#c7a16f', '#d7eadf'], ['茶肆', '茶楼', '酒楼', '酒肆', '茶馆']),
    scene('shi-qiao', '石桥', 'scene-15-shi-qiao.png', ['#eaf5f4', '#bcd7d7', '#f7dfbf'], ['石桥', '桥上', '桥边', '小桥']),
    scene('shan-dao', '山道', 'scene-16-shan-dao.png', ['#e9f2dc', '#b8d2aa', '#f4e2bd'], ['山道', '山路', '山间', '坡道', '山径']),
    scene('zhu-lin', '竹林', 'scene-17-zhu-lin.png', ['#e5f2df', '#a8c995', '#f1e5c6'], ['竹林', '竹影', '竹间', '竹径']),
    scene('jiang-bian-du-kou', '江边渡口', 'scene-18-jiang-bian-du-kou.png', ['#eaf7fb', '#abcfd7', '#f4d9af'], ['渡口', '江边', '河边', '码头', '舟', '船']),
    scene('xue-yuan-han-lin', '雪原寒林', 'scene-19-xue-yuan-han-lin.png', ['#fbfdff', '#d5e6f4', '#f2e2ea'], ['雪原', '雪地', '寒林', '雪夜', '风雪']),
    scene('mei-lin', '梅林', 'scene-20-mei-lin.png', ['#f5eef1', '#d7bdc5', '#e8ead7'], ['梅林', '梅花', '寒梅', '梅枝']),
    scene('tao-lin', '桃林', 'scene-21-tao-lin.png', ['#ffe5eb', '#e6b8c4', '#e9f0d4'], ['桃林', '桃花', '桃枝', '花林']),
    scene('shan-dong', '山洞', 'scene-22-shan-dong.png', ['#e6e0d6', '#9d9f96', '#d2c2a5'], ['山洞', '洞中', '洞穴', '岩洞']),
    scene('da-dian-chao-tang', '大殿朝堂', 'scene-23-da-dian-chao-tang.png', ['#fff0bf', '#d5a760', '#f3ded0'], ['大殿', '朝堂', '宫殿', '殿上', '金殿']),
    scene('yu-hua-yuan', '御花园', 'scene-24-yu-hua-yuan.png', ['#f4ead7', '#cdb887', '#d8ead8'], ['御花园', '宫苑', '宫中花园', '禁苑']),
    scene('yan-ting', '宴厅', 'scene-25-yan-ting.png', ['#ffe2bd', '#c88f62', '#f1d5c0'], ['宴厅', '宴席', '席间', '筵席', '宴上']),
    scene('yi-guan-yao-pu', '医馆药铺', 'scene-26-yi-guan-yao-pu.png', ['#f4f7de', '#c8d8a5', '#ffe0c8'], ['医馆', '药铺', '药房', '药柜', '诊室']),
    scene('gu-cha-si-miao', '古刹寺庙', 'scene-27-gu-cha-si-miao.png', ['#ede6d7', '#c9b89b', '#dce8dc'], ['古刹', '寺庙', '寺中', '佛寺', '庙里', '禅院']),
    scene('ying-zhang', '营帐', 'scene-28-ying-zhang.png', ['#f0dfc4', '#b69064', '#d5dfd7'], ['营帐', '军营', '帐中', '帐篷', '营地']),
];

const LEGACY_SCENE_ALIASES: Record<string, string> = {
    灯市夜: 'deng-hui-ye-shi',
    庭院: 'ting-yuan',
    书房: 'shu-fang',
    客栈: 'ke-zhan-fang',
    山道: 'shan-dao',
    雪原: 'xue-yuan-han-lin',
    朝堂: 'da-dian-chao-tang',
    茶肆: 'cha-si-jiu-lou',
    河畔: 'jiang-bian-du-kou',
    雨巷: 'yan-xia-hui-lang',
    药铺: 'yi-guan-yao-pu',
    书肆: 'shu-fang',
    马车: 'jie-shi',
    驿站: 'ke-zhan-fang',
    月夜: 'shi-qiao',
};

const DEFAULT_SCENE_KEY = 'deng-hui-ye-shi';

function normalizeSceneText(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

function findSceneByKey(key: string | undefined): NianNianSceneVisual | undefined {
    if (!key) return undefined;
    return NIANNIAN_SCENE_VISUALS.find(item => item.key === key);
}

export function resolveNianNianSceneVisual(input: {
    category?: string;
    location?: string;
    situation?: string;
}): NianNianSceneVisual {
    const category = (input.category || '').trim();
    const directAlias = findSceneByKey(LEGACY_SCENE_ALIASES[category] || category);
    if (directAlias) return directAlias;

    const normalizedCategory = normalizeSceneText(category);
    if (normalizedCategory) {
        const directLabel = NIANNIAN_SCENE_VISUALS.find(item =>
            normalizeSceneText(item.label) === normalizedCategory || normalizeSceneText(item.key) === normalizedCategory,
        );
        if (directLabel) return directLabel;
    }

    const haystack = normalizeSceneText(`${category} ${input.location || ''} ${input.situation || ''}`);
    if (haystack) {
        const matched = NIANNIAN_SCENE_VISUALS.find(item =>
            item.keywords.some(keyword => haystack.includes(normalizeSceneText(keyword))),
        );
        if (matched) return matched;
    }

    return findSceneByKey(DEFAULT_SCENE_KEY) || NIANNIAN_SCENE_VISUALS[0];
}
