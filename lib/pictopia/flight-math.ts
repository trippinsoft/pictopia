/** The photo-to-trash flight: one uninterrupted transform of the photograph the user just
 * swiped. Pure and worklet-safe so the whole path runs on the UI thread, and testable on its
 * own. Coordinates are offsets of the photograph's own centre from where it sits on screen,
 * so a flight never needs to know where the pager has scrolled to. */
export interface FlightPoint {
  x: number;
  y: number;
}
export interface FlightPath {
  /** Where the finger left the photograph. */
  from: FlightPoint;
  /** Pulls the curve on past the swipe before it bends toward the trash. */
  control: FlightPoint;
  /** The trash, relative to the photograph's resting centre. */
  to: FlightPoint;
  /** Final scale: the photograph shrinks to about a trash-sized miniature. */
  scale: number;
  /** The tilt the swipe left it at, in degrees. */
  rotate: number;
  duration: number;
}
/** A trash-sized miniature, in points. The photograph keeps its aspect ratio throughout, so
 * this is a scale of its displayed width. */
export const FLIGHT_MINIATURE = 38;
/** Long enough to read as a flight, short enough to stay out of the next swipe's way. */
export const FLIGHT_MIN = 300;
export const FLIGHT_MAX = 350;
/** A reduced-motion discard is a brief fade in place, with no travel. */
export const FLIGHT_REDUCED = 160;
/** How far past the middle the arc may swing, as a share of the photograph's width. */
const FLIGHT_SWING = 0.8;

export function flightPath(
  /** The photograph's displayed frame. */
  frame: { width: number; height: number },
  /** How far the finger had moved it when the discard was committed. */
  offset: FlightPoint,
  /** The trash centre, relative to the frame's top-left. */
  target: FlightPoint,
  direction: "left" | "right",
  /** Horizontal gesture velocity in points per second. */
  velocity: number,
): FlightPath {
  const centre = { x: frame.width / 2, y: frame.height / 2 };
  const to = { x: target.x - centre.x, y: target.y - centre.y };
  const speed = Math.min(Math.abs(velocity), 3200);
  const sign = direction === "left" ? -1 : 1;
  // Carries on the way it was thrown — further with a faster flick — then curves down to the
  // trash. The control point sits level with the throw, so the arc tops out early.
  const reach = frame.width * 0.3 + speed * 0.045;
  // However hard it was thrown, the photograph stays near enough to the screen to be watched
  // all the way: the arc is the point of it.
  const swing = Math.max(-FLIGHT_SWING * frame.width, Math.min(FLIGHT_SWING * frame.width, offset.x + sign * reach));
  return {
    from: offset,
    control: { x: swing, y: offset.y + to.y * 0.18 },
    to,
    scale: Math.min(1, FLIGHT_MINIATURE / Math.max(1, frame.width)),
    rotate: offset.x / 22,
    duration: Math.round(Math.max(FLIGHT_MIN, FLIGHT_MAX - speed * 0.02)),
  };
}
/** The photograph's transform partway along the path. `t` runs 0 → 1. */
export function flightAt(path: FlightPath, t: number) {
  "worklet";
  const p = Math.min(1, Math.max(0, t));
  const inverse = 1 - p;
  // Quadratic Bézier: the swipe's own momentum bends into the fall toward the trash.
  const quadratic = (from: number, control: number, to: number) =>
    inverse * inverse * from + 2 * inverse * p * control + p * p * to;
  return {
    x: quadratic(path.from.x, path.control.x, path.to.x),
    y: quadratic(path.from.y, path.control.y, path.to.y),
    // Equal scale change for every equal slice of time; travel may ease separately.
    scale: 1 + (path.scale - 1) * p,
    rotate: path.rotate * inverse,
    // Stay visible through the shrink, then disappear only as it enters the can.
    opacity: p < 0.96 ? 1 : Math.max(0, inverse / 0.04),
  };
}
