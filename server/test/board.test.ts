import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Row = { who: string; whoName: string; listId: string; listName: string; count: number; itemIds: string[] };

describe("board", () => {
  it("shows what others added, grouped per person and list", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const listId = ((await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[])[0]!.id;
    const sam = as(app, f.sam.cookie);
    await sam.post(`/api/lists/${listId}/items`, { name: "Milch" });
    await sam.post(`/api/lists/${listId}/items`, { name: "Brot" });
    const rows = (await as(app, f.alex.cookie).get("/api/board")).json() as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ who: f.sam.id, whoName: "Sam", listName: "Einkauf", count: 2 });
    expect(rows[0]!.itemIds).toHaveLength(2);
  });

  it("own additions never appear", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const listId = ((await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[])[0]!.id;
    await as(app, f.alex.cookie).post(`/api/lists/${listId}/items`, { name: "Milch" });
    expect((await as(app, f.alex.cookie).get("/api/board")).json()).toEqual([]);
  });

  it("entries of invisible lists never appear", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const priv = (await as(app, f.sam.cookie).post("/api/lists", { name: "Privat", visibility: { everyone: false, memberIds: [] } })).json().id as string;
    await as(app, f.sam.cookie).post(`/api/lists/${priv}/items`, { name: "Geschenk" });
    expect((await as(app, f.kim.cookie).get("/api/board")).json()).toEqual([]);
  });

  it("seen clears the board", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const listId = ((await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[])[0]!.id;
    await as(app, f.sam.cookie).post(`/api/lists/${listId}/items`, { name: "Milch" });
    expect(((await as(app, f.alex.cookie).get("/api/board")).json() as Row[]).length).toBe(1);
    expect((await as(app, f.alex.cookie).post("/api/board/seen")).statusCode).toBe(200);
    expect((await as(app, f.alex.cookie).get("/api/board")).json()).toEqual([]);
  });
});
