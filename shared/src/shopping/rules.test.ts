import { describe, expect, it } from "vitest";
import { CATEGORIES, itemKey, searchKey } from "./categories.ts";
import { mergeQuantity, parseQuantity } from "./quantity.ts";
import { suggest } from "./suggest.ts";
import { startOfLocalDay } from "./day.ts";
import { CATALOG } from "./catalog.ts";

describe("itemKey", () => {
  it("normalizes case, spaces and unicode form", () => {
    expect(itemKey(" MILCH ")).toBe("milch");
    expect(itemKey("Grüne   Bohnen")).toBe("grüne bohnen");
    expect(itemKey("Müsli")).toBe("müsli");
  });
  it("searchKey folds umlauts and ß", () => {
    expect(searchKey("Müsli")).toBe("muesli");
    expect(searchKey("Grieß")).toBe("griess");
  });
});

describe("quantity", () => {
  it("parses common units", () => {
    expect(parseQuantity("2")).toEqual({ value: 2, unit: "x" });
    expect(parseQuantity("2 Stk")).toEqual({ value: 2, unit: "x" });
    expect(parseQuantity("1,5 kg")).toEqual({ value: 1500, unit: "g" });
    expect(parseQuantity("500ml")).toEqual({ value: 500, unit: "ml" });
    expect(parseQuantity("ein bisschen")).toBeNull();
  });
  it("adds the same unit group", () => {
    expect(mergeQuantity("1 l", "500 ml")).toBe("1,5 l");
    expect(mergeQuantity("2×", "")).toBe("3×");
    expect(mergeQuantity("", "")).toBe("2×");
    expect(mergeQuantity("500 g", "500 g")).toBe("1 kg");
    expect(mergeQuantity("1 Pck", "2 Pck")).toBe("3 Pck");
  });
  it("keeps incompatible amounts side by side", () => {
    expect(mergeQuantity("1 Pck", "200 g")).toBe("1 Pck + 200 g");
    expect(mergeQuantity("ein bisschen", "2")).toBe("ein bisschen + 2×");
    expect(mergeQuantity("1 l + 2 Pck", "500 ml")).toBe("1,5 l + 2 Pck");
  });
});

describe("suggest", () => {
  const catalog = [
    { name: "Milch", category: "Kühlregal" },
    { name: "Kamillentee", category: "Getränke" },
    { name: "Müsli", category: "Frühstück" },
    { name: "Mehl", category: "Vorrat" },
  ] as const;
  it("ranks word starts before inner matches", () => {
    const names = suggest("mil", catalog, []).map((s) => s.name);
    expect(names[0]).toBe("Milch");
    expect(names).toContain("Kamillentee");
  });
  it("finds umlauts from ascii spelling", () => {
    expect(suggest("muesli", catalog, []).map((s) => s.name)).toEqual(["Müsli"]);
  });
  it("puts own entries first, ordered by use", () => {
    const own = [
      { name: "Mehrkornbrot", category: "Backwaren", uses: 2 },
      { name: "Mehl Typ 1050", category: "Vorrat", uses: 9 },
    ];
    const names = suggest("meh", catalog, own).map((s) => s.name);
    expect(names.slice(0, 3)).toEqual(["Mehl Typ 1050", "Mehrkornbrot", "Mehl"]);
  });
  it("does not list the same item twice", () => {
    const names = suggest("milch", catalog, [{ name: "milch", category: "Kühlregal", uses: 3 }]).map((s) => s.name);
    expect(names.filter((n) => n.toLowerCase() === "milch")).toHaveLength(1);
  });
  it("returns nothing for an empty query", () => {
    expect(suggest("  ", catalog, [])).toEqual([]);
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight in Berlin", () => {
    expect(startOfLocalDay(new Date("2026-11-26T22:59:00Z"), "Europe/Berlin").toISOString()).toBe("2026-11-25T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-11-26T23:01:00Z"), "Europe/Berlin").toISOString()).toBe("2026-11-26T23:00:00.000Z");
  });
  it("survives the switch to summer time", () => {
    expect(startOfLocalDay(new Date("2026-03-29T12:00:00Z"), "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-03-30T12:00:00Z"), "Europe/Berlin").toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});

describe("catalog", () => {
  it("has about 1500 entries without duplicates and with valid categories", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(1400);
    const keys = CATALOG.map((c) => itemKey(c.name));
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CATALOG) expect(CATEGORIES).toContain(c.category);
  });
});
