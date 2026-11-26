export type Unit = "x" | "g" | "ml" | "Pck" | "Dose" | "Fl" | "Bund";

const UNITS: Record<string, { unit: Unit; factor: number }> = {
  "": { unit: "x", factor: 1 },
  x: { unit: "x", factor: 1 },
  "×": { unit: "x", factor: 1 },
  stk: { unit: "x", factor: 1 },
  "stk.": { unit: "x", factor: 1 },
  "stück": { unit: "x", factor: 1 },
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  pck: { unit: "Pck", factor: 1 },
  "pck.": { unit: "Pck", factor: 1 },
  packung: { unit: "Pck", factor: 1 },
  dose: { unit: "Dose", factor: 1 },
  dosen: { unit: "Dose", factor: 1 },
  fl: { unit: "Fl", factor: 1 },
  "fl.": { unit: "Fl", factor: 1 },
  flasche: { unit: "Fl", factor: 1 },
  flaschen: { unit: "Fl", factor: 1 },
  bund: { unit: "Bund", factor: 1 },
};

export function parseQuantity(raw: string): { value: number; unit: Unit } | null {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*([^\d\s]*)$/u);
  if (!m) return null;
  const u = UNITS[m[2]!.toLowerCase()];
  if (!u) return null;
  return { value: Number(m[1]!.replace(",", ".")) * u.factor, unit: u.unit };
}

const num = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");

export function formatQuantity(value: number, unit: Unit): string {
  if (unit === "x") return `${num(value)}×`;
  if (unit === "g") return value >= 1000 ? `${num(value / 1000)} kg` : `${num(value)} g`;
  if (unit === "ml") return value >= 1000 ? `${num(value / 1000)} l` : `${num(value)} ml`;
  return `${num(value)} ${unit}`;
}

/** Amount after the same item was added twice. An empty amount counts as one piece. */
export function mergeQuantity(a: string, b: string): string {
  const pa = a.trim() ? parseQuantity(a) : { value: 1, unit: "x" as Unit };
  const pb = b.trim() ? parseQuantity(b) : { value: 1, unit: "x" as Unit };
  if (pa && pb && pa.unit === pb.unit) return formatQuantity(pa.value + pb.value, pa.unit);
  return `${a.trim() || "1×"} + ${b.trim() || "1×"}`;
}
