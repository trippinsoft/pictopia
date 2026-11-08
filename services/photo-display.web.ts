import type { Media } from "@/lib/pictopia/types";
import { mediaService } from "@/services/media";
export async function photoDisplay(media: Media, _network: boolean, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw Error("Cancelled");
  return (await mediaService.resolve(media)).uri;
}
