import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
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
export interface DiscardFlight {
  /** Starts the flight and resolves once the flying photograph is on screen, so the card
   * underneath can step aside without a gap. Always resolves, even if nothing can be shown. */
  launch(request: FlightRequest): { handoff: Promise<void>; landed: Promise<void> };
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
        const { frame, target } = latest.current.geometry();
        if (!alive.current || !frame || !target) return { handoff: Promise.resolve(), landed: Promise.resolve() };
        const low = latest.current.reduced;
        const path = low
          ? {
              ...flightPath(frame, request.offset, target, request.direction, 0),
              // A brief fade where the photograph already is, with no travel at all.
              control: request.offset,
              to: request.offset,
              scale: 0.92,
              duration: FLIGHT_REDUCED,
            }
          : flightPath(frame, request.offset, target, request.direction, request.velocity);
        const key = `${request.id}#${++sequence.current}`;
        let ready!: () => void, landed!: () => void;
        const handoff = new Promise<void>((resolve) => { ready = resolve; });
        const arrival = new Promise<void>((resolve) => { landed = resolve; });
        setFlights((entries) => [
          ...entries,
          { key, id: request.id, media: request.media, displayUri: rememberedDisplay(request.media), frame, path, reduced: low, ready, landed },
        ]);
        // The handoff never blocks the next swipe, however the image behaves.
        setTimeout(ready, 80);
        return { handoff, landed: arrival };
      },
      cancel(id) {
        for (const entry of current.current) if (entry.id === id) { entry.ready(); entry.landed(); }
        setFlights((entries) => entries.filter((entry) => entry.id !== id));
      },
      reclaim(request) {
        const { frame, target } = latest.current.geometry();
        // No travel to animate, reduced motion, or one already on its way back: reveal at once.
        if (!alive.current || !frame || !target || latest.current.reduced || currentReturns.current.some((entry) => entry.id === request.id)) {
          return { landed: Promise.resolve() };
        }
        // Reuse the forward curve, played in reverse: the miniature starts in the can (progress
        // 1) and grows into the resting slot (progress 0, offset {0,0}), so it mirrors the throw.
        const path = flightPath(frame, { x: 0, y: 0 }, target, "right", 0);
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
  const progress = useSharedValue(0);
  const started = useRef(false);
  const landed = useRef(false);
  const land = useCallback(() => {
    if (landed.current) return;
    landed.current = true;
    onArrive();
  }, [onArrive]);
  const begin = useCallback(() => {
    if (started.current) return;
    started.current = true;
    flight.ready();
    // Use the same linear clock for travel and scale; the curve comes from the path.
    progress.value = withTiming(1, { duration: flight.path.duration, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, () => runOnJS(land)());
    // A stopped animation (backgrounding, for example) must never leave a photograph stuck
    // mid-air or the count out of step.
  }, [flight, land, progress]);
  useEffect(() => {
    const settle = setTimeout(begin, 16);
    const watchdog = setTimeout(land, flight.path.duration + 900);
    return () => {
      clearTimeout(settle);
      clearTimeout(watchdog);
    };
  }, [begin, land, flight.path.duration]);
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
      <MediaImage media={flight.displayUri ? undefined : flight.media} uri={flight.displayUri} fit="contain" style={styles.fill} onSettled={begin} />
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
