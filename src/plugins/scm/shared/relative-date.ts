const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** `iso` relative to `now` (ms) in its largest whole unit, e.g. "3 hours ago"; under a minute is "just now". */
export function relativeDate(iso: string, now: number): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  return "just now";
}
