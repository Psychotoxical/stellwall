import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

async function connect(app: FastifyInstance, cookie: string | null, origin = "http://localhost") {
  await app.ready();
  const headers: Record<string, string> = { origin };
  if (cookie) headers.cookie = cookie;
  const messages: unknown[] = [];
  let resolveClosed: (code: number) => void = () => {};
  const closed = new Promise<number>((resolve) => (resolveClosed = resolve));
  // Listeners go on before the socket opens, so an immediate close is not missed.
  const ws = await app.injectWS("/api/live", { headers }, {
    onInit: (s) => {
      s.on("message", (m: Buffer) => messages.push(JSON.parse(m.toString())));
      s.on("close", (code: number) => resolveClosed(code));
    },
  });
  return { ws, messages, closed };
}

const settle = () => new Promise((r) => setTimeout(r, 150));

describe("live", () => {
  it("member receives change of visible list", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const listId = ((await as(app, f.alex.cookie).get("/api/lists")).json() as { id: string }[])[0]!.id;
    const sam = await connect(app, f.sam.cookie);
    await settle();
    await as(app, f.alex.cookie).post(`/api/lists/${listId}/items`, { name: "Milch" });
    await settle();
    expect(sam.messages).toContainEqual({ type: "list", id: listId });
    sam.ws.terminate();
  });

  it("stranger receives nothing for private list", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const priv = (await as(app, f.alex.cookie).post("/api/lists", { name: "Privat", visibility: { everyone: false, memberIds: [f.sam.id] } })).json().id as string;
    const kim = await connect(app, f.kim.cookie);
    const sam = await connect(app, f.sam.cookie);
    await settle();
    await as(app, f.alex.cookie).post(`/api/lists/${priv}/items`, { name: "Geschenk" });
    await settle();
    expect(kim.messages).not.toContainEqual({ type: "list", id: priv });
    expect(sam.messages).toContainEqual({ type: "list", id: priv });
    kim.ws.terminate();
    sam.ws.terminate();
  });

  it("socket without session is closed", async () => {
    const { app } = await createTestApp();
    const c = await connect(app, null);
    expect(await c.closed).toBe(4401);
  });

  it("socket from a foreign origin is closed", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const c = await connect(app, f.alex.cookie, "https://evil.example");
    expect(await c.closed).toBe(4403);
  });
});
