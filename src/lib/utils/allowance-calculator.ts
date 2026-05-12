export type TransportMode = "car" | "motorcycle" | "walk" | "jeep" | "bus";

export interface ModeDefaults {
  unit_price: number;
  gas_mileage?: number;
  refund_pct: number;
}

export const MODE_DEFAULTS: Record<TransportMode | "wfh", ModeDefaults> = {
  car: { unit_price: 95, gas_mileage: 8, refund_pct: 0.5 },
  motorcycle: { unit_price: 95, gas_mileage: 25, refund_pct: 0.8 },
  walk: { unit_price: 80, refund_pct: 1.0 },
  jeep: { unit_price: 15, refund_pct: 1.0 },
  bus: { unit_price: 20, refund_pct: 1.0 },
  wfh: { unit_price: 120, refund_pct: 1.0 },
};

export const MODE_LABELS: Record<TransportMode, string> = {
  car: "Car",
  motorcycle: "Motorcycle",
  walk: "Walk",
  jeep: "Jeep",
  bus: "Bus",
};

export interface ModeOverride {
  unit_price?: number;
  gas_mileage?: number;
  refund_pct?: number;
}

export interface SnapshotModeConfig {
  car?: ModeOverride;
  motorcycle?: ModeOverride;
  walk?: ModeOverride;
  jeep?: ModeOverride;
  bus?: ModeOverride;
  wfh?: ModeOverride;
}

export interface CalculatorInput {
  distance_km: number;
  declared_mode: TransportMode;
  days_worked: number;
  wfh_days: number;
  jeep_rides: number;
  bus_rides: number;
  undertime_days: number;
  owns_vehicle: boolean;
  mode_config?: SnapshotModeConfig;
}

export interface ModeBreakdown {
  mode: TransportMode | "wfh";
  label: string;
  formula: string;
  amount: number;
}

export interface AllowanceResult {
  effective_days: number;
  walk_allowed: boolean;
  walk_disqualification_reason: string | null;
  breakdowns: ModeBreakdown[];
  total: number;
}

function getEffectiveConfig(
  mode: TransportMode | "wfh",
  overrides?: SnapshotModeConfig
): ModeDefaults {
  const defaults = { ...MODE_DEFAULTS[mode] };
  const override = overrides?.[mode as keyof SnapshotModeConfig];
  if (!override) return defaults;
  return {
    unit_price: override.unit_price ?? defaults.unit_price,
    gas_mileage: override.gas_mileage ?? defaults.gas_mileage,
    refund_pct: override.refund_pct ?? defaults.refund_pct,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateAllowance(input: CalculatorInput): AllowanceResult {
  const capped_wfh = Math.min(Math.max(0, input.wfh_days), 8);
  const undertime = Math.min(input.undertime_days, input.days_worked);
  const effective_days = input.days_worked - undertime + undertime * 0.5;

  // Walk disqualification: distance > 2.4km (1.2km each way) OR owns_vehicle
  const walk_allowed = input.distance_km <= 2.4 && !input.owns_vehicle;
  const walk_disqualification_reason = !walk_allowed
    ? input.distance_km > 2.4
      ? "Walk unavailable: distance exceeds 2.4km (1.2km per way)"
      : "Walk unavailable: registered vehicle on file"
    : null;

  const breakdowns: ModeBreakdown[] = [];
  const mode = input.declared_mode;

  // Primary mode
  if (mode === "car" || mode === "motorcycle") {
    const cfg = getEffectiveConfig(mode, input.mode_config);
    const gas_mileage = cfg.gas_mileage!;
    const amount = round2(
      cfg.unit_price * (input.distance_km / gas_mileage) * effective_days * cfg.refund_pct
    );
    breakdowns.push({
      mode,
      label: MODE_LABELS[mode],
      formula: `₱${cfg.unit_price.toFixed(2)} × (${input.distance_km.toFixed(2)} ÷ ${gas_mileage}) × ${effective_days.toFixed(1)} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  } else if (mode === "walk") {
    const cfg = getEffectiveConfig("walk", input.mode_config);
    if (walk_allowed) {
      const amount = round2(cfg.unit_price * input.distance_km * effective_days * cfg.refund_pct);
      breakdowns.push({
        mode: "walk",
        label: "Walk",
        formula: `₱${cfg.unit_price.toFixed(2)} × ${input.distance_km.toFixed(2)}km × ${effective_days.toFixed(1)} days × ${Math.round(cfg.refund_pct * 100)}%`,
        amount,
      });
    } else {
      breakdowns.push({
        mode: "walk",
        label: "Walk",
        formula: `₱0.00 — ${walk_disqualification_reason}`,
        amount: 0,
      });
    }
  } else if (mode === "jeep") {
    const cfg = getEffectiveConfig("jeep", input.mode_config);
    const amount = round2(
      cfg.unit_price * input.jeep_rides * effective_days * cfg.refund_pct
    );
    breakdowns.push({
      mode: "jeep",
      label: "Jeep",
      formula: `₱${cfg.unit_price.toFixed(2)} × ${input.jeep_rides} rides × ${effective_days.toFixed(1)} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  } else if (mode === "bus") {
    const cfg = getEffectiveConfig("bus", input.mode_config);
    const amount = round2(
      cfg.unit_price * input.bus_rides * effective_days * cfg.refund_pct
    );
    breakdowns.push({
      mode: "bus",
      label: "Bus",
      formula: `₱${cfg.unit_price.toFixed(2)} × ${input.bus_rides} rides × ${effective_days.toFixed(1)} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  }

  // Additive secondary: jeep rides when primary mode is not jeep
  if (mode !== "jeep" && input.jeep_rides > 0) {
    const cfg = getEffectiveConfig("jeep", input.mode_config);
    const amount = round2(
      cfg.unit_price * input.jeep_rides * input.days_worked * cfg.refund_pct
    );
    breakdowns.push({
      mode: "jeep",
      label: "Jeep (secondary)",
      formula: `₱${cfg.unit_price.toFixed(2)} × ${input.jeep_rides} rides × ${input.days_worked} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  }

  // Additive secondary: bus rides when primary mode is not bus
  if (mode !== "bus" && input.bus_rides > 0) {
    const cfg = getEffectiveConfig("bus", input.mode_config);
    const amount = round2(
      cfg.unit_price * input.bus_rides * input.days_worked * cfg.refund_pct
    );
    breakdowns.push({
      mode: "bus",
      label: "Bus (secondary)",
      formula: `₱${cfg.unit_price.toFixed(2)} × ${input.bus_rides} rides × ${input.days_worked} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  }

  // WFH: always additive
  if (capped_wfh > 0) {
    const cfg = getEffectiveConfig("wfh", input.mode_config);
    const amount = round2(cfg.unit_price * capped_wfh * cfg.refund_pct);
    breakdowns.push({
      mode: "wfh",
      label: "Work From Home",
      formula: `₱${cfg.unit_price.toFixed(2)} × ${capped_wfh} days × ${Math.round(cfg.refund_pct * 100)}%`,
      amount,
    });
  }

  const total = round2(breakdowns.reduce((sum, b) => sum + b.amount, 0));

  return { effective_days, walk_allowed, walk_disqualification_reason, breakdowns, total };
}

export function formatPHP(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
