import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

/** Example responses the native apps parse in their own tests (repo folder `contract/`). */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "contract");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids become stable placeholders, so the files only change when the shape does. */
function stable(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string" && UUID.test(value)) {
    if (!ids.has(value)) ids.set(value, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, "0")}`);
    return ids.get(value);
  }
  if (Array.isArray(value)) return value.map((v) => stable(v, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stable(v, ids)]));
  return value;
}

/**
 * Compares a response with its committed example; `UPDATE_CONTRACT=1` rewrites the file.
 * A missing file is written, so a new example appears on the first run.
 */
export function contract(name: string, res: { statusCode: number; json: () => unknown }) {
  const example = { status: res.statusCode, body: stable(res.json(), new Map()) };
  const file = join(DIR, `${name}.json`);
  if (process.env.UPDATE_CONTRACT === "1" || !existsSync(file)) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(example, null, 2) + "\n");
    return;
  }
  expect(example, `contract/${name}.json is out of date: run UPDATE_CONTRACT=1 npm test`).toEqual(JSON.parse(readFileSync(file, "utf8")));
}
