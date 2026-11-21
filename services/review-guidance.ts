import { serialize, storage } from "./repository";
import { homeTourStore } from "./home-tour";
import { type ReviewGuidance, type ReviewStep } from "@/lib/pictopia/review-guidance";

const KEY = "reviewGuidance:v1";
type SavedGuidance = ReviewGuidance & { acknowledged?: true };

export const reviewGuidance = {
  async load(): Promise<ReviewGuidance> {
    const { acknowledged, ...done } = (await storage.getValue<SavedGuidance>(KEY)) ?? {};
    if (!acknowledged && Object.keys(done).length) {
      // Older completion flags don't tell us whether the tips actually appeared.
      const tour = await homeTourStore.load();
      if (tour.source === "onboarding" && tour.outcome === "skipped") return {};
    }
    return done;
  },
  complete(step: ReviewStep) {
    return serialize(async () => {
      const next = { ...await this.load(), [step]: true };
      await storage.setValue(KEY, { ...next, acknowledged: true });
      return next;
    });
  },
  reset() { return serialize(() => storage.setValue(KEY, {})); },
};
