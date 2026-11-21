import { serialize, storage } from "./repository";
import type { HomeTourState } from "@/lib/pictopia/home-tour";

const KEY = "homeTour:v1";
export const homeTourStore = {
  async load(): Promise<HomeTourState> { return (await storage.getValue<HomeTourState>(KEY)) ?? {}; },
  /** Show the tour on the next Home visit. */
  start(source: "onboarding" | "settings") { return serialize(() => storage.setValue(KEY, { pending: true, source })); },
  /** The tour has appeared: it won't show again by itself, even if the app is closed mid-way. */
  shown() { return serialize(async () => storage.setValue(KEY, { ...await this.load(), pending: false, startedAt: Date.now() })); },
  finish(outcome: "completed" | "skipped") { return serialize(async () => storage.setValue(KEY, { ...await this.load(), pending: false, doneAt: Date.now(), outcome })); },
};
