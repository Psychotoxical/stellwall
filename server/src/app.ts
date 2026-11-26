import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import { csrfCheck } from "./auth/guard.ts";
import { authRoutes } from "./auth/routes.ts";
import { SESSION_COOKIE, findSession } from "./auth/sessions.ts";
import { memberRoutes } from "./members/routes.ts";
import { listRoutes } from "./shopping/lists.ts";
import { createHub, liveRoutes } from "./live/hub.ts";
import { itemRoutes } from "./shopping/items.ts";
import { boardRoutes } from "./board/routes.ts";
import { todoRoutes } from "./todos/routes.ts";
import { eventRoutes } from "./calendar/events.ts";
import { birthdayRoutes } from "./calendar/birthdays.ts";
import { importRoutes } from "./calendar/import.ts";
import { createMealie, mealieRoutes } from "./meals/mealie.ts";
import { mealRoutes } from "./meals/plan.ts";
import { createOutbox, webPushSender, type PushSender } from "./push/outbox.ts";
import { createAnnouncer } from "./push/announce.ts";
import { remind } from "./push/reminders.ts";
import type { Notifier } from "./shopping/notify.ts";

const TRUSTED_PROXIES = ["127.0.0.0/8", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

export type AppDeps = {
  config: Config;
  db: Db;
  now?: (() => Date) | undefined;
  mealieTimeoutMs?: number | undefined;
  /** Replaces the real push services (tests). */
  pushSender?: PushSender | undefined;
  /** Runs the outbox and reminder clocks; off in tests, which drive them by hand. */
  timers?: boolean | undefined;
};

declare module "fastify" {
  interface FastifyInstance {
    push: { dispatch: () => Promise<void>; remind: () => Promise<void> };
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? (() => new Date());
  // The app sits behind the host nginx; Docker hands requests over from a private address.
  const app = Fastify({ logger: false, trustProxy: TRUSTED_PROXIES });
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
  await memberRoutes(app, { db: deps.db, now });
  const hub = createHub(deps.db);
  const outbox = createOutbox(deps.db, { now, timeZone: deps.config.timeZone, sender: deps.pushSender ?? webPushSender(deps.db, deps.config.publicUrl) });
  const announcer = createAnnouncer(deps.db, outbox, deps.config.timeZone);
  // Reports run in the background; sending waits for those still being written.
  const pending = new Set<Promise<unknown>>();
  const quietly = (p: Promise<unknown>) => {
    const q = p.catch(() => {}).finally(() => pending.delete(q));
    pending.add(q);
  };
  const settled = () => Promise.all([...pending]);
  const notify: Notifier = {
    ...hub.notifier,
    eventFor: (...a) => quietly(announcer.eventFor(...a)),
    todoGiven: (...a) => quietly(announcer.todoGiven(...a)),
    itemsAdded: (...a) => quietly(announcer.itemsAdded(...a)),
    cook: (...a) => quietly(announcer.cook(...a)),
  };
  app.decorate("push", {
    dispatch: () => settled().then(() => outbox.dispatch()),
    remind: () => settled().then(() => remind(deps.db, outbox, now(), deps.config.timeZone)),
  });
  if (deps.timers !== false) {
    // Reminders are worked out every minute, due messages go out every 30 seconds.
    const tick = (ms: number, fn: () => Promise<void>) => {
      const t = setInterval(() => void fn().catch(() => {}), ms);
      t.unref();
      app.addHook("onClose", async () => clearInterval(t));
    };
    tick(60_000, app.push.remind);
    tick(30_000, app.push.dispatch);
  }
  await liveRoutes(app, { hub, publicUrl: deps.config.publicUrl });
  await listRoutes(app, { db: deps.db, now, notify });
  await itemRoutes(app, { db: deps.db, now, timeZone: deps.config.timeZone, notify });
  await boardRoutes(app, { db: deps.db, now });
  await todoRoutes(app, { db: deps.db, now, timeZone: deps.config.timeZone, notify });
  await eventRoutes(app, { db: deps.db, now, timeZone: deps.config.timeZone, notify });
  await birthdayRoutes(app, { db: deps.db, now, notify });
  await importRoutes(app, { db: deps.db, now, timeZone: deps.config.timeZone, notify });
  const mealie = createMealie(deps.db, deps.mealieTimeoutMs ?? 10_000);
  await mealieRoutes(app, { db: deps.db, mealie });
  await mealRoutes(app, { db: deps.db, now, mealie, notify });

  const webDir = deps.config.webDir;
  if (webDir) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false, index: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (webDir && req.method === "GET" && !req.url.startsWith("/api/")) {
      return reply.header("cache-control", "no-cache").sendFile("index.html");
    }
    return reply.code(404).send({ error: "not_found" });
  });
  return app;
}
