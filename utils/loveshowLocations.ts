/**
 * Love Show location visuals.
 *
 * This file is the source of truth for main-flow Love Show scene locations:
 * house reserve locations, special show locations, and external date cards.
 */

export const LOVE_SHOW_LOCATION_BG_BASE = '/images/loveshow/locations';

export type LoveShowLocationGroup = 'house' | 'special' | 'date';

export interface LoveShowBaseLocation {
  id: string;
  name: string;
  atmosphere: string;
  backgroundImage?: string;
  gradientFallback: string;
}

export interface LoveShowSceneImageRequirement {
  id: string;
  name: string;
  group: LoveShowLocationGroup;
  imagePath: string;
  promptHint: string;
}

export interface LoveShowDateLocation extends LoveShowBaseLocation {
  nameZh: string;
  nameEn: string;
  description: string;
  tags: string[];
}

function locationImage(fileName: string): string {
  return `${LOVE_SHOW_LOCATION_BG_BASE}/${fileName}`;
}

export const HOUSE_LOCATIONS: LoveShowBaseLocation[] = [
  {
    id: 'kitchen',
    name: '厨房',
    atmosphere: '日常温暖，偶遇感',
    backgroundImage: locationImage('house-kitchen.jpg'),
    gradientFallback: 'linear-gradient(135deg, #392820 0%, #a97352 54%, #f1c98b 100%)',
  },
  {
    id: 'living_room',
    name: '客厅',
    atmosphere: '公开热闹，群聊破冰',
    backgroundImage: locationImage('house-living-room.jpg'),
    gradientFallback: 'linear-gradient(135deg, #24101d 0%, #0f3431 56%, #ffd98d 100%)',
  },
  {
    id: 'rooftop',
    name: '天台',
    atmosphere: '私密浪漫，夜聊告白',
    backgroundImage: locationImage('house-rooftop.jpg'),
    gradientFallback: 'linear-gradient(135deg, #182233 0%, #465f8e 50%, #c9b7d8 100%)',
  },
  {
    id: 'hallway',
    name: '走廊',
    atmosphere: '偶然暧昧，擦肩而过',
    backgroundImage: locationImage('house-hallway.jpg'),
    gradientFallback: 'linear-gradient(135deg, #2a1b2e 0%, #75516d 52%, #e0a6a2 100%)',
  },
  {
    id: 'garden',
    name: '院子',
    atmosphere: '轻松开放，集体活动',
    backgroundImage: locationImage('house-garden.jpg'),
    gradientFallback: 'linear-gradient(135deg, #17382f 0%, #7aa889 52%, #f3d7b0 100%)',
  },
  {
    id: 'interview_room',
    name: '单采间',
    atmosphere: '独处真实，对镜头说心里话',
    backgroundImage: locationImage('house-interview-room.jpg'),
    gradientFallback: 'linear-gradient(135deg, #2a1b2e 0%, #75516d 52%, #e0a6a2 100%)',
  },
];

export const SPECIAL_SCENE_LOCATIONS: LoveShowBaseLocation[] = [
  {
    id: 'observatory',
    name: '观察室',
    atmosphere: '暗处窥探，内心翻涌',
    backgroundImage: locationImage('observatory.jpg'),
    gradientFallback: 'linear-gradient(135deg, #141e30 0%, #243b55 60%, #ffafbd 100%)',
  },
  {
    id: 'finale_stage',
    name: '终选露台',
    atmosphere: '最终选择，尊重你的答案',
    backgroundImage: locationImage('finale-stage.jpg'),
    gradientFallback: 'linear-gradient(135deg, #24122d 0%, #8d3f73 45%, #f0b36b 100%)',
  },
];

