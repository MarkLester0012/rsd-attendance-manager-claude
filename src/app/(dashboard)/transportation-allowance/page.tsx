import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransportationAllowanceContent } from "./transportation-allowance-content";
import { format, addMonths, parse, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";

export type EmployeeDefaults = Record<string, { days_worked: number; wfh_days: number }>;

export default async function TransportationAllowancePage() {
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
    const defaultMonth = format(addMonths(new Date(), 1), "yyyy-MM");
    const monthStart = parse(defaultMonth + "-01", "yyyy-MM-dd", new Date());
    const monthEnd = endOfMonth(monthStart);
    const startStr = format(monthStart, "yyyy-MM-dd");
    const endStr = format(monthEnd, "yyyy-MM-dd");

    const [
      { data: employees },
      { data: snapshots },
      { data: changeRequests },
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

    const holidaySet = new Set((holidays ?? []).map((h) => h.observed_date));
    const businessDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
      .filter((d) => !isWeekend(d) && !holidaySet.has(format(d, "yyyy-MM-dd")))
      .length;

    const employeeDefaults: EmployeeDefaults = {};
    for (const emp of employees ?? []) {
      const empLeaves = (monthLeaves ?? []).filter((l) => l.user_id === emp.id);
      const wfhDays = empLeaves
        .filter((l) => l.leave_type === "WFH")
        .reduce((s, l) => s + (l.duration_value ?? 1), 0);
      const otherDays = empLeaves
        .filter((l) => l.leave_type !== "WFH")
        .reduce((s, l) => s + (l.duration_value ?? 1), 0);
      employeeDefaults[emp.id] = {
        wfh_days: Math.round(wfhDays),
        days_worked: Math.max(0, businessDays - Math.round(wfhDays) - Math.round(otherDays)),
      };
    }

    return (
      <TransportationAllowanceContent
        user={user}
        defaultMonth={defaultMonth}
        employees={employees || []}
        initialSnapshots={snapshots || []}
        initialChangeRequests={changeRequests || []}
        employeeDefaults={employeeDefaults}
      />
    );
  }

  // Employee: fetch own snapshots + change requests
  const { data: userRecord } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .single();

  const currentMonth = format(new Date(), "yyyy-MM");

  const [{ data: snapshots }, { data: changeRequests }] = await Promise.all([
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
  ]);

  return (
    <TransportationAllowanceContent
      user={user}
      defaultMonth={currentMonth}
      employees={[]}
      initialSnapshots={snapshots || []}
      initialChangeRequests={changeRequests || []}
      employeeDefaults={{}}
    />
  );
}
