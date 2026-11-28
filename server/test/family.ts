import type { FastifyInstance } from "fastify";
import { H, cookieOf, login, setupAdmin } from "./auth-helpers.ts";

/** Alex (admin), Sam and Kim with their session cookies and ids. */
export async function setupFamily(app: FastifyInstance) {
  const { cookie: alex, res } = await setupAdmin(app, "alex", "correct-horse-1");
  const alexId = res.json().id as string;
  const add = async (username: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { ...H, cookie: alex },
      payload: { username, displayName: username[0]!.toUpperCase() + username.slice(1), password: "member-pass-1", role: "member", color: "person-lilac" },
    });
    return { id: r.json().id as string, cookie: cookieOf(await login(app, username, "member-pass-1")) };
  };
  const sam = await add("sam");
  const kim = await add("kim");
  return { alex: { id: alexId, cookie: alex }, sam, kim };
}

export function as(app: FastifyInstance, cookie: string) {
  return {
    get: (url: string) => app.inject({ method: "GET", url, headers: { cookie } }),
    post: (url: string, payload?: unknown) => app.inject({ method: "POST", url, headers: { ...H, cookie }, payload: payload as object }),
    patch: (url: string, payload: unknown) => app.inject({ method: "PATCH", url, headers: { ...H, cookie }, payload: payload as object }),
    put: (url: string, payload: unknown) => app.inject({ method: "PUT", url, headers: { ...H, cookie }, payload: payload as object }),
    del: (url: string) => app.inject({ method: "DELETE", url, headers: { ...H, cookie } }),
  };
}
