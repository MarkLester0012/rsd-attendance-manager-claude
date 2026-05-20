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
  requested_days_worked?: number;
  requested_wfh_days?: number;
  requested_jeep_rides?: number;
  requested_bus_rides?: number;
  requested_undertime_days?: number;
  requested_owns_vehicle?: boolean;
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
      requested_days_worked: input.requested_days_worked ?? null,
      requested_wfh_days: input.requested_wfh_days ?? null,
      requested_jeep_rides: input.requested_jeep_rides ?? null,
      requested_bus_rides: input.requested_bus_rides ?? null,
      requested_undertime_days: input.requested_undertime_days ?? null,
      requested_owns_vehicle: input.requested_owns_vehicle ?? null,
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
    const newDaysWorked = request.requested_days_worked ?? snap.days_worked;
    const newWfhDays = request.requested_wfh_days ?? snap.wfh_days;
    const newJeepRides = request.requested_jeep_rides ?? snap.jeep_rides;
    const newBusRides = request.requested_bus_rides ?? snap.bus_rides;
    const newUndertimeDays = request.requested_undertime_days ?? snap.undertime_days;
    const newOwnsVehicle = request.requested_owns_vehicle ?? snap.owns_vehicle;

    const newResult = calculateAllowance({
      distance_km: request.requested_distance_km,
      declared_mode: newMode,
      days_worked: newDaysWorked,
      wfh_days: newWfhDays,
      jeep_rides: newJeepRides,
      bus_rides: newBusRides,
      undertime_days: newUndertimeDays,
      owns_vehicle: newOwnsVehicle,
      mode_config: snap.mode_config as SnapshotModeConfig,
    });

    const { error: snapUpdateError } = await supabase
      .from("allowance_snapshots")
      .update({
        distance_km: request.requested_distance_km,
        declared_mode: newMode,
        days_worked: newDaysWorked,
        wfh_days: newWfhDays,
        jeep_rides: newJeepRides,
        bus_rides: newBusRides,
        undertime_days: newUndertimeDays,
        owns_vehicle: newOwnsVehicle,
        total_allowance: newResult.total,
      })
      .eq("id", snap.id);

    if (snapUpdateError) return { error: snapUpdateError.message };
  }

  return { success: true };
}

export async function submitAllowanceRequest(input: {
  month: string;
  distance_km: number;
  declared_mode: TransportMode;
  days_worked: number;
  wfh_days: number;
  jeep_rides: number;
  bus_rides: number;
  undertime_days: number;
  owns_vehicle: boolean;
}) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return { error: "Not authenticated" };

  const { data: employee } = await supabase
    .from("users")
    .select("id, name")
    .eq("auth_id", authUser.id)
    .single();
  if (!employee) return { error: "User not found" };

  // Guard: snapshot already exists → use change request flow instead
  const { data: existingSnapshot } = await supabase
    .from("allowance_snapshots")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("month", input.month)
    .maybeSingle();
  if (existingSnapshot) {
    return { error: "A snapshot already exists for this month. Use the change request form instead." };
  }

  // Check existing submission for this month
  const { data: existingSub } = await supabase
    .from("allowance_submission_requests")
    .select("id, status")
    .eq("employee_id", employee.id)
    .eq("month", input.month)
    .maybeSingle();

  if (existingSub?.status === "pending") {
    return { error: "You already have a pending submission for this month." };
  }

  const wfh_days = Math.min(8, Math.max(0, input.wfh_days));
  const fields = {
    distance_km: input.distance_km,
    declared_mode: input.declared_mode,
    days_worked: input.days_worked,
    wfh_days,
    jeep_rides: input.jeep_rides,
    bus_rides: input.bus_rides,
    undertime_days: input.undertime_days,
    owns_vehicle: input.owns_vehicle,
    status: "pending" as const,
    hr_note: null,
    reviewed_by: null,
    reviewed_at: null,
  };

  let subId: string;
  if (existingSub?.status === "rejected") {
    const { data: updated, error: updateErr } = await supabase
      .from("allowance_submission_requests")
      .update(fields)
      .eq("id", existingSub.id)
      .select("id")
      .single();
    if (updateErr) return { error: updateErr.message };
    subId = updated.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("allowance_submission_requests")
      .insert({ employee_id: employee.id, month: input.month, ...fields })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };
    subId = inserted.id;
  }

  // Notify HR — batched summary
  try {
    const { data: pendingSubs } = await supabase
      .from("allowance_submission_requests")
      .select("employee_id, employee:users!allowance_submission_requests_employee_id_fkey(name)")
      .eq("month", input.month)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const count = pendingSubs?.length ?? 1;
    let title: string;
    if (count === 1) {
      title = `${employee.name} submitted a transportation allowance request`;
    } else if (count === 2) {
      const other = (pendingSubs ?? []).find((s) => s.employee_id !== employee.id);
      const otherName = (other?.employee as { name?: string } | null)?.name ?? "Another employee";
      title = `${employee.name} and ${otherName} submitted transportation allowance requests`;
    } else {
      title = `${employee.name} and ${count - 1} others submitted transportation allowance requests`;
    }

    const { data: hrUsers } = await supabase
      .from("users")
      .select("id")
      .eq("role", "hr");

    if (hrUsers?.length) {
      await supabase.from("notifications").insert(
        hrUsers.map((hr) => ({
          user_id: hr.id,
          type: "allowance_submitted",
          title,
          body: `Month: ${input.month}`,
          data: { month: input.month, submission_id: subId },
        }))
      );
    }
  } catch { /* notification failure should not block */ }

  return { success: true as const, id: subId };
}

