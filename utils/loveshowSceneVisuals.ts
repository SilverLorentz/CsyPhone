import { getLoveShowLocationGradient, getLoveShowLocationWallpaper } from './loveshowLocations';
import { LOVE_SHOW_THEATER_LOCATIONS } from './loveshowTheaterLocations';

const THEATER_LOCATION_BY_ID = new Map(LOVE_SHOW_THEATER_LOCATIONS.map(location => [location.id, location]));

export function getLoveShowSceneLocationGradient(locationId: string): string {
  return THEATER_LOCATION_BY_ID.get(locationId)?.bgGradient
    || getLoveShowLocationGradient(locationId);
}

export function getLoveShowSceneLocationWallpaper(locationId: string): string {
  return THEATER_LOCATION_BY_ID.get(locationId)?.bgImage
    || getLoveShowLocationWallpaper(locationId);
}
