import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/access-denied";
import { format } from "date-fns";
import { getCurrentSemiMonthlyPeriod } from "@/lib/utils/pay-period";
import { PayslipStatsContent } from "./payslip-stats-content";

export default async function PayslipStatsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser.id)
    .single();

  if (!user || user.role !== "hr") return <AccessDenied />;

  const defaultPeriod = getCurrentSemiMonthlyPeriod(new Date());
  const startStr = format(defaultPeriod.start, "yyyy-MM-dd");
  const endStr = format(defaultPeriod.end, "yyyy-MM-dd");

  // Transportation allowance is only shown on 1st-half (26 -> 10) periods,
  // attributed to the period's start month (e.g. Jun 26 - Jul 10 -> June's allowance).
  const isFirstHalf = defaultPeriod.start.getDate() === 26;
  const allowanceMonthKey = isFirstHalf ? format(defaultPeriod.start, "yyyy-MM") : null;
  const allowanceMonthLabel = isFirstHalf ? format(defaultPeriod.start, "MMMM") : null;

  const [
    { data: employees },
    { data: departments },
    { data: holidays },
    { data: leaves },
    { data: snapshots },
    { data: usedLeavesRaw },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, role, leave_balance, department:departments(id, name)")
      .order("name"),
    supabase.from("departments").select("id, name").order("name"),
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
    allowanceMonthKey
      ? supabase
          .from("allowance_snapshots")
          .select("employee_id, total_allowance, month")
          .eq("month", allowanceMonthKey)
      : Promise.resolve({ data: [] }),
    // All-time approved balance-deducting leaves to compute current remaining balance
    supabase
      .from("leaves")
      .select("user_id, duration_value")
      .eq("status", "approved")
      .in("leave_type", ["VL", "PL", "ML", "SPL", "SL", "AB"]),
  ]);

  const usedLeavesMap: Record<string, number> = {};
  (usedLeavesRaw ?? []).forEach((l) => {
    usedLeavesMap[l.user_id] = (usedLeavesMap[l.user_id] ?? 0) + (l.duration_value ?? 1);
  });

  return (
    <PayslipStatsContent
      employees={(employees ?? []) as any}
      departments={departments || []}
      holidays={holidays || []}
      leaves={leaves || []}
      snapshots={snapshots || []}
      usedLeavesMap={usedLeavesMap}
      allowanceMonthKey={allowanceMonthKey}
      allowanceMonthLabel={allowanceMonthLabel}
      defaultPeriodKey={defaultPeriod.key}
    />
  );
}
