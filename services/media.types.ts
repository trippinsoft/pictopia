import { Media } from "@/lib/flickwell/types";
export interface Permission {
  granted: boolean;
  limited: boolean;
  canAskAgain: boolean;
  label: string;
}
export interface MediaService {
  permission(request?: boolean): Promise<Permission>;
  sync(
    onPage: (items: Media[]) => Promise<void>,
    onProgress: (count: number, total: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  resolve(m: Media): Promise<{ uri: string; size?: number; systemFavorite?: boolean }>;
  remove(ids: string[]): Promise<{ confirmed: string[]; cancelled: boolean }>;
  listen(callback: () => void): () => void;
  manageAccess(): Promise<void>;
}
