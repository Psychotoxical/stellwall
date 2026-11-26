import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { CATEGORIES } from "@stellwall/shared";
import { contract } from "./contract.ts";

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe("contract: start and shopping", () => {
  it("writes the shopping, board and member examples the apps parse", async () => {
    const c = clock("2026-11-27T10:00:00Z");
    const { app } = await createTestApp({ now: c.now });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    const sam = as(app, f.sam.cookie);

    contract("members", await alex.get("/api/members"));
    const lists = await alex.get("/api/lists");
    contract("lists", lists);
    const family = lists.json()[0].id as string;

    contract("list-created", await alex.post("/api/lists", { name: "Drogerie", visibility: { everyone: false, memberIds: [f.sam.id] } }));
    c.advance(60_000);
    contract("item-added", await sam.post(`/api/lists/${family}/items`, { name: "Milch", quantity: "2 l" }));
    c.advance(60_000);
    const bread = await sam.post(`/api/lists/${family}/items`, { name: "Brot" });
    c.advance(60_000);
    await sam.post("/api/todos", { title: "Müll rausbringen", visibility: { everyone: true, memberIds: [] }, assignees: [f.alex.id], needsConfirm: false, reminders: [], time: null, until: null, startDate: null, recurrence: { kind: "none" } });
    c.advance(60_000);
    await sam.post("/api/events", { title: "Zahnarzt", allDay: false, start: "2026-12-02T14:30:00.000Z", end: "2026-12-02T15:30:00.000Z", rrule: null, seeAll: false, reminders: [], forWhom: [f.alex.id] });
    c.advance(60_000);
    const checked = await alex.patch(`/api/items/${bread.json().id}`, { checked: true });
    expect(checked.statusCode).toBe(200);
    contract("item-checked", checked);
    contract("items", await alex.get(`/api/lists/${family}/items`));
    contract("suggestions", await alex.get(`/api/suggestions?q=${encodeURIComponent("mil")}`));
    contract("board", await alex.get("/api/board"));
    contract("board-seen", await alex.post("/api/board/seen"));
    contract("list-renamed", await alex.patch(`/api/lists/${family}`, { name: "Wocheneinkauf" }));
    contract("list-not-creator", await sam.patch(`/api/lists/${family}`, { visibility: { everyone: false, memberIds: [] } }));
    // Store sections in shop order: the apps sort and offer them in this order.
    contract("categories", { statusCode: 200, json: () => CATEGORIES });
    contract("item-deleted", await alex.del(`/api/items/${bread.json().id}`));
  });
});
