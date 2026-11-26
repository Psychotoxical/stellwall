import { eq, isNull } from "drizzle-orm";
import { expandEvent, localDate, zonedTime, type Exception } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { eventExceptions, events, lists, members, todos } from "../db/schema.ts";
import { listMemberIds } from "../shopping/visibility.ts";
import type { Outbox } from "./outbox.ts";

type Actor = { id: string; displayName: string };

/** "Mi 2.12. 15:30" or, for all-day events, "Mi 2.12." in the app's time zone. */
export function whenText(at: Date, allDay: boolean, tz: string) {
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: tz, ...o }).format(at);
  const day = `${part({ weekday: "short" }).replace(".", "")} ${part({ day: "numeric" }).replace(".", "")}.${part({ month: "numeric" }).replace(".", "")}.`;
  return allDay ? day : `${day} ${part({ hour: "2-digit", minute: "2-digit" })}`;
}

/** What the routes report so that the people concerned get a push message. */
export function createAnnouncer(db: Db, outbox: Outbox, tz: string, now: () => Date) {
  return {
    /** People who were just made the ones an event is for, or whose event changed. */
    async eventFor(eventId: string, memberIds: string[], actor: Actor, changed: boolean, date?: string) {
      if (!memberIds.length) return;
      const ev = (await db.select().from(events).where(eq(events.id, eventId)))[0];
      if (!ev) return;
      // The day it is about: the changed occurrence, else the next one (a series may have begun long ago).
      const exceptions: Exception[] = (await db.select().from(eventExceptions).where(eq(eventExceptions.eventId, ev.id))).map((x) => ({ date: x.occurrenceDate, cancelled: x.cancelled, title: x.title, location: x.location, startAt: x.startAt, endAt: x.endAt }));
      const spec = { start: ev.startAt, end: ev.endAt, allDay: ev.allDay, rrule: ev.rrule, tz: ev.tz };
      const from = date ? zonedTime(date, "00:00", ev.tz) : now();
      const inst = ev.rrule ? expandEvent(spec, exceptions, new Date(from.getTime() - 86_400_000), new Date(from.getTime() + 400 * 86_400_000)).find((i) => (date ? i.date === date : i.end > from)) : null;
      const start = inst?.start ?? ev.startAt;
      const title = inst?.title ?? ev.title;
      const when = whenText(start, ev.allDay, tz);
      await outbox.enqueue({
        memberIds,
        actor: actor.id,
        kind: "event",
        ref: { type: "event", id: ev.id },
        title: "Kalender",
        body: changed ? `${actor.displayName} hat einen Termin geändert: ${title}, ${when}` : `${actor.displayName} hat dir einen Termin eingetragen: ${title}, ${when}`,
        url: `/kalender?tag=${localDate(start, tz)}`,
      });
    },

    async todoGiven(todoId: string, memberIds: string[], actor: Actor) {
      if (!memberIds.length) return;
      const t = (await db.select({ title: todos.title }).from(todos).where(eq(todos.id, todoId)))[0];
      if (!t) return;
      await outbox.enqueue({ memberIds, actor: actor.id, kind: "todo", ref: { type: "todo", id: todoId }, title: "To-dos", body: `${actor.displayName} hat dir „${t.title}“ gegeben`, url: "/todos" });
    },

    async itemsAdded(listId: string, actor: Actor, count: number) {
      const l = (await db.select().from(lists).where(eq(lists.id, listId)))[0];
      if (!l) return;
      const audience = l.everyone ? (await db.select({ id: members.id }).from(members).where(isNull(members.removedAt))).map((m) => m.id) : await listMemberIds(db, listId);
      for (let i = 0; i < count; i++) {
        await outbox.bundle({
          memberIds: audience,
          actor: actor.id,
          ref: { type: "list", id: listId },
          key: `${actor.id}:${listId}`,
          text: (n) => `${actor.displayName} hat ${n === 1 ? "1 Sache" : `${n} Sachen`} auf „${l.name}“ gesetzt`,
          url: `/einkauf?liste=${listId}`,
        });
      }
    },

    async cook(date: string, cookId: string, actor: Actor) {
      const d = new Date(date + "T12:00:00Z");
      const day = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" }).format(d);
      await outbox.enqueue({ memberIds: [cookId], actor: actor.id, kind: "meal", ref: { type: "meal", id: date }, title: "Essensplan", body: `${actor.displayName} hat dich für ${day} als Koch eingetragen`, url: "/essen" });
    },
  };
}
export type Announcer = ReturnType<typeof createAnnouncer>;
