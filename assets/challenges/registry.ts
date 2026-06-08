// Bundled landmark photos for each virtual challenge POI (downloaded from
// Wikipedia/Wikimedia Commons via scripts/dl-challenge-photos.mjs). Bundling them
// means they always render — no dependency on a live Street View / Static Maps API.
// Order matches CHALLENGES[*].pois in lib/races.ts.
export const CHALLENGE_PHOTOS: Record<string, any[]> = {
  'casa-loop': [
    require('./casa-loop/0.jpg'),
    require('./casa-loop/1.jpg'),
    require('./casa-loop/2.jpg'),
    require('./casa-loop/3.jpg'),
  ],
  'paris-marathon': [
    require('./paris-marathon/0.jpg'),
    require('./paris-marathon/1.jpg'),
    require('./paris-marathon/2.jpg'),
    require('./paris-marathon/3.jpg'),
    require('./paris-marathon/4.jpg'),
  ],
  'great-wall': [
    require('./great-wall/0.jpg'),
    require('./great-wall/1.jpg'),
    require('./great-wall/2.jpg'),
  ],
  'route66': [
    require('./route66/0.jpg'),
    require('./route66/1.jpg'),
    require('./route66/2.jpg'),
  ],
};

export function poiPhoto(challengeId: string, index: number): any | undefined {
  const arr = CHALLENGE_PHOTOS[challengeId];
  return arr ? arr[index] : undefined;
}
