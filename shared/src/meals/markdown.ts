/** A piece of a recipe step, plain or emphasised. */
export type Mark = { text: string; bold: boolean; italic: boolean };

/** **bold**, __bold__ and *italic*, as Mealie keeps them in steps; lone stars stay text. */
const INLINE = /\*\*(?!\s)(.+?)(?<!\s)\*\*|__(?!\s)(.+?)(?<!\s)__|\*(?![\s*])([^*]*?[^\s*])\*(?!\*)/g;

/** Splits a step written in Markdown into plain and emphasised pieces. */
export function inlineMarks(text: string): Mark[] {
  const out: Mark[] = [];
  const plain = (t: string) => t && out.push({ text: t, bold: false, italic: false });
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    plain(text.slice(at, m.index));
    const bold = m[1] ?? m[2];
    out.push(bold !== undefined ? { text: bold, bold: true, italic: false } : { text: m[3]!, bold: false, italic: true });
    at = m.index + m[0].length;
  }
  plain(text.slice(at));
  return out;
}
