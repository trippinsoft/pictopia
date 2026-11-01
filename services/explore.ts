import { storage, serialize, deletionGuard } from "./repository";
import { mediaService } from "./media";
import { Platform } from "react-native";
import {
  createExplore,
  migrateExplore,
  reduceExplore,
  reconcileReview,
  selectExploreIds,
  ExploreAction,
  ExploreSession,
} from "@/lib/pictopia/explore";
import type { DeletionAttempt, PendingDeletion } from "@/lib/pictopia/types";

/** The key predates session version 2; older sessions are upgraded when read. */
export const EXPLORE_KEY = "verticalExplore:v1";

/** Photos in a production deletion attempt or pending confirmation stay out of exploration. */
export async function deletionBlocked() {
  const attempt = await storage.getValue<DeletionAttempt>("deletionAttempt");
  const pending = await storage.getValue<PendingDeletion[]>("deletionPending");
  return new Set([...(attempt?.ids ?? []), ...(pending ?? []).map((p) => p.id)]);
}
/** The IDs that can currently be shown, in order. Browser inspect intentionally returns
 * unknown for deletion safety, so there we only check that the user's selected local file
 * exists; this never proves OS deletion. */
export async function visibleIds(ids: string[]) {
  if (Platform.OS === "web")
    return (
      await Promise.all(
        ids.map(async (id) => ((await storage.getValue<Blob>(`file:${id}`)) ? id : undefined)),
      )
    ).filter((id): id is string => !!id);
  const visibility = await mediaService.inspect(ids);
  return ids.filter((id) => visibility.presence[id] === "present");
}

/** Adventure marks and queue decisions save atomically. OS deletion remains exclusively
 * in the confirmed queue flow. The isolated prototype still writes only EXPLORE_KEY. */
export function exploreStoreFor(key: string) {
  const review = key.startsWith("adventure:") && key.endsWith(":explore");
  return {
    async load() {
      const saved = await storage.getValue<Parameters<typeof migrateExplore>[0]>(key);
      if (!saved) return undefined;
      const session = migrateExplore(saved);
      return review ? reconcileReview(session, await Promise.all(session.ids.map(id => storage.get(id)))) : session;
    },
    /** A function action is built from the stored session inside the serialized write, so
     * queued feed updates always reference the page that is actually saved. */
    async change(action: ExploreAction | ((current: ExploreSession) => ExploreAction)) {
      return serialize(async () => {
        const current = await this.load();
        if (!current) throw Error("This adventure couldn’t be found. Return Home to choose another.");
        const built = typeof action === "function" ? action(current) : action;
        const next = reduceExplore(current, built);
        if (next !== current && current.review) {
          const changed = current.ids.filter(id => !!next.records[id]?.queued !== !!current.records[id]?.queued);
          const release = built.type !== "discard";
          const values = changed.length ? await deletionGuard(changed, release) : {};
          const updates = [];
          for (const id of changed) {
            const item = await storage.get(id);
            if (next.records[id]?.queued && (!item?.active || item.deletedAt)) throw Error("This photo is no longer available.");
            if (item && !item.deletedAt) {
              if (built.type === "discard" && item.decision === "keep") {
                const entry = next.history.find(entry => entry.id === id);
                if (entry) entry.previousDecision = "keep";
              }
              const undoPrevious = built.type === "undo" ? current.history[current.history.length - 1]?.previousDecision : undefined;
              updates.push({ ...item, decision: next.records[id]?.queued ? "delete" as const : undoPrevious });
            }
          }
          // Media decision and session mark are committed together. No OS call is made here.
          await storage.put(updates, { ...values, [key]: next });
        } else if (next !== current) await storage.setValue(key, next);
        return next;
      });
    },
  };
}
export type ExploreStore = ReturnType<typeof exploreStoreFor> & {
  start?: () => Promise<ExploreSession>;
};

/** The original 200-photo prototype: a fixed newest-first snapshot started on demand. */
export const exploreStore: ExploreStore & { start(): Promise<ExploreSession> } = {
  ...exploreStoreFor(EXPLORE_KEY),
  async start() {
    return serialize(async () => {
      const existing = await exploreStore.load();
      if (existing) return existing;
      const blocked = await deletionBlocked();
      // Page past production queue entries rather than reducing the experiment unnecessarily.
      const candidates = [];
      for (let offset = 0; candidates.length < 200; ) {
        const page = await storage.query({ type: "photo", order: "newest", limit: 200, offset });
        candidates.push(...page.filter((m) => !blocked.has(m.id) && m.decision !== "delete"));
        offset += page.length;
        if (page.length < 200) break;
      }
      const session = createExplore(await visibleIds(selectExploreIds(candidates)));
      if (!session.ids.length) return session; // Don't freeze an empty snapshot.
      await storage.setValue(EXPLORE_KEY, session);
      return session;
    });
  },
};
