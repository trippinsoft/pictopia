import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { FlatList } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { WebPageDrag, type PagePointer, type PageSurface } from "@/lib/pictopia/web-page-drag";
import type { ExplorePagerProps } from "./explore-pager.types";
export const ExplorePager = forwardRef<FlatList<string>, ExplorePagerProps>(function ExplorePager(
  { nativeScroll: _nativeScroll, onPointerDragChange, pendingPage, ...props },
  ref,
) {
  const list = useRef<FlatList<string>>(null);
  const activity = useRef(onPointerDragChange);
  activity.current = onPointerDragChange;
  const drag = useMemo(() => new WebPageDrag((active) => activity.current?.(active)), []);
  const reducedMotion = useReducedMotion();
  useImperativeHandle(ref, () => list.current!, []);
  useEffect(() => () => drag.dispose(), [drag]);
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
