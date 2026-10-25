import { AccessScope, DeletionResult, Media, OsDeletion, Presence } from "@/lib/pictopia/types";
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
  ): Promise<void>;
  resolve(m: Media): Promise<{ uri: string; size?: number; systemFavorite?: boolean }>;
  /** Read-only presence lookup against the platform library; never prompts or deletes. */
  inspect(ids: string[]): Promise<{ scope: AccessScope; presence: Record<string, Presence> }>;
  remove(items: Media[], hooks: DeletionHooks): Promise<DeletionResult>;
  listen(callback: () => void): () => void;
  manageAccess(): Promise<void>;
}
