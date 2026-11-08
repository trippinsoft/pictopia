import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { Media } from "@/lib/pictopia/types";
import { mediaService } from "@/services/media";
const native = requireOptionalNativeModule<{
  reviewDisplay?(id: string, version: string, token: string, network: boolean): Promise<string>;
  cancelReviewDisplay?(token: string): Promise<void>;
}>("PictopiaAnalysis");
let serial = 0;
/** Display-size representations only; no original exports, media decisions or size claims. */
export async function photoDisplay(media: Media, network: boolean, signal: AbortSignal): Promise<string> {
  if (Platform.OS !== "ios" || !native?.reviewDisplay)
    return (await mediaService.resolve(media)).uri;
  const token = `display:${++serial}`;
  const cancel = () => native.cancelReviewDisplay?.(token)?.catch(() => {});
  if (signal.aborted) throw Error("Cancelled");
  signal.addEventListener("abort", cancel, { once: true });
  try { return await native.reviewDisplay(media.id, String(media.modified), token, network); }
  finally { signal.removeEventListener("abort", cancel); }
}
