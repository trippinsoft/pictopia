import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { FlatList } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { GLIDE_DURATION, glideEase } from "@/lib/pictopia/glide";
import { WebPageDrag, type PagePointer, type PageSurface } from "@/lib/pictopia/web-page-drag";
import type { ExplorePagerProps } from "./explore-pager.types";
export const ExplorePager = forwardRef<FlatList<string>, ExplorePagerProps>(function ExplorePager(
  { motion: _motion, nativeScroll: _nativeScroll, onPointerDragChange, pendingPage, glide, ...props },
  ref,
) {
  const list = useRef<FlatList<string>>(null);
  const activity = useRef(onPointerDragChange);
  activity.current = onPointerDragChange;
  const drag = useMemo(() => new WebPageDrag((active) => activity.current?.(active)), []);
  const reducedMotion = useReducedMotion();
  useImperativeHandle(ref, () => list.current!, []);
  useEffect(() => () => drag.dispose(), [drag]);
  // A programmatic glide at the shared pace: the browser's smooth scroll is too quick to see.
  // Snapping pauses while it runs; a pointer press takes over at once.
  const gliding = useRef<{ frame: number; node: HTMLElement; snap: string } | undefined>(undefined);
  const stopGlide = () => {
    const run = gliding.current;
    if (!run) return;
    gliding.current = undefined;
    globalThis.cancelAnimationFrame(run.frame);
    if (run.node.style.scrollSnapType === "none") run.node.style.scrollSnapType = run.snap;
  };
  useEffect(() => stopGlide, []);
  if (glide)
    glide.current = (offset: number) => {
      const node = list.current?.getScrollableNode();
      if (!(node instanceof HTMLElement)) return;
      const previous = gliding.current;
      stopGlide();
      const snap = previous?.snap ?? node.style.scrollSnapType;
      node.style.scrollSnapType = "none";
      const from = node.scrollTop, started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / GLIDE_DURATION);
        node.scrollTop = from + (offset - from) * glideEase(t);
        if (t < 1 && gliding.current) gliding.current.frame = globalThis.requestAnimationFrame(step);
        else if (gliding.current) stopGlide();
      };
      gliding.current = { frame: globalThis.requestAnimationFrame(step), node, snap };
    };
  // The feed re-anchors on the shown photo's ID itself when photos are removed or restored.
  // Browsers would also keep the old node in view, through scroll anchoring and by re-snapping
  // to the same snap target, so a photo restored into the shown slot would be scrolled past.
  // Snapping pauses for the commit that changes the pages (unless a drag already paused it).
  const pages = useRef(props.data);
  useLayoutEffect(() => {
    const node = list.current?.getScrollableNode();
    if (!(node instanceof HTMLElement)) return;
    node.style.overflowAnchor = "none";
    if (pages.current === props.data) return;
    pages.current = props.data;
    const snap = node.style.scrollSnapType;
    if (snap === "none") return;
    node.style.scrollSnapType = "none";
    globalThis.requestAnimationFrame(() =>
      globalThis.requestAnimationFrame(() => {
        if (node.style.scrollSnapType === "none") node.style.scrollSnapType = snap;
      }),
    );
  }, [props.data]);
  const sample = (e: PointerEvent<HTMLDivElement>): PagePointer => ({
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    time: e.timeStamp,
  });
  return (
    <div
      style={containerStyle}
      onDragStart={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        stopGlide();
        // A video's progress bar keeps its drags; they never page the feed.
        if (e.target instanceof Element && e.target.closest("[data-scrubber]")) return;
        const node = list.current?.getScrollableNode();
        if (node instanceof HTMLElement)
          drag.start(sample(e), surfaceFor(node), props.scrollEnabled !== false, pendingPage?.());
      }}
      onPointerMoveCapture={(e) => {
        if (drag.move(sample(e))) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerUpCapture={(e) => {
        if (drag.end(sample(e), reducedMotion)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancelCapture={(e) => {
        if (drag.cancel(reducedMotion)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onLostPointerCapture={(e) => {
        if (e.target === e.currentTarget) drag.cancel(reducedMotion);
      }}
    >
      <FlatList
        ref={list}
        {...props}
        onScroll={(e) => {
          props.onScroll?.(e);
          drag.scrolled();
        }}
      />
    </div>
  );
});
/** RN Web replaces the scroll node's `scrollTo` with its own `{ x, y, animated }` version,
 * which reads a DOM `{ top, behavior }` call as "scroll to 0". Use the browser's own method. */
const nativeScrollTo: (this: Element, options: ScrollToOptions) => void = Element.prototype.scrollTo;
const surfaces = new WeakMap<HTMLElement, PageSurface>();
function surfaceFor(node: HTMLElement) {
  let surface = surfaces.get(node);
  if (!surface) surfaces.set(node, (surface = pageSurface(node)));
  return surface;
}
function pageSurface(node: HTMLElement): PageSurface {
  return {
    get scrollTop() {
      return node.scrollTop;
    },
    set scrollTop(value: number) {
      node.scrollTop = value;
    },
    get clientHeight() {
      return node.clientHeight;
    },
    get scrollHeight() {
      return node.scrollHeight;
    },
    style: node.style,
    scrollTo: (options) => nativeScrollTo.call(node, options),
  };
}
const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  touchAction: "none",
  userSelect: "none",
};
