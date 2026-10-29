/** "1 item", "2 items"; pass `many` for irregular plurals ("1 memory", "2 memories"). */
export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
