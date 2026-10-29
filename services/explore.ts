import { storage, serialize } from "./repository";
import { mediaService } from "./media";
import { Platform } from "react-native";
import {
  createExplore,
  reduceExplore,
  selectExploreIds,
  ExploreAction,
  ExploreSession,
} from "@/lib/pictopia/explore";
import type { DeletionAttempt, PendingDeletion } from "@/lib/pictopia/types";

export const EXPLORE_KEY = "verticalExplore:v1";
/** Only writes the experiment key. No media mutations and no deletion operation. */
export const exploreStore = {
  load: () => storage.getValue<ExploreSession>(EXPLORE_KEY),
  async start() {
    return serialize(async () => {
      const existing = await this.load();
      if (existing) return existing;
      const attempt = await storage.getValue<DeletionAttempt>("deletionAttempt");
      const pending = await storage.getValue<PendingDeletion[]>("deletionPending");
      const blocked = new Set([...(attempt?.ids ?? []), ...(pending ?? []).map((p) => p.id)]);
      // Page past production queue entries rather than reducing the experiment unnecessarily.
      const candidates = [];
      for (let offset = 0; candidates.length < 200; ) {
        const page = await storage.query({ type: "photo", order: "newest", limit: 200, offset });
        candidates.push(...page.filter((m) => !blocked.has(m.id) && m.decision !== "delete"));
        offset += page.length;
        if (page.length < 200) break;
      }
      const selected = selectExploreIds(candidates);
      // Browser inspect intentionally returns unknown for deletion safety. Here we only
      // check that the user's selected local file exists; this never proves OS deletion.
      const visible: string[] =
        Platform.OS === "web"
          ? (
              await Promise.all(
                selected.map(async (id) =>
                  (await storage.getValue<Blob>(`file:${id}`)) ? id : undefined,
                ),
              )
            ).filter((id): id is string => !!id)
          : [];
      if (Platform.OS !== "web") {
        const visibility = await mediaService.inspect(selected);
        visible.push(...selected.filter((id) => visibility.presence[id] === "present"));
      }
      const session = createExplore(visible);
      if (!session.ids.length) return session; // Don't freeze an empty snapshot.
      await storage.setValue(EXPLORE_KEY, session);
      return session;
    });
  },
  /** A function action is built from the stored session inside the serialized write, so
   * queued feed updates always reference the page that is actually saved. */
  async change(action: ExploreAction | ((current: ExploreSession) => ExploreAction)) {
    return serialize(async () => {
      const current = await this.load();
      if (!current) throw Error("Open the experiment from Home to start a test.");
      const next = reduceExplore(current, typeof action === "function" ? action(current) : action);
      if (next !== current) await storage.setValue(EXPLORE_KEY, next);
      return next;
    });
  },
};
