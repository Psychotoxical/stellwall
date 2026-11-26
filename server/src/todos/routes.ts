import type { FastifyInstance } from "fastify";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { TODO_CATALOG, itemKey, localDate, occurrences, startOfLocalDay, suggest, zonedTime, type Recurrence } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { catalogEntries, todoAssignees, todoDone, todoMembers, todos } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import type { Notifier } from "../shopping/notify.ts";

const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_DAYS = 60;
const UPCOMING_DAYS = 14;
/** Date key for the single done row of a to-do without a date. */
export const UNDATED = "1970-01-01";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const recurrenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("daily") }),
  z.object({ kind: z.literal("weekly"), weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7) }),
  z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(31) }),
]);
const visibilitySchema = z.object({ everyone: z.boolean(), memberIds: z.array(z.uuid()).max(50) });
const fields = {
  title: z.string().trim().min(1).max(80),
  visibility: visibilitySchema,
  assignees: z.array(z.uuid()).max(10),
  startDate: dateSchema.nullable(),
  time: timeSchema.nullable(),
  recurrence: recurrenceSchema,
  until: dateSchema.nullable(),
  needsConfirm: z.boolean(),
  reminders: z.array(z.number().int().min(0).max(60 * 24 * 30)).max(8),
};
const createBody = z.object(fields).refine((b) => b.startDate !== null || b.recurrence.kind === "none", { message: "repeat needs a date" });
const patchBody = z.object(fields).partial();
const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({ view: z.enum(["today", "upcoming", "undated"]).default("today"), mine: z.string().optional() });
const doneBody = z.object({ date: dateSchema });

type TodoRow = typeof todos.$inferSelect;

export type OccurrenceDto = {
  todoId: string;
  title: string;
  date: string | null;
  at: string | null;
  overdue: boolean;
  done: { by: string; at: string } | null;
  assignees: string[];
  needsConfirm: boolean;
  everyone: boolean;
  createdBy: string;
};

export function todoVisibleTo(memberId: string) {
  return or(
    eq(todos.everyone, true),
    sql`exists (select 1 from ${todoMembers} where ${todoMembers.todoId} = ${todos.id} and ${todoMembers.memberId} = ${memberId})`,
  )!;
}

export async function todoMemberIds(db: Db, todoId: string): Promise<string[]> {
  return (await db.select({ id: todoMembers.memberId }).from(todoMembers).where(eq(todoMembers.todoId, todoId))).map((r) => r.id);
}

