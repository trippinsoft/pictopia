import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./ui";

export const clock = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};
const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** Live seeks while dragging are spaced out so the player isn't flooded. */
const SEEK_EVERY_MS = 120;

/** Shared scrubbing state: the finger's position wins while dragging, and after release the
 * bar holds the chosen time until the player reports it (time updates arrive every 0.5 s). */
export function useScrub(duration: number, position: number, onSeek: (seconds: number) => void) {
  const [drag, setDrag] = useState<number | null>(null), [held, setHeld] = useState<number | null>(null);
  const last = useRef(0), current = useRef<number | null>(null), seek = useRef(onSeek); seek.current = onSeek;
  useEffect(() => {
    if (held === null) return;
    if (Math.abs(position - held) < 0.75) { setHeld(null); return; }
    const timer = setTimeout(() => setHeld(null), 1500);
    return () => clearTimeout(timer);
  }, [held, position]);
  const at = (fraction: number) => clamp(fraction) * Math.max(0, duration);
  return {
    shown: drag ?? held ?? position,
    dragging: drag !== null,
    move(fraction: number) {
      const seconds = at(fraction);
      current.current = seconds; setDrag(seconds);
      const now = Date.now();
      if (now - last.current >= SEEK_EVERY_MS) { last.current = now; seek.current(seconds); }
    },
    end(fraction?: number) {
      // Release and finalize both arrive; only the first one (with a drag under way) seeks.
      if (current.current === null) return;
      const seconds = fraction === undefined ? current.current : at(fraction);
      current.current = null; setDrag(null);
      seek.current(seconds); setHeld(seconds);
    },
  };
}

/** The visual bar: elapsed / total and a track with a thumb. `track` wraps the touch area. */
export function ScrubberBar({ shown, duration, dragging, track }: {
  shown: number; duration: number; dragging: boolean;
  track: (children: ReactNode) => ReactNode;
}) {
  const fraction = duration > 0 ? clamp(shown / duration) : 0;
  return (
    <View className="absolute bottom-3 left-3 right-3 h-11 flex-row items-center gap-3 rounded-full bg-black/55 pl-4 pr-3">
      <Text className="text-caption text-white" style={{ fontVariant: ["tabular-nums"] }}>{clock(shown)} / {clock(duration)}</Text>
      {track(
        <View pointerEvents="none" className="h-11 flex-1 justify-center">
          <View className="h-1 overflow-hidden rounded-full bg-white/30">
            <View className="h-1 bg-white" style={{ width: `${fraction * 100}%` }} />
          </View>
          <View
            className={dragging ? "absolute h-5 w-5 rounded-full bg-white" : "absolute h-3.5 w-3.5 rounded-full bg-white"}
            style={{ left: `${fraction * 100}%`, marginLeft: dragging ? -10 : -7 }}
          />
        </View>,
      )}
    </View>
  );
}
