import { storage } from "./repository";
import {
  DEV_OVERRIDE_KEY,
  devToolsAuthorized,
  noOverride,
  validOverride,
  type DevOverride,
} from "@/lib/pictopia/entitlement";

/** Read once from the build. Expo inlines these `EXPO_PUBLIC_` values when the bundle is made,
 * so a Production build carries the literal "PRODUCTION" and can never authorize overrides. */
export const DEV_TOOLS = devToolsAuthorized({
  env: process.env.EXPO_PUBLIC_CURRENT_ENV,
  devTools: process.env.EXPO_PUBLIC_PICTOPIA_DEV_TOOLS,
  // eslint-disable-next-line no-undef -- React Native's build-time global
  dev: typeof __DEV__ !== "undefined" && __DEV__ === true,
});

type Listener = (override: DevOverride) => void;
const listeners = new Set<Listener>();

/** The persisted developer override. Unauthorized builds always get `noOverride` and cannot
 * save one, whatever is stored on the device. */
export const devOverrideStore = {
  authorized: DEV_TOOLS,
  async load(): Promise<DevOverride> {
    if (!DEV_TOOLS) return noOverride;
    return validOverride(await storage.getValue<DevOverride>(DEV_OVERRIDE_KEY));
  },
  async save(change: Partial<Omit<DevOverride, "version">>) {
    if (!DEV_TOOLS) throw Error("Developer tools aren’t available in this build.");
    const current = await this.load();
    const next = validOverride({ ...current, ...change, version: 1 });
    if ("reviewLimit" in change && change.reviewLimit === undefined) delete next.reviewLimit;
    await storage.setValue(DEV_OVERRIDE_KEY, next);
    for (const listener of listeners) listener(next);
    return next;
  },
  /** Called whenever the override changes, so open screens (e.g. a review's allowance) update. */
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  notify() {
    void this.load().then(o => { for (const listener of listeners) listener(o); });
  },
};
