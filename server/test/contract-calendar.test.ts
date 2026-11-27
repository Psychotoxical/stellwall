import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { contract } from "./contract.ts";

const range = (from: string, to: string) => `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

describe("contract: calendar", () => {
  it("writes the calendar, event and birthday examples the apps parse", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-27T10:00:00Z") });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    const sam = as(app, f.sam.cookie);

    const timed = await alex.post("/api/events", {
      title: "Zahnarzt", location: "Praxis", notes: "Karte mitnehmen", allDay: false,
      start: "2026-12-02T14:30:00.000Z", end: "2026-12-02T15:30:00.000Z", rrule: null, seeAll: false, reminders: [60], forWhom: [f.alex.id, f.sam.id],
    });
    contract("event-created", timed);
    await alex.post("/api/events", { title: "Ausflug", allDay: true, startDate: "2026-12-05", endDate: "2026-12-06", rrule: null, seeAll: true, reminders: [], forWhom: [f.alex.id] });
    const series = await alex.post("/api/events", {
      title: "Training", allDay: false, start: "2026-12-01T17:00:00.000Z", end: "2026-12-01T18:30:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=TU", seeAll: false, reminders: [], forWhom: [f.sam.id],
    });
    const seriesId = series.json().id as string;
    await alex.post("/api/birthdays", { name: "Oma", month: 12, day: 3, year: 1950, visibility: { everyone: true, memberIds: [] }, remindDays: 1, remindWho: [f.alex.id] });

    contract("event", await alex.get(`/api/events/${seriesId}`));
    contract("event-moved-once", await alex.patch(`/api/events/${seriesId}?scope=one&date=2026-12-08`, { title: "Training (Halle 2)" }));
    const cal = await alex.get(range("2026-11-30T00:00:00.000Z", "2026-12-14T00:00:00.000Z"));
    expect(cal.statusCode).toBe(200);
    contract("calendar", cal);
    contract("calendar-mine", await sam.get(range("2026-11-30T00:00:00.000Z", "2026-12-14T00:00:00.000Z") + "&mine=1"));
    contract("calendar-too-long", await alex.get(range("2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z")));
    contract("birthdays", await alex.get("/api/birthdays"));
    contract("event-not-creator", await sam.del(`/api/events/${timed.json().id}`));
    contract("event-deleted-once", await sam.del(`/api/events/${seriesId}?scope=one&date=2026-12-01`));
    contract("event-deleted", await alex.del(`/api/events/${timed.json().id}`));
  });
});
