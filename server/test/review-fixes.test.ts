import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { H, cookieOf, login, setupAdmin } from "./auth-helpers.ts";

describe("review fixes", () => {
  it("address lockout uses the client address forwarded by the proxy", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app, "alex", "correct-horse-1");
    const from = (ip: string, username: string, password: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        remoteAddress: "172.18.0.1",
        headers: { ...H, "x-forwarded-for": ip },
        payload: { username, password },
      });
    for (let i = 0; i < 20; i++) await from("203.0.113.5", `user${i}`, "wrong-pass-0");
    expect((await from("203.0.113.5", "alex", "correct-horse-1")).statusCode).toBe(429);
    expect((await from("198.51.100.7", "alex", "correct-horse-1")).statusCode).toBe(200);
  });

  it("parallel wrong logins are still limited to five checks", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app, "alex", "correct-horse-1");
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => login(app, "alex", `wrong-${i}-pass`)));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
  });

  it("two setup requests at once create only one admin", async () => {
    const { app } = await createTestApp();
    const body = (u: string) => ({ username: u, displayName: u, password: "correct-horse-1" });
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/api/setup", headers: H, payload: body("alex") }),
      app.inject({ method: "POST", url: "/api/setup", headers: H, payload: body("mallory") }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 403]);
  });

  it("changing the own password signs out the other devices", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app, "alex", "correct-horse-1");
    const other = cookieOf(await login(app, "alex", "correct-horse-1"));
    const res = await app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: { ...H, cookie },
      payload: { current: "correct-horse-1", next: "new-password-2" },
    });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: other } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(200);
  });
});
