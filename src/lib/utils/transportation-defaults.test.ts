import { describe, it, expect } from "vitest";
import { buildEmployeeStats, buildTransportationEmployeeDefaults } from "./transportation-defaults";

// Reference period: Mon Jun 1 – Fri Jun 12, 2026 → 10 weekdays, 2 weekends
const START = new Date(2026, 5, 1);
const END = new Date(2026, 5, 12);

type Leave = {
  user_id: string;
  leave_type: string;
  duration_value: number | null;
};

const leave = (user_id: string, leave_type: string, duration_value: number | null = 1): Leave => ({
  user_id,
  leave_type,
  duration_value,
});

describe("buildEmployeeStats — Extended WFH (EWFH)", () => {
  it("does not add EWFH days to wfh_days, but does subtract them from days_worked", () => {
    const stats = buildEmployeeStats(
      "u1",
      START,
      END,
      [],
      [leave("u1", "WFH", 1), leave("u1", "EWFH", 1), leave("u1", "EWFH", 1)]
    );

    expect(stats.wfh_days).toBe(1); // only the literal WFH day counts as a credit
    expect(stats.days_worked).toBe(7); // 10 - 1 (WFH) - 2 (EWFH treated like any other leave)
    expect(stats.leave_breakdown).toEqual({ WFH: 1, EWFH: 2 });
  });

  it("subtracts EWFH from days_worked exactly like any other non-WFH leave type", () => {
    const withEwfh = buildEmployeeStats("u1", START, END, [], [leave("u1", "EWFH", 1)]);
    const withVl = buildEmployeeStats("u1", START, END, [], [leave("u1", "VL", 1)]);

    expect(withEwfh.days_worked).toBe(withVl.days_worked);
    expect(withEwfh.wfh_days).toBe(0);
  });
});

describe("buildTransportationEmployeeDefaults — Extended WFH (EWFH)", () => {
  it("does not add EWFH days to wfh_days, but does subtract them from days_worked", () => {
    const defaults = buildTransportationEmployeeDefaults(
      ["u1"],
      START,
      END,
      [],
      [leave("u1", "WFH", 1), leave("u1", "EWFH", 1), leave("u1", "EWFH", 1)]
    );

    expect(defaults.u1.wfh_days).toBe(1);
    expect(defaults.u1.days_worked).toBe(7); // 10 - 1 (WFH) - 2 (EWFH)
  });

  it("treats an EWFH-only employee the same as any other non-WFH leave for days_worked", () => {
    const ewfhDefaults = buildTransportationEmployeeDefaults(
      ["u1"],
      START,
      END,
      [],
      [leave("u1", "EWFH", 2)]
    );
    const vlDefaults = buildTransportationEmployeeDefaults(
      ["u1"],
      START,
      END,
      [],
      [leave("u1", "VL", 2)]
    );

    expect(ewfhDefaults.u1.wfh_days).toBe(0);
    expect(ewfhDefaults.u1.days_worked).toBe(vlDefaults.u1.days_worked);
  });
});
