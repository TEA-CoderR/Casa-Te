/** Period helpers for the overview page. Dates are local calendar days (YYYY-MM-DD). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

/** Range from ?dal=&al= (default: the last 7 days). Never longer than a year, never reversed. */
export function overviewRange(params: URLSearchParams): { from: string; to: string } {
  const today = isoDay(new Date());
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  let to = valid(params.get('al')) ?? today;
  let from = valid(params.get('dal')) ?? addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > 365) from = addDays(to, -365);
  return { from, to };
}
