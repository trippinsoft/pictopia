import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { Media } from "@/lib/pictopia/types";
import { mediaService } from "@/services/media";
import { CLOUD_ONLY } from "./media-errors";
const native = requireOptionalNativeModule<{
  reviewVideoSource?(id: string, token: string): Promise<string>;
  cancelReviewDisplay?(token: string): Promise<void>;
}>("PictopiaAnalysis");
let sequence = 0;
export async function videoSource(media: Media, network: boolean, signal: AbortSignal) {
  if (signal.aborted) throw Error("Cancelled");
  try { return await mediaService.resolve(media); }
  catch (error) {
    if (!network || !(error instanceof Error) || error.message !== CLOUD_ONLY) throw error;
    if (Platform.OS !== "ios" || !native?.reviewVideoSource) return mediaService.resolve(media, { download: true });
    if (signal.aborted) throw Error("Cancelled");
    const token = `video:${++sequence}`, cancel = () => native.cancelReviewDisplay?.(token)?.catch(() => {});
    signal.addEventListener("abort", cancel, { once: true });
    try { return { uri: await native.reviewVideoSource(media.id, token) }; }
    finally { signal.removeEventListener("abort", cancel); }
  }
}
