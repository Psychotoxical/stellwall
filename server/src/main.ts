import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";

const config = loadConfig(process.env);
const database = await openDatabase(config.databaseUrl);
await database.migrate();
const app = await buildApp({ config, db: database.db });
app.log.info("starting");
await app.listen({ host: "0.0.0.0", port: config.port });

const stop = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