/** External date card location pool. */
export const DATE_LOCATION_POOL: LoveShowDateLocation[] = [
  {
    id: 'amusement_park',
    name: '游乐园',
    nameZh: '游乐园',
    nameEn: 'Moonlit Amusement Park',
    description: '节目组包下夜间小型游乐区，旋转木马、投篮摊和高处灯轮都适合制造临时同盟。',
    tags: ['playful', 'physical', 'bright'],
    backgroundImage: locationImage('date-amusement-park.jpg'),
    gradientFallback: 'linear-gradient(135deg, #ff7a8a 0%, #ffc857 50%, #4ecdc4 100%)',
    atmosphere: '刺激兴奋，容易拉近距离',
  },
  {
    id: 'seaside',
    name: '海边栈道',
    nameZh: '海边栈道',
    nameEn: 'Seaside Boardwalk',
    description: '傍晚海风和长椅连成一条慢镜头动线，适合把公开暧昧转成低声确认。',
    tags: ['open_air', 'romantic', 'talk'],
    backgroundImage: locationImage('date-seaside-boardwalk.jpg'),
    gradientFallback: 'linear-gradient(135deg, #2f80ed 0%, #56ccf2 55%, #f2c94c 100%)',
    atmosphere: '开阔浪漫，适合深聊',
  },
  {
    id: 'cafe',
    name: '转角咖啡馆',
    nameZh: '转角咖啡馆',
    nameEn: 'Corner Cafe',
    description: '窗边双人桌、手写菜单和雨伞架组成安静空间，镜头可以抓住停顿和眼神。',
    tags: ['quiet', 'private', 'dialogue'],
    backgroundImage: locationImage('date-corner-cafe.jpg'),
    gradientFallback: 'linear-gradient(135deg, #8e6e53 0%, #f1d6a8 55%, #6db6a8 100%)',
    atmosphere: '安静私密，面对面',
  },
  {
    id: 'escape_room',
    name: '限时解谜馆',
    nameZh: '限时解谜馆',
    nameEn: 'Puzzle Room',
    description: '节目组定制的轻悬疑密室，密码箱、暗格和误触警报会不断迫使两人协作。',
    tags: ['cooperation', 'tension', 'game'],
    backgroundImage: locationImage('date-puzzle-room.jpg'),
    gradientFallback: 'linear-gradient(135deg, #28313b 0%, #485461 60%, #f2994a 100%)',
    atmosphere: '紧张合作，肢体距离被压近',
  },
  {
    id: 'night_market',
    name: '夜市长街',
    nameZh: '夜市长街',
    nameEn: 'Night Market Lane',
    description: '摊位灯牌和人声把约会藏进热闹里，适合用选择小吃、躲开人潮制造自然亲近。',
    tags: ['crowded', 'casual', 'food'],
    backgroundImage: locationImage('date-night-market-lane.jpg'),
    gradientFallback: 'linear-gradient(135deg, #1f1c2c 0%, #928dab 45%, #ffb347 100%)',
    atmosphere: '热闹随意，自然亲近',
  },
  {
    id: 'aquarium',
    name: '深蓝水族馆',
    nameZh: '深蓝水族馆',
    nameEn: 'Blue Aquarium',
    description: '玻璃隧道、慢速鱼群和蓝色暗光让说话声自动放轻，适合并肩看同一片水影。',
    tags: ['dreamy', 'quiet', 'side_by_side'],
    backgroundImage: locationImage('date-blue-aquarium.jpg'),
    gradientFallback: 'linear-gradient(135deg, #0f2027 0%, #2c5364 55%, #a1c4fd 100%)',
    atmosphere: '安静梦幻，适合并肩',
  },
  {
    id: 'bookstore',
    name: '独立书店',
    nameZh: '独立书店',
    nameEn: 'Independent Bookstore',
    description: '窄书架、旧唱片角和便签墙让约会变成互相挑选秘密关键词的小实验。',
    tags: ['literary', 'quiet', 'taste'],
    backgroundImage: locationImage('date-independent-bookstore.jpg'),
    gradientFallback: 'linear-gradient(135deg, #355c7d 0%, #c06c84 55%, #f8b195 100%)',
    atmosphere: '文艺安静，适合偷看对方的选择',
  },
  {
    id: 'hiking',
    name: '林间步道',
    nameZh: '林间步道',
    nameEn: 'Forest Trail',
    description: '低难度山路和观景平台让两人必须调整同一速度，照顾和逞强都会被镜头捕捉。',
    tags: ['outdoor', 'care', 'motion'],
    backgroundImage: locationImage('date-forest-trail.jpg'),
    gradientFallback: 'linear-gradient(135deg, #134e5e 0%, #71b280 65%, #fceabb 100%)',
    atmosphere: '运动出汗，互相照顾',
  },
  {
    id: 'glass_greenhouse',
    name: '玻璃花房',
    nameZh: '玻璃花房',
    nameEn: 'Glass Greenhouse',
    description: '透明屋顶下是湿润花香和手作花束任务，适合让暧昧从照顾一枝花开始发芽。',
    tags: ['soft', 'craft', 'visual'],
    backgroundImage: locationImage('date-glass-greenhouse.jpg'),
    gradientFallback: 'linear-gradient(135deg, #7fcd91 0%, #f6d365 55%, #fda085 100%)',
    atmosphere: '柔软明亮，适合把心思说得很轻',
  },
  {
    id: 'rain_bus_stop',
    name: '雨夜巴士站',
    nameZh: '雨夜巴士站',
    nameEn: 'Rainy Bus Stop',
    description: '节目组设置的临时雨棚、末班车灯和一把备用伞，专门承接没说出口的等待。',
    tags: ['rain', 'waiting', 'intimate'],
    backgroundImage: locationImage('date-rainy-bus-stop.jpg'),
    gradientFallback: 'linear-gradient(135deg, #232526 0%, #414345 55%, #74ebd5 100%)',
    atmosphere: '雨声压低距离，适合等待和靠近',
  },
  {
    id: 'rooftop_cinema',
    name: '天台露天影院',
    nameZh: '天台露天影院',
    nameEn: 'Rooftop Cinema',
    description: '白幕、折叠椅和城市灯火构成节目组小影院，适合在剧情空白里偷偷观察彼此反应。',
    tags: ['night', 'movie', 'reaction'],
    backgroundImage: locationImage('date-rooftop-cinema.jpg'),
    gradientFallback: 'linear-gradient(135deg, #141e30 0%, #243b55 60%, #ffafbd 100%)',
    atmosphere: '夜色包裹，适合把反应藏在电影光里',
  },
  {
    id: 'ceramic_studio',
    name: '陶艺工作室',
    nameZh: '陶艺工作室',
    nameEn: 'Ceramic Studio',
    description: '转盘、泥水和围裙让两个人必须一起完成一件作品，失误也能变成可爱的共同记忆。',
    tags: ['craft', 'hands_on', 'warm'],
    backgroundImage: locationImage('date-ceramic-studio.jpg'),
    gradientFallback: 'linear-gradient(135deg, #b79891 0%, #94716b 55%, #2bc0e4 100%)',
    atmosphere: '手作笨拙，容易产生共同记忆',
  },
];

