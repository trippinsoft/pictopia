import React, { useState, useRef } from "react";
import { MediaImage } from "./media-image";
import { ZoomPhotoProps } from "./zoom-photo.types";
export function ZoomPhoto({ media }: ZoomPhotoProps) {
  const [scale, setScale] = useState(1),
    [position, setPosition] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    lastDistance = useRef(0),
    last = useRef({ x: 0, y: 0 });
  const outerStyle: React.CSSProperties = {
    flex: 1,
    overflow: "hidden",
    touchAction: "none",
    cursor: scale > 1 ? "grab" : "zoom-in",
    display: "flex",
  };
  const transformStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    transform: `translate(${position.x}px,${position.y}px) scale(${scale})`,
    transformOrigin: "center",
  };
  return (
    <div
      aria-label="Zoomable photo"
      style={outerStyle}
      onDoubleClick={() => {
        setScale((s) => (s > 1 ? 1 : 2));
        setPosition({ x: 0, y: 0 });
      }}
      onWheel={(e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          setScale((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.01)));
        }
      }}
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        last.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const all = [...pointers.current.values()];
        if (all.length === 2) {
          const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
          if (lastDistance.current)
            setScale((s) => Math.min(5, Math.max(1, (s * distance) / lastDistance.current)));
          lastDistance.current = distance;
        } else if (scale > 1) {
          setPosition((p) => ({
            x: p.x + e.clientX - last.current.x,
            y: p.y + e.clientY - last.current.y,
          }));
          last.current = { x: e.clientX, y: e.clientY };
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        lastDistance.current = 0;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        lastDistance.current = 0;
      }}
    >
      <div data-testid="photo-transform" style={transformStyle}>
        <MediaImage media={media} fit="contain" style={fillStyle} />
      </div>
    </div>
  );
}

const fillStyle = { flex: 1 };
