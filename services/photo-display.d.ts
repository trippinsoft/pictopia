import type { Media } from "@/lib/pictopia/types";
export declare function photoDisplay(media: Media, network: boolean, signal: AbortSignal): Promise<string>;
export declare function videoPoster(media: Media, network: boolean, signal: AbortSignal): Promise<string | null>;
