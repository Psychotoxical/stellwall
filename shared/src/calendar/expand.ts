import * as rrulePkg from "rrule";
import { localDate, zonedTime } from "../todos/recurrence.ts";

// rrule ships CommonJS; Node only offers its default export to ES modules.
// Node sees rrule as CommonJS (everything under default), bundlers as ESM with named exports.
const RRule = (rrulePkg as unknown as { RRule?: typeof rrulePkg.RRule; default?: { RRule: typeof rrulePkg.RRule } }).RRule ?? (rrulePkg as unknown as { default: { RRule: typeof rrulePkg.RRule } }).default.RRule;

export type Exception = {
  date: string;
  cancelled: boolean;
  title?: string | null;
  location?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
};

export type EventSpec = { start: Date; end: Date; allDay: boolean; rrule: string | null; tz: string };

export type Instance = {
  /** Local date of the occurrence in the series (key for exceptions). */
  date: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Last day for all-day instances (inclusive). */
  endDate: string;
  title?: string;
  location?: string;
  changed: boolean;
};

const DAY = 86_400_000;

function wallTime(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(at);
}
const floating = (date: string, time = "00:00") => new Date(`${date}T${time}:00.000Z`);
const addDays = (date: string, n: number) => new Date(floating(date).getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((floating(b).getTime() - floating(a).getTime()) / DAY);

/** Occurrences of an event that overlap [from, to]. Recurrence is computed on local wall time, so DST never shifts it. */
export function expandEvent(ev: EventSpec, exceptions: Exception[], from: Date, to: Date): Instance[] {
  const startDate = localDate(ev.start, ev.tz);
  const startTime = ev.allDay ? "00:00" : wallTime(ev.start, ev.tz);
  const duration = ev.end.getTime() - ev.start.getTime();
  const days = ev.allDay ? Math.max(1, daysBetween(startDate, localDate(ev.end, ev.tz))) : 0;
  const ex = new Map(exceptions.map((e) => [e.date, e]));

  let dates: string[];
  if (!ev.rrule) dates = [startDate];
  else {
    const rule = new RRule({ ...RRule.parseString(ev.rrule), dtstart: floating(startDate, startTime) });
    const lo = floating(addDays(localDate(new Date(from.getTime() - Math.max(duration, days * DAY)), ev.tz), -1));
    const hi = floating(addDays(localDate(to, ev.tz), 1), "23:59");
    dates = rule.between(lo, hi, true).map((d) => d.toISOString().slice(0, 10));
  }

  const out: Instance[] = [];
  for (const date of dates) {
    const e = ex.get(date);
    if (e?.cancelled) continue;
    let start = ev.allDay ? zonedTime(date, "00:00", ev.tz) : zonedTime(date, startTime, ev.tz);
    let end = ev.allDay ? zonedTime(addDays(date, days), "00:00", ev.tz) : new Date(start.getTime() + duration);
    if (e?.startAt) start = e.startAt;
    if (e?.endAt) end = e.endAt;
    if (!(start < to && end > from)) continue;
    const inst: Instance = {
      date,
      start,
      end,
      allDay: ev.allDay,
      endDate: ev.allDay ? addDays(localDate(start, ev.tz), days - 1) : localDate(end, ev.tz),
      changed: !!e,
    };
    if (e?.title) inst.title = e.title;
    if (e?.location) inst.location = e.location;
    out.push(inst);
  }
  return out;
}

/** The rule ended after lastDate (inclusive); used to split a series. */
export function withUntil(rrule: string, lastDate: string): string {
  const parts = rrule.split(";").filter((p) => !/^(UNTIL|COUNT)=/i.test(p));
  return [...parts, `UNTIL=${lastDate.replace(/-/g, "")}T235959Z`].join(";");
}

export function validRule(rrule: string): boolean {
  try {
    const o = RRule.parseString(rrule);
    return o.freq !== undefined;
  } catch {
    return false;
  }
}

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export type SimpleKind = "weekly" | "biweekly" | "monthly" | "yearly";

export function simpleRule(kind: SimpleKind, startDate: string): string {
  const d = floating(startDate);
  const wd = DAYS[(d.getUTCDay() + 6) % 7];
  if (kind === "weekly") return `FREQ=WEEKLY;BYDAY=${wd}`;
  if (kind === "biweekly") return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${wd}`;
  if (kind === "monthly") return `FREQ=MONTHLY;BYMONTHDAY=${d.getUTCDate()}`;
  return "FREQ=YEARLY";
}

export function simpleKind(rrule: string | null): SimpleKind | "none" | "custom" {
  if (!rrule) return "none";
  const r = rrule.replace(/;UNTIL=[^;]+/, "");
  if (/^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.test(r)) return "weekly";
  if (/^FREQ=WEEKLY;INTERVAL=2;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.test(r)) return "biweekly";
  if (/^FREQ=MONTHLY;BYMONTHDAY=\d{1,2}$/.test(r)) return "monthly";
  if (r === "FREQ=YEARLY") return "yearly";
  return "custom";
}

export function describeRule(rrule: string): string {
  const kind = simpleKind(rrule);
  const day = (code: string) => DAY_NAMES[DAYS.indexOf(code as (typeof DAYS)[number])];
  const byday = rrule.match(/BYDAY=([A-Z]{2})/)?.[1] ?? "";
  if (kind === "weekly") return `jeden ${day(byday)}`;
  if (kind === "biweekly") return `alle 2 Wochen am ${day(byday)}`;
  if (kind === "monthly") return `monatlich am ${rrule.match(/BYMONTHDAY=(\d+)/)![1]}.`;
  if (kind === "yearly") return "jährlich";
  return "eigene Wiederholung";
}
