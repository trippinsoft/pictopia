/** Release past the threshold, or a quick flick in one direction, commits a swipe. */
export function commitDirection(translation: number, velocity: number, threshold: number) {
  "worklet";
  if (translation > threshold || (velocity > 900 && translation > 24)) return 1;
  if (translation < -threshold || (velocity < -900 && translation < -24)) return -1;
  return 0;
}
/** Right means Keep unless the user reversed swipe directions in Settings. */
export function swipeDecision(direction: 1 | -1, reversed: boolean): "keep" | "delete" {
  return (direction === 1) !== reversed ? "keep" : "delete";
}
export function decisionDirection(decision: "keep" | "delete", reversed: boolean): 1 | -1 {
  return (decision === "keep") !== reversed ? 1 : -1;
}
