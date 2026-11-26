import { itemKey, searchKey } from "./categories.ts";

export type Suggestion = { name: string; category: string };
type Own = Suggestion & { uses: number };

function rank(name: string, q: string): number {
  const k = searchKey(name);
  if (k.startsWith(q)) return 0;
  if (k.split(/[\s-]/).some((w) => w.startsWith(q))) return 1;
  if (k.includes(q)) return 2;
  return -1;
}

/** Own entries first (by use), then the catalog; word starts before inner matches. */
export function suggest(query: string, catalog: readonly Suggestion[], own: readonly Own[], limit = 6): Suggestion[] {
  const q = searchKey(query);
  if (!q) return [];
  const seen = new Set<string>();
  const out: { s: Suggestion; group: number; r: number; uses: number }[] = [];
  const add = (s: Suggestion, group: number, uses: number) => {
    const key = itemKey(s.name);
    if (seen.has(key)) return;
    const r = rank(s.name, q);
    if (r < 0) return;
    seen.add(key);
    out.push({ s: { name: s.name, category: s.category }, group, r, uses });
  };
  [...own].sort((a, b) => b.uses - a.uses).forEach((o) => add(o, 0, o.uses));
  catalog.forEach((c) => add(c, 1, 0));
  out.sort((a, b) => a.r - b.r || a.group - b.group || b.uses - a.uses || a.s.name.localeCompare(b.s.name, "de"));
  return out.slice(0, limit).map((o) => o.s);
}
