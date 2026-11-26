import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { login, setupAdmin } from "./auth-helpers.ts";

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe("lockout", () => {
  it("locks a username after 5 failures and lifts it after 15 minutes", async () => {
    const c = clock("2026-11-26T10:00:00Z");
    const { app } = await createTestApp({ now: c.now });
    await setupAdmin(app, "alex", "correct-horse-1");
    for (let i = 0; i < 5; i++) expect((await login(app, "alex", `wrong-${i}-pass`)).statusCode).toBe(401);
    const sixth = await login(app, "alex", "wrong-6-pass");
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toEqual({ error: "locked", until: "2026-11-26T10:15:00.000Z" });
    const right = await login(app, "alex", "correct-horse-1");
    expect(right.statusCode).toBe(429);
    c.advance(15 * 60 * 1000 + 1000);
    expect((await login(app, "alex", "correct-horse-1")).statusCode).toBe(200);
  });

  it("a successful login resets the failure count", async () => {
    const c = clock("2026-11-26T10:00:00Z");
    const { app } = await createTestApp({ now: c.now });
    await setupAdmin(app, "alex", "correct-horse-1");
    for (let i = 0; i < 4; i++) await login(app, "alex", `wrong-${i}-pass`);
    expect((await login(app, "alex", "correct-horse-1")).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(app, "alex", `wrong-${i}-pass`)).statusCode).toBe(401);
  });

  it("locks an address after 20 failures across usernames", async () => {
    const c = clock("2026-11-26T10:00:00Z");
    const { app } = await createTestApp({ now: c.now });
    await setupAdmin(app, "alex", "correct-horse-1");
    for (let i = 0; i < 20; i++) await login(app, `user${i}`, "wrong-pass-0");
    expect((await login(app, "alex", "correct-horse-1")).statusCode).toBe(429);
  });
});
