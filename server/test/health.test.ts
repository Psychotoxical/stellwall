import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { loadConfig } from "../src/config.ts";

describe("health", () => {
  it("health returns ok", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("loadConfig", () => {
  it("throws naming DATABASE_URL when it is missing", () => {
    expect(() => loadConfig({ PUBLIC_URL: "https://x.test" })).toThrow(/DATABASE_URL/);
  });
  it("reads defaults", () => {
    const c = loadConfig({ DATABASE_URL: "postgres://u:p@db/s", PUBLIC_URL: "https://x.test" });
    expect(c.port).toBe(8080);
    expect(c.cookieSecure).toBe(true);
  });
});
