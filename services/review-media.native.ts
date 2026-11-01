import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { repository } from "./repository";
import type { ReviewMedia } from "./review-media.types";
const native = requireOptionalNativeModule<{
  reviewFavorite?(id: string): Promise<boolean>;
  setReviewFavorite?(id: string, value: boolean): Promise<boolean>;
  shareReviewAsset?(id: string): Promise<string>;
  cancelReviewShare?(): Promise<void>;
  reviewThumbnail?(id: string, version: string): Promise<string>;
}>("PictopiaAnalysis");
const buildRequired = "Native photo actions aren’t available in this build. Update Pictopia to use them.";
export const reviewMedia: ReviewMedia = {
  async favorite(media) {
    if (!native?.reviewFavorite || !native.setReviewFavorite) return { supported: false, value: media.systemFavorite, reason: buildRequired };
    if (Platform.OS === "android" && Number(Platform.Version) < 30) return { supported: false, reason: "Native favorites require Android 11 or later. Nothing has been changed." };
    const value = await native.reviewFavorite(media.id);
    await repository.update(media.id, latest => ({ ...latest, systemFavorite: value }));
    return { supported: true, value };
  },
  async setFavorite(media, value) {
    if (!native?.setReviewFavorite) throw Error(buildRequired);
    const saved = await native.setReviewFavorite(media.id, value);
    if (saved !== value) throw Error("Your library did not save that favorite change.");
    await repository.update(media.id, latest => ({ ...latest, systemFavorite: saved }));
    return saved;
  },
  async share(media) {
    if (!native?.shareReviewAsset) throw Error(buildRequired);
    await native.shareReviewAsset(media.id);
  },
  cancelShare() { void native?.cancelReviewShare?.().catch(() => {}); },
  async thumbnail(media) {
    if (!native?.reviewThumbnail) throw Error(buildRequired);
    return native.reviewThumbnail(media.id, String(media.modified));
  },
  releaseThumbnail() {},
};
