import type { Media } from "@/lib/pictopia/types";
export declare function videoSource(media: Media, network: boolean, signal: AbortSignal): Promise<{ uri: string; size?: number; systemFavorite?: boolean; /** Tried in order if the player can't open `uri`. */ alternates?: string[] }>;
