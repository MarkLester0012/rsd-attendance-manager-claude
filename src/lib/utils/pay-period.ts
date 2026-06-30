import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  parse,
  subMonths,
  setDate,
  getDate,
} from "date-fns";

/**
 * Returns the pay-period window for a given snapshot month.
 * For month "2026-05", the period is May 1 → May 31.
 * Payment is on the 15th of the following month.
 */
export function getPayPeriod(month: string): {
  start: Date;
  end: Date;
  label: string;
} {
  const base = parse(month + "-01", "yyyy-MM-dd", new Date());
  const start = startOfMonth(base);
  const end = endOfMonth(base);

  const label = `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;

  return { start, end, label };
}

/**
 * Returns the payment date (15th of the following month) for a given snapshot month.
 * For "2026-05", returns June 15, 2026.
 */
export function getPaymentDate(month: string): Date {
  const base = parse(month + "-01", "yyyy-MM-dd", new Date());
  return parse(format(addMonths(base, 1), "yyyy-MM") + "-15", "yyyy-MM-dd", new Date());
}

/**
 * Returns the payment date as a yyyy-MM-dd string.
 */
export function getPaymentDateString(month: string): string {
  const base = parse(month + "-01", "yyyy-MM-dd", new Date());
  return format(addMonths(base, 1), "yyyy-MM") + "-15";
}

// ---------------------------------------------------------------------------
// Semi-monthly pay periods (26th–10th and 11th–25th)
// ---------------------------------------------------------------------------

export interface SemiMonthlyPeriod {
  /** yyyy-MM-dd of the period's start date — used as a stable Select key */
  key: string;
  /** Human-readable label, e.g. "Jun 26 – Jul 10, 2026" */
  label: string;
  start: Date;
  end: Date;
}

function makeSemiPeriod(start: Date, end: Date): SemiMonthlyPeriod {
  return {
    key: format(start, "yyyy-MM-dd"),
    label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
    start,
    end,
  };
}

/**
 * Returns the semi-monthly pay period that contains `reference`.
 *
 * Windows:
 *   - day  1–10  → 1st-half that started on 26th of previous month → 10th of this month
 *   - day 11–25  → 2nd-half of this month: 11th–25th
 *   - day 26–31  → 1st-half starting this month: 26th → 10th of next month
 */
export function getCurrentSemiMonthlyPeriod(reference: Date): SemiMonthlyPeriod {
  const day = getDate(reference);

  if (day <= 10) {
    // Period started on 26th of the previous month
    const prevMonth = subMonths(reference, 1);
    return makeSemiPeriod(setDate(prevMonth, 26), setDate(reference, 10));
  } else if (day <= 25) {
    // 2nd-half: 11th–25th of this month
    return makeSemiPeriod(setDate(reference, 11), setDate(reference, 25));
  } else {
    // 1st-half: 26th of this month → 10th of next month
    return makeSemiPeriod(setDate(reference, 26), setDate(addMonths(reference, 1), 10));
  }
}

/** Step one period into the past from `period`. */
function prevSemiPeriod(period: SemiMonthlyPeriod): SemiMonthlyPeriod {
  const startDay = getDate(period.start);
  if (startDay === 26) {
    // Current is a 1st-half (starts 26th). Previous = 2nd-half of same month (11–25).
    return makeSemiPeriod(setDate(period.start, 11), setDate(period.start, 25));
  } else {
    // Current is a 2nd-half (starts 11th). Previous = 1st-half of previous month (26→10).
    const prevMonthStart = setDate(subMonths(period.start, 1), 26);
    const prevMonthEnd = setDate(period.start, 10);
    return makeSemiPeriod(prevMonthStart, prevMonthEnd);
  }
}

/**
 * Returns `count` semi-monthly periods, newest first, starting from the period
 * that contains `reference` and walking backwards.
 */
export function getSemiMonthlyPeriods(
  reference: Date,
  count: number
): SemiMonthlyPeriod[] {
  const periods: SemiMonthlyPeriod[] = [];
  let current = getCurrentSemiMonthlyPeriod(reference);
  for (let i = 0; i < count; i++) {
    periods.push(current);
    current = prevSemiPeriod(current);
  }
  return periods;
}
