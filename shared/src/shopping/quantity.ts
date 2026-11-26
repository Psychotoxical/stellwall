export type Unit = "x" | "g" | "ml" | "Pck" | "Dose" | "Fl" | "Bund" | "EL" | "TL" | "Becher" | "Zehe" | "Prise" | "Glas" | "Scheibe" | "Tasse" | "Würfel" | "Msp";

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
  el: { unit: "EL", factor: 1 },
  tl: { unit: "TL", factor: 1 },
  cl: { unit: "ml", factor: 10 },
  dl: { unit: "ml", factor: 100 },
  mg: { unit: "g", factor: 0.001 },
  becher: { unit: "Becher", factor: 1 },
  zehe: { unit: "Zehe", factor: 1 },
  zehen: { unit: "Zehe", factor: 1 },
  prise: { unit: "Prise", factor: 1 },
  prisen: { unit: "Prise", factor: 1 },
  glas: { unit: "Glas", factor: 1 },
  "gläser": { unit: "Glas", factor: 1 },
  scheibe: { unit: "Scheibe", factor: 1 },
  scheiben: { unit: "Scheibe", factor: 1 },
  tasse: { unit: "Tasse", factor: 1 },
  tassen: { unit: "Tasse", factor: 1 },
  "würfel": { unit: "Würfel", factor: 1 },
  msp: { unit: "Msp", factor: 1 },
  "msp.": { unit: "Msp", factor: 1 },
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

/**
 * Amount after the same item was added again. Amounts are kept as parts joined by " + ";
 * parts with the same unit add up, parts without a known unit stay as typed.
 * An empty amount counts as one piece.
 */
export function mergeQuantity(a: string, b: string): string {
  const sums = new Map<Unit, number>();
  const order: (Unit | string)[] = [];
  const raw = new Set<string>();
  const take = (s: string) => {
    const parts = s.trim() ? s.split(" + ") : ["1×"];
    for (const part of parts) {
      const p = parseQuantity(part);
      if (!p) {
        const k = part.trim();
        if (k && !raw.has(k)) {
          raw.add(k);
          order.push(k);
        }
        continue;
      }
      if (!sums.has(p.unit)) order.push(p.unit);
      sums.set(p.unit, (sums.get(p.unit) ?? 0) + p.value);
    }
  };
  take(a);
  take(b);
  return order.map((u) => (sums.has(u as Unit) ? formatQuantity(sums.get(u as Unit)!, u as Unit) : u)).join(" + ");
}
