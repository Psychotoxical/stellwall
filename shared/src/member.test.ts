import { describe, expect, it } from "vitest";
import { normalizeUsername, passwordSchema, usernameSchema } from "./member.ts";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername(" Alex ")).toBe("alex");
  });
  it("keeps umlauts in NFC form", () => {
    expect(normalizeUsername("Jörg")).toBe("jörg");
  });
});

describe("usernameSchema", () => {
  it("accepts a normalized name and rejects too short ones", () => {
    expect(usernameSchema.safeParse(" Alex ").data).toBe("alex");
    expect(usernameSchema.safeParse("al").success).toBe(false);
  });
  it("rejects spaces inside", () => {
    expect(usernameSchema.safeParse("al ex").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("rejects 9 characters and accepts 10", () => {
    expect(passwordSchema.safeParse("123456789").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(true);
  });
});
