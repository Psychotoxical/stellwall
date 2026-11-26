import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Occ = { todoId: string; title: string; date: string | null; overdue: boolean; done: { by: string } | null; assignees: string[] };

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), set: (iso: string) => (t = new Date(iso).getTime()) };
}

const everyone = { everyone: true, memberIds: [] as string[] };
const base = { needsConfirm: false, reminders: [] as number[], assignees: [] as string[], time: null, until: null };

async function start(now?: () => Date) {
  const { app } = await createTestApp(now ? { now } : {});
  const f = await setupFamily(app);
  return { app, f };
}

describe("to-dos", () => {
  it("weekly rule shows up on its day in today", async () => {
    const c = clock("2026-11-24T08:00:00Z"); // a Tuesday
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    const r = await a.post("/api/todos", { ...base, title: "Müll rausbringen", visibility: everyone, startDate: "2026-11-01", recurrence: { kind: "weekly", weekdays: [2] } });
    expect(r.statusCode).toBe(200);
    const today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.map((o) => [o.title, o.date])).toEqual([["Müll rausbringen", "2026-11-24"]]);
    c.set("2026-11-25T08:00:00Z");
    expect((await a.get("/api/todos?view=today")).json()).toEqual([]);
  });

  it("an unconfirmed occurrence from yesterday is overdue today and gone after checking", async () => {
    const c = clock("2026-11-23T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/todos", { ...base, title: "Katzenklo sauber machen", needsConfirm: true, visibility: everyone, startDate: "2026-11-23", recurrence: { kind: "daily" } })).json().id as string;
    c.set("2026-11-24T08:00:00Z");
    let today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.map((o) => [o.date, o.overdue])).toEqual([["2026-11-23", true], ["2026-11-24", false]]);
    expect((await a.post(`/api/todos/${id}/done`, { date: "2026-11-23" })).statusCode).toBe(200);
    today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.map((o) => o.date)).toEqual(["2026-11-24"]);
  });

  it("a to-do without confirmation is never overdue", async () => {
    const c = clock("2026-11-23T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    await a.post("/api/todos", { ...base, title: "Pflanzen gießen", visibility: everyone, startDate: "2026-11-23", recurrence: { kind: "daily" } });
    c.set("2026-11-25T08:00:00Z");
    const today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.map((o) => [o.date, o.overdue])).toEqual([["2026-11-25", false]]);
  });

  it("changing the rule creates no ghost overdue items before the change", async () => {
    const c = clock("2026-11-02T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/todos", { ...base, title: "Bad putzen", needsConfirm: true, visibility: everyone, startDate: "2026-11-02", recurrence: { kind: "weekly", weekdays: [1] } })).json().id as string;
    c.set("2026-11-20T08:00:00Z");
    await a.patch(`/api/todos/${id}`, { recurrence: { kind: "weekly", weekdays: [5] } });
    const today = (await a.get("/api/todos?view=today")).json() as Occ[];
    expect(today.map((o) => [o.date, o.overdue])).toEqual([["2026-11-20", false]]);
  });

  it("two people checking the same occurrence end with one done row", async () => {
    const c = clock("2026-11-24T08:00:00Z");
    const { app, f } = await start(c.now);
    const id = (await as(app, f.alex.cookie).post("/api/todos", { ...base, title: "Spülmaschine ausräumen", needsConfirm: true, visibility: everyone, startDate: "2026-11-24", recurrence: { kind: "none" } })).json().id as string;
    const [r1, r2] = await Promise.all([
      as(app, f.alex.cookie).post(`/api/todos/${id}/done`, { date: "2026-11-24" }),
      as(app, f.sam.cookie).post(`/api/todos/${id}/done`, { date: "2026-11-24" }),
    ]);
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(r1.json().by).toBe(r2.json().by);
    const occ = ((await as(app, f.kim.cookie).get("/api/todos?view=today")).json() as Occ[])[0]!;
    expect(occ.done?.by).toBe(r1.json().by);
  });

  it("strangers never see a private to-do, assignees always do", async () => {
    const c = clock("2026-11-24T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/todos", { ...base, title: "Geschenk einpacken", visibility: { everyone: false, memberIds: [] }, assignees: [f.sam.id], startDate: "2026-11-24", recurrence: { kind: "none" } })).json().id as string;
    expect(((await as(app, f.sam.cookie).get("/api/todos?view=today")).json() as Occ[]).map((o) => o.todoId)).toEqual([id]);
    expect((await as(app, f.kim.cookie).get("/api/todos?view=today")).json()).toEqual([]);
    expect((await as(app, f.kim.cookie).post(`/api/todos/${id}/done`, { date: "2026-11-24" })).statusCode).toBe(404);
    expect((await as(app, f.kim.cookie).patch(`/api/todos/${id}`, { title: "x" })).statusCode).toBe(404);
  });

  it("mine shows what is assigned to me", async () => {
    const c = clock("2026-11-24T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    await a.post("/api/todos", { ...base, title: "Für Sam", visibility: everyone, assignees: [f.sam.id], startDate: "2026-11-24", recurrence: { kind: "none" } });
    await a.post("/api/todos", { ...base, title: "Für Kim", visibility: everyone, assignees: [f.kim.id], startDate: "2026-11-24", recurrence: { kind: "none" } });
    const mine = (await as(app, f.sam.cookie).get("/api/todos?view=today&mine=1")).json() as Occ[];
    expect(mine.map((o) => o.title)).toEqual(["Für Sam"]);
  });

  it("undated and upcoming views", async () => {
    const c = clock("2026-11-24T08:00:00Z");
    const { app, f } = await start(c.now);
    const a = as(app, f.alex.cookie);
    await a.post("/api/todos", { ...base, title: "Keller aufräumen", visibility: everyone, startDate: null, recurrence: { kind: "none" } });
    await a.post("/api/todos", { ...base, title: "Reifen wechseln", visibility: everyone, startDate: "2026-11-30", recurrence: { kind: "none" } });
    expect(((await a.get("/api/todos?view=undated")).json() as Occ[]).map((o) => o.title)).toEqual(["Keller aufräumen"]);
    expect(((await a.get("/api/todos?view=upcoming")).json() as Occ[]).map((o) => [o.title, o.date])).toEqual([["Reifen wechseln", "2026-11-30"]]);
  });

  it("rejects bad input", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const ok = { ...base, title: "X", visibility: everyone, startDate: "2026-11-24", recurrence: { kind: "none" } };
    expect((await a.post("/api/todos", { ...ok, title: "  " })).statusCode).toBe(400);
    expect((await a.post("/api/todos", { ...ok, title: "x".repeat(81) })).statusCode).toBe(400);
    expect((await a.post("/api/todos", { ...ok, reminders: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).statusCode).toBe(400);
    expect((await a.post("/api/todos", { ...ok, recurrence: { kind: "weekly", weekdays: [8] } })).statusCode).toBe(400);
    expect((await a.post("/api/todos", { ...ok, startDate: null, recurrence: { kind: "daily" } })).statusCode).toBe(400);
    expect((await a.post("/api/todos", { ...ok, time: "25:00" })).statusCode).toBe(400);
  });

  it("only the creator deletes or changes visibility", async () => {
    const { app, f } = await start();
    const id = (await as(app, f.alex.cookie).post("/api/todos", { ...base, title: "A", visibility: everyone, startDate: null, recurrence: { kind: "none" } })).json().id as string;
    expect((await as(app, f.sam.cookie).patch(`/api/todos/${id}`, { title: "B" })).statusCode).toBe(200);
    expect((await as(app, f.sam.cookie).patch(`/api/todos/${id}`, { visibility: { everyone: false, memberIds: [] } })).statusCode).toBe(403);
    expect((await as(app, f.sam.cookie).del(`/api/todos/${id}`)).statusCode).toBe(403);
    expect((await as(app, f.alex.cookie).del(`/api/todos/${id}`)).statusCode).toBe(200);
  });

  it("suggestions come from the task catalog and learn privately", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    expect(((await a.get("/api/todo-suggestions?q=müll")).json() as { name: string }[]).map((s) => s.name)).toContain("Müll rausbringen");
    await a.post("/api/todos", { ...base, title: "Geheimprojekt vorbereiten", visibility: { everyone: false, memberIds: [] }, startDate: null, recurrence: { kind: "none" } });
    expect((await as(app, f.sam.cookie).get("/api/todo-suggestions?q=geheimprojekt")).json()).toEqual([]);
    expect(((await a.get("/api/todo-suggestions?q=geheimprojekt")).json() as { name: string }[]).map((s) => s.name)).toEqual(["Geheimprojekt vorbereiten"]);
  });
});
