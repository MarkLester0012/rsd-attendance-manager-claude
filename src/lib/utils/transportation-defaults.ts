import { eachDayOfInterval, format, isWeekend } from "date-fns";

export interface EmployeeDefaultValues {
  days_worked: number;
  wfh_days: number;
}

export interface EmployeeStats {
  business_days: number;
  holiday_count: number;
  leave_breakdown: Record<string, number>;
  wfh_days: number;
  days_worked: number;
}

interface LeaveSummary {
  user_id: string;
  leave_type: string;
  duration_value: number | null;
}

function countBusinessDays(monthStart: Date, monthEnd: Date, holidayDates: string[]): number {
  const holidaySet = new Set(holidayDates);
  return eachDayOfInterval({ start: monthStart, end: monthEnd })
    .filter((day) => !isWeekend(day) && !holidaySet.has(format(day, "yyyy-MM-dd")))
    .length;
}

export function buildTransportationEmployeeDefaults(
  employeeIds: string[],
  monthStart: Date,
  monthEnd: Date,
  holidayDates: string[],
  monthLeaves: LeaveSummary[]
): Record<string, EmployeeDefaultValues> {
  const businessDays = countBusinessDays(monthStart, monthEnd, holidayDates);

  return employeeIds.reduce<Record<string, EmployeeDefaultValues>>((defaults, employeeId) => {
    const empLeaves = monthLeaves.filter((leave) => leave.user_id === employeeId);

    const wfhDays = empLeaves
      .filter((leave) => leave.leave_type === "WFH")
      .reduce((sum, leave) => sum + (leave.duration_value ?? 1), 0);
    const normalizedWfhDays = Math.min(8, Math.max(0, Math.round(wfhDays)));

    const leaveDays = empLeaves
      .filter((leave) => leave.leave_type !== "WFH")
      .reduce((sum, leave) => sum + (leave.duration_value ?? 1), 0);

    defaults[employeeId] = {
      wfh_days: normalizedWfhDays,
      days_worked: Math.max(0, businessDays - normalizedWfhDays - leaveDays),
    };

    return defaults;
  }, {});
}

export function buildEmployeeStats(
  employeeId: string,
  monthStart: Date,
  monthEnd: Date,
  holidayDates: string[],
  monthLeaves: LeaveSummary[]
): EmployeeStats {
  const holidaySet = new Set(holidayDates);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const business_days = allDays.filter(
    (day) => !isWeekend(day) && !holidaySet.has(format(day, "yyyy-MM-dd"))
  ).length;

  const holiday_count = allDays.filter(
    (day) => !isWeekend(day) && holidaySet.has(format(day, "yyyy-MM-dd"))
  ).length;

  const empLeaves = monthLeaves.filter((l) => l.user_id === employeeId);

  const leave_breakdown = empLeaves.reduce<Record<string, number>>((acc, leave) => {
    acc[leave.leave_type] = (acc[leave.leave_type] ?? 0) + (leave.duration_value ?? 1);
    return acc;
  }, {});

  const rawWfh = empLeaves
    .filter((l) => l.leave_type === "WFH")
    .reduce((sum, l) => sum + (l.duration_value ?? 1), 0);
  const wfh_days = Math.min(8, Math.max(0, Math.round(rawWfh)));

  const leave_days = empLeaves
    .filter((l) => l.leave_type !== "WFH")
    .reduce((sum, l) => sum + (l.duration_value ?? 1), 0);

  return {
    business_days,
    holiday_count,
    leave_breakdown,
    wfh_days,
    days_worked: Math.max(0, business_days - wfh_days - leave_days),
  };
}
