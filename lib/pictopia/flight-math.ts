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
  /** Carries the swipe's own momentum: the curve leaves `from` heading this way, at the
   * speed the finger released it. */
  control: FlightPoint;
  /** Just below the trash, so the photograph drops into the can from underneath. */
  approach: FlightPoint;
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
/** Long enough to read as one flowing arc, short enough to stay out of the next swipe's way. */
export const FLIGHT_MIN = 340;
export const FLIGHT_MAX = 420;
/** A reduced-motion discard is a brief fade in place, with no travel. */
export const FLIGHT_REDUCED = 160;
/** How far past the finger the momentum may carry it, as a share of the photograph's width,
 * and how far from the middle the arc may reach at all: fast flicks stay watchable. */
const FLIGHT_CARRY = 0.45;
const FLIGHT_SWING = 0.9;
/** Even a slow release keeps drifting the way it was pushed before it turns. */
const FLIGHT_NUDGE = 0.12;

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
  const duration = Math.round(Math.max(FLIGHT_MIN, FLIGHT_MAX - speed * 0.03));
  // A cubic Bézier leaves its start at 3·(control − from) per unit of time, so this control
  // point continues the photograph at exactly the speed the finger let go of it: no stop, no
  // restart, just one arc that bends from the throw into the can.
  const carry = Math.min(FLIGHT_CARRY * frame.width, Math.max(FLIGHT_NUDGE * frame.width, (speed * duration) / 1000 / 3));
  const reach = Math.max(-FLIGHT_SWING * frame.width, Math.min(FLIGHT_SWING * frame.width, offset.x + sign * carry));
  const rise = to.y - offset.y;
  return {
    from: offset,
    control: { x: reach, y: offset.y + rise * 0.08 },
    approach: { x: to.x, y: to.y - rise * 0.35 },
    to,
    scale: Math.min(1, FLIGHT_MINIATURE / Math.max(1, frame.width)),
    rotate: offset.x / 22,
    duration,
  };
}
/** The photograph's transform partway along the path. `t` runs 0 → 1. */
export function flightAt(path: FlightPath, t: number) {
  "worklet";
  const p = Math.min(1, Math.max(0, t));
  const u = 1 - p;
  // Cubic Bézier: the swipe's own momentum bends smoothly into the fall toward the trash.
  const cubic = (from: number, control: number, approach: number, to: number) =>
    u * u * u * from + 3 * u * u * p * control + 3 * u * p * p * approach + p * p * p * to;
  return {
    x: cubic(path.from.x, path.control.x, path.approach.x, path.to.x),
    y: cubic(path.from.y, path.control.y, path.approach.y, path.to.y),
    // Equal scale change for every equal slice of time; travel may ease separately.
    scale: 1 + (path.scale - 1) * p,
    rotate: path.rotate * u,
    // Stay visible through the shrink, then disappear only as it enters the can.
    opacity: p < 0.94 ? 1 : Math.max(0, u / 0.06),
  };
}
