import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Inst = { kind: string; title: string; date: string; age: number | null };
const everyone = { everyone: true, memberIds: [] as string[] };

describe("birthdays", () => {
  it("show up in the calendar with the age they turn", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    expect((await a.post("/api/birthdays", { name: "Oma", month: 12, day: 3, year: 1950, visibility: everyone, remindDays: 7, remindWho: [f.alex.id] })).statusCode).toBe(200);
    await a.post("/api/birthdays", { name: "Freund ohne Jahr", month: 12, day: 9, year: null, visibility: everyone, remindDays: 1, remindWho: [] });
    const got = (await as(app, f.sam.cookie).get("/api/calendar?from=2026-12-01T00:00:00Z&to=2026-12-31T00:00:00Z")).json() as Inst[];
    expect(got.filter((i) => i.kind === "birthday").map((i) => [i.title, i.date, i.age])).toEqual([
      ["Oma", "2026-12-03", 76],
      ["Freund ohne Jahr", "2026-12-09", null],
    ]);
  });

  it("29 February shows on 28 February in a common year", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    await as(app, f.alex.cookie).post("/api/birthdays", { name: "Schaltjahrkind", month: 2, day: 29, year: 2008, visibility: everyone, remindDays: 1, remindWho: [] });
    const got = (await as(app, f.alex.cookie).get("/api/calendar?from=2027-02-01T00:00:00Z&to=2027-03-15T00:00:00Z")).json() as Inst[];
    expect(got.map((i) => [i.date, i.age])).toEqual([["2027-02-28", 19]]);
  });

  it("private birthdays stay private", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    await as(app, f.alex.cookie).post("/api/birthdays", { name: "Überraschung", month: 6, day: 1, year: null, visibility: { everyone: false, memberIds: [f.sam.id] }, remindDays: 1, remindWho: [] });
    expect(((await as(app, f.sam.cookie).get("/api/birthdays")).json() as unknown[]).length).toBe(1);
    expect((await as(app, f.kim.cookie).get("/api/birthdays")).json()).toEqual([]);
    expect((await as(app, f.kim.cookie).get("/api/calendar?from=2026-06-01T00:00:00Z&to=2026-06-30T00:00:00Z")).json()).toEqual([]);
  });

  it("rejects impossible dates and lets only the creator delete", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    expect((await a.post("/api/birthdays", { name: "X", month: 4, day: 31, year: null, visibility: everyone, remindDays: 1, remindWho: [] })).statusCode).toBe(400);
    const id = (await a.post("/api/birthdays", { name: "Y", month: 4, day: 30, year: null, visibility: everyone, remindDays: 1, remindWho: [] })).json().id as string;
    expect((await as(app, f.sam.cookie).del(`/api/birthdays/${id}`)).statusCode).toBe(403);
    expect((await a.del(`/api/birthdays/${id}`)).statusCode).toBe(200);
  });
});
