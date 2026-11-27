import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { requireMember } from "../auth/guard.ts";

const versionFile = z.object({ versionCode: z.number().int().positive(), versionName: z.string().min(1).max(40) });

/**
 * What the Android app needs to keep itself up to date: the newest version on this server,
 * and the APK itself. The files come with the server image (APP_DIR).
 */
export async function appRoutes(app: FastifyInstance, opts: { appDir: string | null; fcm: boolean }) {
  const apk = opts.appDir ? join(opts.appDir, "stellwall.apk") : null;

  const latest = () => {
    if (!opts.appDir || !apk || !existsSync(apk)) return null;
    try {
      return versionFile.parse(JSON.parse(readFileSync(join(opts.appDir, "android.json"), "utf8")));
    } catch {
      return null;
    }
  };

  app.get("/api/app/info", { preHandler: requireMember }, async () => ({ fcm: opts.fcm, android: latest() }));

  app.get("/api/app/android", { preHandler: requireMember }, async (_req, reply) => {
    const v = latest();
    if (!v || !apk) return reply.code(404).send({ error: "not_found" });
    return reply
      .type("application/vnd.android.package-archive")
      .header("content-disposition", `attachment; filename="stellwall-${v.versionName}.apk"`)
      .header("cache-control", "private, no-cache")
      .send(createReadStream(apk));
  });
}
