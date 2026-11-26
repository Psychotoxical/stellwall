import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.ts";
import { notificationPrefs, pushSubscriptions } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import { KINDS, vapidKeys, type PushSender } from "./outbox.ts";

const subBody = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  label: z.string().trim().max(60).default(""),
});
const prefsBody = z.strictObject(Object.fromEntries(KINDS.map((k) => [k, z.boolean().optional()])) as Record<(typeof KINDS)[number], z.ZodOptional<z.ZodBoolean>>);
const idParam = z.object({ id: z.uuid() });

export async function pushRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; sender: PushSender }) {
  const { db, now, sender } = opts;

  app.get("/api/push/key", { preHandler: requireMember }, async () => ({ key: (await vapidKeys(db)).publicKey }));

  app.get("/api/push/subscriptions", { preHandler: requireMember }, async (req) => {
    const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, req.member!.id));
    return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt.toISOString() }));
  });

  app.post("/api/push/subscriptions", { preHandler: requireMember }, async (req, reply) => {
    const b = subBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const values = { memberId: req.member!.id, p256dh: b.data.keys.p256dh, auth: b.data.keys.auth, label: b.data.label, createdAt: now() };
    // The same device signed in as someone else now belongs to that person.
    const [row] = await db.insert(pushSubscriptions).values({ endpoint: b.data.endpoint, ...values }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values }).returning();
    return { id: row!.id };
  });

  app.delete("/api/push/subscriptions/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const gone = await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, p.data.id), eq(pushSubscriptions.memberId, req.member!.id))).returning();
    if (!gone.length) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.get("/api/notification-prefs", { preHandler: requireMember }, async (req) => {
    const rows = await db.select().from(notificationPrefs).where(eq(notificationPrefs.memberId, req.member!.id));
    return Object.fromEntries(KINDS.map((k) => [k, rows.find((r) => r.kind === k)?.enabled ?? true]));
  });

  app.put("/api/notification-prefs", { preHandler: requireMember }, async (req, reply) => {
    const b = prefsBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    for (const [kind, enabled] of Object.entries(b.data)) {
      if (enabled === undefined) continue;
      await db.insert(notificationPrefs).values({ memberId: me, kind, enabled }).onConflictDoUpdate({ target: [notificationPrefs.memberId, notificationPrefs.kind], set: { enabled } });
    }
    return { ok: true };
  });

  app.post("/api/push/test", { preHandler: requireMember }, async (req) => {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, req.member!.id));
    const payload = JSON.stringify({ title: "Stellwall", body: "Stellwall kann dir jetzt Bescheid geben.", url: "/mehr" });
    let devices = 0;
    for (const s of subs) {
      const r = await sender(s, payload).catch(() => ({ gone: false }));
      if (r.gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      else devices++;
    }
    return { devices };
  });
}
