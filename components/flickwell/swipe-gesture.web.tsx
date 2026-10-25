import React, { useRef } from "react";
import { SwipeGestureProps } from "./swipe-gesture.types";
export function SwipeGesture({ children, x, y, enabled, onRelease }: SwipeGestureProps) {
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null),
    suppressClick = useRef(false);
  return (
    <div
      style={containerStyle}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!enabled || e.button !== 0) return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        suppressClick.current = false;
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (!p.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          p.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (p.moved) {
          x.value = dx;
          y.value = dy * 0.15;
        }
      }}
      onPointerUp={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        pointer.current = null;
        if (p.moved) {
          suppressClick.current = true;
          onRelease(e.clientX - p.x);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => {
        pointer.current = null;
        x.value = 0;
        y.value = 0;
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  touchAction: "pan-y",
  userSelect: "none",
  width: "100%",
};
