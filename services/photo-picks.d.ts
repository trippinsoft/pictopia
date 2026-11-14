import type { PhotoPick } from "@/lib/pictopia/photo-picks";
export declare function assessPhotos(ids: string[]): Promise<Record<string, PhotoPick>>;
export declare function presentPhotos(ids: string[]): Promise<{ present: Set<string>; screenshots: Set<string> } | undefined>;
