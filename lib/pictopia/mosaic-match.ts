import { mosaicColumns, mosaicScenes, type RGB } from "./mosaic-scenes";

export interface MosaicPhoto {
  id: string;
  rgb: RGB;
}
export interface MosaicMatch {
  score: number;
  tiles: number[];
  unique: number;
}
export interface MosaicMatches {
  scenes: MosaicMatch[];
  best: number;
}

const linear = Array.from({ length: 256 }, (_, i) => {
  const s = i / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

function oklab([red, green, blue]: RGB): RGB {
  const r = linear[red], g = linear[green], b = linear[blue];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

async function assignScene(profiles: Float32Array, targets: RGB[], checkpoint: () => Promise<void>): Promise<MosaicMatch> {
  const uses = new Uint16Array(profiles.length / 3);
  const nearby = new Uint16Array(uses.length);
  const tiles = new Array<number>(targets.length).fill(-1);
  let squaredError = 0;
  let unique = 0;
  let lastYield = performance.now();

  for (let cell = 0; cell < tiles.length; cell++) {
    if (cell % 16 === 0 && performance.now() - lastYield > 32) {
      await checkpoint();
      lastYield = performance.now();
    }
    // 197 and 768 are coprime. Walk the grid in a dispersed order to spread first picks.
    const at = (cell * 197) % tiles.length;
    const x = at % mosaicColumns, y = Math.floor(at / mosaicColumns);
    for (let row = Math.max(0, y - 2); row <= Math.min(tiles.length / mosaicColumns - 1, y + 2); row++) {
      for (let col = Math.max(0, x - 2); col <= Math.min(mosaicColumns - 1, x + 2); col++) {
        const other = tiles[row * mosaicColumns + col];
        if (other >= 0) nearby[other] = cell + 1;
      }
    }

    const [light, a, b] = oklab(targets[at]);
    let bestCost = Infinity, bestError = Infinity, selected = 0;
    for (let photo = 0, p = 0; photo < uses.length; photo++, p += 3) {
      const dl = profiles[p] - light, da = profiles[p + 1] - a, db = profiles[p + 2] - b;
      const error = dl * dl + 1.5 * (da * da + db * db);
      const paid = uses[photo];
      const cost = error + 0.0016 * paid * paid + (nearby[photo] === cell + 1 ? 0.035 : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestError = error;
        selected = photo;
      }
    }
    tiles[at] = selected;
    if (uses[selected]++ === 0) unique++;
    squaredError += bestError;
  }

  // Relative match index, with 100 reserved for an exact color match. It measures
  // the assigned natural tiles, excluding reuse penalties and any color treatment.
  const score = 100 * Math.exp(-4 * Math.sqrt(squaredError / tiles.length));
  return { score, tiles, unique };
}

export async function matchMosaicPhotos(photos: MosaicPhoto[], checkpoint: (scene: number) => Promise<void>): Promise<MosaicMatches> {
  if (!photos.length) throw new Error("No local thumbnails are available in this sample.");
  const profiles = new Float32Array(photos.length * 3);
  photos.forEach((photo, index) => profiles.set(oklab(photo.rgb), index * 3));
  const scenes: MosaicMatch[] = [];
  let best = 0;
  for (const scene of mosaicScenes) {
    const pause = () => checkpoint(scenes.length);
    await pause();
    const match = await assignScene(profiles, scene.targets, pause);
    if (match.score > scenes[best]?.score) best = scenes.length;
    scenes.push(match);
  }
  return { scenes, best };
}
