import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { notificationPrefs, notifications, pushSubscriptions } from "../src/db/schema.ts";

describe("notification schema", () => {
  it("migrations create the notification tables", async () => {
    const { db } = await createTestApp();
    for (const t of [pushSubscriptions, notificationPrefs, notifications]) expect(await db.select().from(t)).toEqual([]);
  });
});
