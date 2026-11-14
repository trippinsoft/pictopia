import { Media, Query, Month, Stats } from "@/lib/pictopia/types";
export interface LibraryProgress {
  accessible: number; accessibleExplored: number;
  explored: number; remaining: number; pending: number; deleted: number; deletedBytes: number; unknownSizes: number;
}
export interface CalendarProgress { key: string; total: number; explored: number; remaining: number; coverId?: string; }
/** Memory Wall month: `total`/`explored`/`remaining` cover accessible photos exactly like
 * CalendarProgress; `cleared` adds photos whose deletion the phone confirmed, so deleting
 * never erases review progress. Videos and photos removed outside Pictopia are excluded. */
export interface WallMonth extends CalendarProgress { cleared: number; }
export interface Storage {
  calendarProgress(screenshotsOnly?: boolean): Promise<CalendarProgress[]>;
  progress(): Promise<LibraryProgress>;
  /** Photo months for the Memory Wall (see WallMonth); includes months that only hold confirmed deletions. */
  memoryWall(): Promise<WallMonth[]>;
  /** Accessible videos and how many have been explored; kept apart from photo progress. */
  videoProgress(): Promise<{ total: number; explored: number; remaining: number }>;
  migrateSeen(): Promise<void>;
  init(): Promise<void>;
  get(id: string): Promise<Media | undefined>;
  query(q: Query): Promise<Media[]>;
  /** Uncapped count and known size of everything matching `q` (verified deletions excluded). */
  count(q: Query): Promise<{ total: number; bytes: number }>;
  put(items: Media[], values?: Record<string, unknown>): Promise<void>;
  getValue<T>(key: string): Promise<T | undefined>;
  setValue(key: string, value: unknown): Promise<void>;
  stats(): Promise<Stats>;
  months(photographsOnly?: boolean): Promise<Month[]>;
}
