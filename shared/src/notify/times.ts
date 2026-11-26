import { localDate, zonedTime } from "../todos/recurrence.ts";

const QUIET_FROM = 22;
const QUIET_TO = "07:00";
const BUNDLE_MS = 5 * 60_000;

const hourIn = (at: Date, tz: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(at));
const nextDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + 86_400_000).toISOString().slice(0, 10);
const prevDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() - 86_400_000).toISOString().slice(0, 10);

/** During the night (22–7 local) the moment the night ends; otherwise null. */
export function quietUntil(at: Date, tz: string): Date | null {
  const h = hourIn(at, tz);
  const today = localDate(at, tz);
  if (h >= QUIET_FROM) return zonedTime(nextDay(today), QUIET_TO, tz);
  if (h < 7) return zonedTime(today, QUIET_TO, tz);
  return null;
}

/** 18:00 local time on the day before the given date. */
export function eveningBefore(date: string, tz: string): Date {
  return zonedTime(prevDay(date), "18:00", tz);
}

/** Shopping changes go out five minutes after the person's last change. */
export function bundleDue(lastChange: Date): Date {
  return new Date(lastChange.getTime() + BUNDLE_MS);
}
