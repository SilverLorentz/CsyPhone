import { describe, expect, it } from 'vitest';
import {
  DATE_LOCATION_POOL,
  HOUSE_LOCATIONS,
  LOVE_SHOW_LOCATION_BG_BASE,
  LOVE_SHOW_MAIN_SCENE_IMAGE_REQUIREMENTS,
  SPECIAL_SCENE_LOCATIONS,
  getLoveShowLocationGradient,
  getLoveShowLocationWallpaper,
} from './loveshowLocations';
import { LOVE_SHOW_THEATER_LOCATIONS } from './loveshowTheaterLocations';

describe('LoveShow location visuals', () => {
  it('lists the current scene image slots without duplicating ids', () => {
    const mainIds = LOVE_SHOW_MAIN_SCENE_IMAGE_REQUIREMENTS.map(item => item.id);
    const theaterIds = LOVE_SHOW_THEATER_LOCATIONS.map(item => item.id);

    expect(HOUSE_LOCATIONS).toHaveLength(6);
    expect(SPECIAL_SCENE_LOCATIONS).toHaveLength(2);
    expect(DATE_LOCATION_POOL).toHaveLength(12);
    expect(LOVE_SHOW_THEATER_LOCATIONS).toHaveLength(15);
    expect(LOVE_SHOW_MAIN_SCENE_IMAGE_REQUIREMENTS).toHaveLength(20);
    expect(mainIds.length + theaterIds.length).toBe(35);
    expect(new Set([...mainIds, ...theaterIds]).size).toBe(35);
  });

  it('gives every configured location an image path and gradient fallback', () => {
    expect(LOVE_SHOW_MAIN_SCENE_IMAGE_REQUIREMENTS.every(item => (
      item.imagePath.startsWith(LOVE_SHOW_LOCATION_BG_BASE)
      && item.promptHint.length > 0
    ))).toBe(true);

    expect(LOVE_SHOW_THEATER_LOCATIONS.every(location => (
      location.bgImage?.startsWith(LOVE_SHOW_LOCATION_BG_BASE)
      && Boolean(location.bgGradient)
    ))).toBe(true);
  });

  it('resolves scene visuals from the shared location table', () => {
    expect(getLoveShowLocationWallpaper('ceramic_studio')).toContain('date-ceramic-studio.jpg');
    expect(getLoveShowLocationGradient('ceramic_studio')).toContain('linear-gradient');
    expect(getLoveShowLocationWallpaper('unknown_location')).toContain('house-living-room.jpg');
  });
});
