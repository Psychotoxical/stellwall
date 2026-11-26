import type { FastifyInstance } from "fastify";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { formatAmount, isPantry, itemKey, mergeIngredients, scaleIngredient, shoppingQuantity, type Ingredient } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { mealPlan, members, pantryStaples, settings } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import { findVisibleList } from "../shopping/visibility.ts";
import { addToList } from "../shopping/items.ts";
import type { Notifier } from "../shopping/notify.ts";
import { MealieError, type Mealie } from "./mealie.ts";

const dateSchema = z.iso.date();
const recipeRef = z.object({ id: z.string().regex(/^[0-9a-f-]{8,64}$/), slug: z.string().regex(/^[a-z0-9-]{1,200}$/), name: z.string().trim().min(1).max(200) });
const mealBody = z
  .object({ recipe: recipeRef.nullable().optional(), text: z.string().trim().max(120).nullable().optional(), cookId: z.uuid().nullable(), servings: z.number().int().min(1).max(50) })
  .refine((b) => !!b.recipe !== !!b.text, "recipe or text");
const previewBody = z.object({ dates: z.array(dateSchema).min(1).max(14) });
const commitBody = z.object({ lines: z.array(z.object({ food: z.string().trim().min(1).max(80), quantity: z.string().trim().max(30) })).min(1).max(200) });
const pantryBody = z.object({ name: z.string().trim().min(1).max(80), variants: z.array(z.string().trim().min(1).max(80)).max(20).default([]) });
const idParam = z.object({ id: z.uuid() });
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

type Line = { food: string; quantity: string; display: string };
const lineOf = (i: Ingredient): Line => ({ food: i.food, quantity: shoppingQuantity(i), display: [i.quantity === null ? "" : formatAmount(i.quantity), i.unit ?? ""].filter(Boolean).join(" ") });

function dto(m: typeof mealPlan.$inferSelect) {
  return {
    date: m.date,
    recipe: m.recipeSlug ? { id: m.recipeId!, slug: m.recipeSlug, name: m.recipeName! } : null,
    text: m.text,
    cookId: m.cookId,
    servings: m.servings,
    updatedBy: m.updatedBy,
  };
}

export async function mealRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; mealie: Mealie; notify: Notifier }) {
  const { db, now, mealie, notify } = opts;

  async function mealList(me: string) {
    const id = (await db.select().from(settings).where(eq(settings.key, "meal_list_id")))[0]?.value;
    if (!id) return { error: "meal_list_missing" as const };
    const l = await findVisibleList(db, id, me);
    if (!l) return { error: "meal_list_hidden" as const };
    return { list: l };
  }

  app.get("/api/meals", { preHandler: requireMember }, async (req, reply) => {
    const q = z.object({ week: dateSchema }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    const rows = await db.select().from(mealPlan).where(and(gte(mealPlan.date, q.data.week), lt(mealPlan.date, addDays(q.data.week, 7))));
    return rows.sort((a, b) => a.date.localeCompare(b.date)).map(dto);
  });

  app.put("/api/meals/:date", { preHandler: requireMember }, async (req, reply) => {
    const p = z.object({ date: dateSchema }).safeParse(req.params);
    const b = mealBody.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "invalid_input" });
    if (b.data.cookId && !(await db.select({ id: members.id }).from(members).where(eq(members.id, b.data.cookId))).length) return reply.code(400).send({ error: "invalid_input" });
    const values = {
      recipeId: b.data.recipe?.id ?? null,
      recipeSlug: b.data.recipe?.slug ?? null,
      recipeName: b.data.recipe?.name ?? null,
      text: b.data.recipe ? null : b.data.text!,
      cookId: b.data.cookId,
      servings: b.data.servings,
      updatedBy: req.member!.id,
      updatedAt: now(),
    };
    const [row] = await db.insert(mealPlan).values({ date: p.data.date, ...values }).onConflictDoUpdate({ target: mealPlan.date, set: values }).returning();
    notify.meals();
    return dto(row!);
  });

  app.delete("/api/meals/:date", { preHandler: requireMember }, async (req, reply) => {
    const p = z.object({ date: dateSchema }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "invalid_input" });
    await db.delete(mealPlan).where(eq(mealPlan.date, p.data.date));
    notify.meals();
    return { ok: true };
  });

  app.post("/api/meals/shopping/preview", { preHandler: requireMember }, async (req, reply) => {
    const b = previewBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const target = await mealList(req.member!.id);
    if ("error" in target) return reply.code(409).send({ error: target.error });
    const meals = await db.select().from(mealPlan).where(inArray(mealPlan.date, b.data.dates));
    meals.sort((a, c) => a.date.localeCompare(c.date));
    const all: Ingredient[] = [];
    const missing: string[] = [];
    for (const m of meals) {
      if (!m.recipeSlug) continue;
      try {
        const r = await mealie.recipe(m.recipeSlug);
        all.push(...r.ingredients.map((i) => scaleIngredient(i, m.servings / r.servings)));
      } catch (e) {
        if (e instanceof MealieError && e.code !== "not_found") return reply.code(502).send({ error: e.code });
        missing.push(m.recipeName ?? m.recipeSlug);
      }
    }
    const staples = await db.select().from(pantryStaples);
    const merged = mergeIngredients(all);
    return {
      listId: target.list.id,
      listName: target.list.name,
      special: merged.filter((i) => !isPantry(i.food, staples)).map(lineOf),
      pantry: merged.filter((i) => isPantry(i.food, staples)).map(lineOf),
      missing,
    };
  });

  app.post("/api/meals/shopping/commit", { preHandler: requireMember }, async (req, reply) => {
    const b = commitBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const target = await mealList(me);
    if ("error" in target) return reply.code(409).send({ error: target.error });
    await db.transaction(async (tx) => {
      for (const l of b.data.lines) await addToList(tx, { listId: target.list.id, name: l.food, quantity: l.quantity, me, at: now() });
    });
    notify.list(target.list.id);
    return { added: b.data.lines.length, listId: target.list.id, listName: target.list.name };
  });

  app.get("/api/pantry", { preHandler: requireMember }, async () => {
    const rows = await db.select().from(pantryStaples);
    return rows.sort((a, b) => a.name.localeCompare(b.name, "de")).map((r) => ({ id: r.id, name: r.name, variants: r.variants }));
  });

  app.post("/api/pantry", { preHandler: requireMember }, async (req, reply) => {
    const b = pantryBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const all = await db.select({ name: pantryStaples.name }).from(pantryStaples);
    if (all.some((s) => itemKey(s.name) === itemKey(b.data.name))) return reply.code(409).send({ error: "exists" });
    const [row] = await db.insert(pantryStaples).values({ name: b.data.name, variants: b.data.variants }).returning();
    return { id: row!.id, name: row!.name, variants: row!.variants };
  });

  app.delete("/api/pantry/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    await db.delete(pantryStaples).where(eq(pantryStaples.id, p.data.id));
    return { ok: true };
  });
}
