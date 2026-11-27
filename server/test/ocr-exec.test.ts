import { describe, expect, it } from "vitest";
import { exec } from "../src/documents/ocr.ts";

describe("text recognition output", () => {
  it("an umlaut split across two chunks of output stays one letter", async () => {
    const script = "process.stdout.write(Buffer.from([0x47, 0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa4, 0x73, 0x74, 0x65])), 50)";
    expect(await exec(process.execPath, ["-e", script], AbortSignal.timeout(10_000))).toBe("Gäste");
  });
});
