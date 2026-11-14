/** Owns one player from creation through release. No React cleanup, event or late
 * promise may call a native method after disposal. Replacements are serialized. */
export interface ReviewPlayer {
  pause(): void; play(): void; release(): void;
  replaceAsync(source: string | null): Promise<void>;
  currentTime: number;
}
export class VideoLifecycle<P extends ReviewPlayer> {
  private current?: P;
  private revision = 0;
  private tail: Promise<void> = Promise.resolve();
  private replacing = 0;
  private wantsPlay = false;
  private healthy = true;
  private removers: (() => void)[] = [];
  constructor(private readonly failure: (error?: unknown) => void) {}
  attach(player: P) { this.current = player; }
  get live() { return !!this.current; }
  command(work: (player: P) => void) {
    const player = this.current;
    if (!player) return;
    try { work(player); } catch (error) { this.healthy = false; if (this.current === player) this.failure(error); }
  }
  listen(remove: () => void) { this.removers.push(remove); }
  replace(source: string | null) {
    const revision = ++this.revision;
    // A queued source change invalidates play immediately, before its microtask starts.
    this.healthy = false;
    const operation = this.tail.then(async () => {
      const player = this.current;
      if (!player || revision !== this.revision) return;
      this.replacing++; this.healthy = true;
      try { player.pause(); await player.replaceAsync(source); }
      catch (error) { this.healthy = false; if (this.current === player && revision === this.revision) this.failure(error); }
      finally { this.replacing--; if (this.current === player && revision === this.revision && this.wantsPlay && this.healthy) this.command(p => p.play()); }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  play() { this.wantsPlay = true; if (this.healthy && !this.replacing) this.command(player => player.play()); }
  pause() { this.wantsPlay = false; this.command(player => player.pause()); }
  dispose() {
    const player = this.current;
    if (!player) return;
    this.current = undefined; this.wantsPlay = false; this.revision++;
    for (const remove of this.removers.splice(0)) { try { remove(); } catch { /* already detached */ } }
    try { player.pause(); } catch { /* native failure during disposal cannot escape */ }
    // Keep the native object alive until its in-flight replacement settles. Nothing
    // may play it now; release exactly once after the outstanding native operation.
    void this.tail.finally(() => { try { player.release(); } catch { /* already released by native failure */ } });
  }
}
