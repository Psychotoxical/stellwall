import type { FastifyInstance } from "fastify";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { expandEvent, localDate, validRule, withUntil, zonedTime, type Exception } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { eventExceptions, eventFor, eventMembers, events } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import type { Notifier } from "../shopping/notify.ts";
import { birthdayInstances } from "./birthdays.ts";

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 62;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iso = z.iso.datetime({ offset: true });
const common = {
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(2000).default(""),
  rrule: z.string().max(300).nullable().refine((r) => r === null || validRule(r), "bad rule"),
  forWhom: z.array(z.uuid()).min(1).max(20),
  seeAll: z.boolean(),
  reminders: z.array(z.number().int().min(0).max(60 * 24 * 30)).max(8),
};
const timedBody = z.object({ ...common, allDay: z.literal(false), start: iso, end: iso });
const allDayBody = z.object({ ...common, allDay: z.literal(true), startDate: dateSchema, endDate: dateSchema });
const createBody = z.discriminatedUnion("allDay", [timedBody, allDayBody]);
const patchBody = z.object({
  title: common.title.optional(),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  rrule: common.rrule.optional(),
  forWhom: common.forWhom.optional(),
  seeAll: z.boolean().optional(),
  reminders: common.reminders.optional(),
  allDay: z.boolean().optional(),
  start: iso.optional(),
  end: iso.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
});
const scopeQuery = z.object({ scope: z.enum(["all", "one", "following"]).default("all"), date: dateSchema.optional() });
const rangeQuery = z.object({ from: iso, to: iso, mine: z.string().optional() });
const idParam = z.object({ id: z.uuid() });

type EventRow = typeof events.$inferSelect;
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

export function eventVisibleTo(memberId: string) {
  return or(
    eq(events.everyone, true),
    sql`exists (select 1 from ${eventMembers} where ${eventMembers.eventId} = ${events.id} and ${eventMembers.memberId} = ${memberId})`,
  )!;
}

export async function eventAudience(db: Db, eventId: string): Promise<string[] | null> {
  const ev = (await db.select({ everyone: events.everyone }).from(events).where(eq(events.id, eventId)))[0];
  if (!ev) return [];
  if (ev.everyone) return null;
  return (await db.select({ id: eventMembers.memberId }).from(eventMembers).where(eq(eventMembers.eventId, eventId))).map((r) => r.id);
}

