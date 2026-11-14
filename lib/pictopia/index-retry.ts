import { LIBRARY_CHANGED } from "@/services/media-errors";

/** Full index passes allowed when the library keeps changing underneath one (e.g. iCloud
 * Photos delivering new items). Each pass is complete on its own; nothing is merged. */
export const INDEX_ATTEMPTS = 3;
export const INDEX_RETRY_MS = 1500;

/** Runs `pass` again from the start only when the library changed mid-index. Any other
 * failure, cancellation, or a third consecutive change is reported as before. */
export async function withIndexRetry<T>(
  pass: (attempt: number) => Promise<T>,
  signal: AbortSignal,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await pass(attempt); }
    catch (error) {
      const changed = error instanceof Error && error.message === LIBRARY_CHANGED;
      if (!changed || signal.aborted || attempt + 1 >= INDEX_ATTEMPTS) throw error;
      await wait(INDEX_RETRY_MS);
      if (signal.aborted) throw error;
    }
  }
}
