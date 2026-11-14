import { CLOUD_ONLY } from "@/services/media-errors";

/** Why a review video can't play right now. None of these affect review credit or discard. */
export type VideoFailure = "cloud" | "inaccessible" | "failed";

const message = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "";
const code = (error: unknown) =>
  error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";

/** Only a local-only lookup can report "in iCloud"; a failed download is a retryable failure,
 * and only a missing asset or revoked access is "inaccessible". */
export function classifyVideoError(error: unknown, download: boolean): VideoFailure {
  const text = message(error);
  if (code(error) === "VIDEO_CLOUD" || text === CLOUD_ONLY) return download ? "failed" : "cloud";
  if (/unavailable\b.*access|no longer available|changed outside|media type changed|not a video|photo access is off/i.test(text))
    return "inaccessible";
  return "failed";
}

/** Diagnostic text for the local review trace: no identifiers, paths or URLs. */
export function videoErrorDetail(error: unknown): string {
  const raw = [code(error), message(error)].filter(Boolean).join(": ") || "unknown";
  return raw
    .replace(/\b(?:ph|file|content|https?|assets-library):\/\/\S+/gi, "<uri>")
    .replace(/(?:\/[\w.-]+){2,}/g, "<path>")
    .slice(0, 200);
}

/** Android plays the MediaStore content URI (scoped-storage safe) rather than a file path. */
export function androidVideoUri(id: string): string | undefined {
  return /^\d+$/.test(id) ? `content://media/external/video/media/${id}` : undefined;
}

/** iOS sources to try in order. A Photos library file path only opens while PhotoKit's access
 * grant is alive, so a local library video plays through expo-video's own `ph://` loader
 * first (it keeps that grant), with the path as the fallback. Pictopia's own slow-motion
 * export and streaming URLs are used as they are. After an explicit iCloud download the
 * fetched copy comes first, so the `ph://` loader never fetches the original a second time. */
export function iosPlaybackSources(resolved: string, id: string, download: boolean): string[] {
  const library = `ph://${id}`;
  if (!resolved.startsWith("file:") || resolved.includes("/pictopia-video/")) return [resolved];
  return download ? [resolved, library] : [library, resolved];
}