export async function eventRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; timeZone: string; notify: Notifier }) {
  const { db, now, timeZone: tz, notify } = opts;

  const visible = async (id: string, me: string) => (await db.select().from(events).where(and(eq(events.id, id), eventVisibleTo(me))).limit(1))[0] ?? null;
  type Q = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
  const forWhomOf = async (id: string, q: Q = db) => (await q.select({ id: eventFor.memberId }).from(eventFor).where(eq(eventFor.eventId, id))).map((r) => r.id);
  const membersOf = async (id: string, q: Q = db) => (await q.select({ id: eventMembers.memberId }).from(eventMembers).where(eq(eventMembers.eventId, id))).map((r) => r.id);

  /**
   * Sets who it is for. Everyone it is for can see it; only the creator's edits take
   * people away again, and viewers chosen apart from that (an import) stay.
   */
  async function setPeople(ev: EventRow, forWhom: string[], me: string, q: Q = db) {
    const current = await forWhomOf(ev.id, q);
    const wanted = [...new Set(forWhom)];
    const gone = current.filter((id) => !wanted.includes(id));
    if (gone.length) await q.delete(eventFor).where(and(eq(eventFor.eventId, ev.id), inArray(eventFor.memberId, gone)));
    const added = wanted.filter((id) => !current.includes(id));
    if (added.length) await q.insert(eventFor).values(added.map((memberId) => ({ eventId: ev.id, memberId, addedBy: me, addedAt: now() })));
    await q.insert(eventMembers).values([...new Set([...wanted, ev.createdBy])].map((memberId) => ({ eventId: ev.id, memberId }))).onConflictDoNothing();
    const drop = me === ev.createdBy ? gone.filter((id) => id !== ev.createdBy) : [];
    if (drop.length) await q.delete(eventMembers).where(and(eq(eventMembers.eventId, ev.id), inArray(eventMembers.memberId, drop)));
    return added;
  }

  function times(b: { allDay: boolean; start?: string; end?: string; startDate?: string; endDate?: string }) {
    if (b.allDay) return { startAt: zonedTime(b.startDate!, "00:00", tz), endAt: zonedTime(addDays(b.endDate!, 1), "00:00", tz) };
    return { startAt: new Date(b.start!), endAt: new Date(b.end!) };
  }

  async function dto(ev: EventRow) {
    return {
      id: ev.id,
      title: ev.title,
      location: ev.location,
      notes: ev.notes,
      allDay: ev.allDay,
      start: ev.startAt.toISOString(),
      end: ev.endAt.toISOString(),
      startDate: localDate(ev.startAt, ev.tz),
      endDate: ev.allDay ? addDays(localDate(ev.endAt, ev.tz), -1) : localDate(ev.endAt, ev.tz),
      rrule: ev.rrule,
      forWhom: await forWhomOf(ev.id),
      seeAll: ev.everyone,
      createdBy: ev.createdBy,
      reminders: ev.reminders as number[],
      imported: !!ev.importUid,
    };
  }

  app.get("/api/calendar", { preHandler: requireMember }, async (req, reply) => {
    const q = rangeQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const from = new Date(q.data.from);
    const to = new Date(q.data.to);
    if (!(to > from) || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY) return reply.code(400).send({ error: "invalid_range" });
    const me = req.member!.id;
    const rows = await db.select().from(events).where(eventVisibleTo(me));
    const ids = rows.map((r) => r.id);
    const fors = ids.length ? await db.select().from(eventFor).where(inArray(eventFor.eventId, ids)) : [];
    const exs = ids.length ? await db.select().from(eventExceptions).where(inArray(eventExceptions.eventId, ids)) : [];
    const out: object[] = [];
    for (const ev of rows) {
      const forWhom = fors.filter((x) => x.eventId === ev.id).map((x) => x.memberId);
      if (q.data.mine && !forWhom.includes(me)) continue;
      const exceptions: Exception[] = exs
        .filter((x) => x.eventId === ev.id)
        .map((x) => ({ date: x.occurrenceDate, cancelled: x.cancelled, title: x.title, location: x.location, startAt: x.startAt, endAt: x.endAt }));
      for (const i of expandEvent({ start: ev.startAt, end: ev.endAt, allDay: ev.allDay, rrule: ev.rrule, tz: ev.tz }, exceptions, from, to)) {
        out.push({
          kind: "event",
          eventId: ev.id,
          date: i.date,
          start: i.start.toISOString(),
          end: i.end.toISOString(),
          allDay: i.allDay,
          endDate: i.endDate,
          title: i.title ?? ev.title,
          location: i.location ?? ev.location,
          forWhom,
          series: !!ev.rrule,
          createdBy: ev.createdBy,
          changed: i.changed,
        });
      }
    }
    out.push(...(await birthdayInstances(db, me, localDate(from, tz), localDate(new Date(to.getTime() - 1), tz), tz)));
    out.sort((a, b) => String((a as { start: string }).start).localeCompare(String((b as { start: string }).start)));
    return out;
  });

  app.get("/api/events/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const ev = await visible(p.data.id, req.member!.id);
    if (!ev) return reply.code(404).send({ error: "not_found" });
    return dto(ev);
  });

  app.post("/api/events", { preHandler: requireMember }, async (req, reply) => {
    const b = createBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const t = times(b.data);
    if (!(t.endAt > t.startAt)) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const [ev] = await db
      .insert(events)
      .values({ title: b.data.title, location: b.data.location, notes: b.data.notes, ...t, allDay: b.data.allDay, tz, rrule: b.data.rrule, everyone: b.data.seeAll, createdBy: me, createdAt: now(), reminders: b.data.reminders })
      .returning();
    const added = await setPeople(ev!, b.data.forWhom, me);
    notify.calendar(ev!.id);
    notify.eventFor(ev!.id, added, req.member!, false);
    return dto(ev!);
  });

  app.patch("/api/events/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const s = scopeQuery.safeParse(req.query);
    const b = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!s.success || !b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const ev = await visible(p.data.id, me);
    if (!ev) return reply.code(404).send({ error: "not_found" });
    const isCreator = ev.createdBy === me;
    if (b.data.seeAll !== undefined && b.data.seeAll !== ev.everyone && !isCreator) return reply.code(403).send({ error: "not_creator" });
    if (b.data.forWhom && !isCreator) {
      const canSee = ev.everyone ? null : await membersOf(ev.id);
      if (canSee && b.data.forWhom.some((id) => !canSee.includes(id))) return reply.code(403).send({ error: "not_creator" });
    }
    const scope = ev.rrule ? s.data.scope : "all";
    if (scope !== "all" && !s.data.date) return reply.code(400).send({ error: "invalid_input" });

    if (scope === "one") {
      const date = s.data.date!;
      let startAt = b.data.start ? new Date(b.data.start) : null;
      let endAt = b.data.end ? new Date(b.data.end) : null;
      if (ev.allDay && b.data.startDate) {
        startAt = zonedTime(b.data.startDate, "00:00", ev.tz);
        endAt = zonedTime(addDays(b.data.endDate ?? b.data.startDate, 1), "00:00", ev.tz);
      }
      if (startAt && endAt && !(endAt > startAt)) return reply.code(400).send({ error: "invalid_input" });
      await db
        .insert(eventExceptions)
        .values({ eventId: ev.id, occurrenceDate: date, cancelled: false, title: b.data.title ?? null, location: b.data.location ?? null, startAt, endAt })
        .onConflictDoUpdate({
          target: [eventExceptions.eventId, eventExceptions.occurrenceDate],
          set: { cancelled: false, ...(b.data.title ? { title: b.data.title } : {}), ...(b.data.location !== undefined ? { location: b.data.location } : {}), ...(startAt ? { startAt } : {}), ...(endAt ? { endAt } : {}) },
        });
      notify.calendar(ev.id);
      if (b.data.title || startAt) notify.eventFor(ev.id, await forWhomOf(ev.id), req.member!, true);
      return dto(ev);
    }

    // Work out everything first, so a refused change writes nothing.
    let base = { startAt: ev.startAt, endAt: ev.endAt };
    if (scope === "following") {
      const date = s.data.date!;
      const inst = expandEvent({ start: ev.startAt, end: ev.endAt, allDay: ev.allDay, rrule: ev.rrule, tz: ev.tz }, [], zonedTime(date, "00:00", ev.tz), zonedTime(addDays(date, 1), "00:00", ev.tz)).find((i) => i.date === date);
      if (!inst) return reply.code(400).send({ error: "no_occurrence" });
      base = { startAt: inst.start, endAt: inst.end };
    }
    const set: Partial<typeof events.$inferInsert> = {};
    for (const k of ["title", "location", "notes", "rrule", "reminders"] as const) if (b.data[k] !== undefined) (set as Record<string, unknown>)[k] = b.data[k];
    if (b.data.seeAll !== undefined) set.everyone = b.data.seeAll;
    const allDay = b.data.allDay ?? ev.allDay;
    if (b.data.start || b.data.startDate || b.data.allDay !== undefined) {
      const t = allDay
        ? times({ allDay, startDate: b.data.startDate ?? localDate(base.startAt, ev.tz), endDate: b.data.endDate ?? b.data.startDate ?? localDate(base.startAt, ev.tz) })
        : times({ allDay, start: b.data.start ?? base.startAt.toISOString(), end: b.data.end ?? base.endAt.toISOString() });
      if (!(t.endAt > t.startAt)) return reply.code(400).send({ error: "invalid_input" });
      Object.assign(set, t, { allDay });
    }

    let added: string[] = [];
    const u = await db.transaction(async (tx) => {
      let target = ev;
      if (scope === "following") {
        const date = s.data.date!;
        const oldRule = ev.rrule!;
        await tx.update(events).set({ rrule: withUntil(oldRule, addDays(date, -1)) }).where(eq(events.id, ev.id));
        const [copy] = await tx
          .insert(events)
          .values({ title: ev.title, location: ev.location, notes: ev.notes, startAt: base.startAt, endAt: base.endAt, allDay: ev.allDay, tz: ev.tz, rrule: oldRule, everyone: ev.everyone, createdBy: ev.createdBy, createdAt: now(), reminders: ev.reminders })
          .returning();
        // The new part keeps who it is for, who added them and who may see it.
        const fors = await tx.select().from(eventFor).where(eq(eventFor.eventId, ev.id));
        if (fors.length) await tx.insert(eventFor).values(fors.map((x) => ({ ...x, eventId: copy!.id })));
        const mems = await membersOf(ev.id, tx);
        if (mems.length) await tx.insert(eventMembers).values(mems.map((memberId) => ({ eventId: copy!.id, memberId })));
        await tx.update(eventExceptions).set({ eventId: copy!.id }).where(and(eq(eventExceptions.eventId, ev.id), gte(eventExceptions.occurrenceDate, date)));
        target = copy!;
      }
      const [row] = Object.keys(set).length ? await tx.update(events).set(set).where(eq(events.id, target.id)).returning() : [target];
      if (b.data.forWhom) added = await setPeople(row!, b.data.forWhom, me, tx);
      return row!;
    });
    notify.calendar(u.id);
    if (u.id !== ev.id) notify.calendar(ev.id);
    notify.eventFor(u.id, added, req.member!, false);
    const changed = ["title", "location", "start", "end", "startDate", "endDate", "allDay", "rrule"].some((k) => (b.data as Record<string, unknown>)[k] !== undefined);
    if (changed) notify.eventFor(u.id, (await forWhomOf(u.id)).filter((id) => !added.includes(id)), req.member!, true);
    return dto(u);
  });

  app.delete("/api/events/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const s = scopeQuery.safeParse(req.query);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!s.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const ev = await visible(p.data.id, me);
    if (!ev) return reply.code(404).send({ error: "not_found" });
    const scope = ev.rrule ? s.data.scope : "all";
    if (scope === "one") {
      if (!s.data.date) return reply.code(400).send({ error: "invalid_input" });
      await db
        .insert(eventExceptions)
        .values({ eventId: ev.id, occurrenceDate: s.data.date, cancelled: true })
        .onConflictDoUpdate({ target: [eventExceptions.eventId, eventExceptions.occurrenceDate], set: { cancelled: true } });
      notify.calendar(ev.id);
      return { ok: true };
    }
    if (ev.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    if (scope === "following") {
      if (!s.data.date) return reply.code(400).send({ error: "invalid_input" });
      await db.update(events).set({ rrule: withUntil(ev.rrule!, addDays(s.data.date, -1)) }).where(eq(events.id, ev.id));
      notify.calendar(ev.id);
      return { ok: true };
    }
    const audience = await eventAudience(db, ev.id);
    await db.delete(events).where(eq(events.id, ev.id));
    notify.calendarGone(audience);
    return { ok: true };
  });
}
