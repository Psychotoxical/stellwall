import { itemKey } from "../shopping/categories.ts";

/** One recipe line: amount, unit, the food itself and anything said about it. */
export type Ingredient = { quantity: number | null; unit: string | null; food: string; note: string };
export type Staple = { name: string; variants: string[] };

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

/** Units as recipes write them, mapped to one spelling. */
const UNITS: Record<string, string> = {
  g: "g", gr: "g", gramm: "g", kg: "kg", kilogramm: "kg", mg: "mg",
  ml: "ml", l: "l", liter: "l", cl: "cl", dl: "dl",
  el: "EL", esslöffel: "EL", tl: "TL", teelöffel: "TL", msp: "Msp", messerspitze: "Msp",
  prise: "Prise", prisen: "Prise",
  dose: "Dose", dosen: "Dose", packung: "Packung", packungen: "Packung", pck: "Packung", päckchen: "Packung",
  becher: "Becher", bund: "Bund", stück: "Stück", stk: "Stück",
  zehe: "Zehe", zehen: "Zehe", scheibe: "Scheibe", scheiben: "Scheibe",
  tasse: "Tasse", tassen: "Tasse", glas: "Glas", gläser: "Glas", würfel: "Würfel",
};

/** A unit as Mealie or a recipe names it ("Esslöffel", "g", "Gramm"), in Stellwall's spelling. */
export function normalizeUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  return UNITS[u.trim().replace(/\.$/, "").toLowerCase()] ?? u.trim();
}

const VAGUE = /^(etwas|ein wenig|ein paar|nach belieben)\s+/i;
const ABOUT = /^(ca\.|circa|etwa|ungefähr)\s*/i;
const TO_TASTE = /\s+(nach belieben)$/i;
/** What a cookbook says something is for ("zum Arbeiten", "für die Form"). */
const PURPOSE = /\s(?:zum|zur|für die|für den|für das)\s/i;

/** Reads a free-text recipe line such as "1 ½ EL Öl" or "1 Dose Tomaten (400 g)". */
export function parseIngredient(text: string): Ingredient {
  const notes: string[] = [];
  let s = text.trim().replace(/\(([^)]*)\)/g, (_, n: string) => {
    if (n.trim()) notes.push(n.trim());
    return " ";
  });
  const comma = s.search(/(?<!\d),|,(?!\d)/);
  if (comma >= 0) {
    const rest = s.slice(comma + 1).trim();
    if (rest) notes.unshift(rest);
    s = s.slice(0, comma);
  }
  s = s.replace(/\s+/g, " ").trim();
  const vague = s.match(VAGUE);
  if (vague) {
    notes.unshift(vague[1]!.toLowerCase());
    s = s.slice(vague[0].length);
  }
  const about = s.match(ABOUT);
  if (about) {
    notes.unshift(about[1]!);
    s = s.slice(about[0].length);
  }
  const taste = s.match(TO_TASTE);
  if (taste) {
    notes.push(taste[1]!);
    s = s.slice(0, s.length - taste[0].length);
  }
  // "Mehl und Mehl zum Arbeiten", "Butter und Fett für die Form": the kitchen's extra is not bought.
  const purpose = s.search(PURPOSE);
  if (purpose > 0) {
    const and = s.slice(0, purpose).lastIndexOf(" und ");
    const cut = and > 0 ? and : purpose;
    notes.push(s.slice(cut).trim());
    s = s.slice(0, cut);
  }
  // "500g" and "2 – 3" / "2 bis 3" are read like "500 g" and "2-3".
  s = s.replace(/^(\d+(?:[.,]\d+)?)(?=[a-zA-ZäöüÄÖÜß])/, "$1 ").replace(/^(\d+(?:[.,]\d+)?)\s*(?:–|—|-|bis)\s*(?=\d)/, "$1-");

  let quantity: number | null = null;
  const q = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*-\s*)?(\d+(?:[.,]\d+)?)?\s*(\d+\/\d+|[½¼¾⅓⅔⅛])?(?=\s|$)/);
  if (q && (q[2] || q[3])) {
    let v = q[2] ? Number(q[2].replace(",", ".")) : 0;
    if (q[3]) {
      const [a, b] = q[3].includes("/") ? q[3].split("/").map(Number) : [FRACTIONS[q[3]]!, 1];
      v += a! / b!;
    }
    quantity = v;
    s = s.slice(q[0].length).trim();
  }

  let unit: string | null = null;
  const word = s.match(/^([^\s]+)\s*/);
  if (word) {
    const u = UNITS[word[1]!.replace(/\.$/, "").toLowerCase()];
    if (u && (quantity !== null || s.length > word[0].length)) {
      unit = u;
      s = s.slice(word[0].length);
    }
  }
  return { quantity, unit, food: s.trim(), note: notes.join(", ") };
}

export function scaleIngredient(i: Ingredient, factor: number): Ingredient {
  return { ...i, quantity: i.quantity === null ? null : i.quantity * factor };
}

const GLYPHS: [number, string][] = [[0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]];

/** An amount as a cook reads it: "1 ½", "¼", "1,2"; large amounts without decimals. */
export function formatAmount(q: number): string {
  if (q >= 100) return String(Math.round(q));
  const whole = Math.floor(q);
  const frac = q - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  const glyph = GLYPHS.find(([v]) => Math.abs(v - frac) < 0.02);
  if (glyph) return whole ? `${whole} ${glyph[1]}` : glyph[1];
  return (Math.round(q * 100) / 100).toString().replace(".", ",");
}

/** Same food with the same unit is added up; the first spelling of the food stays. */
export function mergeIngredients(list: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = [];
  const byKey = new Map<string, Ingredient>();
  for (const i of list) {
    const key = itemKey(i.food) + "|" + (i.unit ?? "");
    const seen = byKey.get(key);
    if (!seen) {
      const copy = { ...i };
      byKey.set(key, copy);
      out.push(copy);
    } else if (i.quantity !== null) {
      seen.quantity = (seen.quantity ?? 0) + i.quantity;
    }
  }
  return out;
}

const num = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
const SHOP_UNIT: Record<string, string> = { Packung: "Pck", Stück: "" };

/** The amount as the shopping list writes it, so that adding up keeps working. */
export function shoppingQuantity(i: Ingredient): string {
  if (i.quantity === null) return "";
  const u = i.unit === null ? "" : (SHOP_UNIT[i.unit] ?? i.unit);
  return u ? `${num(i.quantity)} ${u}` : `${num(i.quantity)}×`;
}

/** Whether a food is part of the pantry: its exact name or a listed variant, nothing guessed. */
export function isPantry(food: string, staples: readonly Staple[]): boolean {
  const k = itemKey(food);
  return staples.some((s) => itemKey(s.name) === k || s.variants.some((v) => itemKey(v) === k));
}
