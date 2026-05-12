"use server";

import { createClient } from "@/lib/supabase/server";
import { calculateAllowance } from "@/lib/utils/allowance-calculator";
import { getPaymentDateString } from "@/lib/utils/pay-period";
import type { TransportMode, SnapshotModeConfig } from "@/lib/types";

interface SnapshotInput {
  employee_id: string;
  month: string;
  payment_date?: string | null;
  distance_km: number;
  declared_mode: TransportMode;
  days_worked: number;
  wfh_days: number;
  jeep_rides: number;
  bus_rides: number;
  undertime_days: number;
  owns_vehicle: boolean;
  mode_config?: SnapshotModeConfig;
}

async function getHRCaller() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" as const, supabase, caller: null };
  const { data: caller } = await supabase.from("users").select("id, role").eq("auth_id", authUser.id).single();
  if (!caller || caller.role !== "hr") return { error: "Only HR can perform this action" as const, supabase, caller: null };
  return { error: null, supabase, caller };
}

export async function saveSnapshot(input: SnapshotInput) {
  const { error, supabase, caller } = await getHRCaller();
  if (error) return { error };

  const { data: existing } = await supabase
    .from("allowance_snapshots")
    .select("id, locked")
    .eq("employee_id", input.employee_id)
    .eq("month", input.month)
    .maybeSingle();

  if (existing?.locked) return { error: "Snapshot is locked. Unlock it first." };

  const wfh_days = Math.min(Math.max(0, input.wfh_days), 8);
  const result = calculateAllowance({
    distance_km: input.distance_km,
    declared_mode: input.declared_mode,
    days_worked: input.days_worked,
    wfh_days,
    jeep_rides: input.jeep_rides,
    bus_rides: input.bus_rides,
    undertime_days: input.undertime_days,
    owns_vehicle: input.owns_vehicle,
    mode_config: input.mode_config,
  });

  const payload = {
    employee_id: input.employee_id,
    month: input.month,
    payment_date: input.payment_date || getPaymentDateString(input.month),
    distance_km: input.distance_km,
    declared_mode: input.declared_mode,
    days_worked: input.days_worked,
    wfh_days,
    jeep_rides: input.jeep_rides,
    bus_rides: input.bus_rides,
    undertime_days: input.undertime_days,
    owns_vehicle: input.owns_vehicle,
    mode_config: input.mode_config || {},
    total_allowance: result.total,
    created_by: caller!.id,
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from("allowance_snapshots")
      .update(payload)
      .eq("id", existing.id);
    if (updateError) return { error: updateError.message };
  } else {
    const { error: insertError } = await supabase
      .from("allowance_snapshots")
      .insert(payload);
    if (insertError) return { error: insertError.message };
  }

  return { success: true, total: result.total };
}

export async function deleteSnapshot(snapshotId: string) {
  const { error, supabase } = await getHRCaller();
  if (error) return { error };

  const { error: deleteError } = await supabase
    .from("allowance_snapshots")
    .delete()
    .eq("id", snapshotId);

  if (deleteError) return { error: deleteError.message };
  return { success: true };
}

export async function setSnapshotLocked(snapshotId: string, locked: boolean) {
  const { error, supabase } = await getHRCaller();
  if (error) return { error };

  const { error: updateError } = await supabase
    .from("allowance_snapshots")
    .update({ locked })
    .eq("id", snapshotId);

  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function lockMonth(month: string, locked: boolean) {
  const { error, supabase } = await getHRCaller();
  if (error) return { error };

  const { error: updateError } = await supabase
    .from("allowance_snapshots")
    .update({ locked })
    .eq("month", month);

  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function submitDistanceChangeRequest(input: {
  snapshot_id: string;
  requested_distance_km: number;
  requested_mode: TransportMode;
  reason: string;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" };

  const { data: employee } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", authUser.id)
    .single();
  if (!employee) return { error: "User not found" };

  const { data: snapshot } = await supabase
    .from("allowance_snapshots")
    .select("id, employee_id, locked")
    .eq("id", input.snapshot_id)
    .single();

  if (!snapshot || snapshot.employee_id !== employee.id) {
    return { error: "Snapshot not found" };
  }
  if (snapshot.locked) return { error: "Snapshot is locked. No changes can be requested." };

  const { data: existingPending } = await supabase
    .from("distance_change_requests")
    .select("id")
    .eq("snapshot_id", input.snapshot_id)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) return { error: "You already have a pending change request for this month." };

  const { error: insertError } = await supabase
    .from("distance_change_requests")
    .insert({
      snapshot_id: input.snapshot_id,
      employee_id: employee.id,
      requested_distance_km: input.requested_distance_km,
      requested_mode: input.requested_mode,
      reason: input.reason,
    });

  if (insertError) return { error: insertError.message };
  return { success: true };
}

export async function reviewChangeRequest(input: {
  request_id: string;
  status: "approved" | "rejected";
  hr_note?: string;
}) {
  const { error, supabase, caller } = await getHRCaller();
  if (error) return { error };

  const { data: request } = await supabase
    .from("distance_change_requests")
    .select("*, snapshot:allowance_snapshots(*)")
    .eq("id", input.request_id)
    .single();

  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "Request is no longer pending" };

  const { error: updateError } = await supabase
    .from("distance_change_requests")
    .update({
      status: input.status,
      hr_note: input.hr_note || null,
      reviewed_by: caller!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.request_id);

  if (updateError) return { error: updateError.message };

  if (input.status === "approved" && request.snapshot) {
    const snap = request.snapshot;
    const newMode = (request.requested_mode as TransportMode) ?? (snap.declared_mode as TransportMode);
    const newResult = calculateAllowance({
      distance_km: request.requested_distance_km,
      declared_mode: newMode,
      days_worked: snap.days_worked,
      wfh_days: snap.wfh_days,
      jeep_rides: snap.jeep_rides,
      bus_rides: snap.bus_rides,
      undertime_days: snap.undertime_days,
      owns_vehicle: snap.owns_vehicle,
      mode_config: snap.mode_config as SnapshotModeConfig,
    });

    const { error: snapUpdateError } = await supabase
      .from("allowance_snapshots")
      .update({
        distance_km: request.requested_distance_km,
        declared_mode: newMode,
        total_allowance: newResult.total,
      })
      .eq("id", snap.id);

    if (snapUpdateError) return { error: snapUpdateError.message };
  }

  return { success: true };
}
