import type { FastifyInstance } from "fastify";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { PERSON_COLORS, passwordSchema, roleSchema, usernameSchema } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { members } from "../db/schema.ts";
import { requireAdmin, requireMember } from "../auth/guard.ts";
import { hashPassword } from "../auth/password.ts";
import { deleteAllSessions, toDto } from "../auth/sessions.ts";

const colorSchema = z.enum(PERSON_COLORS);
const createBody = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(60),
  password: passwordSchema,
  role: roleSchema,
  color: colorSchema,
});
const patchBody = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  color: colorSchema.optional(),
  role: roleSchema.optional(),
});
const resetBody = z.object({ password: passwordSchema });
const idParam = z.object({ id: z.uuid() });

export async function memberRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date }) {
  const { db, now } = opts;
  const active = isNull(members.removedAt);

  async function find(id: string) {
    const rows = await db.select().from(members).where(and(eq(members.id, id), active)).limit(1);
    return rows[0] ?? null;
  }
  async function otherAdmins(id: string) {
    const r = await db
      .select({ n: count() })
      .from(members)
      .where(and(eq(members.role, "admin"), active, ne(members.id, id)));
    return r[0]?.n ?? 0;
  }

  app.get("/api/members", { preHandler: requireMember }, async () => {
    const rows = await db.select().from(members).where(active).orderBy(asc(members.createdAt));
    return rows.map(toDto);
  });

  app.post("/api/members", { preHandler: requireAdmin }, async (req, reply) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const taken = await db.select({ id: members.id }).from(members).where(eq(members.username, body.data.username));
    if (taken.length) return reply.code(409).send({ error: "username_taken" });
    const [m] = await db
      .insert(members)
      .values({
        username: body.data.username,
        displayName: body.data.displayName,
        role: body.data.role,
        color: body.data.color,
        passwordHash: await hashPassword(body.data.password),
      })
      .returning();
    return toDto(m!);
  });

  app.patch("/api/members/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!;
    const isSelf = me.id === p.data.id;
    if (me.role !== "admin" && (!isSelf || body.data.role !== undefined)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const target = await find(p.data.id);
    if (!target) return reply.code(404).send({ error: "not_found" });
    if (body.data.role === "member" && target.role === "admin" && (await otherAdmins(target.id)) === 0) {
      return reply.code(409).send({ error: "last_admin" });
    }
    const [m] = await db.update(members).set(body.data).where(eq(members.id, target.id)).returning();
    return toDto(m!);
  });

  app.post("/api/members/:id/reset-password", { preHandler: requireAdmin }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = resetBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const target = await find(p.data.id);
    if (!target) return reply.code(404).send({ error: "not_found" });
    await db.update(members).set({ passwordHash: await hashPassword(body.data.password) }).where(eq(members.id, target.id));
    await deleteAllSessions(db, target.id);
    return { ok: true };
  });

  app.delete("/api/members/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const target = await find(p.data.id);
    if (!target) return reply.code(404).send({ error: "not_found" });
    if (target.role === "admin" && (await otherAdmins(target.id)) === 0) {
      return reply.code(409).send({ error: "last_admin" });
    }
    await db.update(members).set({ removedAt: now() }).where(eq(members.id, target.id));
    await deleteAllSessions(db, target.id);
    return { ok: true };
  });
}
