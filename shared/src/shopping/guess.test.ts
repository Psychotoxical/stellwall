import { describe, expect, it } from "vitest";
import { cleanName, guessCategory } from "./guess.ts";

describe("guessing a category", () => {
  it("resolves the bracket endings recipes use", () => {
    expect(cleanName("Zwiebel(n)")).toBe("Zwiebeln");
    expect(cleanName("Tomate(n)")).toBe("Tomaten");
    expect(cleanName("Ei(er)")).toBe("Eier");
    expect(cleanName("  Möhre (n) ")).toBe("Möhren");
    expect(cleanName("Mehl (Type 405)")).toBe("Mehl (Type 405)");
    expect(cleanName("Milch")).toBe("Milch");
  });

  it("finds a catalog name exactly, in singular or plural, and through bracket endings", () => {
    expect(guessCategory("Zwiebeln")).toBe("Obst & Gemüse");
    expect(guessCategory("Zwiebel(n)")).toBe("Obst & Gemüse");
    expect(guessCategory("Zwiebel")).toBe("Obst & Gemüse");
    expect(guessCategory("Karotte")).toBe("Obst & Gemüse");
    expect(guessCategory("milch")).toBe("Kühlregal");
  });

  it("takes the category of a catalog word the name starts or ends with", () => {
    expect(guessCategory("Knoblauchzehen")).toBe("Obst & Gemüse");
    expect(guessCategory("Knoblauchzehe(n)")).toBe("Obst & Gemüse");
  });

  it("leaves names it cannot place in Sonstiges", () => {
    expect(guessCategory("Schinkenwrust")).toBe("Sonstiges");
    expect(guessCategory("Xyz")).toBe("Sonstiges");
  });
});
