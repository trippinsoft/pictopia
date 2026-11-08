import { addDays } from "./daily";
/** Recognition is monotonic; changes to the accessible total never revoke awards. */
export function journeyMilestone(explored: number, total: number, awarded: readonly number[]) {
  const crossed = total > 18 ? [25, 50, 75, 100].filter(n => explored * 100 >= total * n && !awarded.includes(n)) : [];
  return { crossed, highest: crossed.at(-1) };
}
export function permittedHistoryDate(date: string, today: string, pro: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
  return date === today || (pro && date >= addDays(today, -7));
}
