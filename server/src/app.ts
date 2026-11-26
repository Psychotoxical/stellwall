import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";

export type AppDeps = { config: Config; db: Db; now?: () => Date };

export async function buildApp(_deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: "127.0.0.1" });
  app.get("/api/health", async () => ({ ok: true }));
  return app;
}
