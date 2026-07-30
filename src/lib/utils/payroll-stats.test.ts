import { describe, it, expect } from "vitest";
import { buildPayrollStats } from "./payroll-stats";

// Reference period: Mon Jun 1 – Fri Jun 12, 2026 → 10 weekdays, 2 weekends
const START = new Date(2026, 5, 1);
const END = new Date(2026, 5, 12);

type Leave = {
  user_id: string;
  leave_type: string;
  leave_date: string;
  duration: string;
  duration_value: number | null;
};

const leave = (
  user_id: string,
  leave_type: string,
  leave_date: string,
  duration_value: number | null = 1
): Leave => ({
  user_id,
  leave_type,
  leave_date,
  duration: duration_value === 0.5 ? "half_am" : "whole",
  duration_value,
});

describe("buildPayrollStats — business days & holidays", () => {
  it("counts weekdays as business days with no holidays or leaves", () => {
    const stats = buildPayrollStats("u1", START, END, [], []);
    expect(stats.business_days).toBe(10);
    expect(stats.holiday_count).toBe(0);
    expect(stats.present_days).toBe(10);
    expect(stats.days_worked).toBe(10);
  });

  it("moves weekday holidays out of business days into holiday_count", () => {
    const stats = buildPayrollStats("u1", START, END, ["2026-06-12"], []); // Fri
    expect(stats.business_days).toBe(9);
    expect(stats.holiday_count).toBe(1);
  });

  it("ignores holidays that fall on weekends entirely", () => {
    const stats = buildPayrollStats("u1", START, END, ["2026-06-06"], []); // Sat
    expect(stats.business_days).toBe(10);
    expect(stats.holiday_count).toBe(0);
  });
});

describe("buildPayrollStats — leave breakdown", () => {
  it("counts whole and half days per type", () => {
    const stats = buildPayrollStats(
      "u1",
      START,
      END,
      [],
      [
        leave("u1", "VL", "2026-06-02"),
        leave("u1", "VL", "2026-06-03", 0.5),
        leave("u1", "SL", "2026-06-04", 0.5),
      ]
    );
    expect(stats.leave_breakdown).toEqual({ VL: 1.5, SL: 0.5 });
    expect(stats.present_days).toBe(8); // 10 - 2 recorded
  });

  it("treats a null duration_value as a whole day", () => {
    const stats = buildPayrollStats("u1", START, END, [], [
      leave("u1", "VL", "2026-06-02", null),
    ]);
    expect(stats.leave_breakdown).toEqual({ VL: 1 });
    expect(stats.present_days).toBe(9);
  });

  it("only counts the requested employee's leaves", () => {
    const stats = buildPayrollStats("u1", START, END, [], [
      leave("u2", "VL", "2026-06-02"),
      leave("u1", "SL", "2026-06-03"),
    ]);
    expect(stats.leave_breakdown).toEqual({ SL: 1 });
  });
});

describe("buildPayrollStats — days worked (WFH/RGA count as worked)", () => {
  it("does not deduct WFH or RGA from days_worked but does from present_days", () => {
    const stats = buildPayrollStats(
      "u1",
      START,
      END,
      [],
      [
        leave("u1", "WFH", "2026-06-02"),
        leave("u1", "RGA", "2026-06-03"),
        leave("u1", "VL", "2026-06-04"),
      ]
    );
    expect(stats.present_days).toBe(7); // 10 - 3 recorded
    expect(stats.days_worked).toBe(9); // 10 - 1 (only VL is non-working)
  });

  it("deducts all non-working types (VL, PL, ML, SPL, SL, AB, NW, BL)", () => {
    const types = ["VL", "PL", "ML", "SPL", "SL", "AB", "NW", "BL"];
    const leaves = types.map((t, i) =>
      leave("u1", t, `2026-06-0${i + 1}`)
    );
    const stats = buildPayrollStats("u1", START, END, [], leaves);
    expect(stats.days_worked).toBe(2); // 10 - 8
  });

  it("does not treat Birthday Leave as a worked day", () => {
    const stats = buildPayrollStats(
      "u1",
      START,
      END,
      [],
      [leave("u1", "BL", "2026-06-02")]
    );
    expect(stats.present_days).toBe(9); // 10 - 1 recorded
    expect(stats.days_worked).toBe(9); // BL is non-working, unlike WFH/RGA
  });

  it("clamps present_days and days_worked at zero when leaves exceed business days", () => {
    const leaves = Array.from({ length: 12 }, (_, i) =>
      leave("u1", "VL", `2026-06-${String(i + 1).padStart(2, "0")}`)
    );
    const stats = buildPayrollStats("u1", START, END, [], leaves);
    expect(stats.present_days).toBe(0);
    expect(stats.days_worked).toBe(0);
  });

  it("handles half-day WFH paired with half-day SL on the same date (split-day)", () => {
    const stats = buildPayrollStats(
      "u1",
      START,
      END,
      [],
      [leave("u1", "WFH", "2026-06-02", 0.5), leave("u1", "SL", "2026-06-02", 0.5)]
    );
    expect(stats.leave_breakdown).toEqual({ WFH: 0.5, SL: 0.5 });
    expect(stats.present_days).toBe(9); // one full day recorded
    expect(stats.days_worked).toBe(9.5); // only the SL half deducts
  });
});
