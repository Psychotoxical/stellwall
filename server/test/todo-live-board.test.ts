import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";

async function connect(app: FastifyInstance, cookie: string) {
  await app.ready();
  const messages: unknown[] = [];
  const ws = await app.injectWS("/api/live", { headers: { origin: "http://localhost", cookie } }, {
    onInit: (s) => s.on("message", (m: Buffer) => messages.push(JSON.parse(m.toString()))),
  });
  return { ws, messages };
}
const settle = () => new Promise((r) => setTimeout(r, 150));
const base = { needsConfirm: false, reminders: [], time: null, until: null, startDate: null, recurrence: { kind: "none" } };

describe("to-do live and board", () => {
  it("stranger gets no todo hint, member of the to-do does", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const kim = await connect(app, f.kim.cookie);
    const sam = await connect(app, f.sam.cookie);
    await settle();
    await as(app, f.alex.cookie).post("/api/todos", { ...base, title: "Geheim", visibility: { everyone: false, memberIds: [f.sam.id] }, assignees: [] });
    await settle();
    expect(kim.messages).not.toContainEqual({ type: "todos" });
    expect(sam.messages).toContainEqual({ type: "todos" });
    kim.ws.terminate();
    sam.ws.terminate();
  });

  it("assignment by others appears on the board, own does not", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    await as(app, f.kim.cookie).post("/api/todos", { ...base, title: "Pflanzen gießen", visibility: { everyone: true, memberIds: [] }, assignees: [f.sam.id] });
    await as(app, f.sam.cookie).post("/api/todos", { ...base, title: "Selbst gemacht", visibility: { everyone: true, memberIds: [] }, assignees: [f.sam.id] });
    const rows = (await as(app, f.sam.cookie).get("/api/board")).json() as { kind: string; whoName: string; title?: string }[];
    expect(rows.filter((r) => r.kind === "todo").map((r) => [r.whoName, r.title])).toEqual([["Kim", "Pflanzen gießen"]]);
    expect((await as(app, f.alex.cookie).get("/api/board")).json()).toEqual([]);
  });
});
