import React, { useRef } from "react";
import { commitDirection } from "@/lib/pictopia/swipe-physics";
import { SwipeGestureProps } from "./swipe-gesture.types";
export function SwipeGesture({
  children,
  x,
  y,
  enabled,
  threshold,
  onCommit,
  onCancel,
}: SwipeGestureProps) {
  const pointer = useRef<{
      id: number;
      x: number;
      y: number;
      moved: boolean;
      lastX: number;
      lastT: number;
      velocity: number;
    } | null>(null),
    suppressClick = useRef(false);
  return (
    <div
      style={containerStyle}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!enabled || e.button !== 0) return;
        pointer.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          moved: false,
          lastX: e.clientX,
          lastT: e.timeStamp,
          velocity: 0,
        };
        suppressClick.current = false;
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.x,
          dy = e.clientY - p.y;
        if (!p.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          p.moved = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        const dt = e.timeStamp - p.lastT;
        if (dt > 0) p.velocity = ((e.clientX - p.lastX) / dt) * 1000;
        p.lastX = e.clientX;
        p.lastT = e.timeStamp;
        if (p.moved) {
          x.value = dx;
          y.value = dy * 0.12;
        }
      }}
      onPointerUp={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        pointer.current = null;
        if (!p.moved) return;
        suppressClick.current = true;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        const direction = commitDirection(e.clientX - p.x, p.velocity, threshold);
        if (direction) onCommit(direction);
        else onCancel();
      }}
      onPointerCancel={() => {
        const moved = pointer.current?.moved;
        pointer.current = null;
        if (moved) onCancel();
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
  // A flex column so the card inside can fill the deck like it does on native.
  display: "flex",
  flexDirection: "column",
  touchAction: "pan-y",
  userSelect: "none",
  width: "100%",
  height: "100%",
};
