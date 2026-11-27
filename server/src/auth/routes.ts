import type { FastifyInstance, FastifyReply } from "fastify";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeUsername, passwordSchema, usernameSchema } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { members, pushSubscriptions } from "../db/schema.ts";
import { requireMember } from "./guard.ts";
import { addressKey, createLockout, userKey } from "./lockout.ts";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password.ts";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  deleteOtherSessions,
  deleteSession,
  listSessions,
  toDto,
} from "./sessions.ts";

type Opts = { db: Db; now: () => Date; cookieSecure: boolean };

export const DEFAULT_COLOR = "person-mint";
const SETUP_LOCK = 7_301_001;

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

const setupBody = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(60),
  password: passwordSchema,
});
const loginBody = z.object({ username: z.string().max(100), password: z.string().max(200) });
const passwordBody = z.object({ current: z.string().max(200), next: passwordSchema });

export async function authRoutes(app: FastifyInstance, opts: Opts) {
  const { db, now } = opts;
  const lockout = createLockout(db, now);
  const memberCount = async () => (await db.select({ n: count() }).from(members))[0]?.n ?? 0;

  app.get("/api/setup/status", async () => ({ needed: (await memberCount()) === 0 }));

  app.post("/api/setup", async (req, reply) => {
    if ((await memberCount()) > 0) return reply.code(403).send({ error: "setup_done" });
    const body = setupBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const passwordHash = await hashPassword(body.data.password);
    // One setup at a time: the count is repeated under a transaction-wide lock.
    const m = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
      const n = (await tx.select({ n: count() }).from(members))[0]?.n ?? 0;
      if (n > 0) return null;
      const [row] = await tx
        .insert(members)
        .values({ username: body.data.username, displayName: body.data.displayName, role: "admin", color: DEFAULT_COLOR, passwordHash })
        .returning();
      return row!;
    });
    if (!m) return reply.code(403).send({ error: "setup_done" });
    const token = await createSession(db, m.id, req.headers["user-agent"], now());
    setSessionCookie(reply, token, opts.cookieSecure);
    return toDto(m);
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = loginBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const username = normalizeUsername(body.data.username);
    const keys = [userKey(username), addressKey(req.ip)];
    const locked = await lockout.lockedUntil(keys);
    if (locked) return reply.code(429).send({ error: "locked", until: locked.toISOString() });
    const counts = await lockout.begin(keys);
    if (counts.some((c, i) => c > keys[i]!.limit)) {
      const until = await lockout.lockReached(keys, counts);
      return reply.code(429).send({ error: "locked", until: until?.toISOString() });
    }

    const rows = await db.select().from(members).where(eq(members.username, username)).limit(1);
    const m = rows[0];
    const ok = m && !m.removedAt ? await verifyPassword(m.passwordHash, body.data.password) : false;
    if (!m) await burnPasswordCheck(body.data.password);
    if (!ok || !m) {
      await lockout.lockReached(keys, counts);
      return reply.code(401).send({ error: "invalid" });
    }
    await lockout.reset(keys[0]!);
    await lockout.refund(keys[1]!);
    const token = await createSession(db, m.id, req.headers["user-agent"], now());
    setSessionCookie(reply, token, opts.cookieSecure);
    return toDto(m);
  });

  app.post("/api/auth/logout", { preHandler: requireMember }, async (req, reply) => {
    await deleteSession(db, req.sessionId!, req.member!.id);
    const endpoint = (req.body as { pushEndpoint?: unknown } | undefined)?.pushEndpoint;
    if (typeof endpoint === "string") await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, req.member!.id)));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", { preHandler: requireMember }, async (req) => req.member);

  app.get("/api/me/sessions", { preHandler: requireMember }, async (req) => {
    const list = await listSessions(db, req.member!.id);
    return list.map((s) => ({ ...s, current: s.id === req.sessionId }));
  });

  app.delete<{ Params: { id: string } }>(
    "/api/me/sessions/:id",
    { preHandler: requireMember },
    async (req, reply) => {
      if (!z.uuid().safeParse(req.params.id).success) return reply.code(404).send({ error: "not_found" });
      await deleteSession(db, req.params.id, req.member!.id);
      return { ok: true };
    },
  );

  app.post("/api/me/password", { preHandler: requireMember }, async (req, reply) => {
    const body = passwordBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const rows = await db.select().from(members).where(eq(members.id, req.member!.id)).limit(1);
    if (!rows[0] || !(await verifyPassword(rows[0].passwordHash, body.data.current))) {
      return reply.code(401).send({ error: "invalid" });
    }
    await db.update(members).set({ passwordHash: await hashPassword(body.data.next), mustChangePassword: false }).where(eq(members.id, req.member!.id));
    await deleteOtherSessions(db, req.member!.id, req.sessionId!);
    return { ok: true };
  });


}
