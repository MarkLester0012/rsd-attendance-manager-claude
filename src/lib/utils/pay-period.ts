import { format, addMonths, parse } from "date-fns";

/**
 * Returns the pay-period window for a given snapshot month.
 * For month "2026-05", the period is May 15 → June 15.
 */
export function getPayPeriod(month: string): {
  start: Date;
  end: Date;
  label: string;
} {
  const base = parse(month + "-15", "yyyy-MM-dd", new Date());
  const end = addMonths(base, 1);

  const label = `${format(base, "MMM d")} – ${format(end, "MMM d, yyyy")}`;

  return { start: base, end, label };
}

/**
 * Returns the payment date (15th) for a given snapshot month.
 */
export function getPaymentDate(month: string): Date {
  return parse(month + "-15", "yyyy-MM-dd", new Date());
}

/**
 * Returns the payment date as a yyyy-MM-dd string.
 */
export function getPaymentDateString(month: string): string {
  return month + "-15";
}
