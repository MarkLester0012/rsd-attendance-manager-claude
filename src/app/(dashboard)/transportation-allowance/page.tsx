import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TransportationAllowanceContent } from "./transportation-allowance-content";
import { format } from "date-fns";
import {
  buildTransportationEmployeeDefaults,
  type EmployeeDefaultValues,
} from "@/lib/utils/transportation-defaults";
import { getPayPeriod } from "@/lib/utils/pay-period";

export type EmployeeDefaults = Record<string, EmployeeDefaultValues>;

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

    const employeeDefaults = buildTransportationEmployeeDefaults(
      (employees ?? []).map((employee) => employee.id),
      periodStart,
      periodEnd,
      (holidays ?? []).map((holiday) => holiday.observed_date),
      monthLeaves ?? []
    );

    return (
      <TransportationAllowanceContent
        user={user}
        defaultMonth={defaultMonth}
        employees={employees || []}
        initialSnapshots={snapshots || []}
        initialChangeRequests={changeRequests || []}
        employeeDefaults={employeeDefaults}
        initialTab={tab === "requests" ? "requests" : "snapshots"}
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
