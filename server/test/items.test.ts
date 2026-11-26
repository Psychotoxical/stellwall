import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Item = { id: string; name: string; quantity: string; category: string; checkedAt: string | null; checkedBy: string | null };

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), set: (iso: string) => (t = new Date(iso).getTime()) };
}

async function familyWithList(now?: () => Date) {
  const { app } = await createTestApp(now ? { now } : {});
  const f = await setupFamily(app);
  const lists = (await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[];
  return { app, f, listId: lists[0]!.id };
}

describe("items", () => {
  it("same name in any spelling is one item with merged amounts", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    await a.post(`/api/lists/${listId}/items`, { name: "Milch", quantity: "1 l" });
    await as(app, f.sam.cookie).post(`/api/lists/${listId}/items`, { name: " MILCH ", quantity: "500 ml" });
    await a.post(`/api/lists/${listId}/items`, { name: "milch" });
    const list = (await a.get(`/api/lists/${listId}/items`)).json() as Item[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Milch", quantity: "1,5 l + 1×", category: "Kühlregal" });
  });

  it("a checked item is not merged into; a new open one is created", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    const id = (await a.post(`/api/lists/${listId}/items`, { name: "Brot" })).json().id as string;
    await a.patch(`/api/items/${id}`, { checked: true });
    await a.post(`/api/lists/${listId}/items`, { name: "Brot" });
    const list = (await a.get(`/api/lists/${listId}/items`)).json() as Item[];
    expect(list.filter((i) => i.name === "Brot")).toHaveLength(2);
    expect(list.filter((i) => i.checkedAt === null)).toHaveLength(1);
  });

  it("unknown items go to Sonstiges, known ones to their section", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    expect((await a.post(`/api/lists/${listId}/items`, { name: "Zwiebeln" })).json().category).toBe("Obst & Gemüse");
    expect((await a.post(`/api/lists/${listId}/items`, { name: "Glühwürmchenfutter" })).json().category).toBe("Sonstiges");
  });

  it("items checked yesterday are gone, today's stay", async () => {
    const c = clock("2026-11-26T20:00:00Z");
    const { app, f, listId } = await familyWithList(c.now);
    const a = as(app, f.alex.cookie);
    const late = (await a.post(`/api/lists/${listId}/items`, { name: "Butter" })).json().id as string;
    const early = (await a.post(`/api/lists/${listId}/items`, { name: "Eier" })).json().id as string;
    c.set("2026-11-26T22:59:00Z"); // 23:59 in Berlin
    await a.patch(`/api/items/${late}`, { checked: true });
    c.set("2026-11-26T23:01:00Z"); // 00:01 the next day
    await a.patch(`/api/items/${early}`, { checked: true });
    let names = ((await a.get(`/api/lists/${listId}/items`)).json() as Item[]).map((i) => i.name);
    expect(names).toEqual(["Eier"]);
    c.set("2026-11-27T22:30:00Z"); // still the same day for Eier
    names = ((await a.get(`/api/lists/${listId}/items`)).json() as Item[]).map((i) => i.name);
    expect(names).toEqual(["Eier"]);
    c.set("2026-11-27T23:00:30Z");
    expect((await a.get(`/api/lists/${listId}/items`)).json()).toEqual([]);
  });

  it("parallel check of one item ends checked once", async () => {
    const { app, f, listId } = await familyWithList();
    const id = (await as(app, f.alex.cookie).post(`/api/lists/${listId}/items`, { name: "Käse" })).json().id as string;
    const [r1, r2] = await Promise.all([
      as(app, f.alex.cookie).patch(`/api/items/${id}`, { checked: true }),
      as(app, f.sam.cookie).patch(`/api/items/${id}`, { checked: true }),
    ]);
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    const item = ((await as(app, f.alex.cookie).get(`/api/lists/${listId}/items`)).json() as Item[])[0]!;
    expect(item.checkedAt).not.toBeNull();
    expect([f.alex.id, f.sam.id]).toContain(item.checkedBy);
    expect(r1.json().checkedBy).toBe(item.checkedBy);
    expect(r2.json().checkedBy).toBe(item.checkedBy);
  });

  it("unchecking clears who checked", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    const id = (await a.post(`/api/lists/${listId}/items`, { name: "Salz" })).json().id as string;
    await a.patch(`/api/items/${id}`, { checked: true });
    const r = await a.patch(`/api/items/${id}`, { checked: false });
    expect(r.json()).toMatchObject({ checkedAt: null, checkedBy: null });
  });

  it("rejects empty and too long input", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    expect((await a.post(`/api/lists/${listId}/items`, { name: "   " })).statusCode).toBe(400);
    expect((await a.post(`/api/lists/${listId}/items`, { name: "x".repeat(81) })).statusCode).toBe(400);
    expect((await a.post(`/api/lists/${listId}/items`, { name: "Reis", quantity: "1".repeat(31) })).statusCode).toBe(400);
    expect((await a.post(`/api/lists/${listId}/items`, { name: "Reis", category: "Unsinn" })).statusCode).toBe(400);
  });

  it("strangers cannot read or change items of a private list", async () => {
    const { app, f } = await familyWithList();
    const a = as(app, f.alex.cookie);
    const listId = (await a.post("/api/lists", { name: "Geheim", visibility: { everyone: false, memberIds: [] } })).json().id as string;
    const id = (await a.post(`/api/lists/${listId}/items`, { name: "Geschenkpapier" })).json().id as string;
    const k = as(app, f.kim.cookie);
    expect((await k.get(`/api/lists/${listId}/items`)).statusCode).toBe(404);
    expect((await k.post(`/api/lists/${listId}/items`, { name: "X" })).statusCode).toBe(404);
    expect((await k.patch(`/api/items/${id}`, { checked: true })).statusCode).toBe(404);
    expect((await k.del(`/api/items/${id}`)).statusCode).toBe(404);
  });

  it("deletes an item", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    const id = (await a.post(`/api/lists/${listId}/items`, { name: "Tee" })).json().id as string;
    expect((await a.del(`/api/items/${id}`)).statusCode).toBe(200);
    expect((await a.get(`/api/lists/${listId}/items`)).json()).toEqual([]);
  });
});

describe("suggestions", () => {
  it("come from the catalog", async () => {
    const { app, f, listId } = await familyWithList();
    const res = (await as(app, f.alex.cookie).get(`/api/suggestions?q=zwieb&list=${listId}`)).json() as { name: string }[];
    expect(res.map((s) => s.name)).toContain("Zwiebeln");
  });

  it("family list teaches everyone, private list only the owner", async () => {
    const { app, f, listId } = await familyWithList();
    const a = as(app, f.alex.cookie);
    await a.post(`/api/lists/${listId}/items`, { name: "Quittenbrot vom Markt" });
    const priv = (await a.post("/api/lists", { name: "Privat", visibility: { everyone: false, memberIds: [] } })).json().id as string;
    await a.post(`/api/lists/${priv}/items`, { name: "Geheimrezept-Zutat" });
    const sam = as(app, f.sam.cookie);
    const s1 = (await sam.get("/api/suggestions?q=quitten")).json() as { name: string }[];
    expect(s1.map((s) => s.name)).toContain("Quittenbrot vom Markt");
    const s2 = (await sam.get("/api/suggestions?q=geheim")).json() as { name: string }[];
    expect(s2).toEqual([]);
    const own = (await a.get("/api/suggestions?q=geheim")).json() as { name: string }[];
    expect(own.map((s) => s.name)).toEqual(["Geheimrezept-Zutat"]);
  });
});
