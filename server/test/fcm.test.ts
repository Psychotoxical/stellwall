import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fcmSender, readServiceAccount, routedSender, type ServiceAccount } from "../src/push/fcm.ts";
import { createTestApp, testConfig } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { contract } from "./contract.ts";

/** A throwaway key, made for the test only; nothing real is involved. */
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const account: ServiceAccount = { project_id: "family-test", client_email: "push@family-test.example", private_key: privateKey, token_uri: "https://oauth.example/token" };

type Call = { url: string; body: string; auth?: string };

/** Stands in for Google: checks the signed request and answers like the real services. */
function fakeGoogle(answer: (c: Call) => { status: number; json: object }) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const c: Call = { url: String(url), body: String(init?.body ?? ""), auth: (init?.headers as Record<string, string> | undefined)?.authorization };
    calls.push(c);
    const a = answer(c);
    return new Response(JSON.stringify(a.json), { status: a.status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const ok = (c: Call) => (c.url === account.token_uri ? { status: 200, json: { access_token: "access-1", expires_in: 3600 } } : { status: 200, json: { name: "projects/family-test/messages/1" } });

describe("FCM", () => {
  it("signs in with the service account and sends a data message", async () => {
    const g = fakeGoogle(ok);
    const send = fcmSender(account, { fetch: g.fetch, now: () => new Date("2026-11-27T10:00:00Z") });
    const r = await send({ endpoint: "fcm:device-token-1", p256dh: "", auth: "" }, JSON.stringify({ title: "Einkauf", body: "Sam hat 2 Sachen gesetzt", url: "/einkauf", kind: "shopping" }));
    expect(r).toEqual({ gone: false });

    const token = g.calls[0]!;
    const assertion = new URLSearchParams(token.body).get("assertion")!;
    const [h, p, sig] = assertion.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims).toMatchObject({ iss: account.client_email, aud: account.token_uri, scope: "https://www.googleapis.com/auth/firebase.messaging", iat: 1795773600 });

    const msg = g.calls[1]!;
    expect(msg.url).toBe("https://fcm.googleapis.com/v1/projects/family-test/messages:send");
    expect(msg.auth).toBe("Bearer access-1");
    expect(JSON.parse(msg.body)).toEqual({
      message: { token: "device-token-1", data: { title: "Einkauf", body: "Sam hat 2 Sachen gesetzt", url: "/einkauf", kind: "shopping" }, android: { priority: "HIGH", ttl: "86400s" } },
    });
  });

  it("keeps the access token until shortly before it runs out", async () => {
    let t = new Date("2026-11-27T10:00:00Z").getTime();
    const g = fakeGoogle(ok);
    const send = fcmSender(account, { fetch: g.fetch, now: () => new Date(t) });
    const sub = { endpoint: "fcm:a", p256dh: "", auth: "" };
    await send(sub, "{}");
    await send(sub, "{}");
    expect(g.calls.filter((c) => c.url === account.token_uri)).toHaveLength(1);
    t += 3600_000;
    await send(sub, "{}");
    expect(g.calls.filter((c) => c.url === account.token_uri)).toHaveLength(2);
  });

  it("a token the phone no longer has is gone, other errors are not", async () => {
    const unregistered = fakeGoogle((c) => (c.url === account.token_uri ? ok(c) : { status: 404, json: { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } }));
    expect(await fcmSender(account, { fetch: unregistered.fetch })({ endpoint: "fcm:x", p256dh: "", auth: "" }, "{}")).toEqual({ gone: true });
    const busy = fakeGoogle((c) => (c.url === account.token_uri ? ok(c) : { status: 503, json: { error: { status: "UNAVAILABLE" } } }));
    expect(await fcmSender(account, { fetch: busy.fetch })({ endpoint: "fcm:x", p256dh: "", auth: "" }, "{}")).toEqual({ gone: false });
  });

  it("a wrong project (404 without UNREGISTERED) keeps every phone", async () => {
    const wrong = fakeGoogle((c) => (c.url === account.token_uri ? ok(c) : { status: 404, json: { error: { status: "NOT_FOUND", message: "Requested entity was not found." } } }));
    expect(await fcmSender(account, { fetch: wrong.fetch })({ endpoint: "fcm:x", p256dh: "", auth: "" }, "{}")).toEqual({ gone: false });
  });

  it("a refused access token is fetched again on the next message", async () => {
    let first = true;
    const g = fakeGoogle((c) => {
      if (c.url === account.token_uri) return ok(c);
      if (first) { first = false; return { status: 401, json: { error: { status: "UNAUTHENTICATED" } } }; }
      return ok(c);
    });
    const send = fcmSender(account, { fetch: g.fetch });
    const sub = { endpoint: "fcm:x", p256dh: "", auth: "" };
    await send(sub, "{}");
    await send(sub, "{}");
    expect(g.calls.filter((c) => c.url === account.token_uri)).toHaveLength(2);
  });

  it("browsers go to web push, phones to FCM; without a service account phone messages wait", async () => {
    const seen: string[] = [];
    const web = async (s: { endpoint: string }) => { seen.push("web:" + s.endpoint); return { gone: false }; };
    const fcm = async (s: { endpoint: string }) => { seen.push("fcm:" + s.endpoint); return { gone: false }; };
    await routedSender(web, fcm)({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "k", auth: "a" }, "{}");
    await routedSender(web, fcm)({ endpoint: "fcm:tok", p256dh: "", auth: "" }, "{}");
    expect(seen).toEqual(["web:https://fcm.googleapis.com/fcm/send/abc", "fcm:fcm:tok"]);
    expect(await routedSender(web, null)({ endpoint: "fcm:tok", p256dh: "", auth: "" }, "{}")).toEqual({ gone: false });
  });
});

describe("the service account file", () => {
  it("a missing or broken file switches phone messages off instead of stopping the server", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stellwall-sa-"));
    writeFileSync(join(dir, "broken.json"), "{ not json");
    const warned: string[] = [];
    expect(readServiceAccount(join(dir, "missing.json"), (m) => warned.push(m))).toBeNull();
    expect(readServiceAccount(join(dir, "broken.json"), (m) => warned.push(m))).toBeNull();
    expect(readServiceAccount(null, (m) => warned.push(m))).toBeNull();
    expect(warned).toHaveLength(2);
    // Nothing from inside the file reaches the log.
    expect(warned.join(" ")).not.toContain("not json");
  });
});

