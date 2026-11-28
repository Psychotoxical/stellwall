import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { boardDismissed, boardSeen, eventFor, events, items, lists, members, todoAssignees, todos } from "../db/schema.ts";
import { eventVisibleTo } from "../calendar/events.ts";
import { requireMember } from "../auth/guard.ts";
import { listVisibleTo } from "../shopping/visibility.ts";

const FIRST_LOOK_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 10;

export type BoardRow = {
  kind: "shopping";
  who: string;
  whoName: string;
  listId: string;
  listName: string;
  count: number;
  latestAt: string;
  itemIds: string[];
  /** What to send to /api/board/dismiss to tick this line off. */
  keys: string[];
};

export type TodoBoardRow = { kind: "todo"; who: string; whoName: string; todoId: string; title: string; latestAt: string; keys: string[] };

export type EventBoardRow = { kind: "event"; who: string; whoName: string; eventId: string; title: string; start: string; allDay: boolean; latestAt: string; keys: string[] };

export async function boardRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date }) {
  const { db, now } = opts;

  app.get("/api/board", { preHandler: requireMember }, async (req) => {
    const me = req.member!.id;
    const seen = (await db.select().from(boardSeen).where(eq(boardSeen.memberId, me)).limit(1))[0];
    const since = seen?.seenAt ?? new Date(now().getTime() - FIRST_LOOK_MS);
    const gone = new Set((await db.select({ key: boardDismissed.key }).from(boardDismissed).where(eq(boardDismissed.memberId, me))).map((d) => d.key));
    const rows = await db
      .select({ id: items.id, addedAt: items.addedAt, who: items.addedBy, whoName: members.displayName, listId: lists.id, listName: lists.name })
      .from(items)
      .innerJoin(lists, eq(items.listId, lists.id))
      .innerJoin(members, eq(items.addedBy, members.id))
      .where(and(ne(items.addedBy, me), gt(items.addedAt, since), listVisibleTo(me)))
      .orderBy(desc(items.addedAt));
    const groups = new Map<string, BoardRow>();
    for (const r of rows) {
      const one = `item:${r.id}`;
      if (gone.has(one)) continue;
      const key = r.who + "|" + r.listId;
      const g = groups.get(key);
      if (g) {
        g.count++;
        g.itemIds.push(r.id);
        g.keys.push(one);
      } else {
        groups.set(key, { kind: "shopping", who: r.who, whoName: r.whoName, listId: r.listId, listName: r.listName, count: 1, latestAt: r.addedAt.toISOString(), itemIds: [r.id], keys: [one] });
      }
    }
    const given = await db
      .select({ todoId: todos.id, title: todos.title, who: todoAssignees.assignedBy, whoName: members.displayName, at: todoAssignees.assignedAt })
      .from(todoAssignees)
      .innerJoin(todos, eq(todoAssignees.todoId, todos.id))
      .innerJoin(members, eq(todoAssignees.assignedBy, members.id))
      .where(and(eq(todoAssignees.memberId, me), ne(todoAssignees.assignedBy, me), gt(todoAssignees.assignedAt, since)));
    // The time is part of the key: given again later, the to-do shows up again.
    const todoRows: TodoBoardRow[] = given
      .map((g): TodoBoardRow => ({ kind: "todo", who: g.who, whoName: g.whoName, todoId: g.todoId, title: g.title, latestAt: g.at.toISOString(), keys: [`todo:${g.todoId}:${g.at.getTime()}`] }))
      .filter((r) => !gone.has(r.keys[0]!));
    const entered = await db
      .select({ eventId: events.id, title: events.title, startAt: events.startAt, allDay: events.allDay, who: eventFor.addedBy, whoName: members.displayName, at: eventFor.addedAt })
      .from(eventFor)
      .innerJoin(events, eq(eventFor.eventId, events.id))
      .innerJoin(members, eq(eventFor.addedBy, members.id))
      .where(and(eq(eventFor.memberId, me), ne(eventFor.addedBy, me), gt(eventFor.addedAt, since), eventVisibleTo(me)));
    const eventRows: EventBoardRow[] = entered
      .map((e): EventBoardRow => ({ kind: "event", who: e.who, whoName: e.whoName, eventId: e.eventId, title: e.title, start: e.startAt.toISOString(), allDay: e.allDay, latestAt: e.at.toISOString(), keys: [`event:${e.eventId}:${e.at.getTime()}`] }))
      .filter((r) => !gone.has(r.keys[0]!));
    return [...groups.values(), ...todoRows, ...eventRows].sort((a, b) => b.latestAt.localeCompare(a.latestAt)).slice(0, MAX_ROWS);
  });

  app.post("/api/board/seen", { preHandler: requireMember }, async (req) => {
    const me = req.member!.id;
    await db
      .insert(boardSeen)
      .values({ memberId: me, seenAt: now() })
      .onConflictDoUpdate({ target: boardSeen.memberId, set: { seenAt: now() } });
    // Everything before now is seen anyway; single ticks are no longer needed.
    await db.delete(boardDismissed).where(eq(boardDismissed.memberId, me));
    return { ok: true };
  });

  app.post("/api/board/dismiss", { preHandler: requireMember }, async (req, reply) => {
    const b = z.object({ keys: z.array(z.string().regex(/^(item|todo|event):[0-9a-f-]{8,64}(:\d{1,16})?$/)).min(1).max(200) }).strict().safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    await db
      .insert(boardDismissed)
      .values(b.data.keys.map((key) => ({ memberId: me, key, at: now() })))
      .onConflictDoNothing();
    return { ok: true };
  });
}
