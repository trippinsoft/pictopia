import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { Media } from "@/lib/pictopia/types";
import { androidVideoUri, iosPlaybackSources } from "@/lib/pictopia/video-playback";
import { mediaService } from "@/services/media";
import { CLOUD_ONLY } from "./media-errors";
const native = requireOptionalNativeModule<{
  reviewVideoPlayback?(id: string, token: string, network: boolean): Promise<string>;
  reviewVideoSource?(id: string, token: string): Promise<string>;
  cancelReviewDisplay?(token: string): Promise<void>;
}>("PictopiaAnalysis");
let sequence = 0;
/** One cancellable PhotoKit request: aborting stops the request and any export natively. */
async function request(start: (token: string) => Promise<string>, signal: AbortSignal) {
  if (signal.aborted) throw Error("Cancelled");
  const token = `video:${++sequence}`, cancel = () => { void native?.cancelReviewDisplay?.(token)?.catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try { return { uri: await start(token) }; }
  finally { signal.removeEventListener("abort", cancel); }
}
export async function videoSource(media: Media, network: boolean, signal: AbortSignal) {
  if (signal.aborted) throw Error("Cancelled");
  // Current iOS builds ask PhotoKit directly: local only unless `network` (an explicit tap),
  // and slow-motion/composed videos get a bounded display export instead of failing.
  const playback = native?.reviewVideoPlayback;
  if (Platform.OS === "ios" && playback) return ios((await request(token => playback(media.id, token, network), signal)).uri, media, network);
  if (Platform.OS === "android") {
    // Resolution proves the item is still present and still a video; playback reads the
    // MediaStore content URI, which works under scoped storage where raw paths may not.
    const resolved = await mediaService.resolve(media);
    const content = androidVideoUri(media.id);
    return { ...resolved, uri: content ?? resolved.uri, alternates: content && resolved.uri !== content ? [resolved.uri] : [] };
  }
  // Older iOS binaries: expo-media-library locally, then the earlier iCloud request.
  try { return ios((await mediaService.resolve(media)).uri, media, false); }
  catch (error) {
    if (!network || !(error instanceof Error) || error.message !== CLOUD_ONLY) throw error;
    const legacy = native?.reviewVideoSource;
    if (!legacy) return ios((await mediaService.resolve(media, { download: true })).uri, media, true);
    return ios((await request(token => legacy(media.id, token), signal)).uri, media, true);
  }
}
function ios(resolved: string, media: Media, download: boolean) {
  const [uri, ...alternates] = iosPlaybackSources(resolved, media.id, download);
  return { uri, alternates };
}
