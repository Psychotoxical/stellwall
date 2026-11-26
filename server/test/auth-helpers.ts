import type { FastifyInstance } from "fastify";

export const H = { "x-stellwall": "1" };

export function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];
  const c = list.find((x) => typeof x === "string" && x.startsWith("sw_session="));
  if (typeof c !== "string") throw new Error("no session cookie");
  return c.split(";")[0]!;
}

export async function setupAdmin(app: FastifyInstance, username = "alex", password = "correct-horse-1") {
  const res = await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: H,
    payload: { username, displayName: "Alex", password },
  });
  if (res.statusCode !== 200) throw new Error("setup failed " + res.statusCode + res.body);
  return { res, cookie: cookieOf(res) };
}

export async function login(app: FastifyInstance, username: string, password: string) {
  return app.inject({ method: "POST", url: "/api/auth/login", headers: H, payload: { username, password } });
}
