import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { UnreadableError, decryptFrom, encryptTo } from "../src/documents/crypto.ts";

const read = async (s: Readable) => {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts);
};

describe("document crypto", () => {
  it("round trip, fresh IV each time, a changed byte throws UnreadableError", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sw-crypto-"));
    const key = randomBytes(32);
    const data = randomBytes(200_000);
    const a = join(dir, "a");
    const b = join(dir, "b");
    expect((await encryptTo(a, Readable.from([data]), key)).size).toBe(data.length);
    await encryptTo(b, Readable.from([data]), key);
    const ca = await readFile(a);
    const cb = await readFile(b);
    expect(ca.subarray(0, 4).toString()).toBe("SWD1");
    expect(ca.subarray(4, 16).equals(cb.subarray(4, 16))).toBe(false);
    expect(ca.includes(data.subarray(0, 64))).toBe(false);
    expect((await read(decryptFrom(a, key))).equals(data)).toBe(true);
    ca[100] = ca[100]! ^ 1;
    await writeFile(a, ca);
    await expect(read(decryptFrom(a, key))).rejects.toBeInstanceOf(UnreadableError);
    await expect(read(decryptFrom(b, randomBytes(32)))).rejects.toBeInstanceOf(UnreadableError);
  });
});
