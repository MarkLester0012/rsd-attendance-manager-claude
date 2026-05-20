"use client";

import { useState, useEffect, useCallback } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { buildEmployeeStats } from "@/lib/utils/transportation-defaults";
import {
  Car, Bike, PersonStanding, Bus, Navigation,
  History, ChevronDown, ChevronUp, AlertCircle, Lock, Send, CheckCircle2, XCircle,
  CalendarDays, TreePalm,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  calculateAllowance, formatPHP, MODE_LABELS,
  type TransportMode, type CalculatorInput,
} from "@/lib/utils/allowance-calculator";
import { getPayPeriod, getPaymentDate } from "@/lib/utils/pay-period";
import { submitDistanceChangeRequest } from "./actions";
import { submitAllowanceRequest } from "./actions";
import { createNotifications } from "@/lib/notifications";
import type { AllowanceSnapshot, AllowanceSubmissionRequest, DistanceChangeRequest, User } from "@/lib/types";
import type { EmployeeStats } from "./page";
import { NumericInput } from "@/components/ui/numeric-input";
import { StatsPanel } from "@/components/transportation-allowance/stats-panel";

const MODE_ICONS_SMALL: Record<TransportMode, React.ReactNode> = {
  car: <Car className="h-3.5 w-3.5" />,
  motorcycle: <Bike className="h-3.5 w-3.5" />,
  walk: <PersonStanding className="h-3.5 w-3.5" />,
  jeep: <Navigation className="h-3.5 w-3.5" />,
  bus: <Bus className="h-3.5 w-3.5" />,
};

const MODE_ICONS: Record<TransportMode, React.ReactNode> = {
  car: <Car className="h-4 w-4" />,
  motorcycle: <Bike className="h-4 w-4" />,
  walk: <PersonStanding className="h-4 w-4" />,
  jeep: <Navigation className="h-4 w-4" />,
  bus: <Bus className="h-4 w-4" />,
};

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return format(new Date(parseInt(y), parseInt(m) - 1), "MMMM yyyy");
}

interface Props {
  user: User;
  snapshots: AllowanceSnapshot[];
  changeRequests: DistanceChangeRequest[];
  submissionRequests: AllowanceSubmissionRequest[];
  defaultMonth: string;
  employeeStats: EmployeeStats;
  previousMonthMode: TransportMode | null;
}

// ─── Submission Form ─────────────────────────────────────────────────────────

interface SubmissionFormProps {
  user: User;
  month: string;
  stats: EmployeeStats;
  statsLoading?: boolean;
  defaultMode: TransportMode;
  defaultDistance?: number | null;
  existingSubmission: AllowanceSubmissionRequest | null;
  onSubmitted: (sub: AllowanceSubmissionRequest) => void;
}

