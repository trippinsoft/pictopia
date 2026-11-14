import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  makeMutable,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { MediaImage } from "./media-image";
import {
  FLIGHT_REDUCED,
  flightAt,
  flightPath,
  type FlightPath,
} from "@/lib/pictopia/flight-math";
import { rememberedDisplay } from "@/lib/pictopia/display-cache";
import type { Media } from "@/lib/pictopia/types";

export interface FlightRequest {
  id: string;
  media: Media;
  displayUri?: string;
  /** How far the finger had moved the photograph when the discard was committed. */
  offset: { x: number; y: number };
  direction: "left" | "right";
  /** Horizontal gesture velocity, points per second. */
  velocity: number;
}
export interface ReclaimRequest {
  id: string;
  media: Media;
}
export interface FlightLaunch {
  /** Resolves once the flying photograph is on screen, so the card underneath can step aside
   * without a gap. Always resolves, even if nothing can be shown. */
  handoff: Promise<void>;
  landed: Promise<void>;
  /** The curve this flight follows, already running on the UI thread from the moment of
   * release. The card follows the same curve until the handoff, so there is never a pause. */
  path?: FlightPath;
  reduced?: boolean;
}
export interface DiscardFlight {
  /** Starts the flight at once, on the UI thread, from exactly where the finger let go. */
  launch(request: FlightRequest): FlightLaunch;
  /** The discard did not stick: the photograph goes back to the feed, not the trash. */
  cancel(id: string): void;
  /** Restore: a miniature flies back out of the trash to the photograph's slot. `landed`
   * resolves when it arrives so the caller reveals the real card then. Always resolves. */
  reclaim(request: ReclaimRequest): { landed: Promise<void> };
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Flight {
  key: string;
  id: string;
  media: Media;
  displayUri?: string;
  frame: Rect;
  path: FlightPath;
  reduced: boolean;
  /** Started at launch, before React renders the flying photograph, so the motion never waits. */
  progress?: SharedValue<number>;
  ready(): void;
  landed(): void;
}
/** The photograph the user swiped keeps flying after the card has handed it over: one
 * continuous shrink along a curve into the trash, on the UI thread, outliving the card and the
 * save. Several can be in the air at once; each stays tied to its own photograph. */
export function useDiscardFlights({
  geometry,
  reduced,
  onArrive,
}: {
  /** Live measurements: the photograph's frame and the trash centre, both in the layer's
   * own coordinates. Read when a flight starts, never cached. */
  geometry(): { frame?: Rect; target?: { x: number; y: number } };
  reduced: boolean;
  /** The photograph has landed in the trash. */
  onArrive(id: string): void;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  // Returning photographs (restore): a miniature flies back out of the trash into its slot.
  const [returns, setReturns] = useState<Flight[]>([]);
  // Mirrors the rendered flights so a cancel can resolve their handoffs outside the updater.
  const current = useRef(flights);
  current.current = flights;
  const currentReturns = useRef(returns);
  currentReturns.current = returns;
  const sequence = useRef(0);
  const latest = useRef({ geometry, reduced, onArrive });
  latest.current = { geometry, reduced, onArrive };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const entry of current.current) { entry.ready(); entry.landed(); }
      for (const entry of currentReturns.current) entry.landed();
    };
  }, []);
  const remove = useCallback((key: string) => {
    setFlights((entries) => entries.filter((flight) => flight.key !== key));
  }, []);
  const removeReturn = useCallback((key: string) => {
    setReturns((entries) => entries.filter((flight) => flight.key !== key));
  }, []);
  const flight = useMemo<DiscardFlight>(
    () => ({
      launch(request) {
        const { frame, target: can } = latest.current.geometry();
        if (!alive.current || !frame || !can) return { handoff: Promise.resolve(), landed: Promise.resolve() };
        // The can is measured in the layer's coordinates; the path wants it from the frame's corner.
        const target = { x: can.x - frame.x, y: can.y - frame.y };
        const low = latest.current.reduced;
        const path = low
          ? {
              ...flightPath(frame, request.offset, target, request.direction, 0),
              // A brief fade where the photograph already is, with no travel at all.
              control: request.offset,
              approach: request.offset,
              to: request.offset,
              scale: 0.92,
              duration: FLIGHT_REDUCED,
            }
          : flightPath(frame, request.offset, target, request.direction, request.velocity);
        const key = `${request.id}#${++sequence.current}`;
        let ready!: () => void, landed!: () => void;
        const handoff = new Promise<void>((resolve) => { ready = resolve; });
        const arrival = new Promise<void>((resolve) => { landed = resolve; });
        // The clock starts now, in the same frame as the release, not after React has
        // rendered the flying copy: the card rides the same curve until the copy takes over.
        const progress = makeMutable(0);
        progress.value = withTiming(1, { duration: path.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
        setFlights((entries) => [
          ...entries,
          { key, id: request.id, media: request.media, displayUri: rememberedDisplay(request.media), frame, path, reduced: low, progress, ready, landed },
        ]);
        // The handoff never blocks the next swipe, however the image behaves.
        setTimeout(ready, 160);
        return { handoff, landed: arrival, path, reduced: low };
      },
      cancel(id) {
        for (const entry of current.current) if (entry.id === id) {
          if (entry.progress) cancelAnimation(entry.progress);
          entry.ready();
          entry.landed();
        }
        setFlights((entries) => entries.filter((entry) => entry.id !== id));
      },
      reclaim(request) {
        const { frame, target: can } = latest.current.geometry();
        // No travel to animate, reduced motion, or one already on its way back: reveal at once.
        if (!alive.current || !frame || !can || latest.current.reduced || currentReturns.current.some((entry) => entry.id === request.id)) {
          return { landed: Promise.resolve() };
        }
        // Reuse the forward curve, played in reverse: the miniature starts in the can (progress
        // 1) and grows into the resting slot (progress 0, offset {0,0}), so it mirrors the throw.
        const path = flightPath(frame, { x: 0, y: 0 }, { x: can.x - frame.x, y: can.y - frame.y }, "right", 0);
        const key = `return#${request.id}#${++sequence.current}`;
        let landed!: () => void;
        const arrival = new Promise<void>((resolve) => { landed = resolve; });
        setReturns((entries) => [
          ...entries,
          { key, id: request.id, media: request.media, displayUri: rememberedDisplay(request.media), frame, path, reduced: false, ready: () => {}, landed },
        ]);
        return { landed: arrival };
      },
    }),
    [],
  );
  const layer = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((entry) => (
        <FlyingPhoto
          key={entry.key}
          flight={entry}
          onArrive={() => {
            entry.landed();
            remove(entry.key);
            latest.current.onArrive(entry.id);
          }}
        />
      ))}
      {returns.map((entry) => (
        <ReturningPhoto
          key={entry.key}
          flight={entry}
          onArrive={() => {
            entry.landed();
            removeReturn(entry.key);
          }}
        />
      ))}
    </View>
  );
  return { flight, layer, flying: flights.length, flyingIds: new Set(flights.map(entry => entry.id)) };
}
/** Carries the curve on the UI thread: one timing value drives position, scale, tilt and the
 * moment it disappears into the can, so nothing re-renders while it travels. */
