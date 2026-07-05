"use server";

import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  LEAVE_TYPES,
  HALF_DAY_TYPES,
  NON_DEDUCTIBLE_TYPES,
  WFH_MONTHLY_CAP,
  WFH_DAILY_GLOBAL_CAP,
} from "@/lib/constants/leave-types";
import type { LeaveTypeCode, LeaveDuration } from "@/lib/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getLeaveReviewers(
  supabase: ServerClient,
  userId: string
): Promise<{ id: string }[]> {
  const { data: memberProjects } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  const projectIds = memberProjects?.map((p: { project_id: string }) => p.project_id) ?? [];

  let leaderQuery = supabase.from("users").select("id").eq("role", "leader");
  if (projectIds.length > 0) {
    const { data: projectMates } = await supabase
      .from("project_members")
      .select("user_id")
      .in("project_id", projectIds)
      .neq("user_id", userId);
    const coMemberIds = [...new Set(projectMates?.map((m: { user_id: string }) => m.user_id) ?? [])];
    if (coMemberIds.length > 0) {
      leaderQuery = leaderQuery.in("id", coMemberIds);
    }
  }

  const [{ data: hrUsers }, { data: leaderUsers }] = await Promise.all([
    supabase.from("users").select("id").eq("role", "hr"),
    leaderQuery,
  ]);
  return [...(hrUsers ?? []), ...(leaderUsers ?? [])];
}

type SubmitLeavesInput = {
  dates: string[]; // yyyy-MM-dd
  leaveType: LeaveTypeCode;
  duration: LeaveDuration;
  reason: string | null;
  /** When set, updates the existing leave instead of inserting new rows. */
  editLeaveId?: string;
};

export async function submitLeaves(
  input: SubmitLeavesInput
): Promise<{ success: boolean; error?: string }> {
  const { dates, leaveType, duration, reason, editLeaveId } = input;
  const config = LEAVE_TYPES[leaveType];

  if (!config || !dates.length || dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return { success: false, error: "Invalid request" };
  }
  if (duration !== "whole" && !HALF_DAY_TYPES.includes(leaveType)) {
    return { success: false, error: "This leave type does not support half days" };
  }
  if (config.requiresReason && !reason?.trim()) {
    return { success: false, error: "Reason is required for this leave type" };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: "Not authenticated" };

  const { data: user } = await supabase
    .from("users")
    .select("id, name, role, leave_balance")
    .eq("auth_id", authUser.id)
    .single();
  if (!user) return { success: false, error: "Not authenticated" };

  const durationValue = duration === "whole" ? 1.0 : 0.5;

  // Overlap check — check all dates at once (edits never change the date)
  if (!editLeaveId) {
    const { data: existing } = await supabase
      .from("leaves")
      .select("leave_date")
      .eq("user_id", user.id)
      .in("leave_date", dates);

    if (existing && existing.length > 0) {
      const conflicting = existing.map((e) => e.leave_date).join(", ");
      return { success: false, error: `You already have leave entries on: ${conflicting}` };
    }
  }

  // WFH validations
  if (leaveType === "WFH") {
    // Monthly cap check — group dates by month
    const monthGroups = new Map<string, string[]>();
    for (const d of dates) {
      const key = d.slice(0, 7);
      if (!monthGroups.has(key)) monthGroups.set(key, []);
      monthGroups.get(key)!.push(d);
    }

    for (const [monthKey, monthDates] of monthGroups) {
      const [year, month] = monthKey.split("-").map(Number);
      const endOfMonth = format(new Date(year, month, 0), "yyyy-MM-dd");
      const { data: monthWfh } = await supabase
        .from("leaves")
        .select("duration_value")
        .eq("user_id", user.id)
        .eq("leave_type", "WFH")
        .eq("status", "approved")
        .gte("leave_date", `${monthKey}-01`)
        .lte("leave_date", endOfMonth);

      const currentMonthWfh =
        monthWfh?.reduce((sum, l) => sum + l.duration_value, 0) || 0;
      const addingDays = monthDates.length * durationValue;

      if (currentMonthWfh + addingDays > WFH_MONTHLY_CAP) {
        return {
          success: false,
          error: `WFH monthly cap would be exceeded for ${format(new Date(year, month - 1, 1), "MMMM")}. Remaining: ${WFH_MONTHLY_CAP - currentMonthWfh} days`,
        };
      }
    }

    // Daily global cap for each date
    for (const dateStr of dates) {
      const { count: dailyWfh } = await supabase
        .from("leaves")
        .select("*", { count: "exact", head: true })
        .eq("leave_date", dateStr)
        .eq("leave_type", "WFH")
        .eq("status", "approved");

      if ((dailyWfh || 0) >= WFH_DAILY_GLOBAL_CAP) {
        return {
          success: false,
          error: `Daily WFH limit reached on ${dateStr} (${WFH_DAILY_GLOBAL_CAP} slots). Remove that day and try again.`,
        };
      }
    }
  }

  // Balance check for deductible types (HR has unlimited balance — LEAV-14)
  if (config.deductsBalance && user.role !== "hr") {
    let query = supabase
      .from("leaves")
      .select("duration_value")
      .eq("user_id", user.id)
      .eq("status", "approved");
    for (const t of NON_DEDUCTIBLE_TYPES) {
      query = query.neq("leave_type", t);
    }
    const { data: approvedLeaves } = await query;

    const totalUsed =
      approvedLeaves?.reduce((sum, l) => sum + l.duration_value, 0) || 0;
    const remaining = user.leave_balance - totalUsed;
    const totalNeeded = dates.length * durationValue;

    if (remaining - totalNeeded < 0) {
      return {
        success: false,
        error: `Insufficient leave balance. Remaining: ${remaining} days, needed: ${totalNeeded} days`,
      };
    }
  }

  const status = config.requiresApproval ? "pending" : "approved";

  if (editLeaveId) {
    const { error } = await supabase
      .from("leaves")
      .update({
        leave_type: leaveType,
        duration,
        duration_value: durationValue,
        reason: reason || null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editLeaveId)
      .eq("user_id", user.id);

    if (error) return { success: false, error: "Failed to save leave" };
    return { success: true };
  }

  const rows = dates.map((leave_date) => ({
    user_id: user.id,
    leave_type: leaveType,
    leave_date,
    duration,
    duration_value: durationValue,
    reason: reason || null,
    status,
  }));

  const { error } = await supabase.from("leaves").insert(rows);
  if (error) return { success: false, error: "Failed to save leave" };

  if (config.requiresApproval) {
    const reviewers = await getLeaveReviewers(supabase, user.id);
    if (reviewers.length) {
      const dateLabel =
        dates.length > 1 ? `${dates.length} days starting ${dates[0]}` : dates[0];
      const { error: notifError } = await supabase.rpc("create_notifications", {
        payload: reviewers.map((r) => ({
          user_id: r.id,
          type: "leave_submitted",
          title: `${user.name} submitted a leave request`,
          body: `${config.label} — ${dateLabel}`,
          data: { employee_name: user.name, leave_type: leaveType },
        })),
      });
      if (notifError) {
        console.error("Failed to notify reviewers:", notifError.message);
      }
    }
  }

  return { success: true };
}
