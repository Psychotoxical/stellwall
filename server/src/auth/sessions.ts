import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { defaultWorld, type MemberDto, type World } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { members, sessions } from "../db/schema.ts";

export const SESSION_COOKIE = "sw_session";
export const SESSION_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function toDto(m: typeof members.$inferSelect): MemberDto {
  return { id: m.id, username: m.username, displayName: m.displayName, role: m.role, color: m.color, world: (m.world as World | null) ?? defaultWorld(m.color), mustChangePassword: m.mustChangePassword };
}

export async function createSession(db: Db, memberId: string, userAgent: string | undefined, now: Date) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    memberId,
    tokenHash: hashToken(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY),
  });
  return token;
}

export type SessionInfo = { sessionId: string; member: MemberDto };

export async function findSession(db: Db, token: string, now: Date): Promise<SessionInfo | null> {
  const rows = await db
    .select({ s: sessions, m: members })
    .from(sessions)
    .innerJoin(members, eq(sessions.memberId, members.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now), isNull(members.removedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (now.getTime() - row.s.lastSeenAt.getTime() > HOUR) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY) })
      .where(eq(sessions.id, row.s.id));
  }
  return { sessionId: row.s.id, member: toDto(row.m) };
}

export async function deleteSession(db: Db, sessionId: string, memberId: string) {
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.memberId, memberId)));
}

export async function deleteAllSessions(db: Db, memberId: string) {
  await db.delete(sessions).where(eq(sessions.memberId, memberId));
}

export async function listSessions(db: Db, memberId: string) {
  return db
    .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(eq(sessions.memberId, memberId));
}

export async function deleteOtherSessions(db: Db, memberId: string, keepSessionId: string) {
  await db.delete(sessions).where(and(eq(sessions.memberId, memberId), ne(sessions.id, keepSessionId)));
}
