import { eligiblePhotographs } from "./photo-eligibility";
import type { Media } from "./types";
import { shuffle } from "./logic";

/** Pit Stops: short games played with the user's own photos. Every answer comes from metadata
 * Pictopia really has (capture dates); nothing is guessed or invented. */
export type PitStop = "guessYear" | "whereWasThis" | "whichFirst" | "memoryMatch";
export const ACTIVE_PIT_STOPS = ["memoryMatch", "whichFirst"] as const;
export const PIT_STOP_ROUNDS = 10;
export const MEMORY_PAIRS = 4;
/** Two photos this close together are too hard (and too arbitrary) to order. */
export const WHICH_FIRST_MIN_GAP = 14 * 86400000;

export const PIT_STOPS: Record<PitStop, { title: string; subtitle: string }> = {
  guessYear: { title: "Guess the Year", subtitle: "How well do you remember?" },
  whereWasThis: { title: "Where Was This?", subtitle: "Recognize a place" },
  whichFirst: { title: "Which Came First?", subtitle: "Put them in order" },
  memoryMatch: { title: "Memory Match", subtitle: "Find the pairs" },
};

export interface GuessRound {
  id: string;
  answer: number;
  options: number[];
}
export interface OrderRound {
  ids: [string, string];
  /** The earlier photo. */
  answer: string;
}

const year = (m: Media) => new Date(m.created).getFullYear();
const dated = (photos: Media[], now = Date.now()) => playable(photos).filter(m =>
  Number.isFinite(m.created) && m.created !== 0 && m.created <= now && Number.isFinite(year(m)),
);
/** Still photos that can be shown. */
export const playable = eligiblePhotographs;

/** Why a game can't be played right now, or nothing if it can. */
export function unavailable(
  game: PitStop,
  { photos, years, captureDates }: { photos: number; years: number; captureDates: boolean },
) {
  if (game === "whereWasThis")
    return "Needs photo locations, which Pictopia doesn’t read yet.";
  if ((game === "guessYear" || game === "whichFirst") && !captureDates)
    return "Needs capture dates from the iOS or Android photo library.";
  if (game === "memoryMatch") return photos < MEMORY_PAIRS ? `Needs at least ${MEMORY_PAIRS} photos.` : undefined;
  if (game === "guessYear" && years < 2) return "Needs photos from at least two different years.";
  if (game === "whichFirst") return photos < 2 ? "Needs photos taken on different dates." : undefined;
  if (photos < PIT_STOP_ROUNDS) return `Needs at least ${PIT_STOP_ROUNDS} photos.`;
  return undefined;
}

/** One photo per round, spread across years so the answer isn't always the same; three
 * nearby years as the other choices (never in the future). */
export function guessRounds(photos: Media[], seed: number, now = Date.now()): GuessRound[] {
  const byYear = new Map<number, Media[]>();
  for (const m of shuffle(dated(photos, now), seed)) byYear.set(year(m), [...(byYear.get(year(m)) ?? []), m]);
  const years = shuffle([...byYear.keys()], seed + 1);
  const picks: Media[] = [];
  for (let round = 0; picks.length < PIT_STOP_ROUNDS; round++) {
    let added = false;
    for (const y of years) {
      const m = byYear.get(y)![round];
      if (m && picks.length < PIT_STOP_ROUNDS) {
        picks.push(m);
        added = true;
      }
    }
    if (!added) break;
  }
  const latest = new Date(now).getFullYear();
  return shuffle(picks, seed + 2).map((m, i) => {
    const answer = year(m);
    const near = [-6, -5, -4, -3, -2, -1, 1, 2, 3].map((d) => answer + d).filter((y) => y <= latest);
    const options = [answer, ...shuffle(near, seed + i).slice(0, 3)].sort((a, b) => a - b);
    return { id: m.id, answer, options };
  });
}

/** Pair the widest available capture-time gaps, without repeating a photograph. Shorter
 * differences remain valid when dates are reliable; equal timestamps never form a round. */
export function orderRounds(photos: Media[], seed: number): OrderRound[] {
  const pool = [...new Map(dated(photos).map(m => [m.id, m])).values()].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const rounds: OrderRound[] = [];
  let left = 0, right = pool.length - 1;
  while (left < right && rounds.length < PIT_STOP_ROUNDS) {
    const earlier = pool[left], later = pool[right];
    if (earlier.created === later.created) break;
    const pair = shuffle([earlier, later], seed ^ Math.imul(rounds.length + 1, 0x9e3779b1));
    rounds.push({ ids: [pair[0].id, pair[1].id], answer: earlier.id });
    left++; right--;
  }
  return shuffle(rounds, seed + 71);
}

/** Four or six photographs, each appearing exactly twice. */
export function memoryDeck(photos: Media[], seed: number, pairs: 4 | 6 = MEMORY_PAIRS) {
  const unique = [...new Map(playable(photos).map(photo => [photo.id, photo])).values()];
  const ids = shuffle(unique, seed)
    .slice(0, pairs)
    .map((m) => m.id);
  return shuffle(
    ids.flatMap((id) => [`${id}#a`, `${id}#b`]),
    seed + 1,
  );
}
export const cardPhoto = (card: string) => card.slice(0, card.lastIndexOf("#"));

/** A calm, honest verdict. */
export function verdict(correct: number, total: number) {
  const share = total ? correct / total : 0;
  return share >= 0.8 ? "Nice work!" : share >= 0.5 ? "Not bad at all." : "Time is tricky.";
}

/** A deliberate, untimed matching game. A mismatched pair stays open until dismissed. */
export interface MatchState { open: string[]; matched: string[]; moves: number }
export const initialMatch = (): MatchState => ({ open: [], matched: [], moves: 0 });
export function flipCard(state: MatchState, card: string, deck: readonly string[]): MatchState {
  if (!deck.includes(card) || state.open.length === 2 || state.open.includes(card) || state.matched.includes(card)) return state;
  const open = [...state.open, card];
  if (open.length < 2) return { ...state, open };
  const moves = state.moves + 1;
  return cardPhoto(open[0]) === cardPhoto(open[1])
    ? { open: [], matched: [...state.matched, ...open], moves }
    : { ...state, open, moves };
}
