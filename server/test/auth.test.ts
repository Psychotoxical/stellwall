import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createTestApp } from "./helpers.ts";
import { H, cookieOf, login, setupAdmin } from "./auth-helpers.ts";

describe("setup", () => {
  it("reports that setup is needed on an empty database", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/setup/status" });
    expect(res.json()).toEqual({ needed: true });
  });

  it("setup creates first admin and session", async () => {
    const { app } = await createTestApp();
    const { res, cookie } = await setupAdmin(app);
    expect(res.json()).toMatchObject({ username: "alex", role: "admin" });
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe("alex");
  });

  it("setup refused once a member exists", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app);
    const again = await app.inject({
      method: "POST",
      url: "/api/setup",
      headers: H,
      payload: { username: "mallory", displayName: "M", password: "0123456789" },
    });
    expect(again.statusCode).toBe(403);
    const status = await app.inject({ method: "GET", url: "/api/setup/status" });
    expect(status.json()).toEqual({ needed: false });
  });
});

describe("login", () => {
  it("login is case and whitespace insensitive", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app, "alex", "correct-horse-1");
    const res = await login(app, " Alex ", "correct-horse-1");
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe("alex");
  });

  it("wrong password returns 401 without revealing which part was wrong", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app);
    const badPw = await login(app, "alex", "wrong-password");
    const badUser = await login(app, "nobody", "wrong-password");
    expect(badPw.statusCode).toBe(401);
    expect(badUser.statusCode).toBe(401);
    expect(badPw.json()).toEqual({ error: "invalid" });
    expect(badUser.json()).toEqual({ error: "invalid" });
  });

  it("me without a session is 401", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
  });
});

describe("sessions", () => {
  it("logout ends only the current session", async () => {
    const { app } = await createTestApp();
    await setupAdmin(app, "alex", "correct-horse-1");
    const a = cookieOf(await login(app, "alex", "correct-horse-1"));
    const b = cookieOf(await login(app, "alex", "correct-horse-1"));
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...H, cookie: a } });
    expect(out.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: a } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: b } })).statusCode).toBe(200);
  });

  it("session survives app restart", async () => {
    const client = new PGlite();
    const first = await createTestApp({ client });
    const { cookie } = await setupAdmin(first.app);
    await first.app.close();
    const second = await createTestApp({ client });
    const me = await second.app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });

  it("lists own sessions and ends one by id", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app, "alex", "correct-horse-1");
    const other = cookieOf(await login(app, "alex", "correct-horse-1"));
    const list = await app.inject({ method: "GET", url: "/api/me/sessions", headers: { cookie } });
    const sessions = list.json() as { id: string; current: boolean }[];
    expect(sessions).toHaveLength(2);
    const notCurrent = sessions.find((s) => !s.current)!;
    const del = await app.inject({
      method: "DELETE",
      url: "/api/me/sessions/" + notCurrent.id,
      headers: { ...H, cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: other } })).statusCode).toBe(401);
  });

  it("changes own password with the current one", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app, "alex", "correct-horse-1");
    const wrong = await app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: { ...H, cookie },
      payload: { current: "nope-nope-1", next: "new-password-2" },
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: { ...H, cookie },
      payload: { current: "correct-horse-1", next: "new-password-2" },
    });
    expect(ok.statusCode).toBe(200);
    expect((await login(app, "alex", "new-password-2")).statusCode).toBe(200);
  });
});

describe("csrf", () => {
  it("state change without X-Stellwall header is 403", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "alex", password: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("state change from a foreign origin is 403", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { ...H, origin: "https://evil.example" },
      payload: { username: "alex", password: "x" },
    });
    expect(res.statusCode).toBe(403);
  });
});
