const TZ = "Europe/Amsterdam";

export function todayNL(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function hourNL(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
}

const at = (iso: string) => new Date(iso + "T12:00:00Z");

export function addDays(iso: string, n: number): string {
  const d = at(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((at(a).getTime() - at(b).getTime()) / 864e5);
}

export function isWeekend(iso: string): boolean {
  const d = at(iso).getUTCDay();
  return d === 0 || d === 6;
}

export function fmt(iso: string, o: Intl.DateTimeFormatOptions): string {
  return at(iso).toLocaleDateString("nl-NL", { ...o, timeZone: "UTC" }).replace(/\./g, "");
}
export const fmtLong = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long" });
export const fmtShort = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });
