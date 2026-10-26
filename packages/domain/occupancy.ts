const day = 86400000;
export function businessDate(now = new Date(), timeZone = "Europe/Paris") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function occupancyDays(
  periods: { start: string; end: string }[],
  year: number,
) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200)
    throw new Error("Exercice invalide");
  const lo = Date.UTC(year, 0, 1),
    hi = Date.UTC(year + 1, 0, 1);
  const intervals = periods
    .map((p) => [
      Math.max(lo, Date.parse(p.start + "T00:00:00Z")),
      Math.min(hi, Date.parse(p.end + "T00:00:00Z")),
    ])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  let end = lo,
    total = 0;
  for (const [s, e] of intervals) {
    if (e > end) {
      total += (e - Math.max(s, end)) / day;
      end = e;
    }
  }
  return { days: total, daysInYear: (hi - lo) / day };
}
