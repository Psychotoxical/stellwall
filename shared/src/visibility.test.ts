import { describe, expect, it } from "vitest";
import { canSee, visibilitySchema } from "./visibility.ts";

describe("canSee", () => {
  it("is true for everyone", () => {
    expect(canSee({ everyone: true, memberIds: [] }, "m1")).toBe(true);
  });
  it("is true for a listed member and false for a stranger", () => {
    const v = { everyone: false, memberIds: ["m1", "m2"] };
    expect(canSee(v, "m2")).toBe(true);
    expect(canSee(v, "m3")).toBe(false);
  });
});

describe("visibilitySchema", () => {
  it("rejects an empty member set when not everyone", () => {
    expect(visibilitySchema.safeParse({ everyone: false, memberIds: [] }).success).toBe(false);
  });
  it("rejects duplicate member ids", () => {
    expect(visibilitySchema.safeParse({ everyone: false, memberIds: ["a", "a"] }).success).toBe(false);
  });
  it("accepts everyone with no members", () => {
    expect(visibilitySchema.safeParse({ everyone: true, memberIds: [] }).success).toBe(true);
  });
});
