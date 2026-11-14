import type { PhotoPick } from "@/lib/pictopia/photo-picks";
/** Browsers have no on-device image check; games keep their order. */
export async function assessPhotos(_ids: string[]): Promise<Record<string, PhotoPick>> { return {}; }
/** Browsers use the regular file check. */
export async function presentPhotos(_ids: string[]): Promise<{ present: Set<string>; screenshots: Set<string> } | undefined> { return undefined; }
