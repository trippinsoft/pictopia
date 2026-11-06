import { storage } from "./repository";
import type { DeveloperFlags, FeatureFlag } from "@/lib/pictopia/features";
const KEY = "developerFlags:v1";
export const developerFlags = {
  async load() { return (await storage.getValue<DeveloperFlags>(KEY)) ?? {}; },
  async set(flag: FeatureFlag, on: boolean) {
    const next = { ...(await this.load()), [flag]: on };
    await storage.setValue(KEY, next);
    return next;
  },
};
