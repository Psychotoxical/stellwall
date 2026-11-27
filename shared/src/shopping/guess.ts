import { CATALOG } from "./catalog.ts";
import { itemKey, OTHER, type Category } from "./categories.ts";

/** Endings recipes put in brackets so one name fits one or many: "Zwiebel(n)", "Ei(er)". */
const BRACKET_ENDING = /\s*\((n|en|e|er|s|nen)\)\s*$/i;

/** "Zwiebel(n)" becomes "Zwiebeln"; any other name only loses surplus spaces. */
export function cleanName(name: string): string {
  const n = name.normalize("NFC").trim().replace(/\s+/g, " ");
  return n.replace(BRACKET_ENDING, (_, ending: string) => ending);
}

const BY_KEY = new Map(CATALOG.map((c) => [itemKey(c.name), c.category]));
// Single catalog words long enough that a name starting or ending with them is that thing ("Knoblauchzehen").
const WORDS = CATALOG.map((c) => ({ key: itemKey(c.name), category: c.category }))
  .filter((c) => c.key.length >= 5 && !c.key.includes(" "))
  .sort((a, b) => b.key.length - a.key.length);

/** Singular and plural forms German shopping names take. */
function forms(key: string): string[] {
  const out = [key, key + "n", key + "en", key + "e", key + "s"];
  for (const end of ["en", "n", "e", "s"]) if (key.length > end.length + 2 && key.endsWith(end)) out.push(key.slice(0, -end.length));
  return out;
}

/** Whether the catalog has this name (in any number), as opposed to a guess from a word in it. */
export function inCatalog(name: string): boolean {
  return forms(itemKey(cleanName(name))).some((f) => BY_KEY.has(f));
}

/** The catalog's category for a name: exact, in another number, or through a catalog word it starts or ends with. */
export function guessCategory(name: string): Category {
  const key = itemKey(cleanName(name));
  for (const f of forms(key)) {
    const c = BY_KEY.get(f);
    if (c) return c;
  }
  const word = WORDS.find((w) => w.key !== key && (key.startsWith(w.key) || key.endsWith(w.key)));
  return word?.category ?? OTHER;
}
