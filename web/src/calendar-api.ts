import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";
import type { Visibility } from "./shopping-api.ts";

export type EventInstance = {
  kind: "event";
  eventId: string;
  date: string;
  start: string;
  end: string;
  allDay: boolean;
  endDate: string;
  title: string;
  location: string;
  forWhom: string[];
  series: boolean;
  createdBy: string;
  changed: boolean;
};
export type BirthdayInstance = { kind: "birthday"; birthdayId: string; date: string; start: string; allDay: true; endDate: string; title: string; age: number | null };
export type CalendarInstance = EventInstance | BirthdayInstance;

export type EventDto = {
  id: string;
  title: string;
  location: string;
  notes: string;
  allDay: boolean;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  rrule: string | null;
  forWhom: string[];
  seeAll: boolean;
  createdBy: string;
  reminders: number[];
  imported: boolean;
};
export type BirthdayDto = {
  id: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
  visibility: Visibility;
  remindDays: number;
  remindWho: string[];
  createdBy: string;
};
export type ImportPreview = { token: string; count: number; fromToday: number; first: string; last: string; sample: { title: string; date: string; allDay: boolean; series: boolean }[] };

// ---------- local calendar dates (YYYY-MM-DD in the device's zone) ----------

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const todayYmd = () => ymd(new Date());
/** Monday of the week the date falls in. */
export const weekStart = (s: string) => addDays(s, -((parseYmd(s).getDay() + 6) % 7));
export const startIso = (s: string) => parseYmd(s).toISOString();
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
export const dayLabel = (s: string) => parseYmd(s).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
export const shortDay = (s: string) => parseYmd(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });

/** Every local date an instance covers; all-day events can span several days. */
export function datesOf(i: CalendarInstance): string[] {
  const out = [i.date];
  if (i.allDay) for (let d = addDays(i.date, 1); d <= i.endDate && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

export function byDay(list: CalendarInstance[]): Map<string, CalendarInstance[]> {
  const m = new Map<string, CalendarInstance[]>();
  for (const i of list) for (const d of datesOf(i)) m.set(d, [...(m.get(d) ?? []), i]);
  for (const v of m.values()) v.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  return m;
}

export const useCalendar = (from: string, to: string, mine: boolean) =>
  useQuery({
    queryKey: ["calendar", from, to, mine],
    queryFn: () => api<CalendarInstance[]>(`/api/calendar?from=${encodeURIComponent(startIso(from))}&to=${encodeURIComponent(startIso(to))}${mine ? "&mine=1" : ""}`),
    placeholderData: (prev) => prev,
  });
export const useBirthdays = () => useQuery({ queryKey: ["birthdays"], queryFn: () => api<BirthdayDto[]>("/api/birthdays") });
