import { useRef, type CSSProperties } from "react";
import { exploreDirection } from "@/lib/pictopia/explore";
import type { ExploreGestureProps } from "./explore-gesture.types";
export function ExploreGesture({
  children,
  x,
  locked,
  enabled,
  onStart,
  onCommit,
  onCancel,
}: ExploreGestureProps) {
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    lastX: number;
    time: number;
    vx: number;
    horizontal: boolean;
  } | null>(null);
  return (
    <div
      style={containerStyle}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!enabled || locked.value || e.button !== 0) return;
        pointer.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          lastX: e.clientX,
          time: e.timeStamp,
          vx: 0,
          horizontal: false,
        };
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId || locked.value) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (!p.horizontal) {
          if (Math.abs(dy) > 12) {
            pointer.current = null;
            return;
          }
          if (Math.abs(dx) <= 12) return;
          p.horizontal = true;
          e.currentTarget.setPointerCapture(p.id);
          onStart();
        }
        const dt = e.timeStamp - p.time;
        if (dt > 0) p.vx = ((e.clientX - p.lastX) * 1000) / dt;
        p.lastX = e.clientX;
        p.time = e.timeStamp;
        x.value = dx;
      }}
      onPointerUp={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        pointer.current = null;
        if (!p.horizontal) return;
        const direction = exploreDirection(
          e.clientX - p.x,
          0,
          e.timeStamp - p.time < 100 ? p.vx : 0,
          0,
        );
        if ((direction === "left" || direction === "right") && !locked.value) {
          locked.value = true;
          onCommit(direction);
        } else onCancel();
      }}
      onPointerCancel={() => {
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
