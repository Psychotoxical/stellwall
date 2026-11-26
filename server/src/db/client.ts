import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Database = { db: Db; migrate(): Promise<void>; close(): Promise<void> };

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function openPostgres(url: string): Promise<Database> {
  const { Pool } = (await import("pg")).default;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  return { db: db as unknown as Db, migrate: () => migrate(db, { migrationsFolder }), close: () => pool.end() };
}

export async function openPglite(client: PGlite): Promise<Database> {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle({ client, schema });
  return { db: db as unknown as Db, migrate: () => migrate(db, { migrationsFolder }), close: () => client.close() };
}
