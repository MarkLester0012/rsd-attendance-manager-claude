import { describe, it, expect } from "vitest";
import {
  calculateAllowance,
  formatPHP,
  type CalculatorInput,
} from "./allowance-calculator";

const base: CalculatorInput = {
  distance_km: 10,
  declared_mode: "car",
  days_worked: 20,
  wfh_days: 0,
  jeep_rides: 0,
  bus_rides: 0,
  undertime_days: 0,
  owns_vehicle: true,
};

describe("calculateAllowance — effective days & undertime", () => {
  it("uses days_worked as effective days with no undertime", () => {
    expect(calculateAllowance(base).effective_days).toBe(20);
  });

  it("counts each undertime day as half a day", () => {
    const r = calculateAllowance({ ...base, undertime_days: 4 });
    expect(r.effective_days).toBe(18); // 20 - 4 + 4*0.5
  });

  it("caps undertime at days_worked", () => {
    const r = calculateAllowance({ ...base, days_worked: 2, undertime_days: 5 });
    expect(r.effective_days).toBe(1); // 2 - 2 + 2*0.5
  });
});

describe("calculateAllowance — car & motorcycle", () => {
  it("car: unit_price × (km ÷ mileage) × days × 50%", () => {
    const r = calculateAllowance(base);
    // 95 × (10/8) × 20 × 0.5 = 1187.5
    expect(r.breakdowns).toHaveLength(1);
    expect(r.breakdowns[0].amount).toBe(1187.5);
    expect(r.total).toBe(1187.5);
  });

  it("motorcycle: better mileage and 80% refund", () => {
    const r = calculateAllowance({ ...base, declared_mode: "motorcycle" });
    // 95 × (10/25) × 20 × 0.8 = 608
    expect(r.total).toBe(608);
  });

  it("applies mode_config overrides", () => {
    const r = calculateAllowance({
      ...base,
      mode_config: { car: { unit_price: 100, gas_mileage: 10, refund_pct: 1 } },
    });
    // 100 × (10/10) × 20 × 1 = 2000
    expect(r.total).toBe(2000);
  });
});

describe("calculateAllowance — walk eligibility", () => {
  const walkBase: CalculatorInput = {
    ...base,
    declared_mode: "walk",
    distance_km: 2,
    owns_vehicle: false,
  };

  it("pays walkers within 2.4km who own no vehicle", () => {
    const r = calculateAllowance(walkBase);
    // 80 × 2 × 20 × 1.0 = 3200
    expect(r.walk_allowed).toBe(true);
    expect(r.walk_disqualification_reason).toBeNull();
    expect(r.total).toBe(3200);
  });

  it("disqualifies walk beyond 2.4km with zero amount", () => {
    const r = calculateAllowance({ ...walkBase, distance_km: 3 });
    expect(r.walk_allowed).toBe(false);
    expect(r.walk_disqualification_reason).toMatch(/distance/);
    expect(r.total).toBe(0);
  });

  it("disqualifies walk when a vehicle is registered", () => {
    const r = calculateAllowance({ ...walkBase, owns_vehicle: true });
    expect(r.walk_allowed).toBe(false);
    expect(r.walk_disqualification_reason).toMatch(/vehicle/);
    expect(r.total).toBe(0);
  });
});

describe("calculateAllowance — jeep, bus, and secondary rides", () => {
  it("jeep as primary uses effective_days", () => {
    const r = calculateAllowance({
      ...base,
      declared_mode: "jeep",
      jeep_rides: 2,
      undertime_days: 4, // effective 18
    });
    // 15 × 2 × 18 × 1.0 = 540
    expect(r.total).toBe(540);
  });

  it("secondary rides use full days_worked, not effective_days", () => {
    const r = calculateAllowance({
      ...base,
      declared_mode: "car",
      jeep_rides: 2,
      undertime_days: 4, // effective 18, days_worked 20
    });
    const jeep = r.breakdowns.find((b) => b.label === "Jeep (secondary)");
    // 15 × 2 × 20 × 1.0 = 600 (NOT 540)
    expect(jeep?.amount).toBe(600);
  });

  it("adds bus secondary on top of the primary mode", () => {
    const r = calculateAllowance({ ...base, bus_rides: 2 });
    // car 1187.5 + bus 20×2×20 = 800 → 1987.5
    expect(r.breakdowns.map((b) => b.mode)).toEqual(["car", "bus"]);
    expect(r.total).toBe(1987.5);
  });
});

describe("calculateAllowance — WFH", () => {
  it("adds WFH at ₱120/day", () => {
    const r = calculateAllowance({ ...base, wfh_days: 3 });
    const wfh = r.breakdowns.find((b) => b.mode === "wfh");
    expect(wfh?.amount).toBe(360);
    expect(r.total).toBe(1187.5 + 360);
  });

  it("caps WFH at 8 days", () => {
    const r = calculateAllowance({ ...base, wfh_days: 15 });
    const wfh = r.breakdowns.find((b) => b.mode === "wfh");
    expect(wfh?.amount).toBe(960); // 120 × 8
  });

  it("clamps negative WFH days to zero", () => {
    const r = calculateAllowance({ ...base, wfh_days: -2 });
    expect(r.breakdowns.find((b) => b.mode === "wfh")).toBeUndefined();
  });
});

describe("formatPHP", () => {
  it("formats with peso sign and two decimals", () => {
    expect(formatPHP(1187.5)).toBe("₱1,187.50");
    expect(formatPHP(0)).toBe("₱0.00");
  });
});
