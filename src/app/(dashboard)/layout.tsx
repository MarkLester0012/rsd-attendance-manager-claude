import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const { data: user } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) {
    redirect("/login");
  }

  // Get pending approvals count for leaders/HR
  let pendingCount = 0;
  if (user.role === "leader" || user.role === "hr") {
    const { count } = await supabase
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count || 0;
  }

  return (
    <DashboardShell user={user} pendingCount={pendingCount}>
      {children}
    </DashboardShell>
  );
}
