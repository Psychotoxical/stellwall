import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CATALOG, CATEGORIES, OTHER, itemKey, mergeQuantity, startOfLocalDay, suggest } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { catalogEntries, items, lists } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import { findVisibleList, listVisibleTo } from "./visibility.ts";
import type { Notifier } from "./notify.ts";

const nameSchema = z.string().trim().min(1).max(80);
const quantitySchema = z.string().trim().max(30);
const categorySchema = z.enum(CATEGORIES);
const addBody = z.object({ name: nameSchema, quantity: quantitySchema.optional(), category: categorySchema.optional() });
const patchBody = z.object({
  checked: z.boolean().optional(),
  name: nameSchema.optional(),
  quantity: quantitySchema.optional(),
  category: categorySchema.optional(),
});
const idParam = z.object({ id: z.uuid() });
const suggestQuery = z.object({ q: z.string().max(80).default("") });

const CATALOG_BY_KEY = new Map(CATALOG.map((c) => [itemKey(c.name), c]));
const ORDER = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));

export type ItemDto = {
  id: string;
  listId: string;
  name: string;
  quantity: string;
  category: string;
  addedBy: string;
  addedAt: string;
  checkedAt: string | null;
  checkedBy: string | null;
};

const toDto = (i: typeof items.$inferSelect): ItemDto => ({
  id: i.id,
  listId: i.listId,
  name: i.name,
  quantity: i.quantity,
  category: i.category,
  addedBy: i.addedBy,
  addedAt: i.addedAt.toISOString(),
  checkedAt: i.checkedAt?.toISOString() ?? null,
  checkedBy: i.checkedBy,
});

export async function itemRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; timeZone: string; notify: Notifier }) {
  const { db, now, timeZone, notify } = opts;

  /** Items checked before today's local midnight are gone. */
  async function sweep(listId: string) {
    const dayStart = startOfLocalDay(now(), timeZone);
    await db.delete(items).where(and(eq(items.listId, listId), isNotNull(items.checkedAt), lt(items.checkedAt, dayStart)));
  }

  async function visibleItem(id: string, memberId: string) {
    const rows = await db
      .select({ item: items })
      .from(items)
      .innerJoin(lists, eq(items.listId, lists.id))
      .where(and(eq(items.id, id), listVisibleTo(memberId)))
      .limit(1);
    return rows[0]?.item ?? null;
  }

  async function knownCategory(exec: Pick<Db, "select">, key: string, memberId: string): Promise<string> {
    const own = await exec
      .select({ category: catalogEntries.category, scope: catalogEntries.scope })
      .from(catalogEntries)
      .where(and(eq(catalogEntries.key, key), inArray(catalogEntries.scope, [memberId, "family"])));
    const mine = own.find((o) => o.scope === memberId) ?? own[0];
    return mine?.category ?? CATALOG_BY_KEY.get(key)?.category ?? OTHER;
  }

  async function learn(scope: string, key: string, name: string, category: string) {
    await db
      .insert(catalogEntries)
      .values({ scope, key, name, category, uses: 1, lastUsed: now() })
      .onConflictDoUpdate({
        target: [catalogEntries.scope, catalogEntries.key],
        set: { uses: sql`${catalogEntries.uses} + 1`, lastUsed: now(), category },
      });
  }

  app.get("/api/lists/:id/items", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const l = await findVisibleList(db, p.data.id, req.member!.id);
    if (!l) return reply.code(404).send({ error: "not_found" });
    await sweep(l.id);
    const rows = await db.select().from(items).where(eq(items.listId, l.id));
    rows.sort(
      (a, b) =>
        (ORDER.get(a.category) ?? 99) - (ORDER.get(b.category) ?? 99) || a.name.localeCompare(b.name, "de"),
    );
    return rows.map(toDto);
  });

  app.post("/api/lists/:id/items", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const me = req.member!.id;
    const l = await findVisibleList(db, p.data.id, me);
    if (!l) return reply.code(404).send({ error: "not_found" });
    const body = addBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const key = itemKey(body.data.name);
    const quantity = body.data.quantity ?? "";
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${l.id + "|" + key}))`);
      const open = await tx
        .select()
        .from(items)
        .where(and(eq(items.listId, l.id), eq(items.key, key), isNull(items.checkedAt)))
        .limit(1);
      if (open[0]) {
        const [u] = await tx
          .update(items)
          .set({ quantity: mergeQuantity(open[0].quantity, quantity), ...(body.data.category ? { category: body.data.category } : {}) })
          .where(eq(items.id, open[0].id))
          .returning();
        return u!;
      }
      const category = body.data.category ?? (await knownCategory(tx, key, me));
      const [n] = await tx
        .insert(items)
        .values({ listId: l.id, name: body.data.name, key, quantity, category, addedBy: me, addedAt: now() })
        .returning();
      return n!;
    });
    await learn(l.everyone ? "family" : me, key, result.name, result.category);
    notify.list(l.id);
    return toDto(result);
  });

  app.patch("/api/items/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const item = await visibleItem(p.data.id, me);
    if (!item) return reply.code(404).send({ error: "not_found" });
    const { checked, ...fields } = body.data;
    const set: Partial<typeof items.$inferInsert> = { ...fields };
    if (fields.name) set.key = itemKey(fields.name);
    const key = set.key ?? item.key;
    const fresh = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${item.listId + "|" + key}))`);
      if (Object.keys(set).length) await tx.update(items).set(set).where(eq(items.id, item.id));
      if (checked === true) {
        // Only the first check counts; a second one in parallel changes nothing.
        await tx.update(items).set({ checkedAt: now(), checkedBy: me }).where(and(eq(items.id, item.id), isNull(items.checkedAt)));
      } else if (checked === false) {
        await tx.update(items).set({ checkedAt: null, checkedBy: null }).where(eq(items.id, item.id));
      }
      const [cur] = await tx.select().from(items).where(eq(items.id, item.id));
      if (!cur) return null;
      // An open item that now has the name of another open item joins it.
      if (!cur.checkedAt) {
        const [twin] = await tx
          .select()
          .from(items)
          .where(and(eq(items.listId, cur.listId), eq(items.key, cur.key), isNull(items.checkedAt), ne(items.id, cur.id)))
          .limit(1);
        if (twin) {
          const [merged] = await tx
            .update(items)
            .set({ quantity: mergeQuantity(twin.quantity, cur.quantity) })
            .where(eq(items.id, twin.id))
            .returning();
          await tx.delete(items).where(eq(items.id, cur.id));
          return merged!;
        }
      }
      return cur;
    });
    if (!fresh) return reply.code(404).send({ error: "not_found" });
    notify.list(item.listId);
    return toDto(fresh);
  });

  app.delete("/api/items/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const item = await visibleItem(p.data.id, req.member!.id);
    if (!item) return reply.code(404).send({ error: "not_found" });
    await db.delete(items).where(eq(items.id, item.id));
    notify.list(item.listId);
    return { ok: true };
  });

  app.get("/api/suggestions", { preHandler: requireMember }, async (req, reply) => {
    const q = suggestQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const own = await db
      .select({ name: catalogEntries.name, category: catalogEntries.category, uses: catalogEntries.uses })
      .from(catalogEntries)
      .where(or(eq(catalogEntries.scope, "family"), eq(catalogEntries.scope, me)));
    return suggest(q.data.q, CATALOG, own);
  });
}
