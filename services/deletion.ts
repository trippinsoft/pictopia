import {
  storage,
  serialize,
  DELETION_ATTEMPT,
  DELETION_PENDING,
  CONFIRMED_CLEANUP,
} from "./repository";
import { MediaService } from "./media.types";
import { summarize, verdict } from "@/lib/pictopia/deletion";
import {
  DeletionAttempt,
  DeletionRecovery,
  DeletionResult,
  Media,
  PendingDeletion,
} from "@/lib/pictopia/types";
type Outcome = Pick<DeletionResult, "confirmed" | "remaining" | "uncertain">;
/**
 * Applies verified outcomes in one storage transaction: confirmed items leave the queue and are
 * counted, verified-present items stay queued, and unverifiable items move to the pending list.
 * Only ids still tracked by the journal or pending list are processed, so replaying the same
 * outcome (for example after a crash mid-way) can never count an item twice.
 */
async function commit(attemptId: string | null | undefined, outcome: Outcome): Promise<Outcome> {
  return serialize(async () => {
    const stored = await storage.getValue<DeletionAttempt | null>(DELETION_ATTEMPT);
    const attempt = attemptId !== null && stored && stored.id === attemptId ? stored : null;
    const pending = (await storage.getValue<PendingDeletion[]>(DELETION_PENDING)) ?? [];
    const tracked = new Set([...(attempt?.ids ?? []), ...pending.map((p) => p.id)]);
    const keep = (ids: string[]) => Array.from(new Set(ids.filter((id) => tracked.has(id))));
    const confirmed = keep(outcome.confirmed),
      remaining = keep(outcome.remaining).filter((id) => !confirmed.includes(id)),
      uncertain = keep(outcome.uncertain).filter(
        (id) => !confirmed.includes(id) && !remaining.includes(id),
      );
    const updates: Media[] = [];
    let bytes = 0;
    for (const id of confirmed) {
      const latest = await storage.get(id);
      bytes += latest?.size ?? attempt?.sizes?.[id] ?? pending.find((p) => p.id === id)?.size ?? 0;
      if (latest)
        updates.push({ ...latest, active: false, decision: undefined, deletedAt: Date.now() });
    }
    const resolved = new Set([...confirmed, ...remaining]);
    const nextPending = pending.filter((p) => !resolved.has(p.id));
    for (const id of uncertain)
      if (!nextPending.some((p) => p.id === id))
        nextPending.push({
          id,
          size: attempt?.sizes?.[id],
          scope: attempt?.scope ?? "none",
          os: attempt?.phase === "returned" ? (attempt.os ?? "unknown") : "unknown",
          since: Date.now(),
        });
    const cleanup = (await storage.getValue<{ count: number; estimatedBytes: number }>(
      CONFIRMED_CLEANUP,
    )) ?? { count: 0, estimatedBytes: 0 };
    await storage.put(updates, {
      ...(attempt ? { [DELETION_ATTEMPT]: null } : {}),
      [DELETION_PENDING]: nextPending,
      ...(confirmed.length
        ? {
            [CONFIRMED_CLEANUP]: {
              count: cleanup.count + confirmed.length,
              estimatedBytes: cleanup.estimatedBytes + bytes,
            },
          }
        : {}),
    });
    return { confirmed, remaining, uncertain };
  });
}
/**
 * Re-checks an interrupted deletion journal and any items still awaiting verification against
 * the platform library. Read-only toward the OS (it never deletes) and safe to run repeatedly.
 */
export async function recoverDeletions(media: MediaService): Promise<DeletionRecovery | null> {
  const attempt = await storage.getValue<DeletionAttempt | null>(DELETION_ATTEMPT);
  const pending = (await storage.getValue<PendingDeletion[]>(DELETION_PENDING)) ?? [];
  const attemptIds = Array.isArray(attempt?.ids) ? attempt.ids : [];
  if (!attemptIds.length && !pending.length) {
    if (attempt) await serialize(() => storage.setValue(DELETION_ATTEMPT, null));
    return null;
  }
  const ids = Array.from(new Set([...attemptIds, ...pending.map((p) => p.id)]));
  const { scope, presence } = await media.inspect(ids);
  const outcome: Outcome = { confirmed: [], remaining: [], uncertain: [] };
  for (const id of ids) {
    const p = pending.find((x) => x.id === id);
    // Journal entries without a recorded OS result were interrupted before it returned.
    const os = attemptIds.includes(id)
      ? attempt?.phase === "returned"
        ? (attempt.os ?? "unknown")
        : "unknown"
      : (p?.os ?? "unknown");
    const before = attemptIds.includes(id) ? attempt?.scope : p?.scope;
    const v = verdict(presence[id] ?? "unknown", os, before, scope);
    outcome[v === "confirmed" ? "confirmed" : v === "remaining" ? "remaining" : "uncertain"].push(
      id,
    );
  }
  const applied = await commit(attempt ? (attempt.id ?? undefined) : null, outcome);
  return { interrupted: !!attemptIds.length, ...applied };
}
/**
 * Requests OS deletion of items the user explicitly confirmed. A journal is persisted before
 * the OS request and the result is applied atomically afterwards; anything that cannot be
 * verified is preserved for recovery instead of being reported as deleted.
 */
export async function deleteMarked(items: Media[], media: MediaService): Promise<DeletionResult> {
  await recoverDeletions(media);
  const current: Media[] = [];
  for (const item of items) {
    const latest = await storage.get(item.id);
    if (latest?.active && latest.decision === "delete") current.push(latest);
  }
  const empty = { requested: [], confirmed: [], remaining: [], uncertain: [], skipped: [] };
  if (!current.length) return summarize("unknown", empty);
  const id = `deletion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let journaled = false;
  try {
    const result = await media.remove(current, {
      beforeRequest: (ids, scope) =>
        serialize(async () => {
          if (await storage.getValue<DeletionAttempt | null>(DELETION_ATTEMPT))
            throw Error("Another deletion is still being checked. Try again shortly.");
          const sizes: Record<string, number> = {};
          for (const m of current) if (m.size !== undefined) sizes[m.id] = m.size;
          await storage.setValue(DELETION_ATTEMPT, {
            id,
            ids,
            sizes,
            scope,
            started: Date.now(),
            phase: "requested",
          } satisfies DeletionAttempt);
          journaled = true;
        }),
      afterRequest: (os) =>
        serialize(async () => {
          const a = await storage.getValue<DeletionAttempt | null>(DELETION_ATTEMPT);
          if (a?.id === id)
            await storage.setValue(DELETION_ATTEMPT, { ...a, phase: "returned", os });
        }),
    });
    if (!result.requested.length) return result;
    // Counting is idempotent inside commit; the user is told what verification found.
    await commit(id, result);
    return result;
  } catch (e) {
    // Never leave a journal behind silently: re-verify what we can, then surface the error.
    if (journaled) await recoverDeletions(media).catch(() => null);
    throw e instanceof Error ? e : Error("Deletion could not be verified. Your queue was kept.");
  }
}
