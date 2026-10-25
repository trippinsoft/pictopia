import { Media, Query, Month, Stats } from "@/lib/pictopia/types";
export interface Storage {
  init(): Promise<void>;
  get(id: string): Promise<Media | undefined>;
  query(q: Query): Promise<Media[]>;
  put(items: Media[], values?: Record<string, unknown>): Promise<void>;
  getValue<T>(key: string): Promise<T | undefined>;
  setValue(key: string, value: unknown): Promise<void>;
  stats(): Promise<Stats>;
  months(): Promise<Month[]>;
}
