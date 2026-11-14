/** What the device's on-device image check says about one photo. */
export interface PhotoPick { utility: boolean; score: number; faces: number }

/** Orders game candidates so paperwork (documents, receipts, cheques, screenshots) never comes
 * before real memories. With `byScore`, people, pets and places come first; otherwise the given
 * order (e.g. Which Came First's date spread) is kept. Unchecked photos sit between the two, and
 * paperwork is kept only at the very end so a small library can still play. */
export function rankForGame<T extends { id: string }>(items: readonly T[], picks: Readonly<Record<string, PhotoPick>>, byScore: boolean): T[] {
  const tier = (item: T) => { const pick = picks[item.id]; return !pick ? 1 : pick.utility ? 2 : 0; };
  const indexed = items.map((item, index) => ({ item, index, tier: tier(item), score: picks[item.id]?.score ?? 0 }));
  indexed.sort((a, b) => a.tier - b.tier || (byScore && a.tier === 0 ? b.score - a.score : 0) || a.index - b.index);
  return indexed.map(entry => entry.item);
}

/** Camera photos are HEIC/JPEG/RAW; PNG, GIF and WebP files are almost always screenshots, saved
 * graphics or memes, even when the library doesn't flag them as screenshots. Games never use them. */
export const cameraPhoto = (m: { name?: string; screenshot?: boolean }) =>
  !m.screenshot && !/\.(png|gif|webp|bmp)$/i.test(m.name ?? "") && !/^screen[ _-]?shot/i.test(m.name ?? "");
