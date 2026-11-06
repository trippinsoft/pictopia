import { Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import type { AlbumService, AlbumSummary } from "./albums.types";

const PAGE = 500;
// Album membership is read live each time: albums change outside Pictopia, and under limited
// access only the shared photos are returned, whatever the album's reported count.
export const albumService: AlbumService = {
  supported: true,
  async list() {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
    return albums
      .filter((a) => a.assetCount > 0 && (Platform.OS !== "ios" || !a.type || a.type === "album"))
      .map((a): AlbumSummary => ({ id: a.id, title: a.title, count: a.assetCount, kind: Platform.OS === "ios" ? "album" : "folder" }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
  async members(id, signal) {
    const ids: string[] = [];
    let after: string | undefined;
    for (;;) {
      if (signal?.aborted) throw Error("Cancelled");
      const page = await MediaLibrary.getAssetsAsync({ album: id, first: PAGE, after, mediaType: ["photo", "video"], sortBy: [["creationTime", false]] });
      ids.push(...page.assets.map((a) => a.id));
      if (!page.hasNextPage) return ids;
      after = page.endCursor;
    }
  },
};
