import { eachDayOfInterval, format, isWeekend } from "date-fns";

export interface EmployeeDefaultValues {
  days_worked: number;
  wfh_days: number;
}

interface LeaveSummary {
  user_id: string;
  leave_type: string;
  duration_value: number | null;
}

export function buildTransportationEmployeeDefaults(
  employeeIds: string[],
  monthStart: Date,
  monthEnd: Date,
  holidayDates: string[],
  monthLeaves: LeaveSummary[]
): Record<string, EmployeeDefaultValues> {
  const holidaySet = new Set(holidayDates);
  const businessDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    .filter((day) => !isWeekend(day) && !holidaySet.has(format(day, "yyyy-MM-dd")))
    .length;

  return employeeIds.reduce<Record<string, EmployeeDefaultValues>>((defaults, employeeId) => {
    const wfhDays = monthLeaves
      .filter((leave) => leave.user_id === employeeId && leave.leave_type === "WFH")
      .reduce((sum, leave) => sum + (leave.duration_value ?? 1), 0);
    const normalizedWfhDays = Math.min(8, Math.max(0, Math.round(wfhDays)));

    defaults[employeeId] = {
      wfh_days: normalizedWfhDays,
      days_worked: Math.max(0, businessDays - normalizedWfhDays),
    };

    return defaults;
  }, {});
}
