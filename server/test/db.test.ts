import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/client.ts";
import { members } from "../src/db/schema.ts";

describe("openDatabase", () => {
  it("opens an in-memory database for pglite:memory", async () => {
    const d = await openDatabase("pglite:memory");
    await d.migrate();
    expect(await d.db.select().from(members)).toEqual([]);
    await d.close();
  });
});