function FlyingPhoto({ flight, onArrive }: { flight: Flight; onArrive(): void }) {
  // Normally already running since the release; a fallback clock covers any older caller.
  const fallback = useSharedValue(0);
  const progress = flight.progress ?? fallback;
  const landed = useRef(false);
  const shown = useRef(false);
  const land = useCallback(() => {
    if (landed.current) return;
    landed.current = true;
    onArrive();
  }, [onArrive]);
  // The copy is drawn: the next frame it is on screen, and the card can stop drawing itself.
  const show = useCallback(() => {
    if (shown.current) return;
    shown.current = true;
    globalThis.requestAnimationFrame(() => flight.ready());
  }, [flight]);
  useEffect(() => {
    if (!flight.progress)
      fallback.value = withTiming(1, { duration: flight.path.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    // A stopped animation (backgrounding, for example) must never leave a photograph stuck
    // mid-air or the count out of step.
    const watchdog = setTimeout(land, flight.path.duration + 900);
    return () => clearTimeout(watchdog);
  }, [fallback, flight, land]);
  // Lands when the shared clock reaches the can, even if this copy mounted late.
  useAnimatedReaction(
    () => progress.value >= 1,
    (done, before) => {
      if (done && !before) runOnJS(land)();
    },
  );
  const style = useAnimatedStyle(() => {
    const at = flightAt(flight.path, progress.value);
    return {
      // Reduced motion gets a plain fade over the whole, much shorter, transition.
      opacity: flight.reduced ? Math.max(0, 1 - progress.value) : at.opacity,
      transform: [
        { translateX: at.x },
        { translateY: at.y },
        { scale: at.scale },
        { rotate: `${at.rotate}deg` },
      ],
    };
  });
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.photo,
        {
          left: flight.frame.x,
          top: flight.frame.y,
          width: flight.frame.width,
          height: flight.frame.height,
        },
        style,
      ]}
    >
      <MediaImage media={flight.displayUri ? undefined : flight.media} uri={flight.displayUri} fit="contain" style={styles.fill} onSettled={show} />
    </Animated.View>
  );
}
/** Restore's mirror of FlyingPhoto: the same curve on the UI thread, driven from the can back
 * to the slot. One timing value runs position, scale and tilt in reverse; opacity fades in so
 * the photograph grows out of the trash and settles into place. */
function ReturningPhoto({ flight, onArrive }: { flight: Flight; onArrive(): void }) {
  // Starts in the can (progress 1) and travels to the resting slot (progress 0).
  const progress = useSharedValue(1);
  const landed = useRef(false);
  const land = useCallback(() => {
    if (landed.current) return;
    landed.current = true;
    onArrive();
  }, [onArrive]);
  useEffect(() => {
    progress.value = withTiming(
      0,
      { duration: flight.path.duration, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never },
      () => runOnJS(land)(),
    );
    // A stopped animation (backgrounding) must never leave the photograph stuck or the count
    // out of step: land after the same budget the throw uses.
    const watchdog = setTimeout(land, flight.path.duration + 900);
    return () => clearTimeout(watchdog);
  }, [flight, land, progress]);
  const style = useAnimatedStyle(() => {
    const at = flightAt(flight.path, progress.value);
    return {
      // Fade in over the first stretch of the return, then hold full while it settles.
      opacity: Math.min(1, 1.15 - progress.value),
      transform: [
        { translateX: at.x },
        { translateY: at.y },
        { scale: at.scale },
        { rotate: `${at.rotate}deg` },
      ],
    };
  });
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.photo,
        {
          left: flight.frame.x,
          top: flight.frame.y,
          width: flight.frame.width,
          height: flight.frame.height,
        },
        style,
      ]}
    >
      <MediaImage media={flight.displayUri ? undefined : flight.media} uri={flight.displayUri} fit="contain" style={styles.fill} />
    </Animated.View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 }, photo: { position: "absolute" } });
