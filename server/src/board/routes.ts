import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { boardSeen, items, lists, members } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import { listVisibleTo } from "../shopping/visibility.ts";

const FIRST_LOOK_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 10;

export type BoardRow = {
  who: string;
  whoName: string;
  listId: string;
  listName: string;
  count: number;
  latestAt: string;
  itemIds: string[];
};

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
        groups.set(key, { who: r.who, whoName: r.whoName, listId: r.listId, listName: r.listName, count: 1, latestAt: r.addedAt.toISOString(), itemIds: [r.id] });
      }
    }
    return [...groups.values()].slice(0, MAX_ROWS);
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
