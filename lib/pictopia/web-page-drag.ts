export interface PagePointer {
  id: number;
  x: number;
  y: number;
  time: number;
}
export interface PageSurface {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  style: { scrollSnapType: string };
  scrollTo(options: { top: number; behavior: "auto" | "smooth" }): void;
}
/** Browser mouse/touch dragging moves the existing scroll surface, never media cards.
 * Horizontal ownership is left to the child discard handler for the whole gesture.
 */
export class WebPageDrag {
  private pointer?: PagePointer & {
    axis?: "vertical" | "horizontal";
    origin: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    /** Page the previous release was snapping to, when this drag interrupted it. */
    base?: number;
  };
  private surface?: PageSurface;
  private snap?: string;
  private target?: number;
  private settleTimer?: ReturnType<typeof setTimeout>;
  constructor(private readonly onActivity: (active: boolean) => void) {}
  /** `pendingPage` is a page a programmatic scroll (Next, discard) is still moving to. */
  start(sample: PagePointer, surface: PageSurface, enabled: boolean, pendingPage?: number) {
    if (!enabled || this.pointer || surface.clientHeight <= 0) return false;
    // Catching a page that is still snapping continues from where it was headed, like a
    // native feed: rapid flicks each move one more page instead of being ignored. Activity
    // stays held; the snap resumes if this touch turns out to be a tap or sideways swipe.
    let base = pendingPage;
    if (this.target !== undefined && this.surface === surface) {
      base = Math.round(this.target / surface.clientHeight);
      clearTimeout(this.settleTimer);
      this.settleTimer = undefined;
      this.target = undefined;
    }
    this.surface = surface;
    this.pointer = {
      ...sample,
      origin: surface.scrollTop,
      lastY: sample.y,
      lastTime: sample.time,
      velocity: 0,
      base,
    };
    return true;
  }
  move(sample: PagePointer) {
    const p = this.pointer,
      surface = this.surface;
    if (!p || p.id !== sample.id || !surface) return false;
    const dx = sample.x - p.x,
      dy = sample.y - p.y;
    if (!p.axis) {
      // Mirrors native failure-before-activation: vertical/diagonal intent wins if
      // Y leaves the dead zone before a horizontal pan has been established.
      if (Math.abs(dy) > 12) p.axis = "vertical";
      else if (Math.abs(dx) > 12) p.axis = "horizontal";
    }
    const dt = sample.time - p.lastTime;
    if (dt > 0) p.velocity = ((sample.y - p.lastY) * 1000) / dt;
    p.lastY = sample.y;
    p.lastTime = sample.time;
    if (p.axis !== "vertical") return false;
    if (this.snap === undefined) {
      // Only a vertical drag owns the feed. Taps and sideways discards never report
      // activity, so the photo underneath stays free to start its own gesture.
      this.onActivity(true);
      this.snap = surface.style.scrollSnapType;
      surface.style.scrollSnapType = "none";
    }
    surface.scrollTop = this.clamp(p.origin - dy);
    return true;
  }
  end(sample: PagePointer, reducedMotion: boolean) {
    const p = this.pointer,
      surface = this.surface;
    if (!p || p.id !== sample.id || !surface) return false;
    this.pointer = undefined;
    if (p.axis !== "vertical") {
      this.resume(p, reducedMotion);
      return false;
    }
    const distance = p.y - sample.y;
    const velocity = sample.time - p.lastTime < 100 ? -p.velocity : 0;
    const movesPage =
      Math.abs(distance) >= surface.clientHeight * 0.32 ||
      (Math.abs(distance) >= 16 && Math.abs(velocity) >= 650 && distance * velocity > 0);
    const originPage = p.base ?? Math.round(p.origin / surface.clientHeight);
    this.finish(
      this.clamp((originPage + (movesPage ? Math.sign(distance) : 0)) * surface.clientHeight),
      reducedMotion,
    );
    return true;
  }
  cancel(reducedMotion: boolean) {
    const p = this.pointer;
    if (!p) return false;
    this.pointer = undefined;
    if (p.axis === "vertical") {
      this.finish(
        p.base === undefined ? p.origin : this.clamp(p.base * (this.surface?.clientHeight ?? 0)),
        reducedMotion,
      );
      return true;
    }
    this.resume(p, reducedMotion);
    return false;
  }
  scrolled() {
    if (
      this.target !== undefined &&
      this.surface &&
      Math.abs(this.surface.scrollTop - this.target) < 1.5
    ) {
      this.release();
    }
  }
  dispose() {
    this.pointer = undefined;
    this.release();
  }
  private resume(p: { base?: number }, reducedMotion: boolean) {
    if (p.base !== undefined && this.surface)
      this.finish(this.clamp(p.base * this.surface.clientHeight), reducedMotion);
  }
  private clamp(offset: number) {
    return Math.max(
      0,
      Math.min((this.surface?.scrollHeight ?? 0) - (this.surface?.clientHeight ?? 0), offset),
    );
  }
  private finish(target: number, reducedMotion: boolean) {
    this.target = target;
    this.surface?.scrollTo({ top: target, behavior: reducedMotion ? "auto" : "smooth" });
    this.scrolled();
    // Activity includes the release animation. Releasing it at pointer-up lets
    // the feed's quiet timer realign a fractional offset to the old saved page.
    // Poll the DOM as well: RN Web can coalesce the final onScroll notification.
    if (this.target !== undefined) this.watchSettlement(0);
  }
  private watchSettlement(elapsed: number) {
    this.settleTimer = setTimeout(() => {
      this.scrolled();
      if (this.target === undefined) return;
      if (elapsed >= 1200) {
        // Recover interrupted browser smooth scrolling without an indefinite
        // input lock. The feed will acknowledge this offset or realign safely.
        this.surface?.scrollTo({ top: this.target, behavior: "auto" });
        this.release();
        return;
      }
      this.watchSettlement(elapsed + 32);
    }, 32);
  }
  private release() {
    const active = this.snap !== undefined || this.target !== undefined;
    clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
    this.target = undefined;
    this.restoreSnap();
    if (active) this.onActivity(false);
  }
  private restoreSnap() {
    if (this.surface && this.snap !== undefined) this.surface.style.scrollSnapType = this.snap;
    this.snap = undefined;
  }
}
