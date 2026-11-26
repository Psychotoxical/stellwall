import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { H } from "./auth-helpers.ts";
import type { PushSender } from "../src/push/outbox.ts";

const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: "BPk-test-key", auth: "auth-test" }, label: "Handy" });

async function start() {
  const sent: string[] = [];
  const sender: PushSender = async (s, payload) => {
    sent.push(s.endpoint + " " + JSON.parse(payload).body);
    return { gone: false };
  };
  const { app } = await createTestApp({ pushSender: sender });
  const f = await setupFamily(app);
  const put = (cookie: string, url: string, body: object) => app.inject({ method: "PUT", url, headers: { ...H, cookie }, payload: body });
  return { app, f, sent, put };
}

describe("push API", () => {
  it("hands out the public key only", async () => {
    const { app, f } = await start();
    const r = (await as(app, f.sam.cookie).get("/api/push/key")).json() as Record<string, string>;
    expect(Object.keys(r)).toEqual(["key"]);
    expect(r.key!.length).toBeGreaterThan(40);
    expect((await app.inject({ method: "GET", url: "/api/push/key" })).statusCode).toBe(401);
  });

  it("each person sees and removes only their own devices", async () => {
    const { app, f } = await start();
    const s = as(app, f.sam.cookie);
    const id = (await s.post("/api/push/subscriptions", sub("sam"))).json().id as string;
    await as(app, f.kim.cookie).post("/api/push/subscriptions", sub("kim"));
    expect(((await s.get("/api/push/subscriptions")).json() as { label: string }[]).map((d) => d.label)).toEqual(["Handy"]);
    expect((await as(app, f.kim.cookie).del(`/api/push/subscriptions/${id}`)).statusCode).toBe(404);
    expect((await s.del(`/api/push/subscriptions/${id}`)).statusCode).toBe(200);
    expect((await s.get("/api/push/subscriptions")).json()).toEqual([]);
  });

  it("refuses an address that is not https", async () => {
    const { app, f } = await start();
    expect((await as(app, f.sam.cookie).post("/api/push/subscriptions", { ...sub("x"), endpoint: "http://127.0.0.1/x" })).statusCode).toBe(400);
  });

  it("switches are stored per person, everything on until switched off", async () => {
    const { app, f, put } = await start();
    const s = as(app, f.sam.cookie);
    expect((await s.get("/api/notification-prefs")).json()).toEqual({ event: true, event_reminder: true, todo: true, todo_reminder: true, shopping: true, birthday: true, meal: true });
    expect((await put(f.sam.cookie, "/api/notification-prefs", { shopping: false })).statusCode).toBe(200);
    expect((await s.get("/api/notification-prefs")).json()).toMatchObject({ shopping: false, meal: true });
    expect((await as(app, f.kim.cookie).get("/api/notification-prefs")).json()).toMatchObject({ shopping: true });
    expect((await put(f.sam.cookie, "/api/notification-prefs", { nonsense: true })).statusCode).toBe(400);
  });

  it("a test message goes to my devices only", async () => {
    const { app, f, sent } = await start();
    await as(app, f.sam.cookie).post("/api/push/subscriptions", sub("sam"));
    await as(app, f.kim.cookie).post("/api/push/subscriptions", sub("kim"));
    expect((await as(app, f.sam.cookie).post("/api/push/test", {})).json()).toEqual({ devices: 1 });
    expect(sent).toEqual(["https://fcm.googleapis.com/fcm/send/sam Stellwall kann dir jetzt Bescheid geben."]);
  });
});
