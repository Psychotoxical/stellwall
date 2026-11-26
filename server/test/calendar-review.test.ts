import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

type Inst = { date: string; start: string; title: string; allDay: boolean; endDate: string };
const timed = (title: string, startIso: string, endIso: string, more: object = {}) => ({ title, allDay: false, start: startIso, end: endIso, rrule: null, seeAll: false, reminders: [], ...more });
const cal = (from: string, to: string) => `/api/calendar?from=${from}&to=${to}`;

describe("calendar review fixes", () => {
  it("an imported series with a UTC end keeps its last occurrence", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-01T10:00:00Z") });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "BEGIN:VEVENT", "UID:until-1@example.test", "DTSTART;TZID=Europe/Berlin:20261201T193000", "DTEND;TZID=Europe/Berlin:20261201T203000",
      "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215T183000Z", "SUMMARY:Kurs", "END:VEVENT",
      "END:VCALENDAR", "",
    ].join("\r\n");
    const pre = await a.post("/api/import/preview", { ics });
    await a.post("/api/import/commit", { token: pre.json().token, from: "all", visibility: { everyone: false, memberIds: [] } });
    const got = (await a.get(cal("2026-11-30T00:00:00Z", "2026-12-31T00:00:00Z"))).json() as Inst[];
    expect(got.map((i) => i.date)).toEqual(["2026-12-01", "2026-12-08", "2026-12-15"]);
  });

  it("only this occurrence of an all-day series can move to another day", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/events", { title: "Markt", allDay: true, startDate: "2026-11-07", endDate: "2026-11-07", rrule: "FREQ=WEEKLY;BYDAY=SA", seeAll: true, reminders: [], forWhom: [f.alex.id] })).json().id as string;
    expect((await a.patch(`/api/events/${id}?scope=one&date=2026-11-14`, { allDay: true, startDate: "2026-11-15", endDate: "2026-11-15" })).statusCode).toBe(200);
    const got = (await a.get(cal("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z"))).json() as Inst[];
    expect(got.map((i) => [i.date, i.endDate])).toEqual([["2026-11-07", "2026-11-07"], ["2026-11-14", "2026-11-15"], ["2026-11-21", "2026-11-21"], ["2026-11-28", "2026-11-28"]]);
  });

  it("someone who is not the creator cannot take an event away from others", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const id = (await as(app, f.alex.cookie).post("/api/events", timed("Ausflug", "2026-11-25T10:00:00.000Z", "2026-11-25T11:00:00.000Z", { forWhom: [f.sam.id, f.kim.id] }))).json().id as string;
    expect((await as(app, f.sam.cookie).patch(`/api/events/${id}?scope=all`, { forWhom: [f.sam.id] })).statusCode).toBe(200);
    expect((await as(app, f.kim.cookie).get(`/api/events/${id}`)).statusCode).toBe(200);
  });

  it("people chosen to see an import keep seeing it after an edit", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-01T10:00:00Z") });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:x-1@example.test", "DTSTART:20261120T100000Z", "DTEND:20261120T110000Z", "SUMMARY:Termin", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
    const pre = await a.post("/api/import/preview", { ics });
    await a.post("/api/import/commit", { token: pre.json().token, from: "all", visibility: { everyone: false, memberIds: [f.kim.id] } });
    const id = ((await a.get(cal("2026-11-19T00:00:00Z", "2026-11-21T00:00:00Z"))).json() as { eventId: string }[])[0]!.eventId;
    await a.patch(`/api/events/${id}?scope=all`, { forWhom: [f.alex.id, f.sam.id] });
    expect((await as(app, f.kim.cookie).get(`/api/events/${id}`)).statusCode).toBe(200);
  });

  it("a refused change does not split the series", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/events", timed("Training", "2026-11-02T17:00:00.000Z", "2026-11-02T18:00:00.000Z", { rrule: "FREQ=WEEKLY", forWhom: [f.alex.id] }))).json().id as string;
    const r = await a.patch(`/api/events/${id}?scope=following&date=2026-11-16`, { start: "2026-11-16T18:00:00.000Z", end: "2026-11-16T17:00:00.000Z" });
    expect(r.statusCode).toBe(400);
    expect((await a.get(`/api/events/${id}`)).json().rrule).toBe("FREQ=WEEKLY");
    expect(((await a.get(cal("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"))).json() as Inst[]).length).toBe(5);
  });

  it("changing the following occurrences does not announce the event again", async () => {
    let t = new Date("2026-11-01T10:00:00Z");
    const { app } = await createTestApp({ now: () => t });
    const f = await setupFamily(app);
    const id = (await as(app, f.kim.cookie).post("/api/events", timed("Training", "2026-11-02T17:00:00.000Z", "2026-11-02T18:00:00.000Z", { rrule: "FREQ=WEEKLY", forWhom: [f.sam.id, f.kim.id] }))).json().id as string;
    t = new Date("2026-11-01T11:00:00Z");
    await as(app, f.sam.cookie).post("/api/board/seen", {});
    t = new Date("2026-11-01T12:00:00Z");
    await as(app, f.kim.cookie).patch(`/api/events/${id}?scope=following&date=2026-11-16`, { title: "Training neu" });
    const rows = (await as(app, f.sam.cookie).get("/api/board")).json() as { kind: string }[];
    expect(rows.filter((r) => r.kind === "event")).toEqual([]);
  });
});
