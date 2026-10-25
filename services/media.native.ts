import * as MediaLibrary from "expo-media-library";
import { requireOptionalNativeModule } from "expo-modules-core";
import { File } from "expo-file-system";
import { Linking, Platform } from "react-native";
import { MediaService } from "./media.types";
import { dateKeys } from "@/lib/flickwell/logic";
const nativeMetadata = requireOptionalNativeModule<{
  getMetadata(ids: string[]): Promise<{ id: string; favorite: boolean; screenshot: boolean }[]>;
}>("FlickWellAnalysis");
export const mediaService: MediaService = {
  async permission(request = false) {
    const p = await (request
      ? MediaLibrary.requestPermissionsAsync(false, ["photo", "video"])
      : MediaLibrary.getPermissionsAsync(false, ["photo", "video"]));
    return {
      granted: p.granted,
      limited: p.accessPrivileges === "limited",
      canAskAgain: p.canAskAgain,
      label: p.granted
        ? p.accessPrivileges === "limited"
          ? "Limited access"
          : "Full access"
        : "Not connected",
    };
  },
  async sync(onPage, onProgress, signal) {
    let after: string | undefined,
      count = 0,
      more = true;
    const screenshotAlbums = new Set<string>();
    if (Platform.OS === "android") {
      try {
        const albums = await MediaLibrary.getAlbumsAsync();
        for (const album of albums)
          if (/screenshots?/i.test(album.title)) screenshotAlbums.add(album.id);
      } catch {
        /* Album metadata is optional. */
      }
    }
    while (more && !signal.aborted) {
      const r = await MediaLibrary.getAssetsAsync({
        first: 200,
        after,
        mediaType: ["photo", "video"],
        sortBy: [["creationTime", false]],
        resolveWithFullInfo: Platform.OS === "android",
      });
      const metadata = new Map<string, { favorite: boolean; screenshot: boolean }>();
      if (nativeMetadata) {
        try {
          for (const m of await nativeMetadata.getMetadata(r.assets.map((a) => a.id)))
            metadata.set(m.id, m);
        } catch {
          /* Use platform metadata below when the module cannot query an asset. */
        }
      } else if (Platform.OS === "ios") {
        for (let offset = 0; offset < r.assets.length; offset += 20) {
          await Promise.all(
            r.assets.slice(offset, offset + 20).map(async (a) => {
              try {
                const info = await MediaLibrary.getAssetInfoAsync(a.id, {
                  shouldDownloadFromNetwork: false,
                });
                metadata.set(a.id, {
                  favorite: info.isFavorite ?? false,
                  screenshot: a.mediaSubtypes?.includes("screenshot") ?? false,
                });
              } catch {
                /* Inaccessible media is handled during review. */
              }
            }),
          );
        }
      }
      await onPage(
        r.assets.map((a) => ({
          id: a.id,
          uri: a.uri,
          name: a.filename,
          type: a.mediaType === "video" ? "video" : "photo",
          created: a.creationTime,
          modified: a.modificationTime,
          width: a.width,
          height: a.height,
          duration: a.duration,
          ...dateKeys(a.creationTime),
          favorite: false,
          livePhoto: a.mediaSubtypes?.includes("livePhoto") ?? false,
          systemFavorite: metadata.get(a.id)?.favorite,
          screenshot:
            (a.mediaSubtypes?.includes("screenshot") ?? false) ||
            metadata.get(a.id)?.screenshot === true ||
            screenshotAlbums.has(a.albumId ?? ""),
          active: true,
        })),
      );
      count += r.assets.length;
      onProgress(count, r.totalCount);
      after = r.endCursor;
      more = r.hasNextPage;
      await new Promise((r) => setTimeout(r, 0));
    }
  },
  async resolve(m) {
    const a = await MediaLibrary.getAssetInfoAsync(m.id, { shouldDownloadFromNetwork: false });
    if (
      a.creationTime !== m.created ||
      a.width !== m.width ||
      a.height !== m.height ||
      a.mediaType !== m.type
    )
      throw Error("This item changed outside FlickWell. Refresh your library before reviewing it.");
    if (a.isNetworkAsset && !a.localUri)
      throw Error("This item is in the cloud. Download it in Photos, then try again.");
    const uri = a.localUri ?? a.uri;
    let size: number | undefined;
    try {
      const f = new File(uri);
      if (f.exists) size = f.size;
    } catch {
      /* Some authorized assets have no readable local file size. */
    }
    return { uri, size, systemFavorite: a.isFavorite };
  },
  async remove(ids) {
    const p = await this.permission();
    if (!p.granted) throw Error("Photo access changed. Reconnect your library before deleting.");
    try {
      const success = await MediaLibrary.deleteAssetsAsync(ids);
      if (!success) return { confirmed: [], cancelled: true };
      const now = await this.permission();
      if (!now.granted || now.limited !== p.limited) return { confirmed: [], cancelled: false };
      const confirmed: string[] = [];
      for (const id of ids) {
        try {
          const a = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
          if (!a?.id) confirmed.push(id);
        } catch {
          /* A lookup error is not proof of deletion. Reconcile against an OS enumeration below. */
        }
      }
      if (confirmed.length !== ids.length) {
        const remaining = new Set(ids.filter((id) => !confirmed.includes(id)));
        let after: string | undefined,
          more = true;
        while (more) {
          const r = await MediaLibrary.getAssetsAsync({
            first: 200,
            after,
            mediaType: ["photo", "video"],
          });
          for (const a of r.assets) remaining.delete(a.id);
          after = r.endCursor;
          more = r.hasNextPage;
        }
        const latest = await this.permission();
        if (latest.granted && latest.limited === p.limited) confirmed.push(...remaining);
      }
      return { confirmed: [...new Set(confirmed)], cancelled: false };
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (/cancel|denied|reject/i.test(message)) return { confirmed: [], cancelled: true };
      throw Error("Deletion could not be verified. Your review queue has been kept.");
    }
  },
  listen(callback) {
    const s = MediaLibrary.addListener(callback);
    return () => s.remove();
  },
  async manageAccess() {
    const p = await this.permission();
    if (p.limited) await MediaLibrary.presentPermissionsPickerAsync(["photo", "video"]);
    else await Linking.openSettings();
  },
};
