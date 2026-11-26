import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { loginAttempts } from "../db/schema.ts";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
export const USER_LIMIT = 5;
export const ADDRESS_LIMIT = 20;

export type LockKey = { key: string; limit: number };

export const userKey = (username: string): LockKey => ({ key: "u:" + username, limit: USER_LIMIT });
export const addressKey = (ip: string): LockKey => ({ key: "ip:" + ip, limit: ADDRESS_LIMIT });

export function createLockout(db: Db, now: () => Date) {
  async function read(key: string) {
    const rows = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
    return rows[0] ?? null;
  }

  /** Latest lock end among the keys, or null when none is locked. */
  async function lockedUntil(keys: LockKey[]): Promise<Date | null> {
    const t = now();
    let until: Date | null = null;
    for (const k of keys) {
      const row = await read(k.key);
      if (row?.lockedUntil && row.lockedUntil > t && (!until || row.lockedUntil > until)) until = row.lockedUntil;
    }
    return until;
  }

  async function fail(keys: LockKey[]): Promise<Date | null> {
    const t = now();
    let until: Date | null = null;
    for (const k of keys) {
      const row = await read(k.key);
      const fresh = !row || t.getTime() - row.windowStart.getTime() > WINDOW_MS;
      const count = fresh ? 1 : row.failedCount + 1;
      const lock = count >= k.limit ? new Date(t.getTime() + LOCK_MS) : null;
      if (lock && (!until || lock > until)) until = lock;
      const values = { failedCount: count, windowStart: fresh ? t : row.windowStart, lockedUntil: lock };
      if (row) await db.update(loginAttempts).set(values).where(eq(loginAttempts.key, k.key));
      else await db.insert(loginAttempts).values({ key: k.key, ...values });
    }
    return until;
  }

  async function reset(key: LockKey) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key.key));
  }

  return { lockedUntil, fail, reset };
}
