import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Item = { id: string; name: string; quantity: string; checkedAt: string | null };

async function start() {
  const { app } = await createTestApp();
  const f = await setupFamily(app);
  const listId = ((await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[])[0]!.id;
  return { app, f, listId };
}

describe("stage 2 review fixes", () => {
  it("a list made private later takes its learned names out of the family suggestions", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/lists", { name: "Geschenke", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    await a.post(`/api/lists/${id}/items`, { name: "Duftset für Mama" });
    await a.patch(`/api/lists/${id}`, { visibility: { everyone: false, memberIds: [] } });
    expect((await as(app, f.sam.cookie).get("/api/suggestions?q=duftset")).json()).toEqual([]);
    expect(((await a.get("/api/suggestions?q=duftset")).json() as { name: string }[]).map((s) => s.name)).toEqual(["Duftset für Mama"]);
  });

  it("a name used on another family list stays in the family suggestions", async () => {
    const { app, f, listId } = await start();
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/lists", { name: "Markt", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    await a.post(`/api/lists/${id}/items`, { name: "Quittenbrot" });
    await a.post(`/api/lists/${listId}/items`, { name: "Quittenbrot" });
    await a.patch(`/api/lists/${id}`, { visibility: { everyone: false, memberIds: [] } });
    expect(((await as(app, f.sam.cookie).get("/api/suggestions?q=quitten")).json() as { name: string }[]).map((s) => s.name)).toContain("Quittenbrot");
  });

  it("renaming onto an open item merges the two", async () => {
    const { app, f, listId } = await start();
    const a = as(app, f.alex.cookie);
    await a.post(`/api/lists/${listId}/items`, { name: "Milch", quantity: "1 l" });
    const butter = (await a.post(`/api/lists/${listId}/items`, { name: "Butter", quantity: "500 ml" })).json().id as string;
    await a.patch(`/api/items/${butter}`, { name: "milch" });
    const items = (await a.get(`/api/lists/${listId}/items`)).json() as Item[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Milch", quantity: "1,5 l" });
  });

  it("unchecking while the same item is open again merges the two", async () => {
    const { app, f, listId } = await start();
    const a = as(app, f.alex.cookie);
    const old = (await a.post(`/api/lists/${listId}/items`, { name: "Brot" })).json().id as string;
    await a.patch(`/api/items/${old}`, { checked: true });
    await a.post(`/api/lists/${listId}/items`, { name: "Brot" });
    await a.patch(`/api/items/${old}`, { checked: false });
    const items = (await a.get(`/api/lists/${listId}/items`)).json() as Item[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Brot", quantity: "2×", checkedAt: null });
  });

  it("repeated mixed amounts fold by unit instead of growing", async () => {
    const { app, f, listId } = await start();
    const a = as(app, f.alex.cookie);
    for (const q of ["1 l", "2 Pck", "1 l", "500 g", "1 Pck", "500 g"]) await a.post(`/api/lists/${listId}/items`, { name: "Sahne", quantity: q });
    const item = ((await a.get(`/api/lists/${listId}/items`)).json() as Item[])[0]!;
    expect(item.quantity).toBe("2 l + 3 Pck + 1 kg");
  });

  it("a member who sees no list gets a fresh family list", async () => {
    const { app, f, listId } = await start();
    await as(app, f.sam.cookie).post("/api/lists", { name: "Sams", visibility: { everyone: false, memberIds: [] } });
    expect((await as(app, f.alex.cookie).del(`/api/lists/${listId}`)).statusCode).toBe(200);
    const kim = (await as(app, f.kim.cookie).get("/api/lists")).json() as { name: string }[];
    expect(kim.map((l) => l.name)).toEqual(["Einkauf"]);
  });
});
