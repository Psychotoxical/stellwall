import { describe, expect, it } from "vitest";
import { describeRule, expandEvent, simpleRule, withUntil } from "./expand.ts";
import { birthdaysBetween } from "./birthdays.ts";
import { zonedTime } from "../todos/recurrence.ts";

const TZ = "Europe/Berlin";
const at = (s: string) => new Date(s);

describe("expandEvent", () => {
  it("weekly at 19:30 stays 19:30 local over the switch to summer time", () => {
    const start = zonedTime("2026-03-03", "19:30", TZ);
    const ev = { start, end: new Date(start.getTime() + 3600_000), allDay: false, rrule: "FREQ=WEEKLY;BYDAY=TU", tz: TZ };
    const out = expandEvent(ev, [], at("2026-03-20T00:00:00Z"), at("2026-04-05T00:00:00Z"));
    expect(out.map((i) => [i.date, i.start.toISOString(), i.end.toISOString()])).toEqual([
      ["2026-03-24", "2026-03-24T18:30:00.000Z", "2026-03-24T19:30:00.000Z"],
      ["2026-03-31", "2026-03-31T17:30:00.000Z", "2026-03-31T18:30:00.000Z"],
    ]);
  });

  it("an all-day event stays on its date", () => {
    const ev = { start: zonedTime("2026-03-29", "00:00", TZ), end: zonedTime("2026-03-30", "00:00", TZ), allDay: true, rrule: "FREQ=YEARLY", tz: TZ };
    const out = expandEvent(ev, [], at("2027-03-01T00:00:00Z"), at("2027-04-01T00:00:00Z"));
    expect(out.map((i) => [i.date, i.allDay, i.endDate])).toEqual([["2027-03-29", true, "2027-03-29"]]);
  });

  it("a single event appears once when it overlaps the window", () => {
    const start = zonedTime("2026-11-26", "23:30", TZ);
    const ev = { start, end: new Date(start.getTime() + 2 * 3600_000), allDay: false, rrule: null, tz: TZ };
    expect(expandEvent(ev, [], at("2026-11-27T00:00:00Z"), at("2026-11-28T00:00:00Z"))).toHaveLength(1);
    expect(expandEvent(ev, [], at("2026-11-28T00:00:00Z"), at("2026-11-29T00:00:00Z"))).toHaveLength(0);
  });

  it("applies cancelled and changed occurrences", () => {
    const start = zonedTime("2026-11-02", "18:00", TZ);
    const ev = { start, end: new Date(start.getTime() + 3600_000), allDay: false, rrule: "FREQ=WEEKLY", tz: TZ };
    const moved = zonedTime("2026-11-10", "19:00", TZ);
    const out = expandEvent(
      ev,
      [
        { date: "2026-11-09", cancelled: false, title: "Training (verlegt)", startAt: moved, endAt: new Date(moved.getTime() + 3600_000) },
        { date: "2026-11-16", cancelled: true },
      ],
      at("2026-11-01T00:00:00Z"),
      at("2026-12-01T00:00:00Z"),
    );
    expect(out.map((i) => [i.date, i.title ?? null, i.start.toISOString()])).toEqual([
      ["2026-11-02", null, "2026-11-02T17:00:00.000Z"],
      ["2026-11-09", "Training (verlegt)", "2026-11-10T18:00:00.000Z"],
      ["2026-11-23", null, "2026-11-23T17:00:00.000Z"],
      ["2026-11-30", null, "2026-11-30T17:00:00.000Z"],
    ]);
  });

  it("withUntil ends a series on a date", () => {
    const start = zonedTime("2026-11-02", "18:00", TZ);
    const rr = withUntil("FREQ=WEEKLY", "2026-11-15");
    const out = expandEvent({ start, end: new Date(start.getTime() + 3600_000), allDay: false, rrule: rr, tz: TZ }, [], at("2026-11-01T00:00:00Z"), at("2026-12-31T00:00:00Z"));
    expect(out.map((i) => i.date)).toEqual(["2026-11-02", "2026-11-09"]);
  });
});

describe("simple rules", () => {
  it("builds and describes the rules the form offers", () => {
    expect(simpleRule("weekly", "2026-11-24")).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(simpleRule("biweekly", "2026-11-24")).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
    expect(simpleRule("monthly", "2026-11-24")).toBe("FREQ=MONTHLY;BYMONTHDAY=24");
    expect(simpleRule("yearly", "2026-11-24")).toBe("FREQ=YEARLY");
    expect(describeRule("FREQ=WEEKLY;BYDAY=TU")).toBe("jeden Dienstag");
    expect(describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU")).toBe("alle 2 Wochen am Dienstag");
    expect(describeRule("FREQ=MONTHLY;BYMONTHDAY=24")).toBe("monatlich am 24.");
    expect(describeRule("FREQ=YEARLY")).toBe("jährlich");
    expect(describeRule("FREQ=MONTHLY;BYDAY=2TH")).toBe("eigene Wiederholung");
  });
});

describe("birthdays", () => {
  it("29 February falls on 28 February in other years", () => {
    const out = birthdaysBetween({ month: 2, day: 29, year: 2004 }, "2026-01-01", "2028-12-31");
    expect(out).toEqual([
      { date: "2026-02-28", age: 22 },
      { date: "2027-02-28", age: 23 },
      { date: "2028-02-29", age: 24 },
    ]);
  });
  it("without a year there is no age", () => {
    expect(birthdaysBetween({ month: 11, day: 26, year: null }, "2026-11-01", "2026-11-30")).toEqual([{ date: "2026-11-26", age: null }]);
  });
  it("is left out before the birth year", () => {
    expect(birthdaysBetween({ month: 5, day: 1, year: 2030 }, "2026-01-01", "2030-12-31")).toEqual([{ date: "2030-05-01", age: 0 }]);
  });
});

describe("review fixes", () => {
  const tz = "Europe/Berlin";
  it("an occurrence moved several days shows up on its new day", () => {
    const ev = { start: zonedTime("2026-11-03", "19:30", tz), end: zonedTime("2026-11-03", "20:30", tz), allDay: false, rrule: "FREQ=WEEKLY;BYDAY=TU", tz };
    const moved = { date: "2026-11-10", cancelled: false, startAt: zonedTime("2026-11-13", "19:30", tz), endAt: zonedTime("2026-11-13", "20:30", tz) };
    const fri = expandEvent(ev, [moved], zonedTime("2026-11-13", "00:00", tz), zonedTime("2026-11-14", "00:00", tz));
    expect(fri.map((i) => [i.date, i.start.toISOString()])).toEqual([["2026-11-10", "2026-11-13T18:30:00.000Z"]]);
    const tue = expandEvent(ev, [moved], zonedTime("2026-11-10", "00:00", tz), zonedTime("2026-11-11", "00:00", tz));
    expect(tue).toEqual([]);
  });
});
