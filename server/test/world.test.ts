import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

describe("colour world", () => {
  it("starts from the person colour and can be chosen by the person", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const s = as(app, f.sam.cookie);
    expect((await s.get("/api/me")).json().world).toBe("flieder"); // person-lilac
    expect((await s.patch(`/api/members/${f.sam.id}`, { world: "rose" })).statusCode).toBe(200);
    expect((await s.get("/api/me")).json().world).toBe("rose");
    expect(((await s.get("/api/members")).json() as { id: string; world: string }[]).find((m) => m.id === f.sam.id)?.world).toBe("rose");
    expect((await s.patch(`/api/members/${f.sam.id}`, { world: "neon" })).statusCode).toBe(400);
    expect((await as(app, f.kim.cookie).patch(`/api/members/${f.sam.id}`, { world: "sonne" })).statusCode).toBe(403);
  });
});
