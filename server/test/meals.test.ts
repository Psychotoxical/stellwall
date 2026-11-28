import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { H } from "./auth-helpers.ts";
import { TOKEN, startFakeMealie } from "./fake-mealie.ts";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function start() {
  const { app } = await createTestApp();
  const f = await setupFamily(app);
  const put = (cookie: string, url: string, body: object) => app.inject({ method: "PUT", url, headers: { ...H, cookie }, payload: body });
  return { app, f, put };
}

describe("meal plan", () => {
  it("one lunch per day, with a free text even without Mealie", async () => {
    const { app, f, put } = await start();
    expect((await put(f.sam.cookie, "/api/meals/2026-11-30", { text: "Pizza bestellen", cookId: null, servings: 4 })).statusCode).toBe(200);
    expect((await put(f.sam.cookie, "/api/meals/2026-12-01", { text: "Suppe", cookId: f.kim.id, servings: 3 })).statusCode).toBe(200);
    expect((await put(f.sam.cookie, "/api/meals/2026-12-01", { text: "Linsensuppe", cookId: f.kim.id, servings: 3 })).statusCode).toBe(200);
    const week = (await as(app, f.alex.cookie).get("/api/meals?week=2026-11-30")).json() as { date: string; text: string; cookId: string | null }[];
    expect(week.map((m) => [m.date, m.text, m.cookId])).toEqual([["2026-11-30", "Pizza bestellen", null], ["2026-12-01", "Linsensuppe", f.kim.id]]);
    expect((await as(app, f.kim.cookie).del("/api/meals/2026-11-30")).statusCode).toBe(200);
    expect(((await as(app, f.alex.cookie).get("/api/meals?week=2026-11-30")).json() as unknown[]).length).toBe(1);
  });

  it("needs either a recipe or a text", async () => {
    const { f, put } = await start();
    expect((await put(f.sam.cookie, "/api/meals/2026-11-30", { cookId: null, servings: 4 })).statusCode).toBe(400);
    expect((await put(f.sam.cookie, "/api/meals/2026-11-30", { text: " ", cookId: null, servings: 4 })).statusCode).toBe(400);
    expect((await put(f.sam.cookie, "/api/meals/2026-13-01", { text: "x", cookId: null, servings: 4 })).statusCode).toBe(400);
  });

  it("the pantry list belongs to everyone", async () => {
    const { app, f } = await start();
    const s = as(app, f.sam.cookie);
    const id = (await s.post("/api/pantry", { name: "Kokosmilch" })).json().id as string;
    expect(((await as(app, f.kim.cookie).get("/api/pantry")).json() as { name: string }[]).some((p) => p.name === "Kokosmilch")).toBe(true);
    expect((await as(app, f.kim.cookie).del(`/api/pantry/${id}`)).statusCode).toBe(200);
    expect((await s.post("/api/pantry", { name: "Salz" })).statusCode).toBe(409);
  });
});

