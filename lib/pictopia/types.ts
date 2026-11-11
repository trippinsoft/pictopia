export type Decision = "keep" | "delete";
export type Collection =
  | "recent"
  | "random"
  | "today"
  | "screenshots"
  | "videos"
  | "large"
  | "favorites"
  | "memory"
  | "best"
  | "quick"
  | "blurry"
  | `month:${string}`
  | `group:${string}`;
export interface Media {
  id: string;
  uri: string;
  name: string;
  type: "photo" | "video";
  created: number;
  modified: number;
  width: number;
  height: number;
  duration: number;
  month: string;
  day: string;
  size?: number;
  favorite: boolean;
  systemFavorite?: boolean;
  screenshot: boolean;
  livePhoto?: boolean;
  decision?: Decision;
  active: boolean;
  /** Set only when Pictopia verified this item was deleted from the device. */
  deletedAt?: number;
  /** First meaningful display; independent of decisions and library membership. */
  firstSeenAt?: number;
  scan?: Analysis;
  scanError?: string;
}
export interface Analysis {
  hash?: string;
  perceptual?: string;
  sharpness?: number;
  exposure?: number;
  size?: number;
  version: string;
}
export interface Query {
  offset?: number;
  limit?: number;
  order?: "newest" | "oldest" | "size";
  month?: string;
  year?: string;
  unseen?: boolean;
  cursor?: { created: number; id: string };
  before?: number;
  blurry?: boolean;
  day?: string;
  type?: "photo" | "video";
  decision?: Decision;
  unreviewed?: boolean;
  favorite?: boolean;
  excludeFavorites?: boolean;
  screenshot?: boolean;
  scanMissing?: boolean;
  hash?: string;
  ids?: string[];
  /** Diagnostics only: rows the last complete sync no longer saw are normally hidden. */
  includeInactive?: boolean;
}
export type SessionMinutes = 2 | 5 | 10;
export interface Session {
  id: string;
  collection: Collection;
  ids: string[];
  position: number;
  reviewed: number;
  kept: number;
  marked: number;
  started: number;
  activeAt?: number;
  minutes?: SessionMinutes;
  elapsedMs?: number;
  finishedEarly?: boolean;
  groups?: Group[];
  history: { id: string; previous?: Decision; decision: Decision; position: number }[];
  complete: boolean;
}
export interface Preferences {
  appearance: "system" | "light" | "dark";
  /** Playful Adventure background theme id (see theming/pastels.ts). */
  theme: string;
  haptics: boolean;
  autoplay: boolean;
  includeFavorites: boolean;
  showReviewed: boolean;
  reverseSwipe: boolean;
  onboarded: boolean;
  /** Local reminders (see lib/pictopia/reminders.ts). Only sent once the OS allows them. */
  reminders: ReminderPrefs;
}
export interface ReminderPrefs {
  /** "Don't lose your streak" on days the streak is at risk. */
  streak: boolean;
  /** Days whose calendar date has photos from earlier years. */
  onThisDay: boolean;
  /** One nudge when photos wait in Discarded. */
  discarded: boolean;
  hour: number;
  minute: number;
}
export const DEFAULT_REMINDERS: ReminderPrefs = { streak: true, onThisDay: true, discarded: true, hour: 19, minute: 0 };
export const defaultPreferences: Preferences = {
  appearance: "system",
  theme: "sky",
  haptics: true,
  autoplay: false,
  includeFavorites: false,
  showReviewed: false,
  reverseSwipe: false,
  onboarded: false,
  reminders: DEFAULT_REMINDERS,
};
export interface Stats {
  total: number;
  photos: number;
  videos: number;
  reviewed: number;
  pending: number;
  knownBytes: number;
  knownSizes: number;
  pendingBytes: number;
}
export interface Month {
  key: string;
  count: number;
  /** Still photos only (count includes videos). */
  photos?: number;
  reviewed: number;
  cover?: string;
}
export interface Group {
  id: string;
  kind: "exact" | "similar";
  ids: string[];
  best: string;
}
export interface ScanState {
  status: "idle" | "running" | "paused" | "complete";
  processed: number;
  total: number;
  skipped: number;
}
export interface Offer {
  id: string;
  kind: "weekly" | "monthly" | "annual" | "lifetime";
  price: string;
  amount: number;
  currency: string;
  /** A free trial the store says this person can start now; absent when none is offered. */
  trialDays?: number;
}
export interface Entitlement {
  active: boolean;
  expires: number | null;
  verifiedAt: number;
  managementURL?: string | null;
}
export type AccessScope = "full" | "limited" | "none";
export type Presence = "present" | "absent" | "unknown";
export type OsDeletion = "success" | "cancelled" | "error" | "unknown";
export interface DeletionResult {
  status: "confirmed" | "partial" | "cancelled" | "failed" | "uncertain";
  os: OsDeletion;
  requested: string[];
  confirmed: string[];
  remaining: string[];
  uncertain: string[];
  skipped: string[];
}
export interface DeletionAttempt {
  id?: string;
  ids: string[];
  sizes?: Record<string, number>;
  scope?: AccessScope;
  started: number;
  activeAt?: number;
  phase?: "requested" | "returned";
  os?: OsDeletion;
}
export interface PendingDeletion {
  id: string;
  size?: number;
  scope: AccessScope;
  os: OsDeletion;
  since: number;
}
export interface DeletionRecovery {
  interrupted: boolean;
  confirmed: string[];
  remaining: string[];
  uncertain: string[];
}
