import { describe, expect, it } from "vitest";
import { bundleDue, eveningBefore, quietUntil } from "./times.ts";

const tz = "Europe/Berlin";

describe("notification times", () => {
  it("night is quiet from 22 to 7 local time", () => {
    expect(quietUntil(new Date("2026-11-26T22:00:00Z"), tz)?.toISOString()).toBe("2026-11-27T06:00:00.000Z"); // 23:00 → 7:00
    expect(quietUntil(new Date("2026-11-27T05:30:00Z"), tz)?.toISOString()).toBe("2026-11-27T06:00:00.000Z"); // 6:30 → 7:00
    expect(quietUntil(new Date("2026-11-27T06:00:00Z"), tz)).toBeNull(); // 7:00 is day
    expect(quietUntil(new Date("2026-11-27T20:59:00Z"), tz)).toBeNull(); // 21:59
    expect(quietUntil(new Date("2026-11-27T21:00:00Z"), tz)?.toISOString()).toBe("2026-11-28T06:00:00.000Z"); // 22:00
  });

  it("the night of the clock change still ends at 7 local time", () => {
    expect(quietUntil(new Date("2026-03-28T23:00:00Z"), tz)?.toISOString()).toBe("2026-03-29T05:00:00.000Z"); // 0:00 CET → 7:00 CEST
  });

  it("evening reminders come at 18 the day before", () => {
    expect(eveningBefore("2026-12-03", tz).toISOString()).toBe("2026-12-02T17:00:00.000Z");
    expect(eveningBefore("2026-03-30", tz).toISOString()).toBe("2026-03-29T16:00:00.000Z");
  });

  it("shopping is sent five minutes after the last change", () => {
    expect(bundleDue(new Date("2026-11-27T10:00:00Z")).toISOString()).toBe("2026-11-27T10:05:00.000Z");
  });
});
