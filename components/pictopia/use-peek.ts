import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

export const PEEK_HOLD_MS = 2000;

/** Peek: briefly lifts the tile cover to show the whole picture, then puts it back. It is purely
 * visual and never touches progress. Reduced motion swaps the fades for an instant show/hide. */
export function usePeek() {
  const peek = useSharedValue(0);
  const reduced = useReducedMotion();
  const [peeking, setPeeking] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = useCallback(() => {
    if (peeking) return;
    setPeeking(true);
    const fadeIn = reduced ? 0 : 260, fadeOut = reduced ? 0 : 450;
    peek.value = reduced ? 1 : withTiming(1, { duration: fadeIn });
    timers.current.push(setTimeout(() => {
      peek.value = reduced ? 0 : withTiming(0, { duration: fadeOut });
      timers.current.push(setTimeout(() => setPeeking(false), fadeOut));
    }, fadeIn + PEEK_HOLD_MS));
  }, [peek, peeking, reduced]);
  return { peek, peeking, start };
}
