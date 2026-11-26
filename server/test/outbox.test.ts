import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { notificationPrefs, pushSubscriptions } from "../src/db/schema.ts";
import { createOutbox, type PushSender } from "../src/push/outbox.ts";
import type { Db } from "../src/db/client.ts";

function fakeSender(gone: string[] = []) {
  const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
  const sender: PushSender = async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return { gone: gone.includes(sub.endpoint) };
  };
  return { sent, sender };
}

async function device(db: Db, memberId: string, endpoint: string) {
  await db.insert(pushSubscriptions).values({ memberId, endpoint, p256dh: "p", auth: "a", label: "", createdAt: new Date() });
}

async function start(at = "2026-11-27T10:00:00Z") {
  let t = new Date(at);
  const clock = () => t;
  const { app, db } = await createTestApp({ now: clock });
  const f = await setupFamily(app);
  const fake = fakeSender(["https://push.example.test/gone"]);
  const outbox = createOutbox(db, { now: clock, timeZone: "Europe/Berlin", sender: fake.sender });
  for (const [who, ep] of [[f.alex.id, "https://push.example.test/alex"], [f.sam.id, "https://push.example.test/sam"], [f.kim.id, "https://push.example.test/kim"]] as const) await device(db, who, ep);
  return { app, db, f, outbox, sent: fake.sent, setTime: (iso: string) => (t = new Date(iso)) };
}

describe("outbox", () => {
  it("never tells anyone about a list they cannot see, nor the person who made the change", async () => {
    const { app, f, outbox, sent } = await start();
    const list = (await as(app, f.alex.cookie).post("/api/lists", { name: "Geschenke", visibility: { everyone: false, memberIds: [f.sam.id] } })).json().id as string;
    await outbox.enqueue({ memberIds: [f.alex.id, f.sam.id, f.kim.id], actor: f.alex.id, kind: "shopping", ref: { type: "list", id: list }, title: "Einkauf", body: "Alex hat 1 Sache auf „Geschenke“ gesetzt", url: "/einkauf" });
    await outbox.dispatch();
    expect(sent.map((s) => s.endpoint)).toEqual(["https://push.example.test/sam"]);
  });

  it("checks again when sending: an event someone lost in between is not announced", async () => {
    const { app, f, outbox, sent } = await start();
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/events", { title: "Arzt", allDay: false, start: "2026-11-30T09:00:00.000Z", end: "2026-11-30T10:00:00.000Z", rrule: null, seeAll: false, reminders: [], forWhom: [f.sam.id] })).json().id as string;
    await outbox.enqueue({ memberIds: [f.sam.id], actor: f.alex.id, kind: "event", ref: { type: "event", id }, title: "Termin", body: "Arzt", url: "/kalender" });
    await a.patch(`/api/events/${id}?scope=all`, { forWhom: [f.alex.id] });
    await outbox.dispatch();
    expect(sent).toEqual([]);
  });

  it("respects what a person switched off", async () => {
    const { db, f, outbox, sent } = await start();
    await db.insert(notificationPrefs).values({ memberId: f.kim.id, kind: "meal", enabled: false });
    await outbox.enqueue({ memberIds: [f.kim.id, f.sam.id], actor: null, kind: "meal", ref: { type: "meal", id: "2026-12-02" }, title: "Essensplan", body: "Du kochst am Mittwoch", url: "/essen" });
    await outbox.dispatch();
    expect(sent.map((s) => s.endpoint)).toEqual(["https://push.example.test/sam"]);
  });

  it("drops a device the push service no longer knows", async () => {
    const { db, f, outbox } = await start();
    await device(db, f.kim.id, "https://push.example.test/gone");
    await outbox.enqueue({ memberIds: [f.kim.id], actor: null, kind: "meal", ref: { type: "meal", id: "2026-12-02" }, title: "x", body: "y", url: "/essen" });
    await outbox.dispatch();
    expect((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, f.kim.id))).map((s) => s.endpoint)).toEqual(["https://push.example.test/kim"]);
  });

  it("keeps quiet at night and sends at 7, but reminders come on time", async () => {
    const { f, outbox, sent, setTime } = await start("2026-11-27T22:00:00Z"); // 23:00 local
    await outbox.enqueue({ memberIds: [f.sam.id], actor: null, kind: "meal", ref: { type: "meal", id: "2026-12-02" }, title: "x", body: "nachts", url: "/essen" });
    await outbox.enqueue({ memberIds: [f.sam.id], actor: null, kind: "event_reminder", ref: { type: "test", id: "r" }, title: "x", body: "Erinnerung", url: "/kalender", quiet: false });
    await outbox.dispatch();
    expect(sent.map((s) => s.payload.body)).toEqual(["Erinnerung"]);
    setTime("2026-11-28T06:00:00Z"); // 7:00 local
    await outbox.dispatch();
    expect(sent.map((s) => s.payload.body)).toEqual(["Erinnerung", "nachts"]);
  });

  it("the same reminder is only ever queued once", async () => {
    const { f, outbox, sent } = await start();
    for (let i = 0; i < 2; i++) await outbox.enqueue({ memberIds: [f.sam.id], actor: null, kind: "event_reminder", ref: { type: "test", id: "r" }, title: "x", body: "einmal", url: "/", dedupe: "rem:1", quiet: false });
    await outbox.dispatch();
    await outbox.enqueue({ memberIds: [f.sam.id], actor: null, kind: "event_reminder", ref: { type: "test", id: "r" }, title: "x", body: "einmal", url: "/", dedupe: "rem:1", quiet: false });
    await outbox.dispatch();
    expect(sent.length).toBe(1);
  });

  it("bundles shopping: one message for six things, a new one later", async () => {
    const { app, f, outbox, sent, setTime } = await start();
    const list = (await as(app, f.alex.cookie).post("/api/lists", { name: "Einkauf", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    for (let i = 1; i <= 6; i++) {
      setTime(`2026-11-27T10:0${i}:00Z`);
      await outbox.bundle({ memberIds: [f.sam.id], actor: f.kim.id, ref: { type: "list", id: list }, key: `${f.kim.id}:${list}`, text: (n) => `Kim hat ${n} Sachen auf „Einkauf“ gesetzt`, url: "/einkauf" });
      await outbox.dispatch();
    }
    expect(sent).toEqual([]);
    setTime("2026-11-27T10:11:00Z");
    await outbox.dispatch();
    expect(sent.map((s) => s.payload.body)).toEqual(["Kim hat 6 Sachen auf „Einkauf“ gesetzt"]);
    setTime("2026-11-27T10:20:00Z");
    await outbox.bundle({ memberIds: [f.sam.id], actor: f.kim.id, ref: { type: "list", id: list }, key: `${f.kim.id}:${list}`, text: (n) => (n === 1 ? "Kim hat 1 Sache auf „Einkauf“ gesetzt" : `Kim hat ${n} Sachen`), url: "/einkauf" });
    setTime("2026-11-27T10:26:00Z");
    await outbox.dispatch();
    expect(sent.map((s) => s.payload.body).at(-1)).toBe("Kim hat 1 Sache auf „Einkauf“ gesetzt");
  });
});
