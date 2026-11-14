import type { Entitlement } from "./types";
import { entitlementActive } from "./logic";

/** The single answer to "is Pictopia+ on right now?". Every premium check reads `pro` from
 * here (through the provider's `app.pro`); nothing else may grant or deny Pictopia+.
 *
 * A developer override exists only for explicitly authorized test builds. It is ignored —
 * never read, never applied — unless `devToolsAuthorized` is true, so a Production build has
 * no usable override even if a value was somehow saved on the device. */
export type DevSubscriptionMode = "auto" | "free" | "plus";
export const DEV_SUBSCRIPTION_MODES: readonly DevSubscriptionMode[] = ["auto", "free", "plus"];
/** Testing review limits the developer can pick instead of the approved daily limit. */
export const DEV_REVIEW_LIMITS = [3, 10, 25] as const;

export interface DevOverride {
  version: 1;
  mode: DevSubscriptionMode;
  /** Replaces the free daily review limit while testing; absent = the approved limit. */
  reviewLimit?: number;
}
export const DEV_OVERRIDE_KEY = "developerEntitlement:v1";
export const noOverride: DevOverride = { version: 1, mode: "auto" };

export interface BuildConfig {
  /** Draftbit's `EXPO_PUBLIC_CURRENT_ENV`: DEVELOPMENT, STAGING or PRODUCTION. */
  env: string | undefined;
  /** `EXPO_PUBLIC_PICTOPIA_DEV_TOOLS`: must be exactly "enabled" to opt a non-dev build in. */
  devTools: string | undefined;
  /** React Native's `__DEV__`: true only for JavaScript served by a development server. */
  dev: boolean;
}

/** Developer tools are authorized only when the build says so explicitly; anything missing,
 * misspelled or Production fails closed.
 * - DEVELOPMENT + a development server (web preview, simulators, dev client): allowed.
 * - STAGING + `EXPO_PUBLIC_PICTOPIA_DEV_TOOLS=enabled`: allowed (test builds, TestFlight).
 * - PRODUCTION, an unknown environment, or no environment: never. */
export function devToolsAuthorized(config: BuildConfig) {
  if (config.env === "PRODUCTION") return false;
  if (config.env === "DEVELOPMENT") return config.dev === true || config.devTools === "enabled";
  if (config.env === "STAGING") return config.devTools === "enabled";
  return false;
}

/** Accepts only a well-formed saved override; anything else is treated as no override. */
export function validOverride(value: unknown): DevOverride {
  const v = value as Partial<DevOverride> | null | undefined;
  if (!v || typeof v !== "object" || !DEV_SUBSCRIPTION_MODES.includes(v.mode as DevSubscriptionMode)) return noOverride;
  const limit = (DEV_REVIEW_LIMITS as readonly number[]).includes(v.reviewLimit as number) ? v.reviewLimit : undefined;
  return { version: 1, mode: v.mode as DevSubscriptionMode, ...(limit ? { reviewLimit: limit } : {}) };
}

export type EntitlementSource = "store" | "developer";
export interface ResolvedEntitlement {
  pro: boolean;
  /** What decided `pro`: the store's purchase record, or the developer override. */
  source: EntitlementSource;
  /** Whether the store itself reports an active Pictopia+ purchase. */
  storePro: boolean;
  /** The override actually in effect ("auto" whenever developer tools are not authorized). */
  mode: DevSubscriptionMode;
}

export function resolveEntitlement(store: Entitlement | null, override: DevOverride | null | undefined, authorized: boolean, now = Date.now()): ResolvedEntitlement {
  const storePro = entitlementActive(store, now);
  const mode = authorized ? validOverride(override).mode : "auto";
  if (mode === "auto") return { pro: storePro, source: "store", storePro, mode };
  return { pro: mode === "plus", source: "developer", storePro, mode };
}

/** The free daily review limit in effect: the approved limit unless an authorized developer
 * chose a testing limit. */
export function effectiveReviewLimit(approved: number, override: DevOverride | null | undefined, authorized: boolean) {
  return (authorized && validOverride(override).reviewLimit) || approved;
}