export async function todoRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; timeZone: string; notify: Notifier }) {
  const { db, now, timeZone: tz, notify } = opts;

  async function findVisible(id: string, me: string) {
    return (await db.select().from(todos).where(and(eq(todos.id, id), todoVisibleTo(me))).limit(1))[0] ?? null;
  }

  async function setVisibility(todoId: string, everyone: boolean, memberIds: string[], creator: string) {
    await db.delete(todoMembers).where(eq(todoMembers.todoId, todoId));
    if (everyone) return;
    const assignees = (await db.select({ id: todoAssignees.memberId }).from(todoAssignees).where(eq(todoAssignees.todoId, todoId))).map((r) => r.id);
    const ids = [...new Set([...memberIds, creator, ...assignees])];
    await db.insert(todoMembers).values(ids.map((memberId) => ({ todoId, memberId })));
  }

  async function setAssignees(todo: TodoRow, ids: string[], me: string) {
    const current = (await db.select().from(todoAssignees).where(eq(todoAssignees.todoId, todo.id))).map((a) => a.memberId);
    const wanted = new Set(ids);
    const gone = current.filter((id) => !wanted.has(id));
    if (gone.length) await db.delete(todoAssignees).where(and(eq(todoAssignees.todoId, todo.id), inArray(todoAssignees.memberId, gone)));
    const added = [...wanted].filter((id) => !current.includes(id));
    if (added.length) {
      await db.insert(todoAssignees).values(added.map((memberId) => ({ todoId: todo.id, memberId, assignedBy: me, assignedAt: now() })));
      // Whoever has to do it may always see it.
      if (!todo.everyone) await db.insert(todoMembers).values(added.map((memberId) => ({ todoId: todo.id, memberId }))).onConflictDoNothing();
    }
    return added;
  }

  async function learn(scope: string, title: string) {
    await db
      .insert(catalogEntries)
      .values({ kind: "todo", scope, key: itemKey(title), name: title, category: "", uses: 1, lastUsed: now() })
      .onConflictDoUpdate({ target: [catalogEntries.kind, catalogEntries.scope, catalogEntries.key], set: { uses: sql`${catalogEntries.uses} + 1`, lastUsed: now() } });
  }

  async function unlearn(todo: TodoRow) {
    const other = await db.select({ id: todos.id }).from(todos).where(and(eq(todos.key, todo.key), eq(todos.everyone, true), ne(todos.id, todo.id))).limit(1);
    if (other.length) return;
    const fam = (await db.select().from(catalogEntries).where(and(eq(catalogEntries.kind, "todo"), eq(catalogEntries.scope, "family"), eq(catalogEntries.key, todo.key))))[0];
    if (!fam) return;
    await db
      .insert(catalogEntries)
      .values({ kind: "todo", scope: todo.createdBy, key: fam.key, name: fam.name, category: "", uses: fam.uses, lastUsed: now() })
      .onConflictDoUpdate({ target: [catalogEntries.kind, catalogEntries.scope, catalogEntries.key], set: { uses: sql`${catalogEntries.uses} + ${fam.uses}` } });
    await db.delete(catalogEntries).where(eq(catalogEntries.id, fam.id));
  }

  async function ruleDto(t: TodoRow) {
    const assignees = (await db.select({ id: todoAssignees.memberId }).from(todoAssignees).where(eq(todoAssignees.todoId, t.id))).map((r) => r.id);
    return {
      id: t.id,
      title: t.title,
      visibility: { everyone: t.everyone, memberIds: t.everyone ? [] : await todoMemberIds(db, t.id) },
      createdBy: t.createdBy,
      assignees,
      startDate: t.startDate,
      time: t.time,
      recurrence: t.recurrence as Recurrence,
      until: t.until,
      needsConfirm: t.needsConfirm,
      reminders: t.reminders as number[],
    };
  }

  app.get("/api/todos", { preHandler: requireMember }, async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const t = now();
    const rows = await db.select().from(todos).where(todoVisibleTo(me));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const assign = await db.select().from(todoAssignees).where(inArray(todoAssignees.todoId, ids));
    const done = await db.select().from(todoDone).where(inArray(todoDone.todoId, ids));
    const assigneesOf = (id: string) => assign.filter((a) => a.todoId === id).map((a) => a.memberId);
    const doneOf = (id: string, date: string) => {
      const d = done.find((x) => x.todoId === id && x.occurrenceDate === date);
      return d ? { by: d.doneBy, at: d.doneAt.toISOString() } : null;
    };
    const mine = (r: TodoRow) => {
      const a = assigneesOf(r.id);
      return a.includes(me) || (a.length === 0 && r.createdBy === me);
    };
    const pick = q.data.mine ? rows.filter(mine) : rows;
    const dto = (r: TodoRow, date: string | null, at: Date | null, overdue: boolean): OccurrenceDto => ({
      todoId: r.id,
      title: r.title,
      date,
      at: at?.toISOString() ?? null,
      overdue,
      done: doneOf(r.id, date ?? UNDATED),
      assignees: assigneesOf(r.id),
      needsConfirm: r.needsConfirm,
      everyone: r.everyone,
      createdBy: r.createdBy,
    });
    const out: OccurrenceDto[] = [];
    const today = localDate(t, tz);
    const dayStart = startOfLocalDay(t, tz);
    for (const r of pick) {
      const rule = { start: r.startDate ?? "", time: r.time, recurrence: r.recurrence as Recurrence, until: r.until };
      if (q.data.view === "undated") {
        if (!r.startDate) out.push(dto(r, null, null, false));
        continue;
      }
      if (!r.startDate) continue;
      if (q.data.view === "today") {
        if (r.needsConfirm) {
          const since = new Date(Math.max(r.ruleChangedAt.getTime(), t.getTime() - OVERDUE_DAYS * DAY));
          if (localDate(since, tz) < today) {
            for (const o of occurrences(rule, since, new Date(dayStart.getTime() - 1), tz)) {
              if (!doneOf(r.id, o.date)) out.push(dto(r, o.date, o.at, true));
            }
          }
        }
        for (const o of occurrences(rule, t, t, tz)) out.push(dto(r, o.date, o.at, false));
      } else {
        const tomorrow = zonedTime(localDate(new Date(dayStart.getTime() + DAY + 2 * 60 * 60 * 1000), tz), "00:00", tz);
        for (const o of occurrences(rule, tomorrow, new Date(t.getTime() + UPCOMING_DAYS * DAY), tz)) out.push(dto(r, o.date, o.at, false));
      }
    }
    out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.at ?? "").localeCompare(b.at ?? "") || a.title.localeCompare(b.title, "de"));
    return out;
  });

  app.get("/api/todos/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const t = await findVisible(p.data.id, req.member!.id);
    if (!t) return reply.code(404).send({ error: "not_found" });
    return ruleDto(t);
  });

  app.post("/api/todos", { preHandler: requireMember }, async (req, reply) => {
    const b = createBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const [t] = await db
      .insert(todos)
      .values({
        title: b.data.title,
        key: itemKey(b.data.title),
        everyone: b.data.visibility.everyone,
        createdBy: me,
        createdAt: now(),
        ruleChangedAt: now(),
        startDate: b.data.startDate,
        time: b.data.time,
        recurrence: b.data.recurrence,
        until: b.data.until,
        needsConfirm: b.data.needsConfirm,
        reminders: b.data.reminders,
      })
      .returning();
    await setVisibility(t!.id, b.data.visibility.everyone, b.data.visibility.memberIds, me);
    const given = await setAssignees(t!, b.data.assignees, me);
    notify.todoGiven(t!.id, given, req.member!);
    await learn(t!.everyone ? "family" : me, t!.title);
    notify.todo(t!.id);
    return ruleDto(t!);
  });

  app.patch("/api/todos/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const b = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const t = await findVisible(p.data.id, me);
    if (!t) return reply.code(404).send({ error: "not_found" });
    if (b.data.visibility && t.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    if (b.data.assignees && !t.everyone && t.createdBy !== me) {
      // Adding someone would widen who sees a private to-do; that stays with its creator.
      const canSee = await todoMemberIds(db, t.id);
      if (b.data.assignees.some((id) => !canSee.includes(id))) return reply.code(403).send({ error: "not_creator" });
    }
    const start = b.data.startDate === undefined ? t.startDate : b.data.startDate;
    const rec = b.data.recurrence ?? (t.recurrence as Recurrence);
    if (start === null && rec.kind !== "none") return reply.code(400).send({ error: "invalid_input" });
    const set: Partial<typeof todos.$inferInsert> = {};
    if (b.data.title !== undefined) Object.assign(set, { title: b.data.title, key: itemKey(b.data.title) });
    if (b.data.needsConfirm !== undefined) set.needsConfirm = b.data.needsConfirm;
    if (b.data.reminders !== undefined) set.reminders = b.data.reminders;
    if (b.data.visibility) set.everyone = b.data.visibility.everyone;
    const ruleKeys = ["startDate", "time", "recurrence", "until"] as const;
    const differs = (k: (typeof ruleKeys)[number]) => b.data[k] !== undefined && JSON.stringify(b.data[k]) !== JSON.stringify(t[k]);
    if (ruleKeys.some(differs)) {
      for (const k of ruleKeys) if (b.data[k] !== undefined) (set as Record<string, unknown>)[k] = b.data[k];
      // Only a real change of the rule resets what counts as overdue.
      set.ruleChangedAt = now();
    }
    const [u] = Object.keys(set).length ? await db.update(todos).set(set).where(eq(todos.id, t.id)).returning() : [t];
    // Assignees first, so visibility is built from the new set of people.
    if (b.data.assignees) notify.todoGiven(u!.id, await setAssignees(u!, b.data.assignees, me), req.member!);
    if (b.data.visibility) {
      await setVisibility(t.id, b.data.visibility.everyone, b.data.visibility.memberIds, t.createdBy);
      if (t.everyone && !b.data.visibility.everyone) await unlearn(u!);
    }
    notify.todo(t.id);
    return ruleDto(u!);
  });

  app.delete("/api/todos/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const me = req.member!.id;
    const t = await findVisible(p.data.id, me);
    if (!t) return reply.code(404).send({ error: "not_found" });
    if (t.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const audience = t.everyone ? null : await todoMemberIds(db, t.id);
    await db.delete(todos).where(eq(todos.id, t.id));
    notify.todoGone(audience);
    return { ok: true };
  });

  app.post("/api/todos/:id/done", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const b = doneBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const t = await findVisible(p.data.id, me);
    if (!t) return reply.code(404).send({ error: "not_found" });
    // Only the first check counts; a second one in parallel keeps the first.
    await db.insert(todoDone).values({ todoId: t.id, occurrenceDate: b.data.date, doneBy: me, doneAt: now() }).onConflictDoNothing();
    const [d] = await db.select().from(todoDone).where(and(eq(todoDone.todoId, t.id), eq(todoDone.occurrenceDate, b.data.date)));
    notify.todo(t.id);
    return { by: d!.doneBy, at: d!.doneAt.toISOString() };
  });

  app.delete("/api/todos/:id/done/:date", { preHandler: requireMember }, async (req, reply) => {
    const p = z.object({ id: z.uuid(), date: dateSchema }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const t = await findVisible(p.data.id, req.member!.id);
    if (!t) return reply.code(404).send({ error: "not_found" });
    await db.delete(todoDone).where(and(eq(todoDone.todoId, t.id), eq(todoDone.occurrenceDate, p.data.date)));
    notify.todo(t.id);
    return { ok: true };
  });

  app.get("/api/todo-suggestions", { preHandler: requireMember }, async (req, reply) => {
    const q = z.object({ q: z.string().max(80).default("") }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const own = await db
      .select({ name: catalogEntries.name, category: catalogEntries.category, uses: catalogEntries.uses })
      .from(catalogEntries)
      .where(and(eq(catalogEntries.kind, "todo"), or(eq(catalogEntries.scope, "family"), eq(catalogEntries.scope, me))));
    return suggest(q.data.q, TODO_CATALOG.map((name) => ({ name, category: "" })), own).map((s) => ({ name: s.name }));
  });
}
