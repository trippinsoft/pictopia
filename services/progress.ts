import { serialize, storage } from "./repository";
import { dailyStore } from "./daily";
import { evaluateSavedBadges } from "./badges";
import { createProgressResource } from "@/lib/pictopia/progress-resource";

/** Reads are serialized with review/deletion writes: statistics and badges cannot observe
 * different sides of a save. Only publish after every read and the badge save succeed. */
export const progressResource = createProgressResource(() => serialize(async () => {
  const [progress, months, videos, streak, activity, restores, stats] = await Promise.all([
    storage.progress(), storage.calendarProgress(), storage.videoProgress(),
    dailyStore.streak(), dailyStore.activity(), dailyStore.restores(), storage.stats(),
  ]);
  const badges = await evaluateSavedBadges(Date.now(), { progress, months });
  return { progress, months, videos, streak, activity, restores, stats, badges };
}));
