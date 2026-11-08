import type { Adventure, AdventureKind } from "./adventures";

/** The fixed Pictopia 1.0 adventure catalog. Names and artwork are permanent; only the photos,
 * hints and context change from trip to trip. Every description states exactly what the
 * selection code (lib/pictopia/curation.ts) picks, never more. */
export type CatalogId = "on-this-day" | "time-machine" | "time-capsule" | "surprise-me" | "screenshot-sweep" | "duplicate-hunt";
export interface CatalogEntry {
  id: CatalogId;
  name: string;
  /** Short line on Explore cards. */
  blurb: string;
  /** "What it picks", shown in the info sheet. */
  details: string;
  /** Key into the designed illustration mapping in components/pictopia/adventure-art.tsx. */
  art: "onThisDay" | "timeMachine" | "capsule" | "detour" | "screenshots" | "duplicates";
  pro?: boolean;
}
export const CATALOG: readonly CatalogEntry[] = [
  {
    id: "on-this-day",
    name: "On This Day",
    blurb: "Today’s date in earlier years",
    details:
      "Photos taken on today’s date in earlier years. If there aren’t enough, it looks within 3 days, then within 7 days, then the whole month, and always tells you when it has widened. Up to 18 photos, oldest year first. Shots taken seconds apart show once.",
    art: "onThisDay",
  },
  {
    id: "time-machine",
    name: "The Yearbook",
    blurb: "Pick a year. Rediscover the moments that made it memorable.",
    details:
      "You choose a year. Pictopia picks up to 18 photos spread across its months, in the order they were taken. Photos you haven’t explored come first.",
    art: "timeMachine",
  },
  {
    id: "time-capsule",
    name: "Time Capsule",
    blurb: "One month Pictopia picks for you",
    details:
      "Pictopia chooses one month you’ve explored the least, from months with at least 20 photos. 18 photos spread across its days, in the order they were taken.",
    art: "capsule",
  },
  {
    id: "surprise-me",
    name: "Surprise Me",
    blurb: "A mix from across your years",
    details:
      "18 photos from the months you’ve explored least, drawn from across all your years and arranged so no two in a row come from the same year.",
    art: "detour",
  },
  {
    id: "screenshot-sweep",
    name: "Screenshot Sweep",
    blurb: "Old screenshots, oldest first",
    details:
      "Only images your phone marks as screenshots, oldest first. Favorites are skipped. Unexplored screenshots older than six months come first, and at most two from any quick series.",
    art: "screenshots",
  },
  {
    id: "duplicate-hunt",
    name: "Duplicate Hunt",
    blurb: "Look-alikes, side by side",
    details:
      "Identical copies, and similar shots taken within two minutes of each other. Pictopia suggests a keeper; you decide what to mark. Part of Pictopia+.",
    art: "duplicates",
    pro: true,
  },
];
export const catalogEntry = (id: CatalogId) => CATALOG.find((c) => c.id === id)!;

/** The permanent name for a saved adventure, whatever title older versions stored. */
export function adventureName(kind: AdventureKind): string {
  switch (kind) {
    case "day":
      return "On This Day";
    case "year":
    case "month":
      return "The Yearbook";
    case "capsule":
      return "Time Capsule";
    case "detour":
    case "random":
      return "Surprise Me";
    case "screenshots":
      return "Screenshot Sweep";
    case "corners":
      return "Hidden Corners";
    case "pitstop":
      return "Pit Stop Photos";
  }
}
export const catalogFor = (kind: AdventureKind): CatalogEntry | undefined =>
  CATALOG.find((c) => c.name === adventureName(kind));

/** Saved source stays immutable; the year remains visible when resuming or finishing. */
export function adventureLabel(adventure: Pick<Adventure, "kind" | "source">): string {
  const name = adventureName(adventure.kind);
  return adventure.kind === "year" && /^year:\d{4}$/.test(adventure.source)
    ? `${name} · ${adventure.source.slice(5)}` : name;
}