export async function reviewSubmissionRequest(input: {
  request_id: string;
  status: "approved" | "rejected";
  hr_note?: string;
}) {
  const { error, supabase, caller } = await getHRCaller();
  if (error) return { error };

  const { data: submission } = await supabase
    .from("allowance_submission_requests")
    .select("*")
    .eq("id", input.request_id)
    .single();

  if (!submission) return { error: "Submission not found" };
  if (submission.status !== "pending") return { error: "Submission is no longer pending" };

  const { error: updateErr } = await supabase
    .from("allowance_submission_requests")
    .update({
      status: input.status,
      hr_note: input.hr_note ?? null,
      reviewed_by: caller!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.request_id);

  if (updateErr) return { error: updateErr.message };

  if (input.status === "approved") {
    const wfh_days = Math.min(8, Math.max(0, submission.wfh_days));
    const result = calculateAllowance({
      distance_km: submission.distance_km,
      declared_mode: submission.declared_mode as TransportMode,
      days_worked: submission.days_worked,
      wfh_days,
      jeep_rides: submission.jeep_rides,
      bus_rides: submission.bus_rides,
      undertime_days: submission.undertime_days,
      owns_vehicle: submission.owns_vehicle,
      mode_config: {},
    });

    const { data: existingSnap } = await supabase
      .from("allowance_snapshots")
      .select("id, locked")
      .eq("employee_id", submission.employee_id)
      .eq("month", submission.month)
      .maybeSingle();

    if (existingSnap?.locked) return { error: "Snapshot is locked. Unlock it first." };

    const snapPayload = {
      employee_id: submission.employee_id,
      month: submission.month,
      payment_date: getPaymentDateString(submission.month),
      distance_km: submission.distance_km,
      declared_mode: submission.declared_mode,
      days_worked: submission.days_worked,
      wfh_days,
      jeep_rides: submission.jeep_rides,
      bus_rides: submission.bus_rides,
      undertime_days: submission.undertime_days,
      owns_vehicle: submission.owns_vehicle,
      mode_config: {},
      total_allowance: result.total,
      created_by: caller!.id,
    };

    if (existingSnap) {
      const { error: snapErr } = await supabase
        .from("allowance_snapshots")
        .update(snapPayload)
        .eq("id", existingSnap.id);
      if (snapErr) return { error: snapErr.message };
    } else {
      const { error: snapErr } = await supabase
        .from("allowance_snapshots")
        .insert(snapPayload);
      if (snapErr) return { error: snapErr.message };
    }

    // Notify employee
    try {
      await supabase.from("notifications").insert({
        user_id: submission.employee_id,
        type: "allowance_submission_reviewed",
        title: "Your transportation allowance request was approved",
        body: `Total allowance: ₱${result.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        data: { submission_id: input.request_id, month: submission.month },
      });
    } catch { /* ignore */ }

    return { success: true as const, total: result.total, snapPayload };
  }

  // Rejected
  try {
    await supabase.from("notifications").insert({
      user_id: submission.employee_id,
      type: "allowance_submission_reviewed",
      title: "Your transportation allowance request was rejected",
      body: input.hr_note ? `HR note: ${input.hr_note}` : "Your request was declined. Please resubmit with corrections.",
      data: { submission_id: input.request_id, month: submission.month },
    });
  } catch { /* ignore */ }

  return { success: true as const };
}
