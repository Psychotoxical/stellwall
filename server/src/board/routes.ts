import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { boardSeen, eventFor, events, items, lists, members, todoAssignees, todos } from "../db/schema.ts";
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
};

export type TodoBoardRow = { kind: "todo"; who: string; whoName: string; todoId: string; title: string; latestAt: string };

export type EventBoardRow = { kind: "event"; who: string; whoName: string; eventId: string; title: string; start: string; allDay: boolean; latestAt: string };

export async function boardRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date }) {
  const { db, now } = opts;

  app.get("/api/board", { preHandler: requireMember }, async (req) => {
    const me = req.member!.id;
    const seen = (await db.select().from(boardSeen).where(eq(boardSeen.memberId, me)).limit(1))[0];
    const since = seen?.seenAt ?? new Date(now().getTime() - FIRST_LOOK_MS);
    const rows = await db
      .select({ id: items.id, addedAt: items.addedAt, who: items.addedBy, whoName: members.displayName, listId: lists.id, listName: lists.name })
      .from(items)
      .innerJoin(lists, eq(items.listId, lists.id))
      .innerJoin(members, eq(items.addedBy, members.id))
      .where(and(ne(items.addedBy, me), gt(items.addedAt, since), listVisibleTo(me)))
      .orderBy(desc(items.addedAt));
    const groups = new Map<string, BoardRow>();
    for (const r of rows) {
      const key = r.who + "|" + r.listId;
      const g = groups.get(key);
      if (g) {
        g.count++;
        g.itemIds.push(r.id);
      } else {
        groups.set(key, { kind: "shopping", who: r.who, whoName: r.whoName, listId: r.listId, listName: r.listName, count: 1, latestAt: r.addedAt.toISOString(), itemIds: [r.id] });
      }
    }
    const given = await db
      .select({ todoId: todos.id, title: todos.title, who: todoAssignees.assignedBy, whoName: members.displayName, at: todoAssignees.assignedAt })
      .from(todoAssignees)
      .innerJoin(todos, eq(todoAssignees.todoId, todos.id))
      .innerJoin(members, eq(todoAssignees.assignedBy, members.id))
      .where(and(eq(todoAssignees.memberId, me), ne(todoAssignees.assignedBy, me), gt(todoAssignees.assignedAt, since)));
    const todoRows: TodoBoardRow[] = given.map((g) => ({ kind: "todo", who: g.who, whoName: g.whoName, todoId: g.todoId, title: g.title, latestAt: g.at.toISOString() }));
    const entered = await db
      .select({ eventId: events.id, title: events.title, startAt: events.startAt, allDay: events.allDay, who: eventFor.addedBy, whoName: members.displayName, at: eventFor.addedAt })
      .from(eventFor)
      .innerJoin(events, eq(eventFor.eventId, events.id))
      .innerJoin(members, eq(eventFor.addedBy, members.id))
      .where(and(eq(eventFor.memberId, me), ne(eventFor.addedBy, me), gt(eventFor.addedAt, since), eventVisibleTo(me)));
    const eventRows: EventBoardRow[] = entered.map((e) => ({ kind: "event", who: e.who, whoName: e.whoName, eventId: e.eventId, title: e.title, start: e.startAt.toISOString(), allDay: e.allDay, latestAt: e.at.toISOString() }));
    return [...groups.values(), ...todoRows, ...eventRows].sort((a, b) => b.latestAt.localeCompare(a.latestAt)).slice(0, MAX_ROWS);
  });

  app.post("/api/board/seen", { preHandler: requireMember }, async (req) => {
    const me = req.member!.id;
    await db
      .insert(boardSeen)
      .values({ memberId: me, seenAt: now() })
      .onConflictDoUpdate({ target: boardSeen.memberId, set: { seenAt: now() } });
    return { ok: true };
  });
}
