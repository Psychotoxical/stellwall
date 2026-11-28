import { describe, expect, it } from "vitest";
import { formatAmount, isPantry, mergeIngredients, parseIngredient, scaleIngredient, shoppingQuantity } from "./ingredients.ts";
import { mergeQuantity } from "../shopping/quantity.ts";

describe("parseIngredient", () => {
  it.each([
    ["1 ½ EL Öl", { quantity: 1.5, unit: "EL", food: "Öl", note: "" }],
    ["200 g Mehl", { quantity: 200, unit: "g", food: "Mehl", note: "" }],
    ["2 Eier", { quantity: 2, unit: null, food: "Eier", note: "" }],
    ["Salz", { quantity: null, unit: null, food: "Salz", note: "" }],
    ["1/2 TL Salz", { quantity: 0.5, unit: "TL", food: "Salz", note: "" }],
    ["etwas Pfeffer", { quantity: null, unit: null, food: "Pfeffer", note: "etwas" }],
    ["1 Dose Tomaten (400 g)", { quantity: 1, unit: "Dose", food: "Tomaten", note: "400 g" }],
    ["2 Zehen Knoblauch, gehackt", { quantity: 2, unit: "Zehe", food: "Knoblauch", note: "gehackt" }],
    ["0,5 l Milch", { quantity: 0.5, unit: "l", food: "Milch", note: "" }],
    ["2 Esslöffel Zucker", { quantity: 2, unit: "EL", food: "Zucker", note: "" }],
    ["1 Prise Muskat", { quantity: 1, unit: "Prise", food: "Muskat", note: "" }],
    // Cookbook lines that add something for the kitchen: only the first part is bought.
    ["450 g Mehl und Mehl zum Arbeiten", { quantity: 450, unit: "g", food: "Mehl", note: "und Mehl zum Arbeiten" }],
    ["400 g Butter und Fett für die Form", { quantity: 400, unit: "g", food: "Butter", note: "und Fett für die Form" }],
    ["Puderzucker zum Bestäuben", { quantity: null, unit: null, food: "Puderzucker", note: "zum Bestäuben" }],
    ["3 Eigelb (Eier: Größe M)", { quantity: 3, unit: null, food: "Eigelb", note: "Eier: Größe M" }],
    // An "und" that belongs to the food stays.
    ["200 g Salz und Pfeffer", { quantity: 200, unit: "g", food: "Salz und Pfeffer", note: "" }],
  ])("%s", (text, expected) => {
    expect(parseIngredient(text)).toEqual(expected);
  });
});

describe("scaling and display", () => {
  it("scales from 4 to 2 and 6 servings and keeps missing amounts missing", () => {
    const flour = { quantity: 200, unit: "g", food: "Mehl", note: "" };
    expect(scaleIngredient(flour, 2 / 4).quantity).toBe(100);
    expect(scaleIngredient(flour, 6 / 4).quantity).toBe(300);
    expect(scaleIngredient({ quantity: null, unit: null, food: "Salz", note: "" }, 6 / 4).quantity).toBeNull();
  });
  it("shows fractions and commas", () => {
    expect(formatAmount(1.5)).toBe("1 ½");
    expect(formatAmount(0.25)).toBe("¼");
    expect(formatAmount(0.75)).toBe("¾");
    expect(formatAmount(1 / 3)).toBe("⅓");
    expect(formatAmount(2)).toBe("2");
    expect(formatAmount(1.2)).toBe("1,2");
    expect(formatAmount(333.333)).toBe("333");
  });
});

describe("merging for the shopping list", () => {
  it("adds the same food with the same unit, keeps different units apart", () => {
    const got = mergeIngredients([
      { quantity: 200, unit: "g", food: "Mehl", note: "" },
      { quantity: 100, unit: "g", food: "mehl", note: "" },
      { quantity: 2, unit: "EL", food: "Mehl", note: "" },
      { quantity: 2, unit: null, food: "Eier", note: "" },
      { quantity: 1, unit: null, food: "Eier", note: "" },
    ]);
    expect(got.map((g) => [g.food, g.quantity, g.unit])).toEqual([["Mehl", 300, "g"], ["Mehl", 2, "EL"], ["Eier", 3, null]]);
  });
  it("writes amounts the shopping list can add up", () => {
    expect(shoppingQuantity({ quantity: 300, unit: "g", food: "Mehl", note: "" })).toBe("300 g");
    expect(shoppingQuantity({ quantity: 3, unit: null, food: "Eier", note: "" })).toBe("3×");
    expect(shoppingQuantity({ quantity: null, unit: null, food: "Salz", note: "" })).toBe("");
    expect(mergeQuantity("300 g", "200 g")).toBe("500 g");
    expect(mergeQuantity(shoppingQuantity({ quantity: 1.5, unit: "EL", food: "Öl", note: "" }), "1 EL")).toBe("2,5 EL");
  });
});

describe("pantry", () => {
  const staples = [{ name: "Salz", variants: [] }, { name: "Öl", variants: ["Sonnenblumenöl", "Rapsöl"] }];
  it("matches by name or listed variant, never by a guess", () => {
    expect(isPantry("salz", staples)).toBe(true);
    expect(isPantry("Rapsöl", staples)).toBe(true);
    expect(isPantry("Olivenöl", staples)).toBe(false);
    expect(isPantry("Meersalz", staples)).toBe(false);
  });
});

describe("review fixes", () => {
  it("every recipe unit adds up on the shopping list", () => {
    for (const unit of ["Becher", "Zehe", "Prise", "Glas", "Scheibe", "Tasse", "Würfel", "Msp", "Dose", "Packung", "Bund", "EL", "TL", "g", "kg", "ml", "l", "cl", "dl"]) {
      const one = shoppingQuantity({ quantity: 1, unit, food: "x", note: "" });
      const two = mergeQuantity(one, one);
      expect(two, unit).not.toBe(one);
    }
    expect(mergeQuantity("1 Becher", "1 Becher")).toBe("2 Becher");
    expect(mergeQuantity("2 cl", "3 cl")).toBe("50 ml");
  });

  it.each([
    ["500g Hackfleisch", { quantity: 500, unit: "g", food: "Hackfleisch", note: "" }],
    ["1,5kg Kartoffeln", { quantity: 1.5, unit: "kg", food: "Kartoffeln", note: "" }],
    ["ca. 200 g Mehl", { quantity: 200, unit: "g", food: "Mehl", note: "ca." }],
    ["2 – 3 Eier", { quantity: 3, unit: null, food: "Eier", note: "" }],
    ["2 bis 3 Eier", { quantity: 3, unit: null, food: "Eier", note: "" }],
    ["Salz nach Belieben", { quantity: null, unit: null, food: "Salz", note: "nach Belieben" }],
  ])("reads %s", (text, expected) => {
    expect(parseIngredient(text)).toEqual(expected);
  });
});
