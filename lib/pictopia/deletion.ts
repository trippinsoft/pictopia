import { AccessScope, DeletionResult, OsDeletion, Presence } from "./types";
export function accessScope(p: { granted: boolean; accessPrivileges?: string }): AccessScope {
  // Anything other than an explicit "all" grant is treated as partial visibility.
  return !p.granted ? "none" : p.accessPrivileges === "all" ? "full" : "limited";
}
/**
 * Decides what a post-request lookup proves about one asset. Absence is only authoritative
 * under full access. Under limited access an asset can vanish from view without being deleted,
 * so absence counts only alongside an OS success for a request that contained the asset (it was
 * verified visible just before the request) and an unchanged access scope.
 */
export function verdict(
  presence: Presence,
  os: OsDeletion,
  before: AccessScope | undefined,
  after: AccessScope,
): "confirmed" | "remaining" | "uncertain" {
  if (presence === "present") return "remaining";
  if (presence !== "absent") return "uncertain";
  if (after === "full") return "confirmed";
  if (after === "limited" && before === "limited" && os === "success") return "confirmed";
  return "uncertain";
}
export function summarize(
  os: OsDeletion,
  r: Pick<DeletionResult, "requested" | "confirmed" | "remaining" | "uncertain" | "skipped">,
): DeletionResult {
  const status: DeletionResult["status"] = !r.requested.length
    ? "failed"
    : r.confirmed.length === r.requested.length && !r.skipped.length
      ? "confirmed"
      : r.confirmed.length
        ? "partial"
        : r.uncertain.length
          ? "uncertain"
          : os === "cancelled"
            ? "cancelled"
            : "failed";
  const { requested, confirmed, remaining, uncertain, skipped } = r;
  return { status, os, requested, confirmed, remaining, uncertain, skipped };
}
export function classifyDeletion(input: {
  requested: string[];
  skipped: string[];
  os: OsDeletion;
  before: AccessScope;
  after: AccessScope;
  presence: Record<string, Presence>;
}): DeletionResult {
  const r = { requested: input.requested, skipped: input.skipped, confirmed: [] as string[] };
  const remaining: string[] = [],
    uncertain: string[] = [];
  for (const id of input.requested) {
    const v = verdict(input.presence[id] ?? "unknown", input.os, input.before, input.after);
    (v === "confirmed" ? r.confirmed : v === "remaining" ? remaining : uncertain).push(id);
  }
  return summarize(input.os, { ...r, remaining, uncertain });
}
/** iOS reports user cancellation as PHPhotosErrorDomain 3072; Android as a write-grant refusal. */
export function deletionErrorKind(e: unknown): OsDeletion {
  const message =
    e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /3072|cancel|did ?n['’]?t grant|did not grant|not granted|reject/i.test(message)
    ? "cancelled"
    : "error";
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export function deletionMessage(r: DeletionResult) {
  if (r.status === "cancelled") return "Deletion cancelled. Everything stays in your review queue.";
  const parts: string[] = [];
  if (r.confirmed.length)
    parts.push(
      `${plural(r.confirmed.length, "item", "items")} confirmed deleted. They may remain in Recently Deleted or Trash.`,
    );
  else if (!r.uncertain.length) parts.push("Nothing was deleted. Your queue is unchanged.");
  if (r.confirmed.length && r.remaining.length)
    parts.push(
      `${plural(r.remaining.length, "item was", "items were")} not deleted and stay in your queue.`,
    );
  if (r.uncertain.length)
    parts.push(
      `${plural(r.uncertain.length, "item", "items")} could not be verified as deleted, so ${r.uncertain.length === 1 ? "it isn’t" : "they aren’t"} counted. Pictopia will check again next time it opens.`,
    );
  if (r.skipped.length)
    parts.push(
      `${plural(r.skipped.length, "item was", "items were")} unavailable or changed outside Pictopia and ${r.skipped.length === 1 ? "was" : "were"} not sent for deletion.`,
    );
  return parts.join(" ");
}
export function recoveryMessage(r: {
  interrupted: boolean;
  confirmed: string[];
  uncertain: string[];
}) {
  if (!r.interrupted && !r.confirmed.length) return null;
  const parts = [
    r.interrupted
      ? "Pictopia checked a deletion that was interrupted."
      : "Pictopia finished checking an earlier deletion.",
  ];
  if (r.confirmed.length)
    parts.push(`${plural(r.confirmed.length, "item was", "items were")} confirmed deleted.`);
  if (r.uncertain.length)
    parts.push(
      `${plural(r.uncertain.length, "item", "items")} could not be verified yet and ${r.uncertain.length === 1 ? "isn’t" : "aren’t"} counted.`,
    );
  if (!r.confirmed.length && !r.uncertain.length)
    parts.push("Nothing was deleted. Your queue is unchanged.");
  return parts.join(" ");
}
