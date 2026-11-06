/** A loaded foreground photo must stay visible this long before it earns an encounter. */
export const ENCOUNTER_DWELL_MS = 400;
const MAX_ATTEMPTS = 3;

/** Only a timestamp produced during this session can credit a departed photo. */
export function qualifiedEncounterTime(displayedAt: number | undefined, started = 0, now = Date.now()) {
  return displayedAt !== undefined && Number.isFinite(displayedAt) && displayedAt >= Math.max(1, started) && displayedAt <= now;
}

interface EncounterOptions {
  save(displayedAt: number): Promise<unknown>;
  onError(): void;
  now?: () => number;
  schedule?: (work: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

/** One photo's visibility lifecycle. Preloading alone never starts this observer.
 * Retries retain the time of the actual encounter, rather than crediting a later photo.
 * A failed qualified encounter is reported if retries run out or the user leaves. */
export function observePhotoEncounter({ save, onError, now = Date.now, schedule = setTimeout, cancel = clearTimeout }: EncounterOptions) {
  let visible = false, disposed = false, saved = false, saving = false;
  let attempts = 0, failed = false, reported = false;
  let displayedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const report = () => {
    if (!reported) { reported = true; onError(); }
  };
  const persist = async () => {
    timer = undefined;
    if (!visible || disposed || saved || saving) return;
    displayedAt ??= now();
    saving = true;
    attempts++;
    try {
      await save(displayedAt);
      saved = true;
      failed = false;
    } catch {
      failed = true;
      if (disposed || !visible || attempts >= MAX_ATTEMPTS) report();
      else timer = schedule(() => { void persist(); }, 600 * attempts);
    } finally {
      saving = false;
    }
  };
  return {
    setVisible(next: boolean) {
      if (disposed || next === visible) return;
      visible = next;
      clear();
      if (!visible) {
        if (failed) report();
        return;
      }
      if (!saved && !saving) {
        attempts = 0;
        timer = schedule(() => { void persist(); }, ENCOUNTER_DWELL_MS);
      }
    },
    dispose() {
      disposed = true;
      visible = false;
      clear();
      if (failed) report();
    },
  };
}
