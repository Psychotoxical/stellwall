import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { H } from "./auth-helpers.ts";
import { TOKEN, startFakeMealie } from "./fake-mealie.ts";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function start(opts: { slow?: boolean; timeoutMs?: number } = {}) {
  const mealie = await startFakeMealie({ slow: opts.slow });
  closers.push(mealie.close);
  const { app } = await createTestApp({ mealieTimeoutMs: opts.timeoutMs });
  const f = await setupFamily(app);
  const put = (cookie: string, body: object) => app.inject({ method: "PUT", url: "/api/settings/mealie", headers: { ...H, cookie }, payload: body });
  return { app, f, mealie, put };
}

describe("Mealie connection", () => {
  it("only the administration sets it up, and the key never comes back", async () => {
    const { app, f, mealie, put } = await start();
    expect((await put(f.sam.cookie, { url: mealie.url, token: TOKEN })).statusCode).toBe(403);
    expect((await put(f.alex.cookie, { url: mealie.url, token: TOKEN })).statusCode).toBe(200);
    const got = await as(app, f.alex.cookie).get("/api/settings/mealie");
    expect(got.json()).toEqual({ url: mealie.url, hasToken: true, listId: null });
    expect(got.body).not.toContain(TOKEN);
    const test = await as(app, f.alex.cookie).post("/api/settings/mealie/test", {});
    expect(test.json()).toMatchObject({ ok: true });
  });

  it("searches recipes and reads one with structured and free-text ingredients", async () => {
    const { app, f, mealie, put } = await start();
    await put(f.alex.cookie, { url: mealie.url, token: TOKEN });
    const s = as(app, f.sam.cookie);
    const found = (await s.get("/api/recipes?q=pfanne")).json() as { slug: string; name: string; hasImage: boolean }[];
    expect(found.map((r) => [r.slug, r.hasImage])).toEqual([["gemuese-pfanne", true]]);
    const r = (await s.get("/api/recipes/gemuese-pfanne")).json();
    expect(r).toMatchObject({ name: "Gemüsepfanne", servings: 4, steps: ["Reis kochen.", "Gemüse anbraten und würzen."] });
    expect(r.ingredients).toEqual([
      { quantity: 200, unit: "g", food: "Reis", note: "" },
      { quantity: 1.5, unit: "EL", food: "Öl", note: "" },
      { quantity: 2, unit: null, food: "Paprika", note: "in Streifen" },
      { quantity: null, unit: null, food: "Salz", note: "" },
    ]);
    const img = await s.get("/api/recipes/11111111-1111-4111-8111-111111111111/image");
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toContain("image/webp");
  });

  it("caches the recipe list for a while", async () => {
    const { app, f, mealie, put } = await start();
    await put(f.alex.cookie, { url: mealie.url, token: TOKEN });
    const s = as(app, f.sam.cookie);
    await s.get("/api/recipes?q=");
    await s.get("/api/recipes?q=");
    expect(mealie.calls.filter((c) => c.startsWith("/api/recipes?")).length).toBe(1);
  });

  it("says clearly when Mealie is missing, refuses the key or does not answer", async () => {
    const { app, f, mealie, put } = await start({ slow: true, timeoutMs: 300 });
    const s = as(app, f.sam.cookie);
    expect((await s.get("/api/recipes?q=")).json()).toEqual({ error: "mealie_not_configured" });
    await put(f.alex.cookie, { url: mealie.url, token: "wrong-token" });
    const wrong = await s.get("/api/recipes?q=x");
    expect(wrong.statusCode).toBe(502);
    expect(["mealie_auth", "mealie_unreachable"]).toContain(wrong.json().error);
    await put(f.alex.cookie, { token: TOKEN });
    const slow = await s.get("/api/recipes?q=y");
    expect(slow.json()).toEqual({ error: "mealie_unreachable" });
    expect(slow.body).not.toContain(TOKEN);
  });

  it("rejects a key the server refuses as such", async () => {
    const { app, f, mealie, put } = await start();
    await put(f.alex.cookie, { url: mealie.url, token: "wrong-token" });
    expect((await as(app, f.sam.cookie).get("/api/recipes?q=x")).json()).toEqual({ error: "mealie_auth" });
  });

  it("a new address needs the key again, so the old key never goes to another server", async () => {
    const { app, f, mealie, put } = await start();
    await put(f.alex.cookie, { url: mealie.url, token: TOKEN });
    await put(f.alex.cookie, { url: "https://rezepte.example.test" });
    expect((await as(app, f.alex.cookie).get("/api/settings/mealie")).json()).toMatchObject({ hasToken: false });
  });
});
