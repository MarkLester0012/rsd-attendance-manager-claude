import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransportationAllowanceContent } from "./transportation-allowance-content";
import { format, subMonths } from "date-fns";
import {
  buildTransportationEmployeeDefaults,
  buildEmployeeStats,
  type EmployeeDefaultValues,
  type EmployeeStats,
} from "@/lib/utils/transportation-defaults";
import { getPayPeriod } from "@/lib/utils/pay-period";
import type { TransportMode } from "@/lib/types";

export type EmployeeDefaults = Record<string, EmployeeDefaultValues>;
export type { EmployeeStats };

export default async function TransportationAllowancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("*, department:departments(id, name, created_at)")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) redirect("/login");

  if (user.role === "hr") {
    const defaultMonth = format(new Date(), "yyyy-MM");
    const { start: periodStart, end: periodEnd } = getPayPeriod(defaultMonth);
    const startStr = format(periodStart, "yyyy-MM-dd");
    const endStr = format(periodEnd, "yyyy-MM-dd");

    const [
      { data: employees },
      { data: snapshots },
      { data: changeRequests },
      { data: submissionRequests },
      { data: holidays },
      { data: monthLeaves },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("*, department:departments(id, name, created_at)")
        .order("name"),
      supabase
        .from("allowance_snapshots")
        .select("*, employee:users!allowance_snapshots_employee_id_fkey(id, name, email, role, department_id)")
        .eq("month", defaultMonth),
      supabase
        .from("distance_change_requests")
        .select(
          "*, employee:users!distance_change_requests_employee_id_fkey(id, name, email, role, department_id), snapshot:allowance_snapshots(*)"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("allowance_submission_requests")
        .select("*, employee:users!allowance_submission_requests_employee_id_fkey(id, name, email, role, department_id)")
        .eq("month", defaultMonth)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("holidays")
        .select("observed_date")
        .gte("observed_date", startStr)
        .lte("observed_date", endStr),
      supabase
        .from("leaves")
        .select("user_id, leave_type, duration_value")
        .eq("status", "approved")
        .gte("leave_date", startStr)
        .lte("leave_date", endStr),
    ]);

    const holidayDates = (holidays ?? []).map((h) => h.observed_date);
    const leaveSummaries = monthLeaves ?? [];

    const employeeDefaults = buildTransportationEmployeeDefaults(
      (employees ?? []).map((e) => e.id),
      periodStart,
      periodEnd,
      holidayDates,
      leaveSummaries
    );

    // Build per-employee stats for HR modal display
    const employeeStatsList: Record<string, EmployeeStats> = {};
    for (const emp of employees ?? []) {
      employeeStatsList[emp.id] = buildEmployeeStats(
        emp.id,
        periodStart,
        periodEnd,
        holidayDates,
        leaveSummaries
      );
    }

    return (
      <TransportationAllowanceContent
        user={user}
        defaultMonth={defaultMonth}
        employees={employees || []}
        initialSnapshots={snapshots || []}
        initialChangeRequests={changeRequests || []}
        initialSubmissionRequests={submissionRequests || []}
        employeeDefaults={employeeDefaults}
        employeeStatsList={employeeStatsList}
        initialTab={tab === "requests" || tab === "submissions" ? "requests" : "snapshots"}
      />
    );
  }

  // Employee branch
  const { data: userRecord } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .single();

  const currentMonth = format(new Date(), "yyyy-MM");
  const prevMonth = format(subMonths(new Date(), 1), "yyyy-MM");
  const { start: periodStart, end: periodEnd } = getPayPeriod(currentMonth);
  const startStr = format(periodStart, "yyyy-MM-dd");
  const endStr = format(periodEnd, "yyyy-MM-dd");

  const [
    { data: snapshots },
    { data: changeRequests },
    { data: submissionRequests },
    { data: holidays },
    { data: monthLeaves },
  ] = await Promise.all([
    supabase
      .from("allowance_snapshots")
      .select("*")
      .eq("employee_id", userRecord!.id)
      .order("month", { ascending: false })
      .limit(12),
    supabase
      .from("distance_change_requests")
      .select("*, snapshot:allowance_snapshots(*)")
      .eq("employee_id", userRecord!.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("allowance_submission_requests")
      .select("*")
      .eq("employee_id", userRecord!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("holidays")
      .select("observed_date")
      .gte("observed_date", startStr)
      .lte("observed_date", endStr),
    supabase
      .from("leaves")
      .select("user_id, leave_type, duration_value")
      .eq("status", "approved")
      .eq("user_id", userRecord!.id)
      .gte("leave_date", startStr)
      .lte("leave_date", endStr),
  ]);

  const holidayDates = (holidays ?? []).map((h) => h.observed_date);
  const leaveSummaries = monthLeaves ?? [];

  const employeeStats = buildEmployeeStats(
    userRecord!.id,
    periodStart,
    periodEnd,
    holidayDates,
    leaveSummaries
  );

  const previousMonthMode =
    ((snapshots ?? []).find((s) => s.month === prevMonth)?.declared_mode as TransportMode) ?? null;

  return (
    <TransportationAllowanceContent
      user={user}
      defaultMonth={currentMonth}
      employees={[]}
      initialSnapshots={snapshots || []}
      initialChangeRequests={changeRequests || []}
      initialSubmissionRequests={submissionRequests || []}
      employeeDefaults={{}}
      employeeStatsList={{}}
      employeeStats={employeeStats}
      previousMonthMode={previousMonthMode}
    />
  );
}
