import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "@/lib/types";

type NotificationPayload = {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

type NotificationResult = { success: boolean; error?: string };

// Inserts go through the create_notifications() security-definer function,
// which enforces per-type sender-role checks (see supabase/schema.sql).
export async function createNotification(
  n: NotificationPayload
): Promise<NotificationResult> {
  return createNotifications([n]);
}

export async function createNotifications(
  ns: NotificationPayload[]
): Promise<NotificationResult> {
  if (!ns.length) return { success: true };
  const supabase = createClient();
  const { error } = await supabase.rpc("create_notifications", {
    payload: ns.map((n) => ({ ...n, data: n.data ?? {} })),
  });
  if (error) {
    console.error("Failed to create notifications:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}