function SubmissionForm({ user, month, stats, statsLoading, defaultMode, defaultDistance, existingSubmission, onSubmitted }: SubmissionFormProps) {
  const [form, setForm] = useState<CalculatorInput>(() => ({
    distance_km: existingSubmission?.distance_km ?? defaultDistance ?? 0,
    declared_mode: (existingSubmission?.declared_mode as TransportMode) ?? defaultMode,
    days_worked: existingSubmission?.days_worked ?? stats.days_worked,
    wfh_days: existingSubmission?.wfh_days ?? stats.wfh_days,
    jeep_rides: existingSubmission?.jeep_rides ?? 0,
    bus_rides: existingSubmission?.bus_rides ?? 0,
    undertime_days: existingSubmission?.undertime_days ?? 0,
    owns_vehicle: existingSubmission?.owns_vehicle ?? false,
    mode_config: {},
  }));
  const [submitting, setSubmitting] = useState(false);

  // Sync days_worked/wfh_days when stats update (e.g. async fetch completes)
  useEffect(() => {
    if (existingSubmission) return;
    setForm((prev) => ({
      ...prev,
      days_worked: stats.days_worked,
      wfh_days: stats.wfh_days,
    }));
  }, [stats.days_worked, stats.wfh_days, existingSubmission]);

  const update = useCallback((patch: Partial<CalculatorInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const result = calculateAllowance(form);
  const showPublicTransport =
    form.declared_mode === "jeep" ||
    form.declared_mode === "bus" ||
    form.jeep_rides > 0 ||
    form.bus_rides > 0;

  async function handleSubmit() {
    if (form.distance_km <= 0) {
      toast.error("Please enter a valid distance");
      return;
    }
    if (!result.walk_allowed && form.declared_mode === "walk") {
      toast.error(result.walk_disqualification_reason ?? "Walk is not available");
      return;
    }
    setSubmitting(true);
    const res = await submitAllowanceRequest({
      month,
      distance_km: form.distance_km,
      declared_mode: form.declared_mode,
      days_worked: form.days_worked,
      wfh_days: form.wfh_days,
      jeep_rides: form.jeep_rides,
      bus_rides: form.bus_rides,
      undertime_days: form.undertime_days,
      owns_vehicle: form.owns_vehicle,
    });
    setSubmitting(false);

    if ("error" in res) {
      toast.error(res.error);
      return;
    }

    toast.success("Allowance request submitted!");
    onSubmitted({
      id: res.id,
      employee_id: user.id,
      month,
      ...form,
      status: "pending",
      hr_note: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return (
    <div className="grid md:grid-cols-5 gap-6">
      {/* Left: form */}
      <div className="md:col-span-3 space-y-4">
        {/* Mode */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Transport Mode</Label>
          <Select
            value={form.declared_mode}
            onValueChange={(v) => update({ declared_mode: v as TransportMode })}
          >
            <SelectTrigger className="bg-background border-border h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => {
                const walkDisqualified = m === "walk" && (form.distance_km > 2.4 || form.owns_vehicle);
                return (
                  <SelectItem key={m} value={m} disabled={walkDisqualified}>
                    <span className="flex items-center gap-2">
                      {MODE_ICONS_SMALL[m]} {MODE_LABELS[m]}
                      {walkDisqualified && <span className="text-xs text-amber-400">(unavailable)</span>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!result.walk_allowed && form.declared_mode === "walk" && result.walk_disqualification_reason && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {result.walk_disqualification_reason}
            </p>
          )}
        </div>

        {/* Numeric fields */}
        <div className="grid grid-cols-2 gap-3">
          <NumericInput value={form.distance_km} onChange={(v) => update({ distance_km: v })} label="Distance (km)" min={0} step={0.1} />
          <NumericInput value={form.days_worked} onChange={(v) => update({ days_worked: v })} label="Days Worked" min={0} max={31} step={0.5} />
          <NumericInput value={form.wfh_days} onChange={(v) => update({ wfh_days: v })} label="WFH Days (max 8)" min={0} max={8} step={0.5} />
          <NumericInput value={form.undertime_days} onChange={(v) => update({ undertime_days: v })} label="Undertime Days" min={0} />
        </div>

        {/* Public transport */}
        {showPublicTransport && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Public Transport Rides / Day</p>
            <div className="grid grid-cols-2 gap-3">
              <NumericInput value={form.jeep_rides} onChange={(v) => update({ jeep_rides: v })} label="Jeep Rides" min={0} />
              <NumericInput value={form.bus_rides} onChange={(v) => update({ bus_rides: v })} label="Bus Rides" min={0} />
            </div>
          </div>
        )}
        {!showPublicTransport && (
          <button
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            onClick={() => update({ jeep_rides: 1 })}
          >
            + Add public transport rides
          </button>
        )}

        {/* Owns vehicle */}
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
          <Label htmlFor="owns-vehicle" className="text-sm text-foreground/70 cursor-pointer">
            Registered vehicle on file
          </Label>
          <Switch
            id="owns-vehicle"
            checked={form.owns_vehicle}
            onCheckedChange={(v) => update({ owns_vehicle: v })}
          />
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleSubmit}
          disabled={submitting || form.distance_km <= 0}
        >
          <Send className="h-4 w-4" />
          {submitting ? "Submitting…" : existingSubmission ? "Resubmit Request" : "Submit Allowance Request"}
        </Button>
      </div>

      {/* Right: live calc + stats */}
      <div className="md:col-span-2 space-y-4">
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
            Estimated Allowance
          </p>
          {result.breakdowns.map((b, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/70">{b.label}</span>
                <span className="font-mono text-foreground">{formatPHP(b.amount)}</span>
              </div>
              {b.formula && (
                <p className="text-[10px] text-muted-foreground/50 font-mono pl-1 truncate">{b.formula}</p>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold text-emerald-400">{formatPHP(result.total)}</span>
          </div>
        </div>

        <StatsPanel stats={stats} loading={statsLoading} />
      </div>
    </div>
  );
}

// ─── Breakdown Card ──────────────────────────────────────────────────────────

function BreakdownCard({ snapshot }: { snapshot: AllowanceSnapshot }) {
  const result = calculateAllowance({
    distance_km: snapshot.distance_km,
    declared_mode: snapshot.declared_mode as TransportMode,
    days_worked: snapshot.days_worked,
    wfh_days: snapshot.wfh_days,
    jeep_rides: snapshot.jeep_rides,
    bus_rides: snapshot.bus_rides,
    undertime_days: snapshot.undertime_days,
    owns_vehicle: snapshot.owns_vehicle,
    mode_config: snapshot.mode_config,
  });

  return (
    <div className="space-y-2">
      {result.breakdowns.map((b, i) => (
        <div
          key={i}
          className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 text-sm"
        >
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{b.label}</p>
            <p className="text-muted-foreground font-mono text-xs">{b.formula}</p>
          </div>
          <span className="font-semibold text-foreground ml-4 shrink-0">
            {formatPHP(b.amount)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <span className="font-semibold text-foreground">Total Allowance</span>
        <span className="text-xl font-bold text-emerald-400">{formatPHP(result.total)}</span>
      </div>
    </div>
  );
}

// ─── Change Request Modal ────────────────────────────────────────────────────

interface ChangeRequestForm {
  declared_mode: TransportMode;
  distance_km: number;
  days_worked: number;
  wfh_days: number;
  jeep_rides: number;
  bus_rides: number;
  undertime_days: number;
  owns_vehicle: boolean;
}

function ChangeRequestModal({
  snapshot, userName, stats, open, onClose, onSubmitted,
}: {
  snapshot: AllowanceSnapshot;
  userName: string;
  stats: EmployeeStats;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState<ChangeRequestForm>({
    declared_mode: snapshot.declared_mode as TransportMode,
    distance_km: snapshot.distance_km,
    days_worked: snapshot.days_worked,
    wfh_days: snapshot.wfh_days,
    jeep_rides: snapshot.jeep_rides,
    bus_rides: snapshot.bus_rides,
    undertime_days: snapshot.undertime_days,
    owns_vehicle: snapshot.owns_vehicle,
  });
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const update = useCallback((patch: Partial<ChangeRequestForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const walkDisqualified = form.declared_mode === "walk" && (form.distance_km > 2.4 || form.owns_vehicle);

  const currentResult = calculateAllowance({
    distance_km: snapshot.distance_km,
    declared_mode: snapshot.declared_mode as TransportMode,
    days_worked: snapshot.days_worked,
    wfh_days: snapshot.wfh_days,
    jeep_rides: snapshot.jeep_rides,
    bus_rides: snapshot.bus_rides,
    undertime_days: snapshot.undertime_days,
    owns_vehicle: snapshot.owns_vehicle,
    mode_config: snapshot.mode_config ?? {},
  });

  const newResult = calculateAllowance({
    distance_km: form.distance_km,
    declared_mode: form.declared_mode,
    days_worked: form.days_worked,
    wfh_days: form.wfh_days,
    jeep_rides: form.jeep_rides,
    bus_rides: form.bus_rides,
    undertime_days: form.undertime_days,
    owns_vehicle: form.owns_vehicle,
    mode_config: snapshot.mode_config ?? {},
  });

  async function handleSubmit() {
    if (form.distance_km <= 0) { toast.error("Enter a valid distance"); return; }
    if (walkDisqualified) { toast.error("Walk is not available for this distance or vehicle status"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    setLoading(true);
    const result = await submitDistanceChangeRequest({
      snapshot_id: snapshot.id,
      requested_distance_km: form.distance_km,
      requested_mode: form.declared_mode,
      reason: reason.trim(),
      requested_days_worked: form.days_worked,
      requested_wfh_days: form.wfh_days,
      requested_jeep_rides: form.jeep_rides,
      requested_bus_rides: form.bus_rides,
      requested_undertime_days: form.undertime_days,
      requested_owns_vehicle: form.owns_vehicle,
    });
    setLoading(false);
    if ("error" in result) { toast.error(result.error); return; }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: hrUsers } = await supabase.from("users").select("id").eq("role", "hr");
      if (hrUsers?.length) {
        await createNotifications(
          hrUsers.map((hr) => ({
            user_id: hr.id,
            type: "allowance_change_request" as const,
            title: `${userName} requested an allowance change`,
            body: `${MODE_LABELS[form.declared_mode]} · ${form.distance_km} km — ${reason.trim()}`,
            data: { snapshot_id: snapshot.id },
          }))
        );
      }
    } catch { /* ignore */ }

    toast.success("Change request submitted");
    onSubmitted();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-background border-border max-w-[calc(100%-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request Changes</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-5 gap-5 max-h-[70vh] overflow-y-auto pr-1 py-1">
          {/* Left: form fields */}
          <div className="sm:col-span-3 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Transport Mode</Label>
              <Select value={form.declared_mode} onValueChange={(v) => update({ declared_mode: v as TransportMode })}>
                <SelectTrigger className="bg-background border-border h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => {
                    const disq = m === "walk" && (form.distance_km > 2.4 || form.owns_vehicle);
                    return (
                      <SelectItem key={m} value={m} disabled={disq}>
                        <span className="flex items-center gap-2">
                          {MODE_ICONS_SMALL[m]} {MODE_LABELS[m]}
                          {disq && <span className="text-xs text-amber-400">(unavailable)</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {walkDisqualified && (
                <p className="text-xs text-amber-400">Walk not available at this distance or with a registered vehicle.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Distance (km)</Label>
                <NumericInput value={form.distance_km} onChange={(v) => update({ distance_km: v })} min={0.1} step={0.1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Days Worked</Label>
                <NumericInput value={form.days_worked} onChange={(v) => update({ days_worked: v })} min={0} max={31} step={0.5} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">WFH Days (max 8)</Label>
                <NumericInput value={form.wfh_days} onChange={(v) => update({ wfh_days: v })} min={0} max={8} step={0.5} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Undertime Days</Label>
                <NumericInput value={form.undertime_days} onChange={(v) => update({ undertime_days: v })} min={0} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Jeep Rides/Day</Label>
                <NumericInput value={form.jeep_rides} onChange={(v) => update({ jeep_rides: v })} min={0} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bus Rides/Day</Label>
                <NumericInput value={form.bus_rides} onChange={(v) => update({ bus_rides: v })} min={0} />
              </div>
            </div>

            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
              <Label className="text-sm text-foreground/70 cursor-pointer">Registered vehicle on file</Label>
              <Switch checked={form.owns_vehicle} onCheckedChange={(v) => update({ owns_vehicle: v })} />
            </div>

            {/* Before / After total */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Estimated Total</p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current</span>
                <span className="font-mono text-muted-foreground line-through">{formatPHP(currentResult.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground">Requested</span>
                <span className={cn("font-mono font-bold", newResult.total > currentResult.total ? "text-emerald-400" : newResult.total < currentResult.total ? "text-red-400" : "text-foreground")}>
                  {formatPHP(newResult.total)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason for changes</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-background border-border resize-none"
                rows={3}
                placeholder="Explain what changed and why..."
              />
            </div>
          </div>

          {/* Right: stats */}
          <div className="sm:col-span-2">
            <StatsPanel stats={stats} title="Pay Period Stats" compact />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending Submission View ─────────────────────────────────────────────────

function PendingSubmissionCard({ submission }: { submission: AllowanceSubmissionRequest }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3">
        <Send className="h-4 w-4 text-blue-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-300">Pending HR review</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submitted {format(new Date(submission.created_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs" variant="outline">
          Pending
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">Mode</p>
          <p className="text-foreground font-semibold flex items-center gap-1 mt-0.5">
            {MODE_ICONS[submission.declared_mode as TransportMode]}
            {MODE_LABELS[submission.declared_mode as TransportMode]}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">Distance</p>
          <p className="text-foreground font-semibold">{submission.distance_km} km</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">Days Worked</p>
          <p className="text-foreground font-semibold">{submission.days_worked}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">WFH Days</p>
          <p className="text-foreground font-semibold">{submission.wfh_days}</p>
        </div>
      </div>

      {(submission.jeep_rides > 0 || submission.bus_rides > 0) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {submission.jeep_rides > 0 && (
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Jeep Rides/Day</p>
              <p className="text-foreground font-semibold">{submission.jeep_rides}</p>
            </div>
          )}
          {submission.bus_rides > 0 && (
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Bus Rides/Day</p>
              <p className="text-foreground font-semibold">{submission.bus_rides}</p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
          Estimated Allowance
        </p>
        {calculateAllowance({
          distance_km: submission.distance_km,
          declared_mode: submission.declared_mode as TransportMode,
          days_worked: submission.days_worked,
          wfh_days: submission.wfh_days,
          jeep_rides: submission.jeep_rides,
          bus_rides: submission.bus_rides,
          undertime_days: submission.undertime_days,
          owns_vehicle: submission.owns_vehicle,
          mode_config: {},
        }).breakdowns.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-foreground/70">{b.label}</span>
            <span className="font-mono text-foreground">{formatPHP(b.amount)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-bold text-emerald-400">
            {formatPHP(calculateAllowance({
              distance_km: submission.distance_km,
              declared_mode: submission.declared_mode as TransportMode,
              days_worked: submission.days_worked,
              wfh_days: submission.wfh_days,
              jeep_rides: submission.jeep_rides,
              bus_rides: submission.bus_rides,
              undertime_days: submission.undertime_days,
              owns_vehicle: submission.owns_vehicle,
              mode_config: {},
            }).total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EmployeeView({
  user,
  snapshots,
  changeRequests,
  submissionRequests,
  defaultMonth,
  employeeStats,
  previousMonthMode,
}: Props) {
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [localSnapshots, setLocalSnapshots] = useState(snapshots);
  const [localRequests, setLocalRequests] = useState(changeRequests);
  const [localSubmissions, setLocalSubmissions] = useState(submissionRequests);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentStats, setCurrentStats] = useState(employeeStats);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    setLocalSnapshots(snapshots);
    setLocalRequests(changeRequests);
    setLocalSubmissions(submissionRequests);
  }, [snapshots, changeRequests, submissionRequests]);

  useEffect(() => {
    if (selectedMonth === defaultMonth) {
      setCurrentStats(employeeStats);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    const { start: periodStart, end: periodEnd } = getPayPeriod(selectedMonth);
    const startStr = format(periodStart, "yyyy-MM-dd");
    const endStr = format(periodEnd, "yyyy-MM-dd");
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const [{ data: holidays }, { data: monthLeaves }] = await Promise.all([
        supabase.from("holidays").select("observed_date")
          .gte("observed_date", startStr).lte("observed_date", endStr),
        supabase.from("leaves").select("user_id, leave_type, duration_value")
          .eq("status", "approved").eq("user_id", user.id)
          .gte("leave_date", startStr).lte("leave_date", endStr),
      ]);
      if (cancelled) return;
      const holidayDates = (holidays ?? []).map((h: { observed_date: string }) => h.observed_date);
      setCurrentStats(buildEmployeeStats(user.id, periodStart, periodEnd, holidayDates, monthLeaves ?? []));
      setStatsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedMonth, defaultMonth, employeeStats, user.id]);

  const snapshot = localSnapshots.find((s) => s.month === selectedMonth) ?? null;
  const currentSubmission = localSubmissions.find((s) => s.month === selectedMonth) ?? null;

  const previousMonthDistance = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prevKey = format(new Date(y, m - 2, 1), "yyyy-MM");
    return localSnapshots.find((s) => s.month === prevKey)?.distance_km ?? null;
  })();

  const pendingRequest = localRequests.find(
    (r) => r.snapshot_id === snapshot?.id && r.status === "pending"
  ) ?? null;

  // Submission state machine
  type SubmissionState = "no_submission" | "pending" | "rejected" | "has_snapshot";
  let submissionState: SubmissionState;
  if (snapshot) {
    submissionState = "has_snapshot";
  } else if (!currentSubmission) {
    submissionState = "no_submission";
  } else if (currentSubmission.status === "pending") {
    submissionState = "pending";
  } else {
    submissionState = "rejected"; // approved would have snapshot; so this is rejected
  }

  // Warning banner: last 2 days of month and no pending/approved submission
  const { end: periodEnd } = getPayPeriod(selectedMonth);
  const today = new Date();
  const daysUntilEnd = differenceInCalendarDays(periodEnd, today);
  const showWarning =
    selectedMonth === defaultMonth &&
    daysUntilEnd <= 2 &&
    daysUntilEnd >= 0 &&
    submissionState !== "has_snapshot" &&
    submissionState !== "pending";

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return format(d, "yyyy-MM");
  });

  function handleSubmitted(sub: AllowanceSubmissionRequest) {
    setLocalSubmissions((prev) => {
      const idx = prev.findIndex((s) => s.month === sub.month);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = sub;
        return updated;
      }
      return [sub, ...prev];
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:flex-1">
          <h1 className="text-2xl font-bold text-foreground">Transportation Allowance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {formatMonth(selectedMonth)}
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Warning banner */}
      {showWarning && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <span className="font-medium">Reminder:</span> Your transportation allowance for {formatMonth(selectedMonth)} has not been submitted.
            {daysUntilEnd === 0 ? " Today is the last day of the month." : ` Only ${daysUntilEnd} day${daysUntilEnd === 1 ? "" : "s"} left.`}
          </p>
        </div>
      )}

      {/* Main card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-foreground">{formatMonth(selectedMonth)}</CardTitle>
            <div className="flex items-center gap-2">
              {snapshot?.locked && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
              {submissionState === "has_snapshot" && snapshot && (
                <Badge className="gap-1 text-xs bg-muted/60 text-foreground/70">
                  {MODE_ICONS[snapshot.declared_mode as TransportMode]}
                  {MODE_LABELS[snapshot.declared_mode as TransportMode]}
                </Badge>
              )}
              {submissionState === "pending" && (
                <Badge className="gap-1 text-xs bg-blue-500/20 text-blue-400 border-blue-500/30" variant="outline">
                  <Send className="h-3 w-3" /> Submitted
                </Badge>
              )}
              {submissionState === "rejected" && currentSubmission && (
                <Badge className="gap-1 text-xs bg-red-500/20 text-red-400 border-red-500/30" variant="outline">
                  <XCircle className="h-3 w-3" /> Rejected
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* has_snapshot: existing breakdown + key stats */}
          {submissionState === "has_snapshot" && snapshot && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Distance</p>
                  <p className="text-foreground font-semibold">{snapshot.distance_km} km</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Days Worked</p>
                  <p className="text-foreground font-semibold">{snapshot.days_worked}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">WFH Days</p>
                  <p className="text-foreground font-semibold">{snapshot.wfh_days}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Payment Date</p>
                  <p className="text-foreground font-semibold">
                    {snapshot.payment_date
                      ? format(new Date(snapshot.payment_date), "MMM d")
                      : format(getPaymentDate(selectedMonth), "MMM d")}
                  </p>
                </div>
              </div>

              <BreakdownCard snapshot={snapshot} />

              {!snapshot.locked && (
                <div className="pt-2">
                  {pendingRequest ? (
                    <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-300 font-medium">Pending change request</p>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {pendingRequest.requested_mode && pendingRequest.requested_mode !== snapshot?.declared_mode
                            ? `${MODE_LABELS[pendingRequest.requested_mode as TransportMode]} · `
                            : ""}
                          {pendingRequest.requested_distance_km} km — awaiting HR review
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-border text-foreground/70 hover:text-foreground hover:bg-muted/60"
                      onClick={() => setRequestModalOpen(true)}
                    >
                      <Send className="h-3 w-3" />
                      Request Mode / Distance Change
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/* pending: read-only submitted values */}
          {submissionState === "pending" && currentSubmission && (
            <PendingSubmissionCard submission={currentSubmission} />
          )}

          {/* rejected: prefilled form with rejection banner */}
          {submissionState === "rejected" && currentSubmission && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm">
                <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-medium">Request rejected</p>
                  {currentSubmission.hr_note && (
                    <p className="text-muted-foreground text-xs mt-0.5">HR note: {currentSubmission.hr_note}</p>
                  )}
                  <p className="text-muted-foreground/70 text-xs mt-0.5">
                    Please update your details below and resubmit.
                  </p>
                </div>
              </div>
              <SubmissionForm
                key={selectedMonth}
                user={user}
                month={selectedMonth}
                stats={currentStats}
                statsLoading={statsLoading}
                defaultMode={previousMonthMode ?? "walk"}
                defaultDistance={previousMonthDistance}
                existingSubmission={currentSubmission}
                onSubmitted={handleSubmitted}
              />
            </>
          )}

          {/* no_submission: fresh form */}
          {submissionState === "no_submission" && (
            <SubmissionForm
              key={selectedMonth}
              user={user}
              month={selectedMonth}
              stats={currentStats}
              statsLoading={statsLoading}
              defaultMode={previousMonthMode ?? "walk"}
              defaultDistance={previousMonthDistance}
              existingSubmission={null}
              onSubmitted={handleSubmitted}
            />
          )}
        </CardContent>
      </Card>

      {/* Approved submission history (non-current months) */}
      {localSubmissions.filter((s) => s.status === "approved").length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground/70">Approved Submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {localSubmissions.filter((s) => s.status === "approved").map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 text-sm">
                <div className="flex items-center gap-2">
                  {MODE_ICONS[s.declared_mode as TransportMode]}
                  <span className="text-foreground">{formatMonth(s.month)}</span>
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                </div>
                <span className="text-xs text-muted-foreground">{s.distance_km} km</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Change request history */}
      {localRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground/70">Change Request History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {localRequests.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between py-2 px-3 rounded-lg bg-muted/40 text-sm"
              >
                <div>
                  <p className="text-foreground">
                    {r.snapshot?.month ? formatMonth(r.snapshot.month) : "—"} →{" "}
                    <span className="font-medium">
                      {r.requested_mode ? `${MODE_LABELS[r.requested_mode as TransportMode]} · ` : ""}
                      {r.requested_distance_km} km
                    </span>
                  </p>
                  <p className="text-muted-foreground/70 text-xs mt-0.5">{r.reason}</p>
                  {r.hr_note && (
                    <p className="text-muted-foreground text-xs mt-0.5 italic">HR: {r.hr_note}</p>
                  )}
                </div>
                <Badge
                  className={cn(
                    "text-xs shrink-0 ml-2",
                    r.status === "approved" && "bg-green-500/20 text-green-400 border-green-500/30",
                    r.status === "rejected" && "bg-red-500/20 text-red-400 border-red-500/30",
                    r.status === "pending" && "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  )}
                  variant="outline"
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Snapshot history */}
      {localSnapshots.length > 0 && (
        <Card>
          <CardHeader
            className="pb-3 cursor-pointer select-none"
            onClick={() => setShowHistory((v) => !v)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-foreground/70 flex items-center gap-2">
                <History className="h-4 w-4" />
                Past Months
              </CardTitle>
              {showHistory ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground/70" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
              )}
            </div>
          </CardHeader>
          {showHistory && (
            <CardContent className="pt-0">
              <div className="space-y-1">
                {localSnapshots.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedMonth(s.month)}
                    className={cn(
                      "w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm transition-colors hover:bg-muted/60",
                      selectedMonth === s.month && "bg-muted/60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {MODE_ICONS[s.declared_mode as TransportMode]}
                      <span className="text-foreground">{formatMonth(s.month)}</span>
                      {s.locked && <Lock className="h-3 w-3 text-muted-foreground/50" />}
                    </div>
                    <span className="font-semibold text-foreground">{formatPHP(s.total_allowance)}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Change request modal */}
      {snapshot && (
        <ChangeRequestModal
          snapshot={snapshot}
          userName={user.name}
          stats={currentStats}
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          onSubmitted={() => window.location.reload()}
        />
      )}
    </div>
  );
}
