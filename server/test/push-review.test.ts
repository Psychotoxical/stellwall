import { describe, expect, it } from "vitest";
import { eq, lt } from "drizzle-orm";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { H } from "./auth-helpers.ts";
import { notifications, pushSubscriptions, settings } from "../src/db/schema.ts";
import { createOutbox, webPushSender, type PushSender } from "../src/push/outbox.ts";
import type { Db } from "../src/db/client.ts";

async function start(at: string, slow = 0) {
  let t = new Date(at);
  const sent: { to: string; body: string; url: string }[] = [];
  const sender: PushSender = async (sub, payload) => {
    if (slow) await new Promise((r) => setTimeout(r, slow));
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
  return { app, db, f, sent, sender, run, clock: () => t };
}

describe("push review fixes", () => {
  it("a removed member gets nothing more and loses their devices", async () => {
    const { app, db, f, sent, run } = await start("2026-11-27T10:00:00Z");
    await as(app, f.alex.cookie).post("/api/events", { title: "Elternabend", allDay: false, start: "2026-12-02T18:00:00.000Z", end: "2026-12-02T19:00:00.000Z", rrule: null, seeAll: false, reminders: [], forWhom: [f.kim.id] });
    expect((await as(app, f.alex.cookie).del(`/api/members/${f.kim.id}`)).statusCode).toBe(200);
    await run();
    expect(sent).toEqual([]);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, f.kim.id))).toEqual([]);
  });

  it("two overlapping send runs deliver each message once", async () => {
    const { db, f, sent, sender, clock } = await start("2026-11-27T10:00:00Z", 30);
    const outbox = createOutbox(db, { now: clock, timeZone: "Europe/Berlin", sender });
    for (let i = 0; i < 3; i++) await outbox.enqueue({ memberIds: [f.sam.id], actor: null, kind: "meal", ref: { type: "meal", id: `d${i}` }, title: "x", body: `m${i}`, url: "/" });
    await Promise.all([outbox.dispatch(), outbox.dispatch()]);
    expect(sent.map((s) => s.body).sort()).toEqual(["m0", "m1", "m2"]);
  });

  it("no reminder for a to-do that is already done", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const a = as(app, f.alex.cookie);
    const id = (await a.post("/api/todos", { title: "Sportzeug packen", visibility: { everyone: true, memberIds: [] }, assignees: [f.alex.id], needsConfirm: true, reminders: [1440], time: null, until: null, startDate: "2026-11-28", recurrence: { kind: "none" } })).json().id as string;
    await a.post(`/api/todos/${id}/done`, { date: "2026-11-28" });
    await run("2026-11-27T17:00:00Z");
    expect(sent).toEqual([]);
  });

  it("several lead times that land on the same evening give one message", async () => {
    const { app, f, sent, run } = await start("2026-11-25T10:00:00Z");
    await as(app, f.alex.cookie).post("/api/events", { title: "Ausflug", allDay: true, startDate: "2026-11-27", endDate: "2026-11-27", rrule: null, seeAll: false, reminders: [1440, 60, 15], forWhom: [f.alex.id] });
    await run("2026-11-26T17:00:00Z");
    expect(sent.map((s) => s.body)).toEqual(["Erinnerung: Ausflug morgen"]);
  });

  it("a change to one occurrence names that day, not the start of the series", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const k = as(app, f.kim.cookie);
    const id = (await k.post("/api/events", { title: "Training", allDay: false, start: "2026-11-02T16:00:00.000Z", end: "2026-11-02T17:00:00.000Z", rrule: "FREQ=WEEKLY;BYDAY=MO", seeAll: false, reminders: [], forWhom: [f.sam.id, f.kim.id] })).json().id as string;
    await run();
    sent.length = 0;
    await k.patch(`/api/events/${id}?scope=one&date=2026-12-07`, { start: "2026-12-07T17:00:00.000Z", end: "2026-12-07T18:00:00.000Z" });
    await run();
    expect(sent).toEqual([{ to: "sam", body: "Kim hat einen Termin geändert: Training, Mo 7.12. 18:00", url: "/kalender?tag=2026-12-07" }]);
  });

  it("signing out takes this device off the list", async () => {
    const { app, db, f } = await start("2026-11-27T10:00:00Z");
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...H, cookie: f.sam.cookie }, payload: { pushEndpoint: "https://push.example.test/sam" } });
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, f.sam.id))).toEqual([]);
  });

  it("a failed key setup is tried again on the next message", async () => {
    const { db } = await createTestApp();
    let selects = 0;
    const flaky = new Proxy(db, {
      get(target, prop, recv) {
        if (prop === "select") {
          return (...args: unknown[]) => {
            selects++;
            if (selects === 1) throw new Error("database away");
            return (target.select as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, prop, recv);
      },
    }) as Db;
    const send = webPushSender(flaky, "https://wall.example.test");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/none", p256dh: "p", auth: "a" };
    await send(sub, "{}").catch(() => {});
    await send(sub, "{}").catch(() => {});
    expect(selects).toBeGreaterThan(1);
    expect((await db.select().from(settings).where(eq(settings.key, "vapid_public"))).length).toBe(1);
  });

  it("only real push services are accepted as device addresses", async () => {
    const { app, f } = await start("2026-11-27T10:00:00Z");
    const s = as(app, f.sam.cookie);
    const body = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" }, label: "x" });
    expect((await s.post("/api/push/subscriptions", body("https://intranet.example.test/x"))).statusCode).toBe(400);
    for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]) {
      expect((await s.post("/api/push/subscriptions", body(ok))).statusCode, ok).toBe(200);
    }
  });

  it("old sent messages are cleared out", async () => {
    const { db, f, run } = await start("2026-11-27T10:00:00Z");
    await db.insert(notifications).values({ memberId: f.sam.id, kind: "meal", refType: "meal", refId: "x", title: "x", body: "x", url: "/", dueAt: new Date("2026-10-01T10:00:00Z"), sentAt: new Date("2026-10-01T10:00:00Z") });
    await run();
    expect(await db.select().from(notifications).where(lt(notifications.sentAt, new Date("2026-10-28T00:00:00Z")))).toEqual([]);
  });
});
