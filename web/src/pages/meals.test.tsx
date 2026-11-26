import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";
import { addDays, todayYmd, weekStart } from "../calendar-api.ts";

afterEach(() => vi.unstubAllGlobals());

const monday = weekStart(todayYmd());
const veg = { id: "11111111-1111-4111-8111-111111111111", slug: "gemuese-pfanne", name: "Gemüsepfanne" };
const recipe = {
  ...veg, servings: 4, hasImage: true, steps: ["Reis kochen.", "Gemüse anbraten."],
  ingredients: [{ quantity: 200, unit: "g", food: "Reis", note: "" }, { quantity: 1.5, unit: "EL", food: "Öl", note: "" }, { quantity: null, unit: null, food: "Salz", note: "" }],
};

function base(meals: unknown[] = [], more: Record<string, (b: unknown) => { status: number; body: unknown }> = {}) {
  return {
    "GET /api/me": () => ({ status: 200, body: alex }),
    "GET /api/members": () => ({ status: 200, body: [alex, sam] }),
    "GET /api/board": () => ({ status: 200, body: [] }),
    "GET /api/todos?*": () => ({ status: 200, body: [] }),
    "GET /api/calendar?*": () => ({ status: 200, body: [] }),
    "GET /api/meals?*": () => ({ status: 200, body: meals }),
    "GET /api/recipes?*": () => ({ status: 200, body: [{ ...veg, servings: 4, hasImage: true }] }),
    [`GET /api/recipes/${veg.slug}`]: () => ({ status: 200, body: recipe }),
    ...more,
  };
}

describe("meal plan page", () => {
  it("shows the week with what is planned for lunch", async () => {
    fakeApi(base([{ date: monday, recipe: veg, text: null, cookId: "s1", servings: 4, updatedBy: "a1" }, { date: addDays(monday, 1), recipe: null, text: "Pizza bestellen", cookId: null, servings: 4, updatedBy: "a1" }]));
    renderAt("/essen");
    expect(await screen.findByText("Gemüsepfanne")).toBeInTheDocument();
    expect(screen.getByText("Pizza bestellen")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: new RegExp(de.meals.nothing) }).length).toBe(5);
  });

  it("a free text can be planned", async () => {
    const calls = fakeApi(base([], { "PUT /api/meals/*": () => ({ status: 200, body: {} }), [`PUT /api/meals/${monday}`]: (b) => ({ status: 200, body: b }) }));
    renderAt("/essen");
    fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(de.meals.nothing) }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: de.meals.modes.text }));
    fireEvent.change(screen.getByLabelText(de.meals.text), { target: { value: "Reste" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === `PUT /api/meals/${monday}`)?.body).toEqual({ text: "Reste", recipe: null, cookId: null, servings: 4 }));
  });

  it("a recipe from Mealie can be picked", async () => {
    const calls = fakeApi(base([], { [`PUT /api/meals/${monday}`]: (b) => ({ status: 200, body: b }) }));
    renderAt("/essen");
    fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(de.meals.nothing) }))[0]!);
    fireEvent.change(await screen.findByLabelText(de.meals.search), { target: { value: "pfanne" } });
    fireEvent.click(await screen.findByRole("button", { name: /Gemüsepfanne/ }));
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === `PUT /api/meals/${monday}`)?.body).toEqual({ recipe: veg, text: null, cookId: null, servings: 4 }));
  });

  it("without Mealie the page says so and free text still works", async () => {
    fakeApi(base([], { "GET /api/recipes?*": () => ({ status: 409, body: { error: "mealie_not_configured" } }) }));
    renderAt("/essen");
    fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(de.meals.nothing) }))[0]!);
    expect(await screen.findByText(de.meals.errors.mealie_not_configured!)).toBeInTheDocument();
    expect(screen.getByLabelText(de.meals.text)).toBeInTheDocument();
  });
});

describe("recipe view", () => {
  it("recalculates the ingredients for other servings", async () => {
    fakeApi(base());
    renderAt(`/essen/rezept/${veg.slug}?portionen=4`);
    expect(await screen.findByText("200 g")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: de.meals.fewer }));
    fireEvent.click(screen.getByRole("button", { name: de.meals.fewer }));
    expect(await screen.findByText("100 g")).toBeInTheDocument();
    expect(screen.getByText("¾ EL")).toBeInTheDocument();
    expect(screen.getByText("Gemüse anbraten.")).toBeInTheDocument();
  });
});

describe("shopping for the week", () => {
  it("special things are ticked, pantry things are asked about", async () => {
    const calls = fakeApi(base([{ date: monday, recipe: veg, text: null, cookId: null, servings: 4, updatedBy: "a1" }], {
      "POST /api/meals/shopping/preview": () => ({ status: 200, body: { listId: "l1", listName: "Wocheneinkauf", missing: [], special: [{ food: "Paprika", quantity: "2×", display: "2" }], pantry: [{ food: "Salz", quantity: "", display: "" }] } }),
      "POST /api/meals/shopping/commit": (b) => ({ status: 200, body: { added: (b as { lines: unknown[] }).lines.length, listId: "l1", listName: "Wocheneinkauf" } }),
    }));
    renderAt("/essen");
    fireEvent.click(await screen.findByRole("button", { name: de.meals.shopWeek }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("checkbox", { name: /Paprika/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Salz/ })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: de.meals.putOn(1, "Wocheneinkauf") }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/meals/shopping/commit")?.body).toEqual({ lines: [{ food: "Paprika", quantity: "2×" }] }));
    expect(await screen.findByText(de.meals.done(1, "Wocheneinkauf"))).toBeInTheDocument();
  });
});
