import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { pushSubscriptions } from "../src/db/schema.ts";
import type { PushSender } from "../src/push/outbox.ts";

async function start(at: string) {
  let t = new Date(at);
  const sent: { to: string; body: string; url: string }[] = [];
  const sender: PushSender = async (sub, payload) => {
    const p = JSON.parse(payload);
    sent.push({ to: sub.endpoint.split("/").at(-1)!, body: p.body, url: p.url });
    return { gone: false };
  };
  const { app, db } = await createTestApp({ now: () => t, pushSender: sender });
  const f = await setupFamily(app);
  for (const [id, name] of [[f.alex.id, "alex"], [f.sam.id, "sam"], [f.kim.id, "kim"]] as const) {
    await db.insert(pushSubscriptions).values({ memberId: id, endpoint: `https://push.example.test/${name}`, p256dh: "p", auth: "a", label: "", createdAt: t });
  }
  const run = async (iso?: string) => {
    if (iso) t = new Date(iso);
    await app.push.remind();
    await app.push.dispatch();
  };
  return { app, f, sent, run, setTime: (iso: string) => (t = new Date(iso)) };
}
const timed = (title: string, startIso: string, endIso: string, more: object) => ({ title, allDay: false, start: startIso, end: endIso, rrule: null, seeAll: false, reminders: [], ...more });

describe("what people are told", () => {
  it("an event someone enters for me, and later changes", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const k = as(app, f.kim.cookie);
    const id = (await k.post("/api/events", timed("Zahnarzt", "2026-12-02T14:30:00.000Z", "2026-12-02T15:30:00.000Z", { forWhom: [f.sam.id, f.kim.id] }))).json().id as string;
    await run();
    expect(sent).toEqual([{ to: "sam", body: "Kim hat dir einen Termin eingetragen: Zahnarzt, Mi 2.12. 15:30", url: "/kalender?tag=2026-12-02" }]);
    await k.patch(`/api/events/${id}?scope=all`, { start: "2026-12-02T15:30:00.000Z", end: "2026-12-02T16:30:00.000Z" });
    await run();
    expect(sent.at(-1)).toEqual({ to: "sam", body: "Kim hat einen Termin geändert: Zahnarzt, Mi 2.12. 16:30", url: "/kalender?tag=2026-12-02" });
    expect(sent.length).toBe(2);
  });

  it("a to-do someone gives me", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    await as(app, f.kim.cookie).post("/api/todos", { title: "Müll rausbringen", visibility: { everyone: true, memberIds: [] }, assignees: [f.sam.id, f.kim.id], needsConfirm: false, reminders: [], time: null, until: null, startDate: null, recurrence: { kind: "none" } });
    await run();
    expect(sent.map((s) => [s.to, s.body])).toEqual([["sam", "Kim hat dir „Müll rausbringen“ gegeben"]]);
  });

  it("shopping is told in one message per person once the other person stopped", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const list = (await as(app, f.alex.cookie).post("/api/lists", { name: "Einkauf", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    const k = as(app, f.kim.cookie);
    await k.post(`/api/lists/${list}/items`, { name: "Milch" });
    await k.post(`/api/lists/${list}/items`, { name: "Brot" });
    await run();
    expect(sent).toEqual([]);
    await run("2026-11-27T10:06:00Z");
    expect(sent.map((s) => [s.to, s.body]).sort()).toEqual([["alex", "Kim hat 2 Sachen auf „Einkauf“ gesetzt"], ["sam", "Kim hat 2 Sachen auf „Einkauf“ gesetzt"]]);
  });

  it("being set as cook", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const put = (body: object) => app.inject({ method: "PUT", url: "/api/meals/2026-12-02", headers: { "x-stellwall": "1", cookie: f.kim.cookie }, payload: body });
    await put({ text: "Suppe", cookId: f.sam.id, servings: 4 });
    await put({ text: "Linsensuppe", cookId: f.sam.id, servings: 4 });
    await run();
    expect(sent.map((s) => [s.to, s.body])).toEqual([["sam", "Kim hat dich für Mittwoch, 2.12. als Koch eingetragen"]]);
  });
});

describe("reminders", () => {
  it("an event reminder comes the set time before, once", async () => {
    const { app, f, sent, run } = await start("2026-12-02T12:00:00Z");
    await as(app, f.kim.cookie).post("/api/events", timed("Zahnarzt", "2026-12-02T14:30:00.000Z", "2026-12-02T15:30:00.000Z", { forWhom: [f.sam.id], reminders: [60] }));
    await run();
    sent.length = 0;
    await run("2026-12-02T13:29:00Z");
    expect(sent).toEqual([]);
    await run("2026-12-02T13:30:00Z");
    await run("2026-12-02T13:31:00Z");
    expect(sent.map((s) => [s.to, s.body])).toEqual([["sam", "Erinnerung: Zahnarzt um 15:30"]]);
  });

  it("all-day events and birthdays come at 18 o'clock the evening before", async () => {
    const { app, f, sent, run } = await start("2026-11-25T10:00:00Z");
    const a = as(app, f.alex.cookie);
    await a.post("/api/events", { title: "Ausflug", allDay: true, startDate: "2026-11-27", endDate: "2026-11-27", rrule: null, seeAll: false, reminders: [1440], forWhom: [f.alex.id] });
    await a.post("/api/birthdays", { name: "Oma", month: 12, day: 3, year: 1950, visibility: { everyone: true, memberIds: [] }, remindDays: 7, remindWho: [f.sam.id] });
    await run("2026-11-25T17:00:00Z"); // 18:00 local on the 25th
    expect(sent).toEqual([]);
    // Lead time counts like for events: 7 days before means the evening of the 26th, a week ahead.
    await run("2026-11-26T17:00:00Z");
    expect(sent.map((s) => [s.to, s.body])).toEqual([["alex", "Erinnerung: Ausflug morgen"], ["sam", "Oma hat in 7 Tagen Geburtstag und wird 76"]]);
  });

  it("a to-do with a time reminds whoever takes care of it", async () => {
    const { app, f, sent, run } = await start("2026-11-27T06:00:00Z");
    await as(app, f.alex.cookie).post("/api/todos", { title: "Blumen gießen", visibility: { everyone: true, memberIds: [] }, assignees: [f.alex.id], needsConfirm: false, reminders: [10], time: "08:00", until: null, startDate: "2026-11-27", recurrence: { kind: "daily" } });
    await run("2026-11-27T06:50:00Z"); // 7:50 local
    expect(sent.map((s) => [s.to, s.body])).toEqual([["alex", "Erinnerung: Blumen gießen um 08:00"]]);
  });
});
