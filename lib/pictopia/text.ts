/** "1 item", "2 items"; pass `many` for irregular plurals ("1 memory", "2 memories"). */
export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Shown only while a library is indexed for the first time, e.g. "Getting your library ready… 12,000 of 70,000 photos & videos". */
export const libraryReadyLabel = (progress: string) => progress ? `Getting your library ready… ${progress}` : undefined;
