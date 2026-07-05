"use server";

import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";

export async function reviewLeave(
  leaveId: string,
  status: "approved" | "rejected"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { success: false, error: "Not authenticated" };

  const { data: reviewer } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();
  if (!reviewer || reviewer.role === "member") {
    return { success: false, error: "Not authorized" };
  }

  const { data: leave } = await supabase
    .from("leaves")
    .select("id, user_id, leave_type, leave_date")
    .eq("id", leaveId)
    .single();
  if (!leave) return { success: false, error: "Leave not found" };

  const { error } = await supabase
    .from("leaves")
    .update({
      status,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", leaveId);
  if (error) return { success: false, error: error.message };

  const leaveConfig = LEAVE_TYPES[leave.leave_type as keyof typeof LEAVE_TYPES];
  const { error: notifError } = await supabase.rpc("create_notifications", {
    payload: [
      {
        user_id: leave.user_id,
        type: status === "approved" ? "leave_approved" : "leave_rejected",
        title:
          status === "approved"
            ? "Your leave was approved"
            : "Your leave was rejected",
        body: `${leaveConfig?.label ?? leave.leave_type} on ${format(parseISO(leave.leave_date), "MMM d, yyyy")}`,
        data: { leave_id: leaveId },
      },
    ],
  });
  if (notifError) {
    console.error("Failed to notify requester:", notifError.message);
  }

  return { success: true };
}
