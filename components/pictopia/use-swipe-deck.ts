import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "@/services/repository";
import { Decision, Media, Session } from "@/lib/pictopia/types";
import { DeckState, canCommit, isReviewing } from "@/lib/pictopia/swipe-machine";
import { DeckController } from "@/lib/pictopia/deck-controller";
export function currentOf(session: Session | null | undefined) {
  return session && !session.complete ? session.ids[session.position] : undefined;
}
/** React adapter for DeckController: loads photo records and mirrors deck state for rendering. */
export function useSwipeDeck({
  session,
  revision,
  decide,
  onError,
  onCommitted,
}: {
  session: Session | null | undefined;
  revision: number;
  decide: (decision: Decision, id: string) => Promise<Session>;
  onError: (message: string) => void;
  onCommitted?: (decision: Decision) => void;
}) {
  const deps = useRef({ decide, onError });
  deps.current = { decide, onError };
  const [state, setState] = useState<DeckState>(() => ({ settled: [] }));
  const controller = useRef<DeckController | null>(null);
  if (!controller.current)
    controller.current = new DeckController({
      decide: (d, id) => deps.current.decide(d, id).then(currentOf),
      onChange: setState,
      onError: (message) => deps.current.onError(message),
    });
  const deck = controller.current;
  useEffect(() => () => deck.dispose(), [deck]);
  const current = currentOf(session);
  useEffect(() => {
    deck.sync(current);
  }, [current, state.committing, deck]);
  const top = state.top;
  const ids = session?.ids ?? [];
  const index = top ? ids.indexOf(top) : -1;
  const below = index >= 0 ? ids[index + 1] : undefined;
  // Records are cached by id and refreshed in place, so provider refreshes never unmount the
  // photo on screen or discard its readiness.
  const [records, setRecords] = useState<Record<string, Media | null>>({});
  useEffect(() => {
    let alive = true;
    for (const id of [top, below]) {
      if (!id) continue;
      storage
        .get(id)
        .then((m) => {
          if (alive) setRecords((r) => (r[id] === (m ?? null) ? r : { ...r, [id]: m ?? null }));
        })
        .catch(() => {
          if (alive) setRecords((r) => ({ ...r, [id]: null }));
        });
    }
    return () => {
      alive = false;
    };
  }, [top, below, revision]);
  /** undefined while loading, null when unavailable. */
  const view = (id?: string) => {
    const m = id ? records[id] : undefined;
    return m === undefined ? undefined : m?.active ? m : null;
  };
  const topRecord = view(top);
  useEffect(() => {
    deck.watchTop(top, topRecord === null);
  }, [top, topRecord === null, deck]);
  const commit = useCallback(
    (decision: Decision) => {
      const accepted = deck.commit(decision, !!topRecord);
      if (accepted) onCommitted?.(decision);
      return accepted;
    },
    [deck, topRecord, onCommitted],
  );
  const settled = useCallback((id: string) => deck.settled(id), [deck]);
  const animated = useCallback((id: string) => deck.animated(id), [deck]);
  return {
    state,
    top,
    below,
    topRecord,
    belowRecord: view(below),
    /** Keep / Set aside are available. */
    canDecide: !!top && canCommit(state, top) && !!topRecord,
    /** Undo / Skip / Finish are available: nothing is mid-flight. */
    idle: !state.committing,
    /** A usable photo is in front of the user (drives the review timer). */
    reviewing: isReviewing(state) && !!topRecord,
    commit,
    settled,
    animated,
  };
}
