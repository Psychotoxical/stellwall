import { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../src/app.ts";
import { openPglite, type Database } from "../src/db/client.ts";
import type { Config } from "../src/config.ts";
import type { PushSender } from "../src/push/outbox.ts";

export const testConfig: Config = {
  databaseUrl: "pglite://memory",
  port: 0,
  publicUrl: "http://localhost",
  cookieSecure: false,
  webDir: null,
  timeZone: "Europe/Berlin",
  appDir: null,
  firebaseAccountFile: null,
};

export async function createTestApp(opts: { client?: PGlite; now?: () => Date; mealieTimeoutMs?: number | undefined; pushSender?: PushSender; config?: Config } = {}) {
  const client = opts.client ?? new PGlite();
  const database: Database = await openPglite(client);
  await database.migrate();
  const app = await buildApp({ config: opts.config ?? testConfig, db: database.db, now: opts.now, mealieTimeoutMs: opts.mealieTimeoutMs, pushSender: opts.pushSender ?? (async () => ({ gone: false })), timers: false });
  return { app, db: database.db, client };
}
