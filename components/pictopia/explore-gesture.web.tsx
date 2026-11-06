import { useEffect, useRef, type CSSProperties } from "react";
import { browserDragAxis } from "@/lib/pictopia/web-page-drag";
import { exploreDirection } from "@/lib/pictopia/explore";
import { withTiming } from "react-native-reanimated";
import { DOUBLE_TAP_MS, ZOOM_SNAP, clampScale, clampTo, focalOffset, panLimit, toggleZoomAt } from "@/lib/pictopia/zoom-math";
import type { ExploreGestureProps } from "./explore-gesture.types";
export function ExploreGesture({
  children,
  x,
  y,
  locked,
  enabled,
  tapEnabled,
  zoom,
  zoomed,
  onTap,
  onStart,
  onCommit,
  onCancel,
  onZoomStart,
  onZoomEnd,
}: ExploreGestureProps) {
  const box = useRef<HTMLDivElement>(null);
  const look = useRef<{ id: number; x: number; y: number; zx: number; zy: number; start: number; moved: number } | null>(null);
  const latest = useRef({ enabled, zoomed, onZoomStart, onZoomEnd });
  latest.current = { enabled, zoomed, onZoomStart, onZoomEnd };
  // A second tap within the double-tap window zooms instead; the single tap waits for it.
  const lastTap = useRef(0),
    pendingTap = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pendingTap.current), []);
  function tapped(e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }) {
    const now = Date.now();
    if (enabled && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      clearTimeout(pendingTap.current);
      if (locked.value || Math.abs(x.value) > 1) return;
      const rect = e.currentTarget.getBoundingClientRect(),
        frame = { width: rect.width, height: rect.height },
        target = toggleZoomAt(zoom.scale.value, { x: e.clientX - rect.left - frame.width / 2, y: e.clientY - rect.top - frame.height / 2 }, zoom.photo.value, frame);
      if (target.scale > 1) onZoomStart();
      zoom.scale.value = withTiming(target.scale, { duration: 220 });
      zoom.x.value = withTiming(target.x, { duration: 220 });
      zoom.y.value = withTiming(target.y, { duration: 220 });
      if (target.scale === 1) onZoomEnd();
      return;
    }
    lastTap.current = now;
    clearTimeout(pendingTap.current);
    pendingTap.current = setTimeout(onTap, DOUBLE_TAP_MS);
  }
  // Trackpad pinch arrives as ctrl+wheel. React's wheel listener is passive, so the browser
  // page zoom can only be prevented from a listener registered here.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !latest.current.enabled || locked.value || Math.abs(x.value) > 1) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect(),
        frame = { width: rect.width, height: rect.height },
        before = zoom.scale.value,
        scale = clampScale(before * Math.exp(-e.deltaY * 0.01));
      if (before <= 1 && scale > 1) latest.current.onZoomStart();
      const fx = e.clientX - rect.left - frame.width / 2,
        fy = e.clientY - rect.top - frame.height / 2,
        limit = panLimit(scale, zoom.photo.value, frame);
      if (scale < ZOOM_SNAP) {
        zoom.scale.value = 1;
        zoom.x.value = 0;
        zoom.y.value = 0;
        if (before > 1) latest.current.onZoomEnd();
        return;
      }
      zoom.scale.value = scale;
      zoom.x.value = clampTo(focalOffset(fx, fx, zoom.x.value, before, scale), limit.x);
      zoom.y.value = clampTo(focalOffset(fy, fy, zoom.y.value, before, scale), limit.y);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [locked, x, zoom]);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    lastX: number;
    time: number;
    start: number;
    vx: number;
    horizontal: boolean;
  } | null>(null);
  return (
    <div
      ref={box}
      style={zoomed ? zoomedStyle : containerStyle}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (zoomed) {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, zx: zoom.x.value, zy: zoom.y.value, start: e.timeStamp, moved: 0 };
          return;
        }
        if (!(enabled || tapEnabled) || locked.value || e.button !== 0) return;
        pointer.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          lastX: e.clientX,
          time: e.timeStamp,
          start: e.timeStamp,
          vx: 0,
          horizontal: false,
        };
      }}
      onPointerMove={(e) => {
        const l = look.current;
        if (l && l.id === e.pointerId) {
          const dx = e.clientX - l.x, dy = e.clientY - l.y, rect = e.currentTarget.getBoundingClientRect();
          const limit = panLimit(zoom.scale.value, zoom.photo.value, { width: rect.width, height: rect.height });
          l.moved = Math.max(l.moved, Math.hypot(dx, dy));
          zoom.x.value = clampTo(l.zx + dx, limit.x);
          zoom.y.value = clampTo(l.zy + dy, limit.y);
          return;
        }
        const p = pointer.current;
        if (!p || p.id !== e.pointerId || locked.value) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (!p.horizontal) {
          const axis = browserDragAxis(dx, dy);
          if (axis === "vertical") {
            pointer.current = null;
            return;
          }
          if (!axis) return;
          if (!enabled) {
            pointer.current = null;
            return;
          }
          p.horizontal = true;
          e.currentTarget.setPointerCapture(p.id);
          onStart();
        }
        const dt = e.timeStamp - p.time;
        if (dt > 0) p.vx = ((e.clientX - p.lastX) * 1000) / dt;
        p.lastX = e.clientX;
        p.time = e.timeStamp;
        x.value = dx;
        y.value = dy;
      }}
      onPointerUp={(e) => {
        const l = look.current;
        if (l && l.id === e.pointerId) {
          look.current = null;
          if (tapEnabled && l.moved <= 10 && e.timeStamp - l.start <= 300) tapped(e);
          return;
        }
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        pointer.current = null;
        if (!p.horizontal) {
          // Same limits as the native tap: a short touch that barely moved.
          if (
            tapEnabled &&
            !locked.value &&
            Math.abs(e.clientX - p.x) <= 10 &&
            Math.abs(e.clientY - p.y) <= 10 &&
            e.timeStamp - p.start <= 300
          )
            tapped(e);
          return;
        }
        const velocity = e.timeStamp - p.time < 100 ? p.vx : 0;
        const direction = exploreDirection(e.clientX - p.x, 0, velocity, 0);
        if ((direction === "left" || direction === "right") && !locked.value) {
          locked.value = true;
          onCommit(direction, velocity);
        } else onCancel();
      }}
      onPointerCancel={() => {
        look.current = null;
        const active = pointer.current?.horizontal;
        pointer.current = null;
        if (active) onCancel();
      }}
      onLostPointerCapture={() => {
        if (pointer.current?.horizontal) {
          pointer.current = null;
          onCancel();
        }
      }}
    >
      {children}
    </div>
  );
}
const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  touchAction: "pan-y",
  userSelect: "none",
};
const zoomedStyle: CSSProperties = { ...containerStyle, touchAction: "none", cursor: "grab" };
