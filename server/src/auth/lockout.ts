import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { loginAttempts } from "../db/schema.ts";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
export const USER_LIMIT = 5;
export const ADDRESS_LIMIT = 20;

export type LockKey = { key: string; limit: number };

export const userKey = (username: string): LockKey => ({ key: "u:" + username, limit: USER_LIMIT });
export const addressKey = (ip: string): LockKey => ({ key: "ip:" + ip, limit: ADDRESS_LIMIT });

type Row = { failed_count: number; locked_until: Date | string | null };

/**
 * Attempts are counted atomically before the password is checked, so parallel requests
 * cannot get more checks than the limit allows.
 */
export function createLockout(db: Db, now: () => Date) {
  async function lockedUntil(keys: LockKey[]): Promise<Date | null> {
    const t = now();
    let until: Date | null = null;
    for (const k of keys) {
      const rows = await db.select().from(loginAttempts).where(eq(loginAttempts.key, k.key)).limit(1);
      const lock = rows[0]?.lockedUntil;
      if (lock && lock > t && (!until || lock > until)) until = lock;
    }
    return until;
  }

  /** Counts one attempt per key; returns the new counts in key order. */
  async function begin(keys: LockKey[]): Promise<number[]> {
    const t = now();
    const windowStart = new Date(t.getTime() - WINDOW_MS);
    const counts: number[] = [];
    for (const k of keys) {
      const fresh = sql`(login_attempts.window_start < ${windowStart} and (login_attempts.locked_until is null or login_attempts.locked_until <= ${t}))`;
      const res = await db.execute(sql`
        insert into login_attempts (key, failed_count, window_start, locked_until)
        values (${k.key}, 1, ${t}, null)
        on conflict (key) do update set
          failed_count = case when ${fresh} then 1 else login_attempts.failed_count + 1 end,
          window_start = case when ${fresh} then ${t} else login_attempts.window_start end,
          locked_until = case when ${fresh} then null else login_attempts.locked_until end
        returning failed_count, locked_until`);
      const row = (res as unknown as { rows: Row[] }).rows[0]!;
      counts.push(Number(row.failed_count));
    }
    return counts;
  }

  /** Locks every key whose count reached its limit; returns the latest lock end. */
  async function lockReached(keys: LockKey[], counts: number[]): Promise<Date | null> {
    const until = new Date(now().getTime() + LOCK_MS);
    let any = false;
    for (let i = 0; i < keys.length; i++) {
      if ((counts[i] ?? 0) >= keys[i]!.limit) {
        any = true;
        await db.execute(
          sql`update login_attempts set locked_until = coalesce(locked_until, ${until}) where key = ${keys[i]!.key}`,
        );
      }
    }
    return any ? await lockedUntil(keys) : null;
  }

  async function reset(key: LockKey) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key.key));
  }

  /** A successful login gives its counted attempt back. */
  async function refund(key: LockKey) {
    await db.execute(
      sql`update login_attempts set failed_count = greatest(failed_count - 1, 0) where key = ${key.key}`,
    );
  }

  return { lockedUntil, begin, lockReached, reset, refund };
}
