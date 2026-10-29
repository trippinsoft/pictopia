import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useReducedMotion } from "react-native-reanimated";
import type { Media } from "@/lib/pictopia/types";
import type { ExploreAction, ExploreSession } from "@/lib/pictopia/explore";
import { ExploreFeedController } from "@/lib/pictopia/explore-feed-controller";
import { ExplorePager } from "./explore-pager";
import { ExploreCard, ExploreCardHandle } from "./explore-card";
import { Text } from "./ui";

export interface ExploreFeedHandle {
  next(): void;
  discard(direction: "left" | "right"): void;
  action(action: ExploreAction): void;
}
interface Props {
  session: ExploreSession;
  media: Record<string, Media>;
  getSession(): ExploreSession;
  change(
    action: ExploreAction | ((current: ExploreSession) => ExploreAction),
  ): Promise<ExploreSession>;
  onPage(page: number): void;
  onBusy(busy: boolean): void;
  onAvailability(available: boolean): void;
  onError(message: string): void;
}
// Long enough for an animated page scroll to leave the departed photo offscreen.
const RESET_DELAY = 450;
export const ExploreFeed = forwardRef<ExploreFeedHandle, Props>(function ExploreFeed(props, ref) {
  const { session, media } = props;
  const [height, setHeight] = useState(0),
    [page, setPage] = useState(session.position),
    [discarding, setDiscarding] = useState(false);
  const list = useRef<FlatList<string>>(null);
  const cards = useRef(new Map<string, ExploreCardHandle>());
  const cardRefs = useRef(new Map<string, (handle: ExploreCardHandle | null) => void>());
  const offset = useRef(0),
    pageHeight = useRef(0),
    alive = useRef(true);
  const available = useRef(new Map<string, boolean>());
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Touching or momentum on the pager. Native uses UIScrollView/Android drag callbacks;
  // the browser pager reports pointer drags including their release snap.
  const dragging = useRef(false),
    momentum = useRef(false);
  // A programmatic page move in flight. Settling elsewhere mid-animation is ignored.
  const seeking = useRef<{ target: number; until: number } | undefined>(undefined);
  const nativeScroll = useMemo(() => Gesture.Native(), []);
  const reducedMotion = useReducedMotion();
  const latest = useRef({ props, reducedMotion });
  latest.current = { props, reducedMotion };

  const resetDeparted = useCallback(() => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      const s = latest.current.props.getSession();
      const activeId = s.ids[controller.page];
      // Never touch the active card: it may be springing home after a canceled drag.
      for (const [id, handle] of cards.current) if (id !== activeId) handle.reset();
    }, RESET_DELAY);
  }, []);
  const controller = useMemo(
    () =>
      new ExploreFeedController(
        {
          read: () => latest.current.props.getSession(),
          save: (action) => latest.current.props.change(action),
          scrollTo: (target, animated) => {
            if (!pageHeight.current) return;
            seeking.current = animated ? { target, until: Date.now() + 1500 } : undefined;
            if (!animated) offset.current = target * pageHeight.current;
            list.current?.scrollToOffset({
              offset: target * pageHeight.current,
              animated: animated && !latest.current.reducedMotion,
            });
          },
          onPage: (next) => {
            if (!alive.current) return;
            setPage(next);
            latest.current.props.onPage(next);
            const s = latest.current.props.getSession();
            latest.current.props.onAvailability(available.current.get(s.ids[next]) === true);
            resetDeparted();
          },
          onBusy: (busy) => {
            if (!alive.current) return;
            setDiscarding(busy);
            latest.current.props.onBusy(busy);
          },
          onError: (message) => {
            if (alive.current) latest.current.props.onError(message);
          },
        },
        session.position,
      ),
    // The controller is created once per mount; it reads the latest session itself.
    [],
  );
  const availableIds = useCallback(
    () => [...available.current].filter(([, ready]) => ready).map(([id]) => id),
    [],
  );
  const ready = useCallback(
    (id: string, loaded: boolean) => {
      available.current.set(id, loaded);
      if (id === latest.current.props.getSession().ids[controller.page])
        latest.current.props.onAvailability(loaded);
    },
    [controller],
  );
  // RN Web delivers onScroll throttled and up to 100 ms late; read the DOM when settling.
  const readOffset = useCallback(() => {
    const node: unknown = Platform.OS === "web" ? list.current?.getScrollableNode() : undefined;
    if (node && typeof (node as { scrollTop?: unknown }).scrollTop === "number")
      offset.current = (node as { scrollTop: number }).scrollTop;
    return offset.current;
  }, []);
  const atRest = useCallback(
    () =>
      !dragging.current &&
      !momentum.current &&
      pageHeight.current > 0 &&
      Math.abs(readOffset() - controller.page * pageHeight.current) < 1.5,
    [controller, readOffset],
  );
  const canBegin = useCallback(
    (id: string) => atRest() && controller.canDiscard(id),
    [atRest, controller],
  );
  const discard = useCallback(
    (id: string, direction: "left" | "right", animation: Promise<void>) =>
      controller.discard(id, direction, animation),
    [controller],
  );
  const settle = useCallback(() => {
    clearTimeout(quietTimer.current);
    if (!pageHeight.current || dragging.current) return;
    // A quiet scroll means motion has stopped, even if momentum end was never delivered.
    momentum.current = false;
    readOffset();
    const count = latest.current.props.getSession().ids.length;
    const target = Math.max(
      0,
      Math.min(count, Math.round(offset.current / pageHeight.current)),
    );
    const seek = seeking.current;
    if (seek && target !== seek.target && Date.now() < seek.until) {
      quietTimer.current = setTimeout(settle, 140);
      return;
    }
    seeking.current = undefined;
    // Wheel/trackpad scrolling can stop between pages in the browser. Finish the snap; the
    // resulting scroll settles again on the same page, so this is idempotent.
    if (Math.abs(offset.current - target * pageHeight.current) >= 1.5)
      list.current?.scrollToOffset({
        offset: target * pageHeight.current,
        animated: !latest.current.reducedMotion,
      });
    controller.settle(target, availableIds());
  }, [availableIds, controller, readOffset]);
  const scheduleSettle = useCallback(() => {
    clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(settle, 140);
  }, [settle]);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
      // Settle once scrolling goes quiet. Browsers have no momentum lifecycle, and this
      // also covers native momentum-end callbacks that are skipped or interrupted.
      if (!dragging.current) scheduleSettle();
    },
    [scheduleSettle],
  );
  useEffect(() => {
    alive.current = true;
    latest.current.props.onPage(controller.page);
    return () => {
      alive.current = false;
      clearTimeout(quietTimer.current);
      clearTimeout(resetTimer.current);
      latest.current.props.onBusy(false);
    };
  }, [controller]);
  useImperativeHandle(
    ref,
    () => ({
      next: () => controller.next(availableIds()),
      discard: (direction) =>
        cards.current
          .get(latest.current.props.getSession().ids[controller.page])
          ?.discard(direction),
      action: (action) => {
        void controller.action(action);
      },
    }),
    [availableIds, controller],
  );
  const refFor = useCallback((id: string) => {
    let callback = cardRefs.current.get(id);
    if (!callback) {
      callback = (handle) => {
        if (handle) cards.current.set(id, handle);
        else cards.current.delete(id);
      };
      cardRefs.current.set(id, callback);
    }
    return callback;
  }, []);
  // The store returns a fresh array on every save; keep the list data stable unless the
  // snapshot itself changes, so background saves never re-layout the pager.
  const idsKey = session.ids.join("\n");
  const data = useMemo(() => {
    let endId = "explore-completion";
    while (session.ids.includes(endId)) endId += "-";
    return [...session.ids, endId];
  }, [idsKey]);
  const endId = data[data.length - 1];
  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.height;
        if (measured > 0 && Math.abs(measured - pageHeight.current) >= 1) {
          pageHeight.current = measured;
          offset.current = controller.page * measured;
          setHeight(measured);
        }
      }}
      accessibilityLabel="Vertically paged photo feed"
    >
      {height > 0 && (
        <ExplorePager
          key={height}
          ref={list}
          nativeScroll={nativeScroll}
          onPointerDragChange={(active) => {
            if (!alive.current) return;
            dragging.current = active;
            // The drag took over any programmatic move (it continues from that page).
            if (active) seeking.current = undefined;
            clearTimeout(quietTimer.current);
            if (!active) scheduleSettle();
          }}
          pendingPage={() => seeking.current?.target}
          data={data}
          extraData={`${page}:${session.revision}:${Object.keys(media).length}`}
          keyExtractor={(id) => id}
          initialScrollIndex={controller.page}
          getItemLayout={(_data, index) => ({ length: height, offset: height * index, index })}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          bounces={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!discarding}
          scrollEventThrottle={16}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={false}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            // The finger takes over, including catching a page that is still moving.
            dragging.current = true;
            momentum.current = false;
            seeking.current = undefined;
            clearTimeout(quietTimer.current);
          }}
          onScrollEndDrag={(event) => {
            dragging.current = false;
            offset.current = event.nativeEvent.contentOffset.y;
            scheduleSettle();
          }}
          onMomentumScrollBegin={() => {
            momentum.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            momentum.current = false;
            offset.current = event.nativeEvent.contentOffset.y;
            settle();
          }}
          renderItem={({ item: id, index }) => (
            <View style={[styles.page, { height }]}>
              {id === endId ? (
                <View style={styles.end}>
                  <Text className="text-h2 text-foreground">Exploration complete</Text>
                  <Text className="mt-3 text-body text-muted-foreground">Saving your place…</Text>
                </View>
              ) : (
                <ExploreCard
                  id={id}
                  ref={refFor(id)}
                  media={media[id]}
                  active={index === page}
                  discarded={session.records[id]?.discarded === true}
                  nativeScroll={nativeScroll}
                  onBegin={canBegin}
                  onAction={discard}
                  onAvailability={ready}
                />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
});
const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { overflow: "hidden", width: "100%" },
  end: { flex: 1, alignItems: "center", justifyContent: "center" },
});
