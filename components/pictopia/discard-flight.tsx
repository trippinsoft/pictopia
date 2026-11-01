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
import type { Media } from "@/lib/pictopia/types";

export interface FlightRequest {
  id: string;
  media: Media;
  /** How far the finger had moved the photograph when the discard was committed. */
  offset: { x: number; y: number };
  direction: "left" | "right";
  /** Horizontal gesture velocity, points per second. */
  velocity: number;
}
export interface DiscardFlight {
  /** Starts the flight and resolves once the flying photograph is on screen, so the card
   * underneath can step aside without a gap. Always resolves, even if nothing can be shown. */
  launch(request: FlightRequest): { handoff: Promise<void>; landed: Promise<void> };
  /** The discard did not stick: the photograph goes back to the feed, not the trash. */
  cancel(id: string): void;
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
  // Mirrors the rendered flights so a cancel can resolve their handoffs outside the updater.
  const current = useRef(flights);
  current.current = flights;
  const sequence = useRef(0);
  const latest = useRef({ geometry, reduced, onArrive });
  latest.current = { geometry, reduced, onArrive };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const entry of current.current) { entry.ready(); entry.landed(); }
    };
  }, []);
  const remove = useCallback((key: string) => {
    setFlights((entries) => entries.filter((flight) => flight.key !== key));
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
          { key, id: request.id, media: request.media, frame, path, reduced: low, ready, landed },
        ]);
        // The handoff never blocks the next swipe, however the image behaves.
        setTimeout(ready, 80);
        return { handoff, landed: arrival };
      },
      cancel(id) {
        for (const entry of current.current) if (entry.id === id) { entry.ready(); entry.landed(); }
        setFlights((entries) => entries.filter((entry) => entry.id !== id));
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
    </View>
  );
  return { flight, layer, flying: flights.length };
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
      <MediaImage media={flight.media} fit="contain" style={styles.fill} onSettled={begin} />
    </Animated.View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1 }, photo: { position: "absolute" } });
