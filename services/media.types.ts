import { AccessScope, DeletionResult, Media, OsDeletion, Presence } from "@/lib/pictopia/types";
import type { LibraryCensus } from "@/lib/pictopia/on-this-day-audit";
export interface Permission {
  granted: boolean;
  limited: boolean;
  canAskAgain: boolean;
  label: string;
}
export interface DeletionHooks {
  /** Persists the deletion journal. The OS request is never made if this rejects. */
  beforeRequest(ids: string[], scope: AccessScope): Promise<void>;
  afterRequest(os: OsDeletion): Promise<void>;
}
export interface MediaService {
  permission(request?: boolean): Promise<Permission>;
  sync(
    onPage: (items: Media[]) => Promise<void>,
    onProgress: (count: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<void | { metadataFailures: string[] }>;
  /** `download` fetches an iCloud original; without it a cloud-only item fails with `CLOUD_ONLY`. */
  resolve(m: Media, options?: { download?: boolean }): Promise<{ uri: string; size?: number; systemFavorite?: boolean }>;
  /** Known local byte size only; never downloads or hashes an original. */
  size(m: Media): Promise<number | undefined>;
  /** Read-only presence lookup against the platform library; never prompts or deletes. */
  inspect(ids: string[]): Promise<{ scope: AccessScope; presence: Record<string, Presence> }>;
  remove(items: Media[], hooks: DeletionHooks): Promise<DeletionResult>;
  listen(callback: () => void): () => void;
  manageAccess(): Promise<void>;
  /** Developer diagnostics: live platform assets on one MM-DD calendar day, read without image
   * bytes. `years` bounds the fallback enumeration on builds without the native census. */
  census?(day: string, years: number[]): Promise<LibraryCensus | undefined>;
}
