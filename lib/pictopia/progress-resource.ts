/** One shared last-successful snapshot. Blur/unmount never cancels a durable read;
 * refresh failures retain values and remain distinct from first-load failures. */
export function createProgressResource<T>(read: () => Promise<T>) {
  let state: { value?: T; refreshing: boolean; error: boolean } = { refreshing: false, error: false };
  let pending: Promise<void> | undefined;
  let generation = 0;
  let lastRevision: number | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { state = next; listeners.forEach(fn => fn()); };
  return {
    get: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    refresh(revision?: number) {
      if (revision === undefined || revision !== lastRevision) generation++;
      if (revision !== undefined) lastRevision = revision;
      if (pending) return pending;
      publish({ ...state, refreshing: true });
      pending = Promise.resolve().then(async () => {
        let reading: number;
        do {
          reading = generation;
          try {
            const value = await read();
            publish({ value, refreshing: reading !== generation, error: false });
          } catch {
            publish({ ...state, refreshing: reading !== generation, error: true });
          }
          // A save arriving during a read needs a follow-up read. Identical tab
          // revisions coalesce, while newer revisions can never be swallowed.
        } while (reading !== generation);
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
