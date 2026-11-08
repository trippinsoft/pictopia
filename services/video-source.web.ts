import type { Media } from "@/lib/pictopia/types";
import { mediaService } from "@/services/media";
export async function videoSource(media: Media, _network: boolean, signal: AbortSignal) {
  if (signal.aborted) throw Error("Cancelled");
  return mediaService.resolve(media);
}
