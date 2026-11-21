import { Platform } from "react-native";
import { amplitudeClient } from "@/services/amplitude-client";
import { analyticsScreen, type AnalyticsEvent } from "@/lib/pictopia/analytics-policy";
import { sanitizeSubscriptionProperties, type SubscriptionEvent } from "@/lib/pictopia/subscription-analytics";
import { ONBOARDING_VERSION, sanitizeOnboardingProperties, type OnboardingEvent } from "@/lib/pictopia/onboarding-analytics";

let initialization: Promise<void> | undefined;
let initialized = false;

// No key means no initialization, local identifier, queue, or network calls.
// Analytics is independent of library storage and must never block local work.
function initialize(): Promise<void> | undefined {
  const key = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY?.trim();
  if (!key || (Platform.OS === "web" && typeof window === "undefined")) return;
  if (!initialization) {
    initialization = amplitudeClient
      .initialize(key, process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE === "EU" ? "EU" : "US")
      .then(() => { initialized = true; })
      .catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
  }
  return initialization;
}

function emit(event: AnalyticsEvent, screen?: string, properties: Record<string, string | number | boolean> = {}): void {
  try {
    const ready = initialize();
    if (!ready) return;
    void ready.then(() => {
      amplitudeClient.track(event, {
        platform: Platform.OS,
        environment: process.env.EXPO_PUBLIC_CURRENT_ENV ?? "DEVELOPMENT",
        ...(event === "screen_viewed" && screen ? { screen } : {}),
        ...properties,
      });
    }).catch(() => {});
  } catch {
    // SDK/storage/network failures cannot interrupt the app.
  }
}

export function trackAnalytics(event: Exclude<AnalyticsEvent, "screen_viewed" | OnboardingEvent>): void {
  emit(event);
}

export function trackScreen(path: string): void {
  const screen = analyticsScreen(path);
  if (screen) emit("screen_viewed", screen);
}

export function flushAnalytics(): void {
  try {
    if (initialized) amplitudeClient.flush();
  } catch {
    // Background flush is best effort; offline use remains available.
  }
}

export function trackSubscriptionAnalytics(event: SubscriptionEvent, properties: Record<string, string | number | boolean>): void {
  emit(event, undefined, sanitizeSubscriptionProperties(properties));
}

/** Onboarding funnel events: allowlisted properties only, always tagged with the flow version. */
export function trackOnboarding(event: OnboardingEvent, properties: Record<string, unknown> = {}): void {
  emit(event, undefined, sanitizeOnboardingProperties({ ...properties, onboarding_version: ONBOARDING_VERSION }));
}
