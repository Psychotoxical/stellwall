export type BirthdayDate = { month: number; day: number; year: number | null };

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

/** Birthdays between two local dates (inclusive). 29 February falls on 28 February in other years. */
export function birthdaysBetween(b: BirthdayDate, from: string, to: string): { date: string; age: number | null }[] {
  const out: { date: string; age: number | null }[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    if (b.year !== null && y < b.year) continue;
    const day = b.month === 2 && b.day === 29 && !isLeap(y) ? 28 : b.day;
    const date = `${y}-${pad(b.month)}-${pad(day)}`;
    if (date < from || date > to) continue;
    out.push({ date, age: b.year === null ? null : y - b.year });
  }
  return out;
}
