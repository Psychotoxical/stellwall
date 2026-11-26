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

  it("says when no list is chosen yet", async () => {
    const { app, f } = await start();
    const r = await as(app, f.sam.cookie).post("/api/meals/shopping/commit", { lines: [{ food: "Paprika", quantity: "1×" }] });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: "meal_list_missing" });
  });

  it("the recipe page can shop for other servings than planned", async () => {
    const { app, f } = await withMealie();
    const r = await as(app, f.sam.cookie).post("/api/meals/shopping/preview", { dates: ["2026-12-01"], servings: 2 });
    expect((r.json() as { pantry: { food: string; quantity: string }[] }).pantry.map((l) => [l.food, l.quantity])).toEqual([["Mehl", "250 g"], ["Eier", "3×"], ["Öl", "1 EL"]]);
  });
});
