import * as MediaLibrary from "expo-media-library";
import { requireOptionalNativeModule } from "expo-modules-core";
import { File } from "expo-file-system";
import { Linking, Platform } from "react-native";
import { MediaService } from "./media.types";
import { dateKeys } from "@/lib/pictopia/logic";
import { accessScope, classifyDeletion, deletionErrorKind } from "@/lib/pictopia/deletion";
import { OsDeletion, Presence } from "@/lib/pictopia/types";
const nativeMetadata = requireOptionalNativeModule<{
  getMetadata(ids: string[]): Promise<{ id: string; favorite: boolean; screenshot: boolean }[]>;
}>("PictopiaAnalysis");
async function currentScope() {
  return accessScope(await MediaLibrary.getPermissionsAsync(false, ["photo", "video"]));
}
/**
 * Looks up each asset by identifier. A null result means "not visible to Pictopia", which is
 * only proof of absence under full access; lookup errors are always unknown.
 */
async function lookup(ids: string[]) {
  const scope = await currentScope();
  const presence: Record<string, Presence> = {};
  const info = new Map<string, MediaLibrary.AssetInfo>();
  for (const id of ids) presence[id] = "unknown";
  if (scope === "none") return { scope, presence, info };
  for (let offset = 0; offset < ids.length; offset += 20)
    await Promise.all(
      ids.slice(offset, offset + 20).map(async (id) => {
        try {
          const a = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
          if (a == null) presence[id] = "absent";
          else if (a.id === id) {
            presence[id] = "present";
            info.set(id, a);
          }
        } catch {
          /* A failed lookup proves nothing either way. */
        }
      }),
    );
  // A scope change during the lookups makes every absence ambiguous.
  if ((await currentScope()) !== scope)
    for (const id of ids) if (presence[id] === "absent") presence[id] = "unknown";
  return { scope, presence, info };
}
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
      throw Error("This item changed outside Pictopia. Refresh your library before reviewing it.");
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
  async inspect(ids) {
    const { scope, presence } = await lookup(ids);
    return { scope, presence };
  },
  async remove(items, hooks) {
    const before = await lookup(items.map((m) => m.id));
    if (before.scope === "none")
      throw Error("Photo access changed. Reconnect your library before deleting.");
    const requested: string[] = [],
      skipped: string[] = [];
    for (const m of items) {
      const a = before.info.get(m.id);
      // Only assets verified visible and unchanged right now are sent to the OS.
      if (
        before.presence[m.id] === "present" &&
        a &&
        a.creationTime === m.created &&
        a.width === m.width &&
        a.height === m.height &&
        a.mediaType === m.type
      )
        requested.push(m.id);
      else skipped.push(m.id);
    }
    if (!requested.length)
      return classifyDeletion({
        requested,
        skipped,
        os: "unknown",
        before: before.scope,
        after: before.scope,
        presence: before.presence,
      });
    await hooks.beforeRequest(requested, before.scope);
    let os: OsDeletion;
    try {
      // iOS rejects on cancellation; Android deletes item by item and may reject part-way.
      os = (await MediaLibrary.deleteAssetsAsync(requested)) ? "success" : "cancelled";
    } catch (e) {
      os = deletionErrorKind(e);
    }
    try {
      await hooks.afterRequest(os);
    } catch {
      /* Recovery treats an unrecorded OS result as unknown, which is more conservative. */
    }
    const after = await lookup(requested);
    return classifyDeletion({
      requested,
      skipped,
      os,
      before: before.scope,
      after: after.scope,
      presence: after.presence,
    });
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
