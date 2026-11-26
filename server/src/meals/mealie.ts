import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normalizeUnit, parseIngredient, type Ingredient } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { lists, settings } from "../db/schema.ts";
import { requireAdmin, requireMember } from "../auth/guard.ts";

const LIST_TTL_MS = 10 * 60_000;
const RECIPE_TTL_MS = 60 * 60_000;
const MAX_CACHE = 200;

export type RecipeSummary = { id: string; slug: string; name: string; servings: number; hasImage: boolean };
export type Recipe = RecipeSummary & { ingredients: Ingredient[]; steps: string[] };

/** Why Mealie could not help; the code goes to the page, never the key or Mealie's own text. */
export class MealieError extends Error {
  code: "mealie_not_configured" | "mealie_auth" | "mealie_unreachable" | "mealie_bad" | "not_found";
  constructor(code: MealieError["code"]) {
    super(code);
    this.code = code;
  }
}

type MealieIngredient = { quantity?: number | null; unit?: { name?: string; abbreviation?: string } | null; food?: { name?: string } | null; note?: string | null; originalText?: string | null; display?: string | null };
type MealieRecipe = { id?: string; slug?: string; name?: string; recipeServings?: number; image?: string | null; recipeIngredient?: MealieIngredient[]; recipeInstructions?: { text?: string }[] };

function summary(r: MealieRecipe): RecipeSummary {
  if (!r.id || !r.slug || !r.name) throw new MealieError("mealie_bad");
  return { id: r.id, slug: r.slug, name: r.name, servings: r.recipeServings && r.recipeServings > 0 ? r.recipeServings : 4, hasImage: !!r.image };
}

/** Mealie's structured fields when it parsed the line, Stellwall's own reading when it did not. */
export function ingredientOf(i: MealieIngredient): Ingredient | null {
  if (i.food?.name) {
    const parsed = i.note ? parseIngredient(i.note) : null;
    return { quantity: i.quantity && i.quantity > 0 ? i.quantity : null, unit: normalizeUnit(i.unit?.abbreviation || i.unit?.name), food: i.food.name.trim(), note: parsed ? i.note!.trim() : "" };
  }
  const text = (i.originalText || i.note || i.display || "").trim();
  // "Für den Teig:" is a heading inside the recipe, not something to buy.
  if (!text || text.endsWith(":")) return null;
  return parseIngredient(text);
}

export function createMealie(db: Db, timeoutMs: number) {
  const cache = new Map<string, { at: number; value: unknown }>();
  const cached = <T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value as T);
    return load().then((value) => {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), value });
      return value;
    });
  };

  async function config() {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["mealie_url", "mealie_token"]));
    const url = rows.find((r) => r.key === "mealie_url")?.value;
    const token = rows.find((r) => r.key === "mealie_token")?.value;
    if (!url || !token) throw new MealieError("mealie_not_configured");
    return { url: url.replace(/\/+$/, ""), token };
  }

  async function call(path: string): Promise<Response> {
    const { url, token } = await config();
    let res: Response;
    try {
      res = await fetch(url + path, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    } catch {
      throw new MealieError("mealie_unreachable");
    }
    if (res.status === 401 || res.status === 403) throw new MealieError("mealie_auth");
    if (res.status === 404) throw new MealieError("not_found");
    if (!res.ok) throw new MealieError("mealie_unreachable");
    return res;
  }
  const json = async <T>(path: string): Promise<T> => {
    const res = await call(path);
    try {
      return (await res.json()) as T;
    } catch {
      throw new MealieError("mealie_bad");
    }
  };

  return {
    clear: () => cache.clear(),
    search: (q: string) =>
      cached(`s:${q.toLowerCase()}`, LIST_TTL_MS, async () => {
        const body = await json<{ items?: MealieRecipe[]; data?: MealieRecipe[] }>(`/api/recipes?search=${encodeURIComponent(q)}&perPage=24&page=1&orderBy=name&orderDirection=asc`);
        const items = body.items ?? body.data;
        if (!Array.isArray(items)) throw new MealieError("mealie_bad");
        // One odd entry in Mealie must not break the whole search.
        return items.flatMap((r) => {
          try {
            return [summary(r)];
          } catch {
            return [];
          }
        });
      }),
    /** How many recipes Mealie holds in total, not just the first page. */
    count: async () => {
      const body = await json<{ total?: number; items?: unknown[]; data?: unknown[] }>("/api/recipes?perPage=1&page=1");
      if (typeof body.total === "number") return body.total;
      const items = body.items ?? body.data;
      if (!Array.isArray(items)) throw new MealieError("mealie_bad");
      return items.length;
    },
    recipe: (slug: string) =>
      cached(`r:${slug}`, RECIPE_TTL_MS, async (): Promise<Recipe> => {
        const r = await json<MealieRecipe>(`/api/recipes/${encodeURIComponent(slug)}`);
        return {
          ...summary(r),
          ingredients: (r.recipeIngredient ?? []).map(ingredientOf).filter((x): x is Ingredient => !!x && !!x.food),
          steps: (r.recipeInstructions ?? []).map((s) => (s.text ?? "").trim()).filter(Boolean),
        };
      }),
    image: async (id: string) => {
      const res = await call(`/api/media/recipes/${encodeURIComponent(id)}/images/min-original.webp`);
      return { type: res.headers.get("content-type") ?? "image/webp", body: Buffer.from(await res.arrayBuffer()) };
    },
  };
}
export type Mealie = ReturnType<typeof createMealie>;

