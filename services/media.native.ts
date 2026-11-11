import * as MediaLibrary from "expo-media-library";
import { requireOptionalNativeModule } from "expo-modules-core";
import { File } from "expo-file-system";
import { Linking, Platform } from "react-native";
import { MediaService } from "./media.types";
import { CLOUD_ONLY } from "./media-errors";
import { knownMediaSize } from "@/lib/pictopia/storage-size";
import { dateKeys } from "@/lib/pictopia/logic";
import { accessScope, classifyDeletion, deletionErrorKind } from "@/lib/pictopia/deletion";
import { OsDeletion, Presence } from "@/lib/pictopia/types";
import type { CensusAsset, LibraryCensus } from "@/lib/pictopia/on-this-day-audit";
const nativeMetadata = requireOptionalNativeModule<{
  localAssetSize?(id: string): Promise<number | null>;
  getMetadata(ids: string[]): Promise<{ id: string; favorite: boolean; screenshot: boolean }[]>;
  libraryCensus?(day: string): Promise<Omit<LibraryCensus, "scope">>;
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
          if (/^screenshots?$/i.test(album.title.trim())) screenshotAlbums.add(album.id);
      } catch {
        /* Album metadata is optional. */
      }
    }
    const seen = new Set<string>();
    const metadataFailures: string[] = [];
    let expected: number | undefined;
    while (more && !signal.aborted) {
      const r = await MediaLibrary.getAssetsAsync({
        first: 200,
        after,
        mediaType: ["photo", "video"],
        sortBy: [["creationTime", false]],
        resolveWithFullInfo: Platform.OS === "android",
      });
      if (expected !== undefined && expected !== r.totalCount) throw Error("Your library changed while indexing. Please try again.");
      expected = r.totalCount;
      for (const asset of r.assets) {
        if (seen.has(asset.id)) throw Error("Library indexing returned a repeated item. Please try again.");
        seen.add(asset.id);
      }
      if (r.hasNextPage && (!r.endCursor || r.endCursor === after || !r.assets.length)) throw Error("Library indexing stopped before it was complete. Please try again.");
      const metadata = new Map<string, { favorite: boolean; screenshot: boolean }>();
      if (nativeMetadata) {
        try {
          for (const m of await nativeMetadata.getMetadata(r.assets.map((a) => a.id)))
            metadata.set(m.id, m);
        } catch {
          /* Use platform metadata below when the module cannot query an asset. */
        }
      }
      // Also recover missing or failed module rows, not only a missing native module.
      if (Platform.OS === "ios") {
        for (let offset = 0; offset < r.assets.length; offset += 20) {
          await Promise.all(
            r.assets.slice(offset, offset + 20).map(async (a) => {
              if (metadata.has(a.id)) return;
              try {
                const info = await MediaLibrary.getAssetInfoAsync(a.id, {
                  shouldDownloadFromNetwork: false,
                });
                metadata.set(a.id, {
                  favorite: info.isFavorite ?? false,
                  screenshot: info.mediaSubtypes?.includes("screenshot") ?? false,
                });
              } catch {
                /* Inaccessible media is handled during review. */
              }
            }),
          );
        }
      }
      if (Platform.OS === "ios") metadataFailures.push(...r.assets.filter(a => !metadata.has(a.id)).map(a => a.id));
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
    if (!signal.aborted && seen.size !== expected) throw Error("Library indexing did not match the discovered total. Please try again.");
    return { metadataFailures };
  },
  async size(m) {
    const known = knownMediaSize(m);
    if (known !== undefined && Number.isFinite(known) && known > 0) return known;
    if (nativeMetadata?.localAssetSize) {
      try {
        const size = await nativeMetadata.localAssetSize(m.id);
        return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : undefined;
      } catch { return undefined; }
    }
    // Legacy builds must not export/transcode an AVComposition just to obtain its size.
    if (m.livePhoto || m.type === "video") return undefined;
    try { return (await this.resolve(m)).size; } catch { return undefined; }
  },
  async resolve(m, options) {
    const a = await MediaLibrary.getAssetInfoAsync(m.id, { shouldDownloadFromNetwork: !!options?.download });
    if (!a) throw Error("This media item is unavailable. Check library access.");
    // Rendering is a read of the current asset by its full stable ID. Edits/date
    // corrections must not reject a still-accessible photo; deletion independently
    // rechecks the immutable facts before requesting any OS operation.
    if (a.mediaType !== m.type) throw Error("This media type changed. Refresh your library.");
    if (a.isNetworkAsset && !a.localUri)
      throw Error(CLOUD_ONLY);
    const uri = a.localUri ?? a.uri;
    if (!uri) throw Error("No local media reference is available.");
    // expo-image's PhotoKit URI parser uses only the host and drops /L0/... suffixes.
    // Resolve full IDs through MediaLibrary and require its actual local file on iOS.
    if (Platform.OS === "ios" && uri.startsWith("ph://")) throw Error(CLOUD_ONLY);
    let size: number | undefined;
    try {
      const f = new File(uri);
      if (!m.livePhoto && f.exists && Number.isFinite(f.size) && f.size > 0) size = f.size;
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
  async census(day, years): Promise<LibraryCensus | undefined> {
    const scope = await currentScope();
    if (scope === "none") return undefined;
    // iOS builds with the native module read every source, hidden assets and burst frames.
    if (typeof nativeMetadata?.libraryCensus === "function") {
      const r = await nativeMetadata.libraryCensus(day);
      if (await currentScope() !== scope) throw Error("Photo access changed during the census. Run it again.");
      return { ...r, scope: "full" };
    }
    // Otherwise ask the same enumeration sync uses for each year's local calendar day. It can
    // confirm the index, not reveal what that enumeration leaves out.
    const [mm, dd] = day.split("-").map(Number);
    const onDate: CensusAsset[] = [];
    for (const year of years) {
      const start = new Date(year, mm - 1, dd, 0, 0, 0, 0);
      if (start.getMonth() !== mm - 1 || start.getDate() !== dd) continue; // February 29 in a non-leap year
      const end = new Date(year, mm - 1, dd + 1, 0, 0, 0, 0);
      let after: string | undefined;
      for (;;) {
        const r = await MediaLibrary.getAssetsAsync({
          first: 500,
          after,
          mediaType: ["photo", "video"],
          sortBy: [["creationTime", false]],
          createdAfter: start.getTime() - 1,
          createdBefore: end.getTime(),
        });
        for (const a of r.assets)
          if (dateKeys(a.creationTime).day === day)
            onDate.push({
              id: a.id,
              created: a.creationTime,
              type: a.mediaType === "video" ? "video" : a.mediaType === "photo" ? "photo" : "other",
              hidden: false,
              burstFrame: false,
              source: "library",
              screenshot: a.mediaSubtypes?.includes("screenshot") ?? false,
              livePhoto: a.mediaSubtypes?.includes("livePhoto") ?? false,
            });
        if (!r.hasNextPage || !r.endCursor || r.endCursor === after) break;
        after = r.endCursor;
      }
    }
    const all = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: ["photo", "video"] });
    return { scope: "expo", total: all.totalCount, undated: 0, onDate };
  },
  async manageAccess() {
    const p = await this.permission();
    if (p.limited) await MediaLibrary.presentPermissionsPickerAsync(["photo", "video"]);
    else await Linking.openSettings();
  },
};
