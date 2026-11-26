import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { mealPlan, pantryStaples, settings } from "../src/db/schema.ts";

describe("meals schema", () => {
  it("migrations create stage 5 tables and fill the pantry", async () => {
    const { db } = await createTestApp();
    expect(await db.select().from(mealPlan)).toEqual([]);
    expect(await db.select().from(settings)).toEqual([]);
    const staples = (await db.select().from(pantryStaples)).map((s) => s.name);
    expect(staples.length).toBeGreaterThanOrEqual(30);
    expect(staples).toContain("Salz");
  });
});