describe("phones and the app download", () => {
  it("a phone registers its token, the test message reaches it", async () => {
    const sent: string[] = [];
    const { app } = await createTestApp({ pushSender: async (s) => { sent.push(s.endpoint); return { gone: false }; } });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    contract("push-fcm-registered", await alex.post("/api/push/fcm", { token: "device-token-1-0123456789abcdef", label: "Galaxy" }));
    expect((await alex.post("/api/push/fcm", { token: "", label: "x" })).statusCode).toBe(400);
    expect((await alex.post("/api/push/test")).json()).toEqual({ devices: 1 });
    expect(sent).toEqual(["fcm:device-token-1-0123456789abcdef"]);
    expect((await alex.get("/api/push/subscriptions")).json()[0].label).toBe("Galaxy");
  });

  it("tells the newest app version and hands out the APK to members only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stellwall-app-"));
    writeFileSync(join(dir, "android.json"), JSON.stringify({ versionCode: 7, versionName: "0.2.0" }));
    writeFileSync(join(dir, "stellwall.apk"), Buffer.from("PK-not-a-real-apk"));
    writeFileSync(join(dir, "account.json"), JSON.stringify(account));
    const { app } = await createTestApp({ config: { ...testConfig, appDir: dir, firebaseAccountFile: join(dir, "account.json") } });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    contract("app-info", await alex.get("/api/app/info"));
    const apk = await alex.get("/api/app/android");
    expect(apk.statusCode).toBe(200);
    expect(apk.headers["content-type"]).toBe("application/vnd.android.package-archive");
    expect(apk.body).toBe("PK-not-a-real-apk");
    expect((await app.inject({ method: "GET", url: "/api/app/android" })).statusCode).toBe(401);
  });

  it("without an app on the server there is nothing to update", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    contract("app-info-none", await as(app, f.alex.cookie).get("/api/app/info"));
    expect((await as(app, f.alex.cookie).get("/api/app/android")).statusCode).toBe(404);
  });
});
