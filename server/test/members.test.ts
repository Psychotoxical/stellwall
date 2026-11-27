import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { H, cookieOf, login, setupAdmin } from "./auth-helpers.ts";
import type { FastifyInstance } from "fastify";

async function addMember(app: FastifyInstance, cookie: string, username: string, role = "member") {
  return app.inject({
    method: "POST",
    url: "/api/members",
    headers: { ...H, cookie },
    payload: { username, displayName: username, password: "member-pass-1", role, color: "person-lilac" },
  });
}

describe("members", () => {
  it("admin creates member", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    const res = await addMember(app, cookie, "sam");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "sam", role: "member", color: "person-lilac" });
    const list = await app.inject({ method: "GET", url: "/api/members", headers: { cookie } });
    expect((list.json() as unknown[]).length).toBe(2);
  });

  it("member cannot create member", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    await addMember(app, cookie, "sam");
    const sam = cookieOf(await login(app, "sam", "member-pass-1"));
    expect((await addMember(app, sam, "kim")).statusCode).toBe(403);
  });

  it("duplicate username differing in case is rejected", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    await addMember(app, cookie, "sam");
    expect((await addMember(app, cookie, " SAM ")).statusCode).toBe(409);
  });

  it("last admin cannot be removed or demoted, also not by self", async () => {
    const { app } = await createTestApp();
    const { cookie, res } = await setupAdmin(app);
    const id = res.json().id as string;
    const demote = await app.inject({ method: "PATCH", url: "/api/members/" + id, headers: { ...H, cookie }, payload: { role: "member" } });
    expect(demote.statusCode).toBe(409);
    const remove = await app.inject({ method: "DELETE", url: "/api/members/" + id, headers: { ...H, cookie } });
    expect(remove.statusCode).toBe(409);
  });

  it("second admin can remove first admin", async () => {
    const { app } = await createTestApp();
    const { cookie, res } = await setupAdmin(app);
    const firstId = res.json().id as string;
    await addMember(app, cookie, "robin", "admin");
    const robin = cookieOf(await login(app, "robin", "member-pass-1"));
    const del = await app.inject({ method: "DELETE", url: "/api/members/" + firstId, headers: { ...H, cookie: robin } });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(401);
  });

  it("a new or reset password is changed after the first login", async () => {
    const { app } = await createTestApp();
    const { cookie, res } = await setupAdmin(app);
    expect(res.json().mustChangePassword).toBe(false);
    const sam = (await addMember(app, cookie, "sam")).json().id as string;
    const first = await login(app, "sam", "member-pass-1");
    expect(first.json().mustChangePassword).toBe(true);
    const samCookie = cookieOf(first);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: samCookie } })).json().mustChangePassword).toBe(true);
    const change = await app.inject({ method: "POST", url: "/api/me/password", headers: { ...H, cookie: samCookie }, payload: { current: "member-pass-1", next: "my-own-secret-9" } });
    expect(change.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: samCookie } })).json().mustChangePassword).toBe(false);
    await app.inject({ method: "POST", url: `/api/members/${sam}/reset-password`, headers: { ...H, cookie }, payload: { password: "fresh-pass-22" } });
    expect((await login(app, "sam", "fresh-pass-22")).json().mustChangePassword).toBe(true);
  });

  it("reset password ends that member's sessions", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    const sam = (await addMember(app, cookie, "sam")).json().id as string;
    const samCookie = cookieOf(await login(app, "sam", "member-pass-1"));
    const reset = await app.inject({ method: "POST", url: `/api/members/${sam}/reset-password`, headers: { ...H, cookie }, payload: { password: "fresh-pass-22" } });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: samCookie } })).statusCode).toBe(401);
    expect((await login(app, "sam", "fresh-pass-22")).statusCode).toBe(200);
  });

  it("removed member cannot log in and is hidden from the list", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    const sam = (await addMember(app, cookie, "sam")).json().id as string;
    await app.inject({ method: "DELETE", url: "/api/members/" + sam, headers: { ...H, cookie } });
    expect((await login(app, "sam", "member-pass-1")).statusCode).toBe(401);
    const list = await app.inject({ method: "GET", url: "/api/members", headers: { cookie } });
    expect((list.json() as { username: string }[]).map((m) => m.username)).toEqual(["alex"]);
  });

  it("a member edits own name and colour but not role", async () => {
    const { app } = await createTestApp();
    const { cookie } = await setupAdmin(app);
    const sam = (await addMember(app, cookie, "sam")).json().id as string;
    const samCookie = cookieOf(await login(app, "sam", "member-pass-1"));
    const ok = await app.inject({ method: "PATCH", url: "/api/members/" + sam, headers: { ...H, cookie: samCookie }, payload: { displayName: "Sammy", color: "person-sky" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ displayName: "Sammy", color: "person-sky" });
    const role = await app.inject({ method: "PATCH", url: "/api/members/" + sam, headers: { ...H, cookie: samCookie }, payload: { role: "admin" } });
    expect(role.statusCode).toBe(403);
  });
});
