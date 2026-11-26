import type { FastifyInstance } from "fastify";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { items, listMembers, lists } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import { findVisibleList, listMemberIds, listVisibleTo } from "./visibility.ts";
import type { Notifier } from "./notify.ts";

export const DEFAULT_LIST_NAME = "Einkauf";

const visibilityBody = z.object({ everyone: z.boolean(), memberIds: z.array(z.uuid()).max(50) });
const nameSchema = z.string().trim().min(1).max(40);
const createBody = z.object({ name: nameSchema, visibility: visibilityBody });
const patchBody = z.object({ name: nameSchema.optional(), visibility: visibilityBody.optional() });
const idParam = z.object({ id: z.uuid() });

export type ListDto = {
  id: string;
  name: string;
  visibility: { everyone: boolean; memberIds: string[] };
  createdBy: string;
  openCount: number;
};

async function setMembers(db: Db, listId: string, everyone: boolean, memberIds: string[], creator: string) {
  await db.delete(listMembers).where(eq(listMembers.listId, listId));
  if (everyone) return;
  const ids = [...new Set([...memberIds, creator])];
  await db.insert(listMembers).values(ids.map((memberId) => ({ listId, memberId })));
}

export async function listRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; notify: Notifier }) {
  const { db, now, notify } = opts;

  async function toDto(l: typeof lists.$inferSelect): Promise<ListDto> {
    const open = await db.select({ n: count() }).from(items).where(and(eq(items.listId, l.id), isNull(items.checkedAt)));
    return {
      id: l.id,
      name: l.name,
      visibility: { everyone: l.everyone, memberIds: l.everyone ? [] : await listMemberIds(db, l.id) },
      createdBy: l.createdBy,
      openCount: open[0]?.n ?? 0,
    };
  }

  app.get("/api/lists", { preHandler: requireMember }, async (req) => {
    const me = req.member!.id;
    const total = (await db.select({ n: count() }).from(lists))[0]?.n ?? 0;
    if (total === 0) {
      await db.insert(lists).values({ name: DEFAULT_LIST_NAME, everyone: true, createdBy: me, createdAt: now() });
    }
    const rows = await db.select().from(lists).where(listVisibleTo(me)).orderBy(asc(lists.position), asc(lists.createdAt));
    return Promise.all(rows.map(toDto));
  });

  app.post("/api/lists", { preHandler: requireMember }, async (req, reply) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const [l] = await db
      .insert(lists)
      .values({ name: body.data.name, everyone: body.data.visibility.everyone, createdBy: me, createdAt: now() })
      .returning();
    await setMembers(db, l!.id, body.data.visibility.everyone, body.data.visibility.memberIds, me);
    notify.lists();
    return toDto(l!);
  });

  app.patch("/api/lists/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const l = await findVisibleList(db, p.data.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    if (body.data.visibility && l.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const set: Partial<typeof lists.$inferInsert> = {};
    if (body.data.name) set.name = body.data.name;
    if (body.data.visibility) set.everyone = body.data.visibility.everyone;
    const [updated] = Object.keys(set).length ? await db.update(lists).set(set).where(eq(lists.id, l.id)).returning() : [l];
    if (body.data.visibility) await setMembers(db, l.id, body.data.visibility.everyone, body.data.visibility.memberIds, l.createdBy);
    notify.lists();
    return toDto(updated!);
  });

  app.delete("/api/lists/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const me = req.member!.id;
    const l = await findVisibleList(db, p.data.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    if (l.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    await db.delete(lists).where(eq(lists.id, l.id));
    notify.lists();
    return { ok: true };
  });
}