describe("shopping for the meal plan", () => {
  async function withMealie() {
    const s = await start();
    const mealie = await startFakeMealie();
    closers.push(mealie.close);
    const a = as(s.app, s.f.alex.cookie);
    const list = (await a.post("/api/lists", { name: "Wocheneinkauf", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    await s.put(s.f.alex.cookie, "/api/settings/mealie", { url: mealie.url, token: TOKEN, listId: list });
    const veg = { id: "11111111-1111-4111-8111-111111111111", slug: "gemuese-pfanne", name: "Gemüsepfanne" };
    const pan = { id: "22222222-2222-4222-8222-222222222222", slug: "pfannkuchen", name: "Pfannkuchen" };
    await s.put(s.f.sam.cookie, "/api/meals/2026-11-30", { recipe: veg, cookId: null, servings: 2 });
    await s.put(s.f.sam.cookie, "/api/meals/2026-12-01", { recipe: pan, cookId: null, servings: 4 });
    await s.put(s.f.sam.cookie, "/api/meals/2026-12-02", { text: "Reste", cookId: null, servings: 4 });
    return { ...s, list };
  }

  it("scales, adds up and asks about what is usually at home", async () => {
    const { app, f } = await withMealie();
    const r = await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { dates: ["2026-11-30", "2026-12-01", "2026-12-02"] });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { listName: string; special: { food: string; quantity: string }[]; pantry: { food: string; quantity: string }[] };
    expect(body.listName).toBe("Wocheneinkauf");
    expect(body.special.map((l) => [l.food, l.quantity])).toEqual([["Paprika", "1×"]]);
    expect(body.pantry.map((l) => [l.food, l.quantity])).toEqual([["Reis", "100 g"], ["Öl", "2,75 EL"], ["Salz", ""], ["Mehl", "500 g"], ["Eier", "6×"]]);
  });

  it("puts the chosen lines on the fixed list and adds to what is there", async () => {
    const { app, f, list } = await withMealie();
    const s = as(app, f.sam.cookie);
    await s.post(`/api/lists/${list}/items`, { name: "Paprika", quantity: "1×" });
    const r = await s.post("/api/meals/shopping/commit", { lines: [{ food: "Paprika", quantity: "1×" }, { food: "Salz", quantity: "" }] });
    expect(r.json()).toEqual({ added: 2, listId: list, listName: "Wocheneinkauf" });
    const items = (await s.get(`/api/lists/${list}/items`)).json() as { name: string; quantity: string }[];
    expect(items.map((i) => [i.name, i.quantity]).sort()).toEqual([["Paprika", "2×"], ["Salz", ""]]);
  });

  it("makes a family list when none is chosen yet and keeps using it", async () => {
    const { app, f } = await start();
    const s = as(app, f.sam.cookie);
    const r = await s.post("/api/meals/shopping/commit", { lines: [{ food: "Paprika", quantity: "1×" }] });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ added: 1, listName: "Wocheneinkauf" });
    const again = await as(app, f.kim.cookie).post("/api/meals/shopping/commit", { lines: [{ food: "Reis", quantity: "" }] });
    expect(again.json().listId).toBe(r.json().listId);
    const lists = (await as(app, f.kim.cookie).get("/api/lists")).json() as { name: string }[];
    expect(lists.filter((l) => l.name === "Wocheneinkauf")).toHaveLength(1);
  });

  it("makes a new list when the chosen one was deleted", async () => {
    const { app, f, list } = await withMealie();
    expect((await as(app, f.alex.cookie).del(`/api/lists/${list}`)).statusCode).toBe(200);
    const s = as(app, f.sam.cookie);
    const preview = await s.post("/api/meals/shopping/preview", { dates: ["2026-11-30"] });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().listId).not.toBe(list);
    const r = await s.post("/api/meals/shopping/commit", { lines: [{ food: "Paprika", quantity: "1×" }] });
    expect(r.json()).toMatchObject({ added: 1, listId: preview.json().listId, listName: "Wocheneinkauf" });
  });

  it("the recipe page can shop for other servings than planned", async () => {
    const { app, f } = await withMealie();
    const r = await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { dates: ["2026-12-01"], servings: 2 });
    expect((r.json() as { pantry: { food: string; quantity: string }[] }).pantry.map((l) => [l.food, l.quantity])).toEqual([["Mehl", "250 g"], ["Eier", "3×"], ["Öl", "1 EL"]]);
  });
});

