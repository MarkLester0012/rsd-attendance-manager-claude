"use client";

import { useState, useMemo, useCallback } from "react";
import { format, parseISO, isWeekend } from "date-fns";
import { Search, Briefcase, PartyPopper, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSemiMonthlyPeriods, getCurrentSemiMonthlyPeriod } from "@/lib/utils/pay-period";
import { buildPayrollStats } from "@/lib/utils/payroll-stats";
import { formatPHP } from "@/lib/utils/allowance-calculator";
import { LEAVE_TYPES, LEAVE_TYPE_LIST } from "@/lib/constants/leave-types";
import { useRegisterPageContext } from "@/hooks/use-register-page-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCard } from "@/components/shared/user-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { LeaveTypeCode, UserRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types matching the server-side queries
// ---------------------------------------------------------------------------

interface EmployeeDept {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  role: UserRole;
  leave_balance: number;
  // many-to-one FK → Supabase returns a single object, not an array
  department: EmployeeDept | null;
}

interface Department {
  id: string;
  name: string;
}

interface HolidayRow {
  id: string;
  name: string;
  observed_date: string;
}

interface LeaveRow {
  user_id: string;
  leave_type: string;
  leave_date: string;
  duration: string;
  duration_value: number | null;
}

interface SnapshotRow {
  employee_id: string;
  total_allowance: number;
  month: string;
}

interface Props {
  employees: Employee[];
  departments: Department[];
  holidays: HolidayRow[];
  leaves: LeaveRow[];
  snapshots: SnapshotRow[];
  usedLeavesMap: Record<string, number>;
  allowanceMonthKey: string | null;
  allowanceMonthLabel: string | null;
  defaultPeriodKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDept(emp: Employee): EmployeeDept | null {
  return emp.department ?? null;
}

function durationLabel(duration: string): string {
  if (duration === "half_am") return "AM";
  if (duration === "half_pm") return "PM";
  return "Full day";
}



// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PayslipStatsContent({
  employees,
  departments,
  holidays: initialHolidays,
  leaves: initialLeaves,
  snapshots: initialSnapshots,
  usedLeavesMap,
  allowanceMonthKey: initialAllowanceMonthKey,
  allowanceMonthLabel: initialAllowanceMonthLabel,
  defaultPeriodKey,
}: Props) {
  const periods = useMemo(() => getSemiMonthlyPeriods(new Date(), 10), []);
  const [periodKey, setPeriodKey] = useState(defaultPeriodKey);
  const [deptFilter, setDeptFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [holidays, setHolidays] = useState<HolidayRow[]>(initialHolidays);
  const [leaves, setLeaves] = useState<LeaveRow[]>(initialLeaves);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>(initialSnapshots);
  const [allowanceMonthKey, setAllowanceMonthKey] = useState(initialAllowanceMonthKey);
  const [allowanceMonthLabel, setAllowanceMonthLabel] = useState(initialAllowanceMonthLabel);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const activePeriod = useMemo(
    () => periods.find((p) => p.key === periodKey) ?? getCurrentSemiMonthlyPeriod(new Date()),
    [periods, periodKey]
  );

  // Refetch when period changes
  const handlePeriodChange = useCallback(
    async (key: string) => {
      setPeriodKey(key);
      const period = periods.find((p) => p.key === key);
      if (!period) return;
      const startStr = format(period.start, "yyyy-MM-dd");
      const endStr = format(period.end, "yyyy-MM-dd");

      // Transportation allowance only applies to 1st-half (26 -> 10) periods,
      // attributed to the period's start month.
      const isFirstHalf = period.start.getDate() === 26;
      const newAllowanceMonthKey = isFirstHalf ? format(period.start, "yyyy-MM") : null;
      const newAllowanceMonthLabel = isFirstHalf ? format(period.start, "MMMM") : null;

      const supabase = createClient();
      const [{ data: newHolidays }, { data: newLeaves }, snapshotResult] = await Promise.all([
        supabase
          .from("holidays")
          .select("id, name, observed_date")
          .gte("observed_date", startStr)
          .lte("observed_date", endStr),
        supabase
          .from("leaves")
          .select("user_id, leave_type, leave_date, duration, duration_value")
          .eq("status", "approved")
          .gte("leave_date", startStr)
          .lte("leave_date", endStr),
        newAllowanceMonthKey
          ? supabase
              .from("allowance_snapshots")
              .select("employee_id, total_allowance, month")
              .eq("month", newAllowanceMonthKey)
          : Promise.resolve({ data: [] }),
      ]);
      setHolidays(newHolidays ?? []);
      setLeaves(newLeaves ?? []);
      setSnapshots(snapshotResult.data ?? []);
      setAllowanceMonthKey(newAllowanceMonthKey);
      setAllowanceMonthLabel(newAllowanceMonthLabel);
    },
    [periods]
  );

  const holidayDates = useMemo(
    () => holidays.map((h) => h.observed_date),
    [holidays]
  );

  const allowanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of snapshots) map.set(s.employee_id, s.total_allowance);
    return map;
  }, [snapshots]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesDept =
        deptFilter === "all" || getDept(emp)?.id === deptFilter;
      const matchesRole = roleFilter === "all" || emp.role === roleFilter;
      const matchesSearch =
        !search || emp.name.toLowerCase().includes(search.toLowerCase());
      return matchesDept && matchesRole && matchesSearch;
    });
  }, [employees, deptFilter, roleFilter, search]);

  // Build per-employee stats
  const employeeStats = useMemo(() => {
    return filteredEmployees.map((emp) => ({
      employee: emp,
      stats: buildPayrollStats(
        emp.id,
        activePeriod.start,
        activePeriod.end,
        holidayDates,
        leaves
      ),
    }));
  }, [filteredEmployees, activePeriod, holidayDates, leaves]);

  // Period-constant totals (business days / holidays don't depend on the employee)
  const periodTotals = useMemo(
    () => buildPayrollStats("__none__", activePeriod.start, activePeriod.end, holidayDates, []),
    [activePeriod, holidayDates]
  );

  // Holidays within the active period, sorted — weekdays only, to match
  // periodTotals.holiday_count (buildPayrollStats also excludes weekend holidays).
  const periodHolidays = useMemo(
    () =>
      holidays
        .filter((h) => !isWeekend(parseISO(h.observed_date)))
        .sort((a, b) => a.observed_date.localeCompare(b.observed_date)),
    [holidays]
  );

  // Drill-down: leaves for the selected employee
  const drilldownLeaves = useMemo(() => {
    if (!selectedEmployee) return [];
    return leaves
      .filter((l) => l.user_id === selectedEmployee.id)
      .sort((a, b) => a.leave_date.localeCompare(b.leave_date));
  }, [selectedEmployee, leaves]);

  // Group drill-down leaves by type
  const drilldownByType = useMemo(() => {
    const grouped: Partial<Record<LeaveTypeCode, LeaveRow[]>> = {};
    for (const l of drilldownLeaves) {
      const code = l.leave_type as LeaveTypeCode;
      if (!grouped[code]) grouped[code] = [];
      grouped[code]!.push(l);
    }
    return grouped;
  }, [drilldownLeaves]);

  const selectedStats = useMemo(() => {
    if (!selectedEmployee) return null;
    return buildPayrollStats(
      selectedEmployee.id,
      activePeriod.start,
      activePeriod.end,
      holidayDates,
      leaves
    );
  }, [selectedEmployee, activePeriod, holidayDates, leaves]);

  const selectedAllowance = selectedEmployee ? allowanceMap.get(selectedEmployee.id) : undefined;
  const selectedWfh = selectedStats?.leave_breakdown.WFH ?? 0;
  const selectedTotalLeaves = selectedStats
    ? Object.entries(selectedStats.leave_breakdown)
        .filter(([code]) => code !== "WFH")
        .reduce((s, [, v]) => s + v, 0)
    : 0;

  // AI page context
  useRegisterPageContext("Payslip Stats", {
    payPeriod: activePeriod.label,
    allowanceMonth: allowanceMonthLabel,
    employees: employeeStats.slice(0, 30).map(({ employee, stats }) => ({
      name: employee.name,
      role: employee.role,
      department: getDept(employee)?.name,
      business_days: stats.business_days,
      days_worked: stats.days_worked,
      present_days: stats.present_days,
      leave_breakdown: stats.leave_breakdown,
      transportation_allowance: allowanceMap.get(employee.id) ?? null,
    })),
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payslip Stats</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Per-employee leave and attendance summary for payslip calculation.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-3">
              <Briefcase className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{periodTotals.business_days}</p>
              <p className="text-xs text-muted-foreground">Business Days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-500/10 p-3">
              <PartyPopper className="h-8 w-8 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{periodTotals.holiday_count}</p>
              <p className="text-xs text-muted-foreground">Holidays</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{filteredEmployees.length}</p>
              <p className="text-xs text-muted-foreground">Employees</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-3">
              <Wallet className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {allowanceMonthLabel ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {allowanceMonthLabel ? "Transportation Allowance" : "No allowance this period"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period selector */}
        <Select value={periodKey} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department filter */}
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Role filter */}
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="leader">Leader</SelectItem>
            <SelectItem value="hr">HR</SelectItem>
          </SelectContent>
        </Select>

        {/* Name search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 w-48"
            placeholder="Search employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <span className="text-sm text-muted-foreground ml-auto hidden sm:block">
          {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="text-sm font-medium text-muted-foreground">
        Pay Period: <span className="text-foreground">{activePeriod.label}</span>
      </p>

      {/* Employee card grid */}
      {employeeStats.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No employees found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {employeeStats.map(({ employee, stats }) => {
            const allowance = allowanceMap.get(employee.id);
            const wfh = stats.leave_breakdown.WFH ?? 0;
            const totalLeaves = Object.entries(stats.leave_breakdown)
              .filter(([code]) => code !== "WFH")
              .reduce((s, [, v]) => s + v, 0);
            return (
              <UserCard
                key={employee.id}
                name={employee.name}
                department={getDept(employee)?.name ?? undefined}
                onClick={() => setSelectedEmployee(employee)}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {employee.role}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Worked: <span className="text-foreground font-medium">{stats.days_worked}</span></span>
                  <span>WFH: <span className="text-foreground font-medium">{wfh || "—"}</span></span>
                  <span className="col-span-2">Leaves: <span className="text-foreground font-medium">{totalLeaves || "—"}</span></span>
                </div>
                {allowanceMonthLabel && (
                  <p className="text-xs text-emerald-500 font-medium">
                    {allowance !== undefined ? formatPHP(allowance) : "TA: Not set"}
                  </p>
                )}
              </UserCard>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!selectedEmployee}
        onOpenChange={(open) => !open && setSelectedEmployee(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {selectedEmployee?.name}
              {selectedEmployee && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {selectedEmployee.role}
                </Badge>
              )}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{activePeriod.label}</p>
          </DialogHeader>

          {selectedEmployee && selectedStats && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="rounded-md border border-border p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Department</span>
                <span className="text-right">{getDept(selectedEmployee)?.name ?? "—"}</span>
                <span className="text-muted-foreground">Leave Balance</span>
                <span className="text-right">
                  {(selectedEmployee.leave_balance - (usedLeavesMap[selectedEmployee.id] ?? 0)).toFixed(1)}
                  <span className="text-muted-foreground text-xs"> / {selectedEmployee.leave_balance} days</span>
                </span>
                <span className="text-muted-foreground">Leaves (this period)</span>
                <span className="text-right">{selectedTotalLeaves || 0}</span>
                <span className="text-muted-foreground">WFH (this period)</span>
                <span className="text-right">{selectedWfh || 0}</span>
                <span className="text-muted-foreground">Business Days</span>
                <span className="text-right">{selectedStats.business_days}</span>
                <span className="text-muted-foreground">Days Worked</span>
                <span className="text-right">{selectedStats.days_worked}</span>
                <span className="text-muted-foreground">Transportation Allowance</span>
                <span className="text-right">
                  {allowanceMonthLabel ? (
                    selectedAllowance !== undefined ? (
                      <>
                        {formatPHP(selectedAllowance)}
                        <span className="block text-[11px] text-muted-foreground">
                          ({allowanceMonthLabel}&apos;s transportation allowance)
                        </span>
                      </>
                    ) : (
                      "Not set"
                    )
                  ) : (
                    "No allowance for this period"
                  )}
                </span>
              </div>

              {/* Holidays */}
              {periodHolidays.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-amber-500">
                    Holidays ({periodHolidays.length})
                  </p>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Day</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodHolidays.map((h) => (
                          <tr key={h.id} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-2">{format(parseISO(h.observed_date), "MMM d, yyyy")}</td>
                            <td className="px-3 py-2 text-muted-foreground">{format(parseISO(h.observed_date), "EEE")}</td>
                            <td className="px-3 py-2 text-muted-foreground">{h.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Leaves / WFH by type */}
              {drilldownLeaves.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  No approved leave records in this period.
                </p>
              ) : (
                (Object.entries(drilldownByType) as [LeaveTypeCode, LeaveRow[]][]).map(
                  ([code, entries]) => {
                    const lt = LEAVE_TYPES[code];
                    return (
                      <div key={code}>
                        <p
                          className="text-xs font-semibold uppercase tracking-wider mb-2"
                          style={{ color: `var(${lt.cssVar})` }}
                        >
                          {lt.label} ({entries.reduce((s, e) => s + (e.duration_value ?? 1), 0)}{" "}
                          day{entries.reduce((s, e) => s + (e.duration_value ?? 1), 0) !== 1 ? "s" : ""})
                        </p>
                        <div className="rounded-md border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/30 border-b border-border">
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Date
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Day
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                  Duration
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((entry, i) => (
                                <tr
                                  key={i}
                                  className="border-b border-border/50 last:border-0"
                                >
                                  <td className="px-3 py-2">
                                    {format(parseISO(entry.leave_date), "MMM d, yyyy")}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {format(parseISO(entry.leave_date), "EEE")}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {durationLabel(entry.duration)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
