import { serialize, storage } from "./repository";
import { REVIEW_STEPS, type ReviewGuidance, type ReviewStep } from "@/lib/pictopia/review-guidance";
const KEY = "reviewGuidance:v1";
export const reviewGuidance = {
  async load(): Promise<ReviewGuidance> { return (await storage.getValue<ReviewGuidance>(KEY)) ?? {}; },
  complete(step: ReviewStep) { return serialize(async () => { const next = { ...await this.load(), [step]: true }; await storage.setValue(KEY, next); return next; }); },
  skip() { return serialize(() => storage.setValue(KEY, Object.fromEntries(REVIEW_STEPS.map(step => [step, true])))); },
  reset() { return serialize(() => storage.setValue(KEY, {})); },
};
