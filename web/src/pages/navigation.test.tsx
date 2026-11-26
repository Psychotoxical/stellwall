import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { alex, fakeApi, renderAt } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => vi.unstubAllGlobals());

const base = {
  "GET /api/me": () => ({ status: 200, body: alex }),
  "GET /api/members": () => ({ status: 200, body: [alex] }),
  "GET /api/board": () => ({ status: 200, body: [] }),
  "GET /api/todos?*": () => ({ status: 200, body: [] }),
  "GET /api/calendar?*": () => ({ status: 200, body: [] }),
  "GET /api/meals?*": () => ({ status: 200, body: [] }),
  "GET /api/birthdays": () => ({ status: 200, body: [] }),
  "GET /api/pantry": () => ({ status: 200, body: [] }),
};

describe("navigation", () => {
  it("the meal plan has its own tab, and the round picture leads to everything else", async () => {
    fakeApi(base);
    renderAt("/");
    const tabs = (await screen.findAllByRole("navigation", { name: "Bereiche" })).at(-1)!;
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual([de.nav.start, de.nav.einkauf, de.nav.kalender, de.nav.essen, de.nav.todos]);
    const header = document.querySelector("header.head") as HTMLElement;
    expect(within(header).getByRole("link", { name: de.nav.mehr })).toHaveAttribute("href", "/mehr");
  });

  it("pages below an area have a back button to it", async () => {
    fakeApi(base);
    renderAt("/essen/grundvorrat");
    expect(await screen.findByRole("link", { name: de.nav.back(de.meals.page) })).toHaveAttribute("href", "/essen");
  });

  it("the areas themselves have no back button", async () => {
    fakeApi(base);
    renderAt("/kalender");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: /^Zurück/ })).not.toBeInTheDocument();
  });
});
