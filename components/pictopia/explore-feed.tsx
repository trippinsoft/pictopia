import {
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { reviewTrace, tracePhoto, REVIEW_TRACE_MARKER } from "@/lib/pictopia/review-trace";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useReducedMotion, useSharedValue } from "react-native-reanimated";
import type { Media } from "@/lib/pictopia/types";
import type {
  DiscardDirection,
  ExploreAction,
  ExploreDiscard,
  ExploreSession,
} from "@/lib/pictopia/explore";
import { ExploreFeedController, FeedEntrance } from "@/lib/pictopia/explore-feed-controller";
import { ExplorePager } from "./explore-pager";
import { ExploreCard, ExploreCardHandle } from "./explore-card";
import type { DiscardFlight } from "./discard-flight";
import { Text } from "./ui";

export interface ExploreFeedHandle {
  next(): void;
  jump(id: string): void;
  discard(direction: DiscardDirection): void;
  undo(): Promise<boolean>;
  action(action: ExploreAction): void;
}
interface Props {
  session: ExploreSession;
  media: Record<string, Media>;
  getSession(): ExploreSession;
  change(
    action: ExploreAction | ((current: ExploreSession) => ExploreAction),
  ): Promise<ExploreSession>;
  /** Place in the original snapshot, whose `total` never shrinks as photos are discarded;
   * `index === total` is the completion page. `first` is true on the first remaining photo. */
  onPage(index: number, total: number, first: boolean): void;
  onEnd?(): void;
  onBusy(busy: boolean): void;
  onBrowse?(): void;
  /** Original-order position interpolated between the two visible photographs. */
  onScrollPosition?(position: number): void;
  onScrollActive?(id: string): void;
  onDiscard?(): void;
  onAvailability(available: boolean): void;
  onError(message: string): void;
  /** A discard undone while the feed wasn't shown; it slides in once the feed mounts. */
  initialEntrance?: ExploreDiscard;
  /** Free daily allowance: the feed ends before this photo with `limitPage` instead of the
   * completion page. Photos before it (already counted or revisits) stay fully usable. */
  stopBefore?: string;
  limitPage?: ReactNode;
  /** The card after the last photograph (a review's Finish card). */
  endPage?: ReactNode;
  /** Hands a committed discard to the flight that carries the photograph to the trash.
   * Without it, the photo flies off the side as the original explorer always has. */
  flight?: DiscardFlight;
}
// Long enough for an animated page scroll to leave the departed photo offscreen.
const RESET_DELAY = 450;
// A tap this soon after a vertical drag is the drag's own release, not an undo.
const TAP_AFTER_DRAG = 250;
export const ExploreFeed = forwardRef<ExploreFeedHandle, Props>(function ExploreFeed(props, ref) {
  const { session, media } = props;
  const [height, setHeight] = useState(0),
    [discarding, setDiscarding] = useState(false),
    [feed, setFeed] = useState<{ departing: ReadonlySet<string>; hidden: ReadonlySet<string> }>(
      () => ({ departing: new Set(), hidden: new Set() }),
    ),
    [entering, setEntering] = useState<FeedEntrance | undefined>(
      props.initialEntrance && {
        id: props.initialEntrance.id,
        from: props.initialEntrance.direction,
      },
    );
  // The feed is the original order minus what is set aside: in a review, exactly what is
  // marked for deletion. A discarded photo stays rendered while it flies to the trash, and
  // leaves as soon as it has, even if its save is still queued.
  const ids = session.ids.filter(
    (id) =>
      feed.departing.has(id) ||
      (!(session.review ? session.records[id]?.queued : session.records[id]?.discarded) &&
        !feed.hidden.has(id)),
  );
  const idsKey = ids.join("\n");
  const cut = props.stopBefore ? ids.indexOf(props.stopBefore) : -1;
  const data = useMemo(() => {
    let endId = "explore-completion";
    while (ids.includes(endId)) endId += "-";
    return [...(cut >= 0 ? ids.slice(0, cut) : ids), endId];
    // The store returns fresh arrays on every save; only a changed feed re-lays out the pager.
  }, [idsKey, session.review, cut]);
  const limited = cut >= 0;
  const endId = data[data.length - 1];
  // What the pager has actually rendered. Updated with the commit, before paint.
  const pages = useRef(data);
  const list = useRef<FlatList<string>>(null);
  const cards = useRef(new Map<string, ExploreCardHandle>());
  const cardRefs = useRef(new Map<string, (handle: ExploreCardHandle | null) => void>());
  const scrollActive = useRef<string | undefined>(undefined);
  const offset = useRef(0),
    pageHeight = useRef(0),
    alive = useRef(true);
  const available = useRef(new Map<string, boolean>());
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Touching or momentum on the pager. Native uses UIScrollView/Android drag callbacks;
  // the browser pager reports pointer drags including their release snap.
  const dragging = useRef(false),
    momentum = useRef(false),
    lastDrag = useRef(0);
  const prepared = useRef<(() => void)[]>([]);
  // A programmatic page move in flight. Settling elsewhere mid-animation is ignored.
  const seeking = useRef<{ target: number; until: number } | undefined>(undefined);
  const nativeOffset = useSharedValue(0);
  const horizontal = useSharedValue(false);
  const motion = useMemo(() => ({ offset: nativeOffset, horizontal }), [nativeOffset, horizontal]);
  const nativeScroll = useMemo(() => Gesture.Native()
    .onBegin(e => { runOnJS(reviewTrace)("native.begin", { handler: e.handlerTag, state: e.state, oldState: e.oldState }); })
    .onStart(e => { runOnJS(reviewTrace)("native.start", { handler: e.handlerTag, state: e.state, oldState: e.oldState }); })
    .onEnd((e, success) => { runOnJS(reviewTrace)("native.end", { handler: e.handlerTag, state: e.state, oldState: e.oldState, success }); })
    .onFinalize((e, success) => { runOnJS(reviewTrace)("native.finalize", { handler: e.handlerTag, state: e.state, oldState: e.oldState, success }); }), []);
  const reducedMotion = useReducedMotion();
  const latest = useRef({ props, reducedMotion });
  latest.current = { props, reducedMotion };

  const resetDeparted = useCallback(() => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      // Review cards remain hidden after handing their image to a flight. Resetting a
      // mounted departure would paint that same image back at its original position.
      if (latest.current.props.session.review) return;
      // Never touch the active card: it may be springing home after a canceled drag.
      for (const [id, handle] of cards.current)
        if (id !== controller.activeId && !controller.departing.has(id)) handle.reset();
    }, RESET_DELAY);
  }, []);
  /** The counter shows the photo's fixed place in the snapshot, so its total never changes. */
  const report = useCallback((page: number) => {
    const ids = latest.current.props.getSession().ids,
      id = page >= pages.current.length - 1 ? undefined : pages.current[page];
    let first = true;
    for (let i = 0; i < page; i++) if (!controller.departing.has(pages.current[i])) first = false;
    latest.current.props.onPage(id === undefined ? ids.length : ids.indexOf(id), ids.length, first);
  }, []);
  const controller = useMemo(
    () =>
      new ExploreFeedController(
        {
          read: () => latest.current.props.getSession(),
          pages: () => pages.current,
          completionPage: true,
          save: (action) => latest.current.props.change(action),
          scrollTo: (target, animated) => {
            if (!alive.current || !pageHeight.current) return;
            reviewTrace("feed.scrollTo", { target, animated, offset: offset.current, height: pageHeight.current, horizontal: horizontal.value });
            seeking.current = animated ? { target, until: Date.now() + 1500 } : undefined;
            if (!animated) offset.current = target * pageHeight.current;
            list.current?.scrollToOffset({
              offset: target * pageHeight.current,
              animated: animated && !latest.current.reducedMotion,
            });
          },
          onPage: (next) => {
            if (!alive.current) return;
            const id = pages.current[next];
            setActiveId(next === pages.current.length - 1 ? null : id);
            setEntering((entry) => (entry?.id === id ? entry : undefined));
            report(next);
            latest.current.props.onAvailability(available.current.get(id) === true);
            resetDeparted();
          },
          onEnd: () => latest.current.props.onEnd?.(),
          limited: () => !!latest.current.props.stopBefore && pages.current.indexOf(latest.current.props.stopBefore) < 0,
          onBusy: (busy) => {
            if (!alive.current) return;
            setDiscarding(busy);
            latest.current.props.onBusy(busy);
          },
          onError: (message) => {
            if (alive.current) latest.current.props.onError(message);
          },
          onFeed: (departing, hidden) => {
            if (alive.current) setFeed({ departing, hidden });
          },
          prepare: (entry) =>
            new Promise<void>((resolve) => {
              if (!alive.current) return resolve();
              prepared.current.push(resolve);
              setEntering(entry);
            }),
        },
        session.activeId,
      ),
    // The controller is created once per mount; it reads the latest session itself.
    [],
  );
  const [activeId, setActiveId] = useState(controller.activeId);
  // A zoomed photo owns one-finger movement, so the pager holds still until it is back at 1×.
  const [zoomedId, setZoomedId] = useState<string>();
  const zoomChange = useCallback((id: string, zoomed: boolean) => {
    if (!alive.current) return;
    setZoomedId((current) => (zoomed ? id : current === id ? undefined : current));
  }, []);
  const availableIds = useCallback(
    () => [...available.current].filter(([, ready]) => ready).map(([id]) => id),
    [],
  );
  const ready = useCallback(
    (id: string, loaded: boolean) => {
      available.current.set(id, loaded);
      if (id === controller.activeId) latest.current.props.onAvailability(loaded);
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
  // The arriving card positioned itself off-screen in its own layout effect (children run
  // first). Two frames later that is on screen, on the UI thread too.
  useLayoutEffect(() => {
    if (!prepared.current.length) return;
    const waiting = prepared.current;
    prepared.current = [];
    globalThis.requestAnimationFrame(() =>
      globalThis.requestAnimationFrame(() => waiting.forEach((done) => done())),
    );
  }, [entering]);
  /** The horizontal recognizer has already won before it calls this. Native scroll drag
   * callbacks may still describe the previous touch, so claim the page at the live offset
   * instead of rejecting a valid sideways swipe on a stale vertical-drag flag. */
  const claim = useCallback(
    (id: string, nativeOffset?: number) => {
      const h = pageHeight.current;
      if (!h) { reviewTrace("claim.rejected", { photo: tracePhoto(id), reason: "no-height" }); return false; }
      const jsOffset = offset.current;
      const current = nativeOffset ?? readOffset();
      offset.current = current;
      const page = Math.max(0, Math.min(pages.current.length - 1, Math.round(current / h)));
      const off = Math.abs(current - page * h) >= 1.5;
      reviewTrace("claim.request", { photo: tracePhoto(id), nativeOffset, jsOffset, current, height: h, page, nearest: tracePhoto(pages.current[page]), active: tracePhoto(controller.activeId), stored: tracePhoto(latest.current.props.getSession().activeId), dragging: dragging.current, momentum: momentum.current, discarding: controller.discarding, undoing: controller.undoing });
      if (pages.current[page] !== id) { reviewTrace("claim.rejected", { photo: tracePhoto(id), reason: "nearest-id-mismatch" }); return false; }
      // This horizontal recognizer owns the touch now. A missing native scroll-end event
      // must not keep later swipes or page saves behind a stale vertical-drag flag.
      dragging.current = false;
      clearTimeout(quietTimer.current);
      momentum.current = false;
      const accepted = controller.claim(page, availableIds(), off);
      reviewTrace("claim.result", { photo: tracePhoto(id), accepted, off, active: tracePhoto(controller.activeId), busy: controller.busy });
      return accepted;
    },
    [availableIds, controller, readOffset],
  );
  const canBegin = useCallback(
    (id: string, nativeOffset?: number) => {
      const accepted = claim(id, nativeOffset) && controller.canDiscard(id);
      reviewTrace("feed.canBegin", { photo: tracePhoto(id), accepted, active: tracePhoto(controller.activeId), busy: controller.busy, queued: !!latest.current.props.getSession().records[id]?.queued });
      return accepted;
    },
    [claim, controller],
  );
  const discard = useCallback(
    async (id: string, direction: DiscardDirection, animation: Promise<void>, landed?: Promise<void>) => {
      reviewTrace("feed.discard", { photo: tracePhoto(id), active: tracePhoto(controller.activeId), stored: tracePhoto(latest.current.props.getSession().activeId), busy: controller.busy, canDiscard: controller.canDiscard(id), direction });
      if (latest.current.props.session.review) void animation.then(() => { if (alive.current) latest.current.props.onDiscard?.(); });
      await controller.discard(id, direction, animation, landed);
      if (alive.current && !latest.current.props.session.review) latest.current.props.onDiscard?.();
    },
    [controller],
  );
  // A still tap on the photo on screen undoes the latest discard. Drags never get here: the
  // card only reports short, unmoving touches. The tap is accepted exactly like a sideways
  // swipe. It used to also require the known offset to sit within 1.5 pt of a page, but on
  // iOS that offset comes from throttled scroll events and can stay a few points off once
  // paging stops (an interrupted deceleration sends no momentum end). Nothing then moved the
  // pager, so every later tap was refused until a swipe's claim snapped it back into line.
  const undoTap = useCallback(
    (id: string) => {
      if (Date.now() - lastDrag.current < TAP_AFTER_DRAG || !claim(id)) return;
      if (!latest.current.props.session.review) void controller.undo();
    },
    [claim, controller],
  );
  const entered = useCallback((id: string) => {
    if (alive.current) setEntering((entry) => (entry?.id === id ? undefined : entry));
  }, []);
  const settle = useCallback(() => {
    reviewTrace("feed.settle", { offset: offset.current, nativeOffset: nativeOffset.value, height: pageHeight.current, active: tracePhoto(controller.activeId), dragging: dragging.current, momentum: momentum.current, horizontal: horizontal.value, busy: controller.busy });
    clearTimeout(quietTimer.current);
    if (!pageHeight.current || dragging.current) return;
    // A quiet scroll means motion has stopped, even if momentum end was never delivered.
    momentum.current = false;
    readOffset();
    const count = pages.current.length - 1;
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
    const changed = target !== controller.page && !controller.busy;
    controller.settle(target, availableIds());
    if (changed) latest.current.props.onBrowse?.();
  }, [availableIds, controller, readOffset]);
  const scheduleSettle = useCallback(() => {
    clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(settle, 140);
  }, [settle]);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = event.nativeEvent.contentOffset.y;
      if (latest.current.props.session.review && pageHeight.current) {
        const page = Math.max(0, Math.min(pages.current.length - 2, offset.current / pageHeight.current));
        const lower = Math.floor(page), upper = Math.min(pages.current.length - 2, lower + 1);
        const original = latest.current.props.getSession().ids;
        const from = original.indexOf(pages.current[lower]);
        const to = original.indexOf(pages.current[upper]);
        if (from >= 0 && to >= 0) latest.current.props.onScrollPosition?.(from + (to - from) * (page - lower));
        const visibleId = pages.current[Math.round(page)];
        if (visibleId && visibleId !== scrollActive.current) {
          scrollActive.current = visibleId;
          latest.current.props.onScrollActive?.(visibleId);
        }
      }
      // Settle once scrolling goes quiet. Browsers have no momentum lifecycle, and this
      // also covers native momentum-end callbacks that are skipped or interrupted.
      if (!dragging.current) scheduleSettle();
    },
    [scheduleSettle],
  );
  // Runs with the commit that adds or removes a photo, before it is painted, so the pager
  // moves to the active photo's new index in the same frame.
  useLayoutEffect(() => {
    if (pages.current === data) return;
    pages.current = data;
    controller.relayout();
    report(controller.page);
  }, [controller, data, report]);
  useEffect(() => {
    alive.current = true;
    reviewTrace("feed.mount", { marker: REVIEW_TRACE_MARKER, active: tracePhoto(controller.activeId), appState: AppState.currentState });
    const appState = AppState.addEventListener("change", state => reviewTrace("app.state", { state }));
    report(controller.page);
    return () => {
      reviewTrace("feed.unmount", { active: tracePhoto(controller.activeId), horizontal: horizontal.value });
      appState.remove();
      alive.current = false;
      clearTimeout(quietTimer.current);
      clearTimeout(resetTimer.current);
      for (const done of prepared.current) done();
      latest.current.props.onBusy(false);
    };
  }, [controller, report]);
  useImperativeHandle(
    ref,
    () => ({
      next: () => controller.next(availableIds()),
      jump: (id) => { cards.current.get(id)?.reset(); setZoomedId(undefined); controller.jump(id, availableIds()); },
      discard: (direction) =>
        controller.activeId !== null && cards.current.get(controller.activeId)?.discard(direction),
      undo: async () => {
        const id = await controller.undo();
        if (id) latest.current.props.flight?.cancel(id);
        return !!id;
      },
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
  return (
    <View
      style={styles.fill}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.height;
        if (measured > 0 && Math.abs(measured - pageHeight.current) >= 1) {
          reviewTrace("feed.layout", { marker: REVIEW_TRACE_MARKER, from: pageHeight.current, to: measured, active: tracePhoto(controller.activeId), nativeOffset: nativeOffset.value });
          pageHeight.current = measured;
          offset.current = controller.page * measured;
          setHeight(measured);
        }
      }}
      accessibilityLabel="Vertically paged photo feed"
    >
      {height > 0 && data.length > 0 && (
        <ExplorePager
          key={height}
          ref={list}
          nativeScroll={nativeScroll}
          motion={motion}
          onPointerDragChange={(active) => {
            if (!alive.current) return;
            dragging.current = active;
            lastDrag.current = Date.now();
            // The drag took over any programmatic move (it continues from that page).
            if (active) seeking.current = undefined;
            clearTimeout(quietTimer.current);
            if (!active) scheduleSettle();
          }}
          pendingPage={() => seeking.current?.target}
          data={data}
          extraData={`${activeId}:${entering?.id}:${session.revision}:${Object.keys(media).length}`}
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
          scrollEnabled={!discarding && !zoomedId}
          scrollEventThrottle={16}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={false}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            reviewTrace("scroll.drag.begin", { offset: offset.current, nativeOffset: nativeOffset.value });
            // The finger takes over, including catching a page that is still moving.
            dragging.current = true;
            lastDrag.current = Date.now();
            momentum.current = false;
            seeking.current = undefined;
            clearTimeout(quietTimer.current);
          }}
          onScrollEndDrag={(event) => {
            reviewTrace("scroll.drag.end", { offset: event.nativeEvent.contentOffset.y, nativeOffset: nativeOffset.value });
            dragging.current = false;
            lastDrag.current = Date.now();
            offset.current = event.nativeEvent.contentOffset.y;
            scheduleSettle();
          }}
          onMomentumScrollBegin={() => {
            reviewTrace("scroll.momentum.begin", { offset: offset.current, nativeOffset: nativeOffset.value });
            momentum.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            reviewTrace("scroll.momentum.end", { offset: event.nativeEvent.contentOffset.y, nativeOffset: nativeOffset.value });
            momentum.current = false;
            offset.current = event.nativeEvent.contentOffset.y;
            settle();
          }}
          renderItem={({ item: id }) => (
            <View style={[styles.page, { height }]}>
              {id === endId && limited ? (
                props.limitPage
              ) : id === endId && props.endPage ? (
                props.endPage
              ) : id === endId ? (
                <View style={styles.end}>
                  <Text className="text-h2 text-foreground">Exploration complete</Text>
                  <Text className="mt-3 text-body text-muted-foreground">Saving your place…</Text>
                </View>
              ) : (
                <ExploreCard
                  id={id}
                  ref={refFor(id)}
                  media={media[id]}
                  active={id === activeId}
                  entrance={entering?.id === id ? entering.from : undefined}
                  pageHeight={height}
                  nativeScroll={nativeScroll}
                  motion={motion}
                  onBegin={canBegin}
                  onZoomBegin={claim}
                  onAction={discard}
                  onTap={undoTap}
                  onAccessibleNext={() => controller.next(availableIds())}
                  onAccessiblePrevious={() => { const previous = pages.current[controller.page - 1]; if (previous) controller.jump(previous, availableIds()); }}
                  onAccessibleUndo={() => { void controller.undo().then(restored => { if (restored) latest.current.props.flight?.cancel(restored); }); }}
                  onEntered={entered}
                  onAvailability={ready}
                  onZoom={zoomChange}
                  flight={props.flight}
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
