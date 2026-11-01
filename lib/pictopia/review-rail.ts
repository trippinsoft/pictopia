/** At most twelve indicators are drawn, regardless of adventure length. */
export function reviewRailLines(ids: readonly string[], queued: ReadonlySet<string>, position: number) {
  if (!ids.length) return [];
  const center = Math.max(0, Math.min(ids.length - 1, position));
  const first = Math.max(0, Math.floor(center) - 6);
  const last = Math.min(ids.length - 1, Math.ceil(center) + 6);
  const lines = [];
  for (let index = first; index <= last; index++) {
    const distance = Math.abs(index - center);
    if (distance > 5.6) continue;
    lines.push({
      id: ids[index], index, offset: (index - center) * 17,
      active: distance < 0.45 && !queued.has(ids[index]),
      discarded: queued.has(ids[index]),
      opacity: Math.max(0.08, 1 - distance / 6) * (distance < 0.45 ? 1 : queued.has(ids[index]) ? 0.4 : 0.67),
    });
  }
  return lines;
}
