import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { listMembers, lists } from "../db/schema.ts";

/** SQL condition: the list is visible to the member. */
export function listVisibleTo(memberId: string) {
  return or(
    eq(lists.everyone, true),
    sql`exists (select 1 from ${listMembers} where ${listMembers.listId} = ${lists.id} and ${listMembers.memberId} = ${memberId})`,
  )!;
}

export async function findVisibleList(db: Db, listId: string, memberId: string) {
  const rows = await db.select().from(lists).where(and(eq(lists.id, listId), listVisibleTo(memberId))).limit(1);
  return rows[0] ?? null;
}

export async function listMemberIds(db: Db, listId: string): Promise<string[]> {
  const rows = await db.select({ id: listMembers.memberId }).from(listMembers).where(eq(listMembers.listId, listId));
  return rows.map((r) => r.id);
}
