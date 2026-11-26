import type { FastifyInstance } from "fastify";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { birthdaysBetween, zonedTime } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { birthdayMembers, birthdays } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import type { Notifier } from "../shopping/notify.ts";

export function birthdayVisibleTo(memberId: string) {
  return or(
    eq(birthdays.everyone, true),
    sql`exists (select 1 from ${birthdayMembers} where ${birthdayMembers.birthdayId} = ${birthdays.id} and ${birthdayMembers.memberId} = ${memberId})`,
  )!;
}

export async function birthdayAudience(db: Db, id: string): Promise<string[] | null> {
  const b = (await db.select({ everyone: birthdays.everyone }).from(birthdays).where(eq(birthdays.id, id)))[0];
  if (!b) return [];
  if (b.everyone) return null;
  return (await db.select({ id: birthdayMembers.memberId }).from(birthdayMembers).where(eq(birthdayMembers.birthdayId, id))).map((r) => r.id);
}

/** Birthdays the member may see, as calendar instances between two local dates. */
export async function birthdayInstances(db: Db, me: string, fromDate: string, toDate: string, tz: string) {
  const rows = await db.select().from(birthdays).where(birthdayVisibleTo(me));
  return rows.flatMap((b) =>
    birthdaysBetween({ month: b.month, day: b.day, year: b.year }, fromDate, toDate).map((o) => ({
      kind: "birthday",
      birthdayId: b.id,
      date: o.date,
      start: zonedTime(o.date, "00:00", tz).toISOString(),
      allDay: true,
      endDate: o.date,
      title: b.name,
      age: o.age,
    })),
  );
}

const bodyFields = {
  name: z.string().trim().min(1).max(80),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().min(1900).max(2100).nullable(),
  visibility: z.object({ everyone: z.boolean(), memberIds: z.array(z.uuid()).max(50) }),
  remindDays: z.number().int().min(0).max(60),
  remindWho: z.array(z.uuid()).max(20),
};
const createBody = z.object(bodyFields).refine((b) => b.day <= new Date(Date.UTC(2024, b.month, 0)).getUTCDate(), "no such day");
const patchBody = z.object(bodyFields).partial();
const idParam = z.object({ id: z.uuid() });

export async function birthdayRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; notify: Notifier }) {
  const { db, now, notify } = opts;
  const visible = async (id: string, me: string) => (await db.select().from(birthdays).where(and(eq(birthdays.id, id), birthdayVisibleTo(me))).limit(1))[0] ?? null;

  async function setVisibility(id: string, everyone: boolean, memberIds: string[], creator: string) {
    await db.delete(birthdayMembers).where(eq(birthdayMembers.birthdayId, id));
    if (everyone) return;
    await db.insert(birthdayMembers).values([...new Set([...memberIds, creator])].map((memberId) => ({ birthdayId: id, memberId })));
  }

  async function dto(b: typeof birthdays.$inferSelect) {
    const memberIds = b.everyone ? [] : (await db.select({ id: birthdayMembers.memberId }).from(birthdayMembers).where(eq(birthdayMembers.birthdayId, b.id))).map((r) => r.id);
    return { id: b.id, name: b.name, month: b.month, day: b.day, year: b.year, visibility: { everyone: b.everyone, memberIds }, remindDays: b.remindDays, remindWho: b.remindWho as string[], createdBy: b.createdBy };
  }

  app.get("/api/birthdays", { preHandler: requireMember }, async (req) => {
    const rows = await db.select().from(birthdays).where(birthdayVisibleTo(req.member!.id));
    rows.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "de"));
    return Promise.all(rows.map(dto));
  });

  app.post("/api/birthdays", { preHandler: requireMember }, async (req, reply) => {
    const b = createBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const [row] = await db
      .insert(birthdays)
      .values({ name: b.data.name, month: b.data.month, day: b.data.day, year: b.data.year, everyone: b.data.visibility.everyone, createdBy: me, createdAt: now(), remindDays: b.data.remindDays, remindWho: b.data.remindWho })
      .returning();
    await setVisibility(row!.id, b.data.visibility.everyone, b.data.visibility.memberIds, me);
    notify.birthday(row!.id);
    return dto(row!);
  });

  app.patch("/api/birthdays/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const b = patchBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    const row = await visible(p.data.id, me);
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (b.data.visibility && row.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const { visibility, ...rest } = b.data;
    const month = rest.month ?? row.month;
    const day = rest.day ?? row.day;
    if (day > new Date(Date.UTC(2024, month, 0)).getUTCDate()) return reply.code(400).send({ error: "invalid_input" });
    const set: Partial<typeof birthdays.$inferInsert> = { ...rest };
    if (visibility) set.everyone = visibility.everyone;
    const [u] = Object.keys(set).length ? await db.update(birthdays).set(set).where(eq(birthdays.id, row.id)).returning() : [row];
    if (visibility) await setVisibility(row.id, visibility.everyone, visibility.memberIds, row.createdBy);
    notify.birthday(row.id);
    return dto(u!);
  });

  app.delete("/api/birthdays/:id", { preHandler: requireMember }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: "not_found" });
    const me = req.member!.id;
    const row = await visible(p.data.id, me);
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.createdBy !== me) return reply.code(403).send({ error: "not_creator" });
    const audience = await birthdayAudience(db, row.id);
    await db.delete(birthdays).where(eq(birthdays.id, row.id));
    notify.calendarGone(audience);
    return { ok: true };
  });
}
