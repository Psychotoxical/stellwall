import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Occ = { todoId: string; date: string | null; overdue: boolean };

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), set: (iso: string) => (t = new Date(iso).getTime()) };
}
const base = { reminders: [] as number[], time: null, until: null };

describe("stage 3 review fixes", () => {
  it("saving unchanged rule fields keeps overdue items", async () => {
    const c = clock("2026-11-20T08:00:00Z");
    const { app } = await createTestApp({ now: c.now });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const rule = { startDate: "2026-11-20", recurrence: { kind: "daily" }, time: null, until: null };
    const id = (await a.post("/api/todos", { ...base, ...rule, title: "Katzenklo", needsConfirm: true, visibility: { everyone: true, memberIds: [] }, assignees: [] })).json().id as string;
    c.set("2026-11-23T08:00:00Z");
    await a.patch(`/api/todos/${id}`, { ...rule, assignees: [f.sam.id] });
    const today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.filter((o) => o.overdue).map((o) => o.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
  });

  it("unassigning and making private in one save removes the former assignee", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/todos", { ...base, title: "Geschenk", needsConfirm: false, startDate: null, recurrence: { kind: "none" }, visibility: { everyone: true, memberIds: [] }, assignees: [f.sam.id] })).json().id as string;
    await a.patch(`/api/todos/${id}`, { assignees: [], visibility: { everyone: false, memberIds: [] } });
    expect((await as(app, f.sam.cookie).get(`/api/todos/${id}`)).statusCode).toBe(404);
  });

  it("on a private to-do only the creator adds assignees", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const id = (await as(app, f.kim.cookie).post("/api/todos", { ...base, title: "Geschenk für Sam", needsConfirm: false, startDate: null, recurrence: { kind: "none" }, visibility: { everyone: false, memberIds: [f.alex.id] }, assignees: [] })).json().id as string;
    expect((await as(app, f.alex.cookie).patch(`/api/todos/${id}`, { assignees: [f.sam.id] })).statusCode).toBe(403);
    expect((await as(app, f.sam.cookie).get(`/api/todos/${id}`)).statusCode).toBe(404);
    expect((await as(app, f.alex.cookie).patch(`/api/todos/${id}`, { assignees: [f.alex.id] })).statusCode).toBe(200);
  });
});
