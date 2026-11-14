import type { CSSProperties, PointerEvent } from "react";
import { ScrubberBar, useScrub } from "./video-scrubber-bar";
import type { VideoScrubberProps } from "./video-scrubber.types";

const fraction = (e: PointerEvent<HTMLDivElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();
  return rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
};

/** Tap or drag along the track. Pointer events stop here, so the feed's paging, sideways
 * discard and tap-to-play never see them (the pager skips `data-scrubber` targets). */
export function VideoScrubber({ duration, position, onSeek }: VideoScrubberProps) {
  const scrub = useScrub(duration, position, onSeek);
  return (
    <ScrubberBar
      shown={scrub.shown}
      duration={duration}
      dragging={scrub.dragging}
      track={children => (
        <div
          data-scrubber=""
          role="slider"
          aria-label="Video position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(scrub.shown)}
          tabIndex={0}
          style={trackStyle}
          onKeyDown={e => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            onSeek(Math.min(duration, Math.max(0, scrub.shown + (e.key === "ArrowRight" ? 5 : -5))));
          }}
          onPointerDown={e => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub.move(fraction(e));
          }}
          onPointerMove={e => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            scrub.move(fraction(e));
          }}
          onPointerUp={e => {
            e.stopPropagation();
            if (e.currentTarget.hasPointerCapture(e.pointerId)) { e.currentTarget.releasePointerCapture(e.pointerId); scrub.end(fraction(e)); }
          }}
          onPointerCancel={e => { e.stopPropagation(); scrub.end(); }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    />
  );
}
const trackStyle: CSSProperties = { display: "flex", flex: 1, touchAction: "none", cursor: "pointer", outline: "none" };
