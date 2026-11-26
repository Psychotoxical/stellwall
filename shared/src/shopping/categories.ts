export const CATEGORIES = [
  "Obst & Gemüse",
  "Backwaren",
  "Kühlregal",
  "Fleisch & Fisch",
  "Tiefkühl",
  "Vorrat",
  "Frühstück",
  "Süßes & Snacks",
  "Getränke",
  "Drogerie",
  "Haushalt",
  "Tier",
  "Sonstiges",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const OTHER: Category = "Sonstiges";

/** The identity of an item name: same key means same item. */
export function itemKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Key for searching: umlauts and ß folded so that "muesli" finds "Müsli". */
export function searchKey(name: string): string {
  return itemKey(name).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
