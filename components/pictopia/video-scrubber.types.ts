import type { NativeGesture } from "react-native-gesture-handler";
export interface VideoScrubberProps {
  /** Seconds. */
  duration: number;
  /** The player's current position in seconds. */
  position: number;
  /** Jump playback to `seconds`; called while dragging (throttled) and on release. */
  onSeek(seconds: number): void;
  /** The feed's vertical scroll, held still while a finger is on the bar (native only). */
  nativeScroll?: NativeGesture;
}
