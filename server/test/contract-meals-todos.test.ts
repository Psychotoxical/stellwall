import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { H } from "./auth-helpers.ts";
import { as, setupFamily } from "./family.ts";
import { TOKEN, startFakeMealie } from "./fake-mealie.ts";
import { contract } from "./contract.ts";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("contract: meals and to-dos", () => {
  it("writes the meal, recipe and shopping examples the apps parse", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-27T10:00:00Z") });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    const put = (url: string, body: object) => app.inject({ method: "PUT", url, headers: { ...H, cookie: f.alex.cookie }, payload: body });

    contract("recipes-not-configured", await alex.get("/api/recipes?q="));
    const mealie = await startFakeMealie();
    closers.push(mealie.close);
    const list = (await alex.post("/api/lists", { name: "Wocheneinkauf", visibility: { everyone: true, memberIds: [] } })).json().id as string;
    await put("/api/settings/mealie", { url: mealie.url, token: TOKEN, listId: list });

    contract("recipes", await alex.get("/api/recipes?q=pf"));
    contract("recipe", await alex.get("/api/recipes/gemuese-pfanne"));
    contract("recipe-categories", await alex.get("/api/recipe-categories"));
    contract("recipe-categories-set", await put("/api/recipes/testrezept-2/categories", { ids: ["c-backen"] }));
    const veg = { id: "11111111-1111-4111-8111-111111111111", slug: "gemuese-pfanne", name: "Gemüsepfanne" };
    contract("meal-saved", await put("/api/meals/2026-11-30", { recipe: veg, text: null, cookId: f.sam.id, servings: 2 }));
    await put("/api/meals/2026-12-02", { text: "Reste", recipe: null, cookId: null, servings: 4 });
    contract("meals", await alex.get("/api/meals?week=2026-11-30"));
    const preview = await alex.post("/api/meals/shopping/preview", { dates: ["2026-11-30", "2026-12-02"] });
    expect(preview.statusCode).toBe(200);
    contract("meals-shop-preview", preview);
    contract("meals-shop-commit", await alex.post("/api/meals/shopping/commit", { lines: [{ food: "Paprika", quantity: "1×" }, { food: "Reis", quantity: "100 g" }] }));
    contract("meal-deleted", await alex.del("/api/meals/2026-12-02"));
    contract("recipe-shop-preview", await alex.post("/api/meals/shopping/preview", { recipe: { slug: "pfannkuchen", servings: 4 } }));
    contract("recipe-imported", await alex.post("/api/recipes/import", { text: "Pfannkuchen: 250 g Mehl, 3 Eier." }));
    contract("recipe-import-failed", await alex.post("/api/recipes/import", { url: "https://example.com/kaputt" }));
  });

  it("writes the to-do examples the apps parse", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-27T10:00:00Z") });
    const f = await setupFamily(app);
    const alex = as(app, f.alex.cookie);
    const sam = as(app, f.sam.cookie);
    const base = { visibility: { everyone: true, memberIds: [] }, needsConfirm: false, reminders: [], until: null };
    const daily = await sam.post("/api/todos", { ...base, title: "Blumen gießen", assignees: [f.alex.id], startDate: "2026-11-20", time: "08:00", recurrence: { kind: "daily" }, needsConfirm: true });
    contract("todo-created", daily);
    await alex.post("/api/todos", { ...base, title: "Müll rausbringen", assignees: [f.alex.id, f.sam.id], startDate: "2026-11-30", time: null, recurrence: { kind: "weekly", weekdays: [1, 4] } });
    await alex.post("/api/todos", { ...base, title: "Fahrrad reparieren", assignees: [], startDate: null, time: null, recurrence: { kind: "none" } });

    contract("todos-today", await alex.get("/api/todos?view=today&mine=1"));
    contract("todos-upcoming", await alex.get("/api/todos?view=upcoming"));
    contract("todos-undated", await alex.get("/api/todos?view=undated"));
    contract("todo", await alex.get(`/api/todos/${daily.json().id}`));
    contract("todo-done", await alex.post(`/api/todos/${daily.json().id}/done`, { date: "2026-11-27" }));
    contract("todo-undone", await alex.del(`/api/todos/${daily.json().id}/done/2026-11-27`));
    contract("todo-suggestions", await alex.get(`/api/todo-suggestions?q=${encodeURIComponent("Müll")}`));
    contract("todo-not-creator", await alex.del(`/api/todos/${daily.json().id}`));
  });
});
