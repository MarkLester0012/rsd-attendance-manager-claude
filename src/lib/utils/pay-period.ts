import { format, addMonths, startOfMonth, endOfMonth, parse } from "date-fns";

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
