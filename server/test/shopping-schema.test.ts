import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { boardSeen, catalogEntries, items, listMembers, lists } from "../src/db/schema.ts";

describe("shopping schema", () => {
  it("migrations create stage 2 tables", async () => {
    const { db } = await createTestApp();
    for (const t of [lists, listMembers, items, catalogEntries, boardSeen]) {
      expect(await db.select().from(t)).toEqual([]);
    }
  });
});
