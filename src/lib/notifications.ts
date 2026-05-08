import { createClient } from "@/lib/supabase/client";
import type { NotificationType } from "@/lib/types";

type NotificationPayload = {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

export async function createNotification(n: NotificationPayload) {
  const supabase = createClient();
  await supabase.from("notifications").insert({ ...n, data: n.data ?? {} });
}

export async function createNotifications(ns: NotificationPayload[]) {
  if (!ns.length) return;
  const supabase = createClient();
  await supabase
    .from("notifications")
    .insert(ns.map((n) => ({ ...n, data: n.data ?? {} })));
}
