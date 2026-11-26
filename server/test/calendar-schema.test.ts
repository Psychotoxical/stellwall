import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { birthdayMembers, birthdays, eventExceptions, eventFor, eventMembers, events } from "../src/db/schema.ts";

describe("calendar schema", () => {
  it("migrations create stage 4 tables", async () => {
    const { db } = await createTestApp();
    for (const t of [events, eventMembers, eventFor, eventExceptions, birthdays, birthdayMembers]) expect(await db.select().from(t)).toEqual([]);
  });
});
