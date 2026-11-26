import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import { csrfCheck } from "./auth/guard.ts";
import { authRoutes } from "./auth/routes.ts";
import { SESSION_COOKIE, findSession } from "./auth/sessions.ts";

export type AppDeps = { config: Config; db: Db; now?: (() => Date) | undefined };

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? (() => new Date());
  const app = Fastify({ logger: false, trustProxy: "127.0.0.1" });
  await app.register(cookie);

  app.decorateRequest("member", null);
  app.decorateRequest("sessionId", null);
  app.addHook("onRequest", csrfCheck(deps.config.publicUrl));
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const s = await findSession(deps.db, token, now());
    if (s) {
      req.member = s.member;
      req.sessionId = s.sessionId;
    }
  });

  app.get("/api/health", async () => ({ ok: true }));
  await authRoutes(app, { db: deps.db, now, cookieSecure: deps.config.cookieSecure });
  return app;
}
