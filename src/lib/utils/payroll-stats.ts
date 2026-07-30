import { eachDayOfInterval, format, isWeekend } from "date-fns";
import type { LeaveTypeCode } from "@/lib/types";

interface LeaveSummary {
  user_id: string;
  leave_type: string;
  leave_date: string;
  duration: string;
  duration_value: number | null;
}

export interface PayrollStats {
  /** Weekdays in the period that are not holidays */
  business_days: number;
  /** Weekdays in the period that ARE holidays */
  holiday_count: number;
  /**
   * Approved leave/WFH/RGA/AB/NW days per type.
   * Half-days are counted as 0.5 — no caps, no rounding.
   */
  leave_breakdown: Partial<Record<LeaveTypeCode, number>>;
  /**
   * Derived "present" days: business_days minus all recorded duration values.
   * A business day with no leave record is assumed to be an in-office day.
   */
  present_days: number;
  /**
   * Days actually worked: present_days plus WFH and RGA (counted as worked,
   * not deducted). Excludes VL/PL/ML/SPL/SL/AB/NW/BL.
   */
  days_worked: number;
}

/** Leave type codes that do NOT count as a worked day. */
const NON_WORKING_TYPES = new Set<LeaveTypeCode>([
  "VL",
  "PL",
  "ML",
  "SPL",
  "SL",
  "AB",
  "NW",
  "BL",
]);

export interface PayrollLeaveEntry extends LeaveSummary {
  // typed alias used by the UI
}

export function buildPayrollStats(
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
  holidayDates: string[],
  leaves: LeaveSummary[]
): PayrollStats {
  const holidaySet = new Set(holidayDates);
  const allDays = eachDayOfInterval({ start: periodStart, end: periodEnd });

  const business_days = allDays.filter(
    (d) => !isWeekend(d) && !holidaySet.has(format(d, "yyyy-MM-dd"))
  ).length;

  const holiday_count = allDays.filter(
    (d) => !isWeekend(d) && holidaySet.has(format(d, "yyyy-MM-dd"))
  ).length;

  const empLeaves = leaves.filter((l) => l.user_id === employeeId);

  const leave_breakdown: Partial<Record<LeaveTypeCode, number>> = {};
  let totalRecorded = 0;
  let nonWorkingRecorded = 0;

  for (const leave of empLeaves) {
    const val = leave.duration_value ?? 1;
    const code = leave.leave_type as LeaveTypeCode;
    leave_breakdown[code] = (leave_breakdown[code] ?? 0) + val;
    totalRecorded += val;
    if (NON_WORKING_TYPES.has(code)) nonWorkingRecorded += val;
  }

  const present_days = Math.max(0, business_days - totalRecorded);
  const days_worked = Math.max(0, business_days - nonWorkingRecorded);

  return { business_days, holiday_count, leave_breakdown, present_days, days_worked };
}
