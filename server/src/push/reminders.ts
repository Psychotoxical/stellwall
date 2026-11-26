import { inArray, sql } from "drizzle-orm";
import { birthdaysBetween, eveningBefore, expandEvent, localDate, occurrences, type Exception, type Recurrence } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { birthdays, eventExceptions, eventFor, events, todoAssignees, todos } from "../db/schema.ts";
import type { Outbox } from "./outbox.ts";

const DAY = 86_400_000;
const LOOKAHEAD_DAYS = 32;
/** A reminder whose moment passed less than this long ago still goes out (the app was restarting). */
const GRACE_MS = 10 * 60_000;

const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / DAY);
const hhmm = (at: Date, tz: string) => new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);

/** Reminders without a clock time come at 18:00 the evening before; whole days of lead time count back from there. */
const dayReminder = (date: string, minutes: number, tz: string) => eveningBefore(addDays(date, -Math.max(0, Math.floor(minutes / 1440) - 1)), tz);

function relative(date: string, at: Date, tz: string) {
  const n = daysBetween(localDate(at, tz), date);
  if (n <= 0) return "";
  if (n === 1) return "morgen";
  return `in ${n} Tagen`;
}

/** Puts every reminder that is due now into the outbox; the outbox's key keeps each one to a single message. */
export async function remind(db: Db, outbox: Outbox, now: Date, tz: string) {
  const from = new Date(now.getTime() - GRACE_MS);
  const due = (at: Date) => at > from && at <= now;
  const to = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY);

  // Events
  const evs = await db.select().from(events).where(sql`jsonb_array_length(${events.reminders}) > 0`);
  if (evs.length) {
    const ids = evs.map((e) => e.id);
    const fors = await db.select().from(eventFor).where(inArray(eventFor.eventId, ids));
    const exs = await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, ids));
    for (const ev of evs) {
      const people = fors.filter((f) => f.eventId === ev.id).map((f) => f.memberId);
      if (!people.length) continue;
      const exceptions: Exception[] = exs.filter((x) => x.eventId === ev.id).map((x) => ({ date: x.occurrenceDate, cancelled: x.cancelled, title: x.title, location: x.location, startAt: x.startAt, endAt: x.endAt }));
      for (const inst of expandEvent({ start: ev.startAt, end: ev.endAt, allDay: ev.allDay, rrule: ev.rrule, tz: ev.tz }, exceptions, now, to)) {
        for (const r of ev.reminders as number[]) {
          const at = ev.allDay ? dayReminder(localDate(inst.start, tz), r, tz) : new Date(inst.start.getTime() - r * 60_000);
          if (!due(at)) continue;
          const title = inst.title ?? ev.title;
          const day = localDate(inst.start, tz);
          const rel = relative(day, at, tz);
          const body = ev.allDay ? `Erinnerung: ${title} ${rel || "heute"}` : `Erinnerung: ${title} ${rel ? rel + " " : ""}um ${hhmm(inst.start, tz)}`;
          await outbox.enqueue({ memberIds: people, actor: null, kind: "event_reminder", ref: { type: "event", id: ev.id }, title: "Kalender", body, url: `/kalender?tag=${day}`, dueAt: at, dedupe: `rem:e:${ev.id}:${inst.date}:${r}`, quiet: false });
        }
      }
    }
  }

  // To-dos
  const tds = await db.select().from(todos).where(sql`jsonb_array_length(${todos.reminders}) > 0 and ${todos.startDate} is not null`);
  if (tds.length) {
    const assigned = await db.select().from(todoAssignees).where(inArray(todoAssignees.todoId, tds.map((t) => t.id)));
    for (const t of tds) {
      const people = assigned.filter((a) => a.todoId === t.id).map((a) => a.memberId);
      if (!people.length) continue;
      const rule = { start: t.startDate!, time: t.time, recurrence: t.recurrence as Recurrence, until: t.until };
      for (const o of occurrences(rule, now, to, tz)) {
        for (const r of t.reminders as number[]) {
          const at = t.time ? new Date(o.at.getTime() - r * 60_000) : dayReminder(o.date, r, tz);
          if (!due(at)) continue;
          const rel = relative(o.date, at, tz);
          const body = t.time ? `Erinnerung: ${t.title} ${rel ? rel + " " : ""}um ${t.time}` : `Erinnerung: ${t.title} ${rel || "heute"}`;
          await outbox.enqueue({ memberIds: people, actor: null, kind: "todo_reminder", ref: { type: "todo", id: t.id }, title: "To-dos", body, url: "/todos", dueAt: at, dedupe: `rem:t:${t.id}:${o.date}:${r}`, quiet: false });
        }
      }
    }
  }

  // Birthdays
  const bds = await db.select().from(birthdays).where(sql`jsonb_array_length(${birthdays.remindWho}) > 0`);
  const today = localDate(now, tz);
  for (const b of bds) {
    for (const o of birthdaysBetween({ month: b.month, day: b.day, year: b.year }, today, addDays(today, LOOKAHEAD_DAYS + 62))) {
      const at = eveningBefore(addDays(o.date, -b.remindDays), tz);
      if (!due(at)) continue;
      const rel = relative(o.date, at, tz);
      const body = `${b.name} hat ${rel} Geburtstag${o.age !== null ? ` und wird ${o.age}` : ""}`;
      await outbox.enqueue({ memberIds: b.remindWho as string[], actor: null, kind: "birthday", ref: { type: "birthday", id: b.id }, title: "Geburtstag", body, url: "/kalender/geburtstage", dueAt: at, dedupe: `rem:b:${b.id}:${o.date}`, quiet: false });
    }
  }
}