export const LOVE_SHOW_MAIN_SCENE_LOCATIONS: Array<LoveShowBaseLocation | LoveShowDateLocation> = [
  ...HOUSE_LOCATIONS,
  ...SPECIAL_SCENE_LOCATIONS,
  ...DATE_LOCATION_POOL,
];

export const LOVE_SHOW_MAIN_SCENE_IMAGE_REQUIREMENTS: LoveShowSceneImageRequirement[] = [
  ...HOUSE_LOCATIONS.map(location => ({
    id: location.id,
    name: location.name,
    group: 'house' as const,
    imagePath: location.backgroundImage || '',
    promptHint: location.atmosphere,
  })),
  ...SPECIAL_SCENE_LOCATIONS.map(location => ({
    id: location.id,
    name: location.name,
    group: 'special' as const,
    imagePath: location.backgroundImage || '',
    promptHint: location.atmosphere,
  })),
  ...DATE_LOCATION_POOL.map(location => ({
    id: location.id,
    name: location.name,
    group: 'date' as const,
    imagePath: location.backgroundImage || '',
    promptHint: `${location.description} ${location.atmosphere}`,
  })),
];

const DEFAULT_LOCATION = HOUSE_LOCATIONS.find(location => location.id === 'living_room') || HOUSE_LOCATIONS[0];
const LOCATION_BY_ID = new Map(LOVE_SHOW_MAIN_SCENE_LOCATIONS.map(location => [location.id, location]));

export function getLoveShowLocationGradient(locationId: string): string {
  return LOCATION_BY_ID.get(locationId)?.gradientFallback
    || DEFAULT_LOCATION?.gradientFallback
    || 'linear-gradient(135deg, #24101d 0%, #0e7f70 58%, #ffd98d 100%)';
}

export function getLoveShowLocationWallpaper(locationId: string): string {
  return LOCATION_BY_ID.get(locationId)?.backgroundImage
    || DEFAULT_LOCATION?.backgroundImage
    || locationImage('house-living-room.jpg');
}
