import type { Media } from "@/lib/pictopia/types";
export interface FavoriteState { supported: boolean; value?: boolean; reason?: string }
export interface ReviewMedia {
  favorite(media: Media): Promise<FavoriteState>;
  setFavorite(media: Media, value: boolean): Promise<boolean>;
  share(media: Media): Promise<void>;
  cancelShare(): void;
  thumbnail(media: Media): Promise<string>;
  releaseThumbnail(uri: string): void;
}
