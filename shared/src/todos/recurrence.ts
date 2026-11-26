export type Recurrence =
  | { kind: "none" }
  | { kind: "daily" }
  | { kind: "weekly"; weekdays: number[] }
  | { kind: "monthly"; day: number };

export type Rule = { start: string; time: string | null; recurrence: Recurrence; until: string | null };
export type Occurrence = { date: string; at: Date };

/** Calendar date (YYYY-MM-DD) of an instant in tz. */
export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function offsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of a local wall time (date and HH:MM) in tz. */
export function zonedTime(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetMs(new Date(wall), tz);
  return new Date(wall - offsetMs(new Date(first), tz));
}

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

function matches(date: string, rule: Rule): boolean {
  const r = rule.recurrence;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  switch (r.kind) {
    case "none":
      return date === rule.start;
    case "daily":
      return true;
    case "weekly": {
      const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
      return r.weekdays.includes(wd);
    }
    case "monthly": {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return d === Math.min(r.day, last);
    }
  }
}

/** Occurrences of a rule whose local date lies between the local dates of from and to. */
export function occurrences(rule: Rule, from: Date, to: Date, tz: string): Occurrence[] {
  let date = localDate(from, tz) > rule.start ? localDate(from, tz) : rule.start;
  let end = localDate(to, tz);
  if (rule.until && rule.until < end) end = rule.until;
  const out: Occurrence[] = [];
  for (let guard = 0; date <= end && guard < 800; guard++, date = addDays(date, 1)) {
    if (matches(date, rule)) out.push({ date, at: zonedTime(date, rule.time ?? "00:00", tz) });
    if (rule.recurrence.kind === "none" && date >= rule.start) break;
  }
  return out;
}
