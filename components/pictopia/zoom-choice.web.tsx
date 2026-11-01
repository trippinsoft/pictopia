import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { DOUBLE_TAP_MS, ZOOM_SNAP, clampOffset, clampScale, doubleTapTarget, focalOffset, tapSelects } from "@/lib/pictopia/zoom-math";
import type { ZoomChoiceProps } from "./zoom-choice.types";

type Zoom = { scale: number; x: number; y: number };
/** Browser counterpart of the native zoomable answer: pointer pinch, drag, double click/tap and ctrl+wheel. */
export function ZoomChoice({ children, onSelect, onPressChange }: ZoomChoiceProps) {
  const [zoom, setZoom] = useState<Zoom>({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const box = useRef<HTMLDivElement>(null), current = useRef(zoom); current.current = zoom;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const touch = useRef({ startX: 0, startY: 0, moved: 0, pinched: false, distance: 0, scale: 1, fx: 0, fy: 0, x: 0, y: 0, lastX: 0, lastY: 0 });
  const lastTap = useRef(0), pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  const size = () => ({ width: box.current?.clientWidth ?? 0, height: box.current?.clientHeight ?? 0 });
  const local = (e: { clientX: number; clientY: number }) => { const r = box.current?.getBoundingClientRect(); return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }; };
  function set(next: Zoom, smooth = false) { setAnimate(smooth); setZoom(next); }
  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const t = touch.current;
    if (pointers.current.size === 1) { Object.assign(t, { startX: e.clientX, startY: e.clientY, moved: 0, pinched: false, lastX: e.clientX, lastY: e.clientY }); onPressChange?.(true); }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()], { width, height } = size();
      Object.assign(t, { pinched: true, distance: Math.hypot(a.x - b.x, a.y - b.y), scale: current.current.scale, x: current.current.x, y: current.current.y, fx: (a.x + b.x) / 2 - width / 2, fy: (a.y + b.y) / 2 - height / 2 });
      onPressChange?.(false);
    }
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const t = touch.current, { width, height } = size();
    t.moved = Math.max(t.moved, Math.hypot(e.clientX - t.startX, e.clientY - t.startY));
    if (pointers.current.size >= 2 && t.distance) {
      const [a, b] = [...pointers.current.values()], s = clampScale(t.scale * Math.hypot(a.x - b.x, a.y - b.y) / t.distance);
      set({ scale: s, x: clampOffset(focalOffset((a.x + b.x) / 2 - width / 2, t.fx, t.x, t.scale, s), s, width), y: clampOffset(focalOffset((a.y + b.y) / 2 - height / 2, t.fy, t.y, t.scale, s), s, height) });
    } else if (pointers.current.size === 1 && current.current.scale > 1) {
      const z = current.current;
      set({ ...z, x: clampOffset(z.x + e.clientX - t.lastX, z.scale, width), y: clampOffset(z.y + e.clientY - t.lastY, z.scale, height) });
    }
    t.lastX = e.clientX; t.lastY = e.clientY;
  }
  function up(e: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pointers.current.delete(e.pointerId) || pointers.current.size) return;
    const t = touch.current;
    onPressChange?.(false);
    if (current.current.scale < ZOOM_SNAP) set({ scale: 1, x: 0, y: 0 }, true);
    if (cancelled || t.pinched || t.moved > 10) return;
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0; clearTimeout(pending.current);
      set(doubleTapTarget(current.current.scale, local(e), size()), true);
      return;
    }
    lastTap.current = now;
    if (tapSelects(current.current.scale, t.pinched, t.moved)) pending.current = setTimeout(onSelect, DOUBLE_TAP_MS);
  }
  const outer: CSSProperties = { flex: 1, display: "flex", overflow: "hidden", touchAction: "none", userSelect: "none", cursor: zoom.scale > 1 ? "grab" : "pointer" };
  const inner: CSSProperties = { flex: 1, display: "flex", transform: `translate(${zoom.x}px,${zoom.y}px) scale(${zoom.scale})`, transformOrigin: "center", transition: animate ? "transform 220ms ease-out" : undefined };
  return <div ref={box} style={outer} onPointerDown={down} onPointerMove={move} onPointerUp={e => up(e)} onPointerCancel={e => up(e, true)}
    onWheel={e => { if (!e.ctrlKey) return; e.preventDefault(); const z = current.current, s = clampScale(z.scale - e.deltaY * 0.01), { width, height } = size(); set(s < ZOOM_SNAP ? { scale: 1, x: 0, y: 0 } : { scale: s, x: clampOffset(z.x, s, width), y: clampOffset(z.y, s, height) }); }}>
    <div style={inner}>{children}</div>
  </div>;
}
