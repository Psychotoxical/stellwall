import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { todoAssignees, todoDone, todoMembers, todos } from "../src/db/schema.ts";

describe("to-do schema", () => {
  it("migrations create stage 3 tables", async () => {
    const { db } = await createTestApp();
    for (const t of [todos, todoMembers, todoAssignees, todoDone]) expect(await db.select().from(t)).toEqual([]);
  });
});
