import { describe, expect, it } from "vitest";
import { as, setupFamily } from "./family.ts";
import { H } from "./auth-helpers.ts";
import { pushSubscriptions } from "../src/db/schema.ts";
import { createDocsApp, upload } from "./documents-helpers.ts";
import type { PushSender } from "../src/push/outbox.ts";

async function start(begin: string) {
  let t = new Date(begin);
  const sent: { to: string; body: string; url: string; kind: string }[] = [];
  const sender: PushSender = async (sub, payload) => {
    const p = JSON.parse(payload);
    sent.push({ to: sub.endpoint.split("/").at(-1)!, body: p.body, url: p.url, kind: p.kind });
    return { gone: false };
  };
  const { app, db } = await createDocsApp({ now: () => t, pushSender: sender });
  const f = await setupFamily(app);
  for (const [id, name] of [[f.alex.id, "alex"], [f.sam.id, "sam"], [f.kim.id, "kim"]] as const) {
    await db.insert(pushSubscriptions).values({ memberId: id, endpoint: `https://push.example.test/${name}`, p256dh: "p", auth: "a", label: "", createdAt: t });
  }
  const run = async (iso: string) => {
    t = new Date(iso);
    await app.push.remind();
    await app.push.dispatch();
  };
  const at = (iso: string) => (t = new Date(iso));
  return { app, f, sent, run, at };
}

describe("document reminders", () => {
  it("reminds everyone who sees it at 09:00, remindDays before validUntil, once", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const d = (await upload(app, f.alex.cookie, { name: "Personalausweis", validUntil: "2027-01-15", remindDays: 30, visibility: { everyone: false, memberIds: [f.sam.id] } })).json();
    await run("2026-12-16T07:55:00Z");
    expect(sent).toEqual([]);
    // 16 December, 09:00 in Berlin is 08:00 UTC.
    await run("2026-12-16T08:00:30Z");
    expect(sent.map((s) => s.to).sort()).toEqual(["alex", "sam"]);
    expect(sent[0]).toMatchObject({ body: "„Personalausweis“ läuft am 15.01.2027 ab", url: `/dokumente/${d.id}`, kind: "document_expiry" });
    await run("2026-12-16T08:05:00Z");
    expect(sent).toHaveLength(2);
  });

  it("a changed validUntil reminds again for the new date", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    const d = (await upload(app, f.alex.cookie, { name: "TÜV", validUntil: "2026-12-10", remindDays: 7 })).json();
    await run("2026-12-03T08:00:30Z");
    expect(sent).toHaveLength(3);
    await as(app, f.alex.cookie).patch(`/api/documents/${d.id}`, { validUntil: "2028-12-10" });
    await run("2028-12-03T08:00:30Z");
    expect(sent).toHaveLength(6);
    expect(sent.at(-1)!.body).toBe("„TÜV“ läuft am 10.12.2028 ab");
  });

  it("no reminder for an expired document or one without validUntil", async () => {
    const { app, f, sent, run } = await start("2026-11-27T10:00:00Z");
    await upload(app, f.alex.cookie, { name: "Alt", validUntil: "2026-11-01", remindDays: 90 });
    await upload(app, f.alex.cookie, { name: "Ohne Datum" });
    await run("2026-11-27T08:00:30Z");
    await run("2026-11-28T08:00:30Z");
    expect(sent).toEqual([]);
  });

  it('the switch "Ablaufende Dokumente" turns it off per person', async () => {
    const { app, f, sent, run } = await start("2026-10-20T10:00:00Z");
    await app.inject({ method: "PUT", url: "/api/notification-prefs", headers: { ...H, cookie: f.kim.cookie }, payload: { document_expiry: false } });
    await upload(app, f.alex.cookie, { name: "Reisepass", validUntil: "2027-02-01", remindDays: 90 });
    await run("2026-11-03T09:00:00Z");
    await run("2026-11-03T08:00:30Z");
    expect(sent.map((s) => s.to).sort()).toEqual(["alex", "sam"]);
  });

  it("a reminder queued before the document turned private goes to nobody else", async () => {
    const { app, f, sent, at } = await start("2026-11-27T10:00:00Z");
    const d = (await upload(app, f.alex.cookie, { name: "Reisepass", validUntil: "2027-01-15", remindDays: 30 })).json();
    at("2026-12-16T08:00:30Z");
    await app.push.remind();
    await as(app, f.alex.cookie).patch(`/api/documents/${d.id}`, { visibility: { everyone: false, memberIds: [] } });
    await app.push.dispatch();
    expect(sent.map((s) => s.to)).toEqual(["alex"]);
  });

  it("a document saved already inside its reminder window is reminded at the next 09:00", async () => {
    const { app, f, sent, run } = await start("2026-12-10T10:00:00Z");
    await upload(app, f.alex.cookie, { name: "TÜV-Bericht", validUntil: "2026-12-20", remindDays: 30 });
    await run("2026-12-10T12:00:00Z");
    expect(sent).toEqual([]);
    await run("2026-12-11T08:00:30Z");
    expect(sent.map((s) => s.body)).toContain("„TÜV-Bericht“ läuft am 20.12.2026 ab");
    await run("2026-12-12T08:00:30Z");
    expect(sent).toHaveLength(3);
  });
});
