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
const timed = (title: string, forWhom: string[], seeAll = false) => ({ title, allDay: false, start: "2026-11-25T14:30:00.000Z", end: "2026-11-25T15:30:00.000Z", rrule: null, seeAll, reminders: [], forWhom });

describe("calendar live and board", () => {
  it("only people who may see an event or birthday get a hint", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const kim = await connect(app, f.kim.cookie);
    const sam = await connect(app, f.sam.cookie);
    await settle();
    await as(app, f.alex.cookie).post("/api/events", timed("Zahnarzt", [f.sam.id]));
    await as(app, f.alex.cookie).post("/api/birthdays", { name: "Geheim", month: 6, day: 1, year: null, visibility: { everyone: false, memberIds: [f.sam.id] }, remindDays: 1, remindWho: [] });
    await settle();
    expect(kim.messages).not.toContainEqual({ type: "calendar" });
    expect(sam.messages.filter((m) => (m as { type: string }).type === "calendar").length).toBe(2);
    kim.ws.terminate();
    sam.ws.terminate();
  });

  it("an event someone else enters for me appears on the board, my own does not", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    await as(app, f.kim.cookie).post("/api/events", timed("Zahnarzt", [f.sam.id]));
    await as(app, f.sam.cookie).post("/api/events", timed("Selbst eingetragen", [f.sam.id]));
    await as(app, f.kim.cookie).post("/api/events", timed("Für alle sichtbar, nicht für Alex", [f.kim.id], true));
    const rows = (await as(app, f.sam.cookie).get("/api/board")).json() as { kind: string; whoName: string; title?: string; start?: string; allDay?: boolean }[];
    expect(rows.filter((r) => r.kind === "event").map((r) => [r.whoName, r.title, r.start, r.allDay])).toEqual([["Kim", "Zahnarzt", "2026-11-25T14:30:00.000Z", false]]);
    expect(((await as(app, f.alex.cookie).get("/api/board")).json() as unknown[]).length).toBe(0);
  });

  it("the board row goes away once the event is no longer visible", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    const id = (await as(app, f.kim.cookie).post("/api/events", timed("Kurz da", [f.sam.id]))).json().id as string;
    await as(app, f.kim.cookie).patch(`/api/events/${id}?scope=all`, { forWhom: [f.kim.id] });
    const rows = (await as(app, f.sam.cookie).get("/api/board")).json() as { kind: string }[];
    expect(rows.filter((r) => r.kind === "event")).toEqual([]);
  });
});
