import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Inst = { eventId: string; date: string; start: string; title: string; forWhom: string[]; allDay: boolean };

async function start() {
  const { app } = await createTestApp();
  const f = await setupFamily(app);
  return { app, f };
}
const cal = (from: string, to: string, mine = false) => `/api/calendar?from=${from}&to=${to}${mine ? "&mine=1" : ""}`;
const timed = (title: string, startIso: string, endIso: string, more: object = {}) => ({ title, allDay: false, start: startIso, end: endIso, rrule: null, seeAll: false, reminders: [], ...more });

describe("events", () => {
  it("only the people it is for see it, unless all may see it", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const r = await a.post("/api/events", timed("Zahnarzt", "2026-11-25T14:30:00.000Z", "2026-11-25T15:30:00.000Z", { forWhom: [f.sam.id] }));
    expect(r.statusCode).toBe(200);
    const range = cal("2026-11-20T00:00:00Z", "2026-11-30T00:00:00Z");
    expect(((await as(app, f.sam.cookie).get(range)).json() as Inst[]).map((i) => i.title)).toEqual(["Zahnarzt"]);
    expect(((await a.get(range)).json() as Inst[]).map((i) => i.title)).toEqual(["Zahnarzt"]);
    expect(((await as(app, f.kim.cookie).get(range)).json() as Inst[]).filter((i) => "eventId" in i)).toEqual([]);
    await a.post("/api/events", timed("Elternabend", "2026-11-26T18:00:00.000Z", "2026-11-26T19:00:00.000Z", { forWhom: [f.alex.id], seeAll: true }));
    expect(((await as(app, f.kim.cookie).get(range)).json() as Inst[]).map((i) => i.title)).toEqual(["Elternabend"]);
  });

  it("mine shows only what is for me", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    await a.post("/api/events", timed("Für alle sichtbar, für Sam", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.sam.id], seeAll: true }));
    const range = cal("2026-11-20T00:00:00Z", "2026-11-30T00:00:00Z", true);
    expect((await as(app, f.kim.cookie).get(range)).json()).toEqual([]);
    expect(((await as(app, f.sam.cookie).get(range)).json() as Inst[]).length).toBe(1);
  });

  it("all-day events use dates", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    await a.post("/api/events", { title: "Urlaub", allDay: true, startDate: "2026-12-21", endDate: "2026-12-23", rrule: null, seeAll: true, reminders: [], forWhom: [f.alex.id] });
    const got = (await a.get(cal("2026-12-01T00:00:00Z", "2026-12-31T00:00:00Z"))).json() as (Inst & { endDate: string })[];
    expect(got.map((i) => [i.date, i.endDate, i.allDay])).toEqual([["2026-12-21", "2026-12-23", true]]);
  });

  it("series: only this, this and following, all", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/events", timed("Training", "2026-11-02T17:00:00.000Z", "2026-11-02T18:00:00.000Z", { rrule: "FREQ=WEEKLY", forWhom: [f.kim.id], seeAll: true }))).json().id as string;
    const range = cal("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z");
    const list = async () => ((await a.get(range)).json() as Inst[]).map((i) => [i.date, i.title, i.start]);
    // only this one moves an hour later
    await a.patch(`/api/events/${id}?scope=one&date=2026-11-09`, { start: "2026-11-09T18:00:00.000Z", end: "2026-11-09T19:00:00.000Z" });
    // cancel one
    await a.del(`/api/events/${id}?scope=one&date=2026-11-16`);
    // from 23 Nov the training is called differently
    await a.patch(`/api/events/${id}?scope=following&date=2026-11-23`, { title: "Training neu" });
    expect(await list()).toEqual([
      ["2026-11-02", "Training", "2026-11-02T17:00:00.000Z"],
      ["2026-11-09", "Training", "2026-11-09T18:00:00.000Z"],
      ["2026-11-23", "Training neu", "2026-11-23T17:00:00.000Z"],
      ["2026-11-30", "Training neu", "2026-11-30T17:00:00.000Z"],
    ]);
    // all: renaming the old part keeps its exceptions
    await a.patch(`/api/events/${id}?scope=all`, { title: "Training alt" });
    expect((await list()).slice(0, 2)).toEqual([
      ["2026-11-02", "Training alt", "2026-11-02T17:00:00.000Z"],
      ["2026-11-09", "Training alt", "2026-11-09T18:00:00.000Z"],
    ]);
  });

  it("people it is for become able to see it", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/events", timed("Arzt", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.alex.id] }))).json().id as string;
    expect((await as(app, f.kim.cookie).get(`/api/events/${id}`)).statusCode).toBe(404);
    await a.patch(`/api/events/${id}?scope=all`, { forWhom: [f.alex.id, f.kim.id] });
    expect((await as(app, f.kim.cookie).get(`/api/events/${id}`)).statusCode).toBe(200);
  });

  it("strangers cannot change or delete", async () => {
    const { app, f } = await start();
    const id = (await as(app, f.alex.cookie).post("/api/events", timed("Privat", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.alex.id] }))).json().id as string;
    const k = as(app, f.kim.cookie);
    expect((await k.patch(`/api/events/${id}?scope=all`, { title: "x" })).statusCode).toBe(404);
    expect((await k.del(`/api/events/${id}?scope=all`)).statusCode).toBe(404);
  });

  it("only the creator deletes the whole event or widens who sees it", async () => {
    const { app, f } = await start();
    const id = (await as(app, f.alex.cookie).post("/api/events", timed("Gemeinsam", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.alex.id, f.sam.id] }))).json().id as string;
    const s = as(app, f.sam.cookie);
    expect((await s.patch(`/api/events/${id}?scope=all`, { title: "Gemeinsam!" })).statusCode).toBe(200);
    expect((await s.patch(`/api/events/${id}?scope=all`, { seeAll: true })).statusCode).toBe(403);
    expect((await s.patch(`/api/events/${id}?scope=all`, { forWhom: [f.alex.id, f.sam.id, f.kim.id] })).statusCode).toBe(403);
    expect((await s.del(`/api/events/${id}?scope=all`)).statusCode).toBe(403);
  });

  it("rejects bad input", async () => {
    const { app, f } = await start();
    const a = as(app, f.alex.cookie);
    const ok = timed("X", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.alex.id] });
    expect((await a.post("/api/events", { ...ok, title: " " })).statusCode).toBe(400);
    expect((await a.post("/api/events", { ...ok, title: "x".repeat(121) })).statusCode).toBe(400);
    expect((await a.post("/api/events", { ...ok, end: "2026-11-25T09:00:00.000Z" })).statusCode).toBe(400);
    expect((await a.post("/api/events", { ...ok, rrule: "QUATSCH" })).statusCode).toBe(400);
    expect((await a.post("/api/events", { ...ok, reminders: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).statusCode).toBe(400);
    expect((await a.get(cal("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"))).statusCode).toBe(400);
  });
});
