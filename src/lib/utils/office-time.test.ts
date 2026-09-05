import { describe, it, expect } from "vitest";
import { officeDateString, officeMinutesOfDay, OFFICE_TZ } from "./office-time";

describe("OFFICE_TZ", () => {
  it("is Asia/Manila", () => {
    expect(OFFICE_TZ).toBe("Asia/Manila");
  });
});

describe("officeDateString", () => {
  it("returns the office-local calendar date for a UTC instant before midnight PH time", () => {
    // 2026-09-04T15:59:00Z = 2026-09-04T23:59:00+08:00 (still Sep 4 in Manila)
    expect(officeDateString(new Date("2026-09-04T15:59:00.000Z"))).toBe("2026-09-04");
  });

  it("rolls over to the next office-local day past midnight PH time", () => {
    // 2026-09-04T16:01:00Z = 2026-09-05T00:01:00+08:00 (already Sep 5 in Manila)
    expect(officeDateString(new Date("2026-09-04T16:01:00.000Z"))).toBe("2026-09-05");
  });

  it("differs from the naive UTC date string near the day boundary", () => {
    const d = new Date("2026-09-04T20:00:00.000Z"); // 2026-09-05T04:00:00+08:00
    expect(d.toISOString().slice(0, 10)).toBe("2026-09-04");
    expect(officeDateString(d)).toBe("2026-09-05");
  });
});

describe("officeMinutesOfDay", () => {
  it("converts a UTC instant to office-local minutes since midnight", () => {
    // 2026-09-04T06:30:00Z = 2026-09-04T14:30:00+08:00 -> 14*60+30 = 870
    expect(officeMinutesOfDay(new Date("2026-09-04T06:30:00.000Z"))).toBe(870);
  });

  it("handles office-local midnight", () => {
    // 2026-09-04T16:00:00Z = 2026-09-05T00:00:00+08:00 -> 0
    expect(officeMinutesOfDay(new Date("2026-09-04T16:00:00.000Z"))).toBe(0);
  });

  it("handles the last minute of the office-local day", () => {
    // 2026-09-04T15:59:00Z = 2026-09-04T23:59:00+08:00 -> 1439
    expect(officeMinutesOfDay(new Date("2026-09-04T15:59:00.000Z"))).toBe(1439);
  });
});