describe("the recipe book", () => {
  async function withMealie(opts: Parameters<typeof startFakeMealie>[0] = {}) {
    const s = await start();
    const mealie = await startFakeMealie(opts);
    closers.push(mealie.close);
    const a = as(s.app, s.f.alex.cookie);
    const list = (await a.post("/api/lists", { name: "Wocheneinkauf", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    await s.put(s.f.alex.cookie, "/api/settings/mealie", { url: mealie.url, token: TOKEN, listId: list });
    return { ...s, mealie };
  }

  it("shops for a recipe without a planned day, at the servings asked for", async () => {
    const { app, f } = await withMealie();
    const r = await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { recipe: { slug: "pfannkuchen", servings: 4 } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { pantry: { food: string; quantity: string }[]; special: unknown[] };
    expect(body.pantry.map((l) => [l.food, l.quantity])).toEqual([["Mehl", "500 g"], ["Eier", "6×"], ["Öl", "2 EL"]]);
    expect((await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { recipe: { slug: "pfannkuchen", servings: 4 }, dates: ["2026-11-30"] })).statusCode).toBe(400);
    expect((await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { recipe: { slug: "gibt-es-nicht", servings: 2 } })).statusCode).toBe(404);
  });

  const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");

  it("a photo becomes a recipe through Mealie's AI and shows up at once", async () => {
    const { app, f, mealie } = await withMealie();
    const a = as(app, f.sam.cookie);
    expect(((await a.get("/api/recipes?q=Foto")).json() as unknown[]).length).toBe(0);
    const r = await a.post("/api/recipes/import", { images: [{ data: PHOTO, type: "image/jpeg" }] });
    expect(r.statusCode).toBe(201);
    // A baking sheet has no servings: the amounts stay as written.
    expect(r.json()).toMatchObject({ slug: "neu-0", name: "Aus dem Foto", servings: 4, servingsKnown: false });
    expect(mealie.created).toEqual([{ kind: "ai", content: undefined, images: 1 }]);
    // The new recipe is in the book right away, not after the cache runs out.
    expect(((await a.get("/api/recipes?q=Foto")).json() as { slug: string }[]).map((x) => x.slug)).toEqual(["neu-0"]);
    // Its lines are read by Stellwall even though Mealie did not parse them.
    const recipe = (await a.get("/api/recipes/neu-0")).json() as { ingredients: { food: string; quantity: number | null; unit: string | null }[] };
    expect(recipe.ingredients[0]).toMatchObject({ food: "Mehl", quantity: 450, unit: "g", note: "und Mehl zum Arbeiten" });
  });

  it("a link goes to Mealie's importer, typed text to its AI", async () => {
    const { app, f, mealie } = await withMealie();
    const a = as(app, f.sam.cookie);
    expect((await a.post("/api/recipes/import", { url: "https://example.com/rezept" })).statusCode).toBe(201);
    expect((await a.post("/api/recipes/import", { text: "Pfannkuchen: 250 g Mehl, 3 Eier. Verrühren und backen." })).statusCode).toBe(201);
    expect(mealie.created.map((c) => [c.kind, c.url ?? c.content])).toEqual([["url", "https://example.com/rezept"], ["ai", "Pfannkuchen: 250 g Mehl, 3 Eier. Verrühren und backen."]]);
  });

  it("refuses empty or odd input, and says why Mealie could not", async () => {
    const { app, f } = await withMealie();
    const a = as(app, f.sam.cookie);
    expect((await a.post("/api/recipes/import", {})).statusCode).toBe(400);
    expect((await a.post("/api/recipes/import", { url: "file:///etc/passwd" })).statusCode).toBe(400);
    expect((await a.post("/api/recipes/import", { images: [{ data: PHOTO, type: "text/html" }] })).statusCode).toBe(400);
    const bad = await a.post("/api/recipes/import", { url: "https://example.com/kaputt" });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: "mealie_import_failed" });
  });

  it("an AI that fails or a Mealie user who may only read are told apart", async () => {
    const ai = await withMealie({ failAi: true });
    expect((await as(ai.app, ai.f.sam.cookie).post("/api/recipes/import", { text: "Brot" })).json()).toEqual({ error: "mealie_import_failed" });
    const ro = await withMealie({ readOnly: true });
    const r = await as(ro.app, ro.f.sam.cookie).post("/api/recipes/import", { text: "Brot" });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toEqual({ error: "mealie_auth" });
  });
});

