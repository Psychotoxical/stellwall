import { describe, expect, it } from "vitest";
import { localDate, occurrences, zonedTime } from "./recurrence.ts";
import { TODO_CATALOG } from "./catalog.ts";
import { itemKey } from "../shopping/categories.ts";

const TZ = "Europe/Berlin";
const range = (a: string, b: string) => [new Date(a), new Date(b)] as const;

describe("zoned time", () => {
  it("turns local wall time into the right instant across summer time", () => {
    expect(zonedTime("2026-03-24", "07:00", TZ).toISOString()).toBe("2026-03-24T06:00:00.000Z");
    expect(zonedTime("2026-03-31", "07:00", TZ).toISOString()).toBe("2026-03-31T05:00:00.000Z");
    expect(localDate(new Date("2026-11-26T23:30:00Z"), TZ)).toBe("2026-11-27");
  });
});

describe("occurrences", () => {
  it("weekly on Tuesday at 07:00 stays 07:00 local over the switch", () => {
    const [from, to] = range("2026-03-20T00:00:00Z", "2026-04-05T00:00:00Z");
    const occ = occurrences({ start: "2026-01-01", time: "07:00", recurrence: { kind: "weekly", weekdays: [2] }, until: null }, from, to, TZ);
    expect(occ.map((o) => o.at.toISOString())).toEqual(["2026-03-24T06:00:00.000Z", "2026-03-31T05:00:00.000Z"]);
  });

  it("monthly on the 31st falls on the last day of shorter months", () => {
    const [from, to] = range("2026-01-01T00:00:00Z", "2026-04-30T12:00:00Z");
    const occ = occurrences({ start: "2026-01-01", time: null, recurrence: { kind: "monthly", day: 31 }, until: null }, from, to, TZ);
    expect(occ.map((o) => o.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("respects the end date", () => {
    const [from, to] = range("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z");
    const occ = occurrences({ start: "2026-11-01", time: null, recurrence: { kind: "daily" }, until: "2026-11-03" }, from, to, TZ);
    expect(occ.map((o) => o.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("start in the future yields nothing before start", () => {
    const [from, to] = range("2026-11-01T00:00:00Z", "2026-11-12T00:00:00Z");
    const occ = occurrences({ start: "2026-11-10", time: null, recurrence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7] }, until: null }, from, to, TZ);
    expect(occ[0]!.date).toBe("2026-11-10");
  });

  it("none yields exactly one occurrence on its date", () => {
    const [from, to] = range("2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z");
    const occ = occurrences({ start: "2026-11-20", time: "18:30", recurrence: { kind: "none" }, until: null }, from, to, TZ);
    expect(occ).toEqual([{ date: "2026-11-20", at: new Date("2026-11-20T17:30:00.000Z") }]);
  });

  it("an occurrence outside the window is left out", () => {
    const [from, to] = range("2026-11-01T00:00:00Z", "2026-11-05T00:00:00Z");
    expect(occurrences({ start: "2026-11-20", time: null, recurrence: { kind: "none" }, until: null }, from, to, TZ)).toEqual([]);
  });
});

describe("to-do catalog", () => {
  it("has about 150 tasks without duplicates", () => {
    expect(TODO_CATALOG.length).toBeGreaterThanOrEqual(140);
    const keys = TODO_CATALOG.map((t) => itemKey(t));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
