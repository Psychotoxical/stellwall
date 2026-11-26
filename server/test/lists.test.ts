import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type ListDto = { id: string; name: string; visibility: { everyone: boolean; memberIds: string[] }; createdBy: string; openCount: number };

describe("lists", () => {
  it("default list is created once for the family", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = (await as(app, f.alex.cookie).get("/api/lists")).json() as ListDto[];
    const s = (await as(app, f.sam.cookie).get("/api/lists")).json() as ListDto[];
    expect(a.map((l) => l.name)).toEqual(["Einkauf"]);
    expect(s.map((l) => l.id)).toEqual(a.map((l) => l.id));
    expect(a[0]!.visibility.everyone).toBe(true);
  });

  it("stranger cannot see a private list", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const res = await as(app, f.alex.cookie).post("/api/lists", { name: "Geschenke", visibility: { everyone: false, memberIds: [f.sam.id] } });
    expect(res.statusCode).toBe(200);
    const id = res.json().id as string;
    expect(res.json().visibility.memberIds.sort()).toEqual([f.alex.id, f.sam.id].sort());
    const kimLists = (await as(app, f.kim.cookie).get("/api/lists")).json() as ListDto[];
    expect(kimLists.find((l) => l.id === id)).toBeUndefined();
    expect((await as(app, f.kim.cookie).patch("/api/lists/" + id, { name: "X" })).statusCode).toBe(404);
    expect((await as(app, f.kim.cookie).del("/api/lists/" + id)).statusCode).toBe(404);
    const samLists = (await as(app, f.sam.cookie).get("/api/lists")).json() as ListDto[];
    expect(samLists.find((l) => l.id === id)?.name).toBe("Geschenke");
  });

  it("only the creator changes visibility or deletes", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const id = (await as(app, f.alex.cookie).post("/api/lists", { name: "Drogerie", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    expect((await as(app, f.sam.cookie).patch("/api/lists/" + id, { name: "Drogeriemarkt" })).statusCode).toBe(200);
    expect((await as(app, f.sam.cookie).patch("/api/lists/" + id, { visibility: { everyone: false, memberIds: [f.sam.id] } })).statusCode).toBe(403);
    expect((await as(app, f.sam.cookie).del("/api/lists/" + id)).statusCode).toBe(403);
    expect((await as(app, f.alex.cookie).del("/api/lists/" + id)).statusCode).toBe(200);
  });

  it("rejects an empty name and an empty member set", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    expect((await as(app, f.alex.cookie).post("/api/lists", { name: "  ", visibility: { everyone: true, memberIds: [] } })).statusCode).toBe(400);
    expect((await as(app, f.alex.cookie).post("/api/lists", { name: "A", visibility: { everyone: false, memberIds: [] } })).statusCode).toBe(200);
  });

  it("removed member's private lists stay hidden from others", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const id = (await as(app, f.sam.cookie).post("/api/lists", { name: "Sams Liste", visibility: { everyone: false, memberIds: [] } })).json().id as string;
    await as(app, f.alex.cookie).del("/api/members/" + f.sam.id);
    const lists = (await as(app, f.alex.cookie).get("/api/lists")).json() as ListDto[];
    expect(lists.find((l) => l.id === id)).toBeUndefined();
  });
});
