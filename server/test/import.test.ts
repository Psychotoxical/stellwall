import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { isBlockedAddress } from "../src/calendar/import.ts";

const google = readFileSync(new URL("./fixtures/google.ics", import.meta.url), "utf8");
const broken = readFileSync(new URL("./fixtures/broken.ics", import.meta.url), "utf8");
const onlyMe = { everyone: false, memberIds: [] as string[] };

function clock(iso: string) {
  return () => new Date(iso);
}

describe("calendar import", () => {
  it("previews, imports with series, exceptions and all-day events, and never twice", async () => {
    const { app } = await createTestApp({ now: clock("2026-11-01T10:00:00Z") });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const pre = await a.post("/api/import/preview", { ics: google });
    expect(pre.statusCode).toBe(200);
    expect(pre.json()).toMatchObject({ count: 3 });
    const r = await a.post("/api/import/commit", { token: pre.json().token, from: "today", visibility: onlyMe });
    expect(r.json()).toEqual({ added: 2, skipped: 0 });

    const got = (await a.get("/api/calendar?from=2026-11-01T00:00:00Z&to=2026-12-31T00:00:00Z")).json() as { title: string; date: string; start: string; endDate: string; allDay: boolean }[];
    const choir = got.filter((i) => i.title.startsWith("Chorprobe")).slice(0, 4).map((i) => [i.date, i.title, i.start]);
    expect(choir).toEqual([
      ["2026-11-02", "Chorprobe", "2026-11-02T17:30:00.000Z"],
      ["2026-11-09", "Chorprobe (verlegt)", "2026-11-10T18:00:00.000Z"],
      ["2026-11-23", "Chorprobe", "2026-11-23T17:30:00.000Z"],
      ["2026-11-30", "Chorprobe", "2026-11-30T17:30:00.000Z"],
    ]);
    const xmas = got.find((i) => i.title === "Weihnachten bei den Eltern")!;
    expect([xmas.date, xmas.endDate, xmas.allDay]).toEqual(["2026-12-24", "2026-12-26", true]);
    expect(got.some((i) => i.title === "Alter Termin")).toBe(false);

    const again = await a.post("/api/import/preview", { ics: google });
    expect((await a.post("/api/import/commit", { token: again.json().token, from: "today", visibility: onlyMe })).json()).toEqual({ added: 0, skipped: 2 });
    expect(((await as(app, f.sam.cookie).get("/api/calendar?from=2026-11-01T00:00:00Z&to=2026-12-31T00:00:00Z")).json() as unknown[]).length).toBe(0);
  });

  it("imports everything when asked", async () => {
    const { app } = await createTestApp({ now: clock("2026-11-01T10:00:00Z") });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const pre = await a.post("/api/import/preview", { ics: google });
    expect((await a.post("/api/import/commit", { token: pre.json().token, from: "all", visibility: onlyMe })).json()).toEqual({ added: 3, skipped: 0 });
  });

  it("a broken file gives a clear error and imports nothing", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const r = await as(app, f.alex.cookie).post("/api/import/preview", { ics: broken });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: "bad_file" });
  });

  it("someone else's preview token cannot be used", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const pre = await as(app, f.alex.cookie).post("/api/import/preview", { ics: google });
    expect((await as(app, f.sam.cookie).post("/api/import/commit", { token: pre.json().token, from: "all", visibility: onlyMe })).statusCode).toBe(404);
  });

  it("links into the own or private network are refused", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    for (const url of ["http://example.test/cal.ics", "https://127.0.0.1/cal.ics", "https://10.0.0.5/cal.ics", "https://[::1]/cal.ics", "file:///etc/passwd"]) {
      const r = await a.post("/api/import/preview", { url });
      expect(r.statusCode, url).toBe(400);
    }
    expect(isBlockedAddress("192.168.178.20")).toBe(true);
    expect(isBlockedAddress("172.17.0.1")).toBe(true);
    expect(isBlockedAddress("169.254.1.1")).toBe(true);
    expect(isBlockedAddress("fd00::1")).toBe(true);
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
  });
});