const settingsBody = z.object({
  url: z.string().trim().max(500).regex(/^https?:\/\/[^\s]+$/).optional(),
  token: z.string().trim().min(1).max(4000).optional(),
  listId: z.uuid().nullable().optional(),
});

const STATUS: Record<MealieError["code"], number> = { mealie_not_configured: 409, mealie_auth: 502, mealie_unreachable: 502, mealie_bad: 502, not_found: 404 };

export async function mealieRoutes(app: FastifyInstance, opts: { db: Db; mealie: Mealie }) {
  const { db, mealie } = opts;
  const read = async (key: string) => (await db.select().from(settings).where(eq(settings.key, key)))[0]?.value ?? null;
  const write = (key: string, value: string | null) =>
    value === null
      ? db.delete(settings).where(eq(settings.key, key))
      : db.insert(settings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });

  const fail = (reply: { code: (n: number) => { send: (b: object) => unknown } }, e: unknown) => {
    const code = e instanceof MealieError ? e.code : "mealie_unreachable";
    return reply.code(STATUS[code]).send({ error: code });
  };

  app.get("/api/settings/mealie", { preHandler: requireAdmin }, async () => ({ url: await read("mealie_url"), hasToken: !!(await read("mealie_token")), listId: await read("meal_list_id") }));

  app.put("/api/settings/mealie", { preHandler: requireAdmin }, async (req, reply) => {
    const b = settingsBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    if (b.data.listId && !(await db.select({ id: lists.id }).from(lists).where(eq(lists.id, b.data.listId))).length) return reply.code(400).send({ error: "invalid_input" });
    // The key belongs to one server: a new address without a new key drops the old one.
    if (b.data.url !== undefined && b.data.token === undefined && b.data.url !== (await read("mealie_url"))) await write("mealie_token", null);
    if (b.data.url !== undefined) await write("mealie_url", b.data.url);
    if (b.data.token !== undefined) await write("mealie_token", b.data.token);
    if (b.data.listId !== undefined) await write("meal_list_id", b.data.listId);
    mealie.clear();
    return { ok: true };
  });

  app.post("/api/settings/mealie/test", { preHandler: requireAdmin }, async (_req, reply) => {
    try {
      mealie.clear();
      return { ok: true, recipes: await mealie.count() };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/recipes", { preHandler: requireMember }, async (req, reply) => {
    const q = z.object({ q: z.string().max(100).default("") }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      return await mealie.search(q.data.q.trim());
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/recipes/:slug", { preHandler: requireMember }, async (req, reply) => {
    const p = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,200}$/) }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    try {
      return await mealie.recipe(p.data.slug);
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.get("/api/recipes/:id/image", { preHandler: requireMember }, async (req, reply) => {
    const p = z.object({ id: z.string().regex(/^[0-9a-f-]{8,64}$/) }).safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    try {
      const img = await mealie.image(p.data.id);
      if (!img.type.startsWith("image/")) return reply.code(404).send({ error: "not_found" });
      return reply.type(img.type).header("cache-control", "private, max-age=86400").send(img.body);
    } catch (e) {
      return fail(reply, e);
    }
  });
}
