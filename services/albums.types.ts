/** A user album (iOS) or device folder (Android), as reported by the platform media library. */
export interface AlbumSummary {
  id: string;
  title: string;
  /** Item count reported by the platform; members() is authoritative under limited access. */
  count: number;
  /** iOS returns user albums; Android has no user albums, only folders (buckets). */
  kind: "album" | "folder";
}
export interface AlbumService {
  supported: boolean;
  list(): Promise<AlbumSummary[]>;
  /** Asset ids in the album (photos and videos), newest first, read live from the library. */
  members(id: string, signal?: AbortSignal): Promise<string[]>;
}
