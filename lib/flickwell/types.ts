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
  minutes?: SessionMinutes;
  elapsedMs?: number;
  finishedEarly?: boolean;
  groups?: Group[];
  history: { id: string; previous?: Decision; decision: Decision; position: number }[];
  complete: boolean;
}
export interface Preferences {
  appearance: "system" | "light" | "dark";
  haptics: boolean;
  autoplay: boolean;
  includeFavorites: boolean;
  showReviewed: boolean;
  reverseSwipe: boolean;
  onboarded: boolean;
}
export const defaultPreferences: Preferences = {
  appearance: "system",
  haptics: true,
  autoplay: false,
  includeFavorites: false,
  showReviewed: false,
  reverseSwipe: false,
  onboarded: false,
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
  kind: "monthly" | "annual" | "lifetime";
  price: string;
  amount: number;
  currency: string;
}
export interface Entitlement {
  active: boolean;
  expires: number | null;
  verifiedAt: number;
  managementURL?: string | null;
}
