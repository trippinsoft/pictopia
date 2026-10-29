/**
 * Counts active review time from explicit lifecycle signals. Time accrues only while every
 * signal is true: the review screen is focused, the app is active, the page is visible, and a
 * usable photo is in front of the user. Any signal change first closes the current interval, so
 * background time is never counted and nothing is counted twice. Gaps longer than `maxGap`
 * (a suspended or stalled JS thread) are dropped rather than credited.
 */
export interface ClockSignals {
  focused: boolean;
  active: boolean;
  visible: boolean;
  ready: boolean;
}
export class ReviewClock {
  private signals: ClockSignals = { focused: false, active: true, visible: true, ready: false };
  private last: number | null = null;
  /** Counted milliseconds not yet handed to persistence. */
  private pending = 0;
  constructor(
    private readonly now: () => number,
    private readonly maxGap = 3000,
  ) {}
  get counting() {
    const s = this.signals;
    return s.focused && s.active && s.visible && s.ready;
  }
  get unsaved() {
    return this.pending;
  }
  /** Credits time since the last sample if the clock was counting throughout. */
  sample() {
    const now = this.now();
    if (this.counting && this.last !== null) {
      const delta = now - this.last;
      if (delta > 0 && delta <= this.maxGap) this.pending += delta;
    }
    this.last = this.counting ? now : null;
  }
  set(next: Partial<ClockSignals>) {
    this.sample();
    this.signals = { ...this.signals, ...next };
    this.last = this.counting ? this.now() : null;
  }
  /**
   * Returns an amount to persist, or 0. Flushes in chunks the repository accepts (≤ max) once
   * enough has accumulated, or everything when forced (pause, blur, background).
   */
  take(force = false, threshold = 4000, max = 5000) {
    if (!this.pending || (!force && this.pending < threshold)) return 0;
    const amount = Math.min(max, this.pending);
    this.pending -= amount;
    return amount;
  }
  /** Starts a new session: unsaved time is dropped, lifecycle signals are kept. */
  reset() {
    this.pending = 0;
    this.last = this.counting ? this.now() : null;
  }
  /** Puts back time whose save failed so it is retried with the next flush. */
  restore(amount: number) {
    this.pending += Math.max(0, amount);
  }
}
