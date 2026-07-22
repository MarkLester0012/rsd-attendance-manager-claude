import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import {
  getPayPeriod,
  getPaymentDate,
  getPaymentDateString,
  getCurrentSemiMonthlyPeriod,
  getSemiMonthlyPeriods,
} from "./pay-period";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

describe("getPayPeriod", () => {
  it("returns the full calendar month", () => {
    const { start, end, label } = getPayPeriod("2026-05");
    expect(ymd(start)).toBe("2026-05-01");
    expect(ymd(end)).toBe("2026-05-31");
    expect(label).toBe("May 1 – May 31, 2026");
  });

  it("handles February in a non-leap year", () => {
    const { end } = getPayPeriod("2026-02");
    expect(ymd(end)).toBe("2026-02-28");
  });

  it("handles February in a leap year", () => {
    const { end } = getPayPeriod("2028-02");
    expect(ymd(end)).toBe("2028-02-29");
  });
});

describe("getPaymentDate / getPaymentDateString", () => {
  it("pays on the 15th of the following month", () => {
    expect(ymd(getPaymentDate("2026-05"))).toBe("2026-06-15");
    expect(getPaymentDateString("2026-05")).toBe("2026-06-15");
  });

  it("rolls over the year for December", () => {
    expect(ymd(getPaymentDate("2026-12"))).toBe("2027-01-15");
    expect(getPaymentDateString("2026-12")).toBe("2027-01-15");
  });
});

describe("getCurrentSemiMonthlyPeriod", () => {
  it("day 1–10 belongs to the period starting the 26th of the previous month", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 6, 5)); // Jul 5
    expect(ymd(p.start)).toBe("2026-06-26");
    expect(ymd(p.end)).toBe("2026-07-10");
    expect(p.key).toBe("2026-06-26");
  });

  it("day 10 (boundary) still belongs to the 26th–10th period", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 6, 10));
    expect(ymd(p.start)).toBe("2026-06-26");
    expect(ymd(p.end)).toBe("2026-07-10");
  });

  it("day 11 (boundary) starts the 11th–25th period", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 6, 11));
    expect(ymd(p.start)).toBe("2026-07-11");
    expect(ymd(p.end)).toBe("2026-07-25");
  });

  it("day 25 (boundary) still belongs to the 11th–25th period", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 6, 25));
    expect(ymd(p.start)).toBe("2026-07-11");
    expect(ymd(p.end)).toBe("2026-07-25");
  });

  it("day 26 (boundary) starts the 26th–10th period into the next month", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 6, 26));
    expect(ymd(p.start)).toBe("2026-07-26");
    expect(ymd(p.end)).toBe("2026-08-10");
  });

  it("early January reaches back into December of the previous year", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 0, 5)); // Jan 5
    expect(ymd(p.start)).toBe("2025-12-26");
    expect(ymd(p.end)).toBe("2026-01-10");
  });

  it("late December crosses into January of the next year", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 11, 28)); // Dec 28
    expect(ymd(p.start)).toBe("2026-12-26");
    expect(ymd(p.end)).toBe("2027-01-10");
  });

  it("labels the period readably", () => {
    const p = getCurrentSemiMonthlyPeriod(new Date(2026, 5, 30)); // Jun 30
    expect(p.label).toBe("Jun 26 – Jul 10, 2026");
  });
});

describe("getSemiMonthlyPeriods", () => {
  it("returns the requested count, newest first", () => {
    const periods = getSemiMonthlyPeriods(new Date(2026, 6, 15), 4);
    expect(periods).toHaveLength(4);
    expect(periods.map((p) => p.key)).toEqual([
      "2026-07-11",
      "2026-06-26",
      "2026-06-11",
      "2026-05-26",
    ]);
  });

  it("walks contiguously with no gaps or overlaps at period boundaries", () => {
    const periods = getSemiMonthlyPeriods(new Date(2026, 6, 15), 12);
    for (let i = 0; i < periods.length - 1; i++) {
      const newer = periods[i];
      const older = periods[i + 1];
      const dayAfterOlderEnd = new Date(older.end);
      dayAfterOlderEnd.setDate(dayAfterOlderEnd.getDate() + 1);
      expect(ymd(dayAfterOlderEnd)).toBe(ymd(newer.start));
    }
  });

  it("walks backwards across a year boundary", () => {
    const periods = getSemiMonthlyPeriods(new Date(2026, 0, 5), 3);
    expect(periods.map((p) => p.key)).toEqual([
      "2025-12-26",
      "2025-12-11",
      "2025-11-26",
    ]);
  });
});
