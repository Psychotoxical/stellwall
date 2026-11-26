import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../src/app.ts";
import { openPglite } from "../src/db/client.ts";
import { testConfig } from "./helpers.ts";

async function appWithWeb() {
  const dir = mkdtempSync(join(tmpdir(), "sw-web-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Stellwall</title>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
  const database = await openPglite(new PGlite());
  await database.migrate();
  return buildApp({ config: { ...testConfig, webDir: dir }, db: database.db });
}

describe("static web app", () => {
  it("serves index.html for unknown non-api path", async () => {
    const app = await appWithWeb();
    const res = await app.inject({ method: "GET", url: "/mitglieder" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("<title>Stellwall</title>");
  });

  it("serves built files directly", async () => {
    const app = await appWithWeb();
    const res = await app.inject({ method: "GET", url: "/app.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("console.log");
  });

  it("unknown api path returns 404 json", async () => {
    const app = await appWithWeb();
    const res = await app.inject({ method: "GET", url: "/api/nothing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});
