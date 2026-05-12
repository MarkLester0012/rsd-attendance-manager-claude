"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  Car, Bike, PersonStanding, Bus, Navigation,
  Calculator, History, ChevronDown, ChevronUp, AlertCircle, Lock, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const MODE_ICONS_SMALL: Record<TransportMode, React.ReactNode> = {
  car: <Car className="h-3.5 w-3.5" />,
  motorcycle: <Bike className="h-3.5 w-3.5" />,
  walk: <PersonStanding className="h-3.5 w-3.5" />,
  jeep: <Navigation className="h-3.5 w-3.5" />,
  bus: <Bus className="h-3.5 w-3.5" />,
};
import { submitDistanceChangeRequest } from "./actions";
import type { AllowanceSnapshot, DistanceChangeRequest, User } from "@/lib/types";

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
  defaultMonth: string;
}

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
          className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 text-sm"
        >
          <div className="space-y-0.5">
            <p className="font-medium text-white">{b.label}</p>
            <p className="text-white/50 font-mono text-xs">{b.formula}</p>
          </div>
          <span className="font-semibold text-white ml-4 shrink-0">
            {formatPHP(b.amount)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20">
        <span className="font-semibold text-white">Total Allowance</span>
        <span className="text-xl font-bold text-red-400">{formatPHP(result.total)}</span>
      </div>
    </div>
  );
}

function WhatIfCalculator({ base }: { base: AllowanceSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CalculatorInput>({
    distance_km: base?.distance_km ?? 5,
    declared_mode: (base?.declared_mode as TransportMode) ?? "walk",
    days_worked: base?.days_worked ?? 22,
    wfh_days: base?.wfh_days ?? 0,
    jeep_rides: base?.jeep_rides ?? 0,
    bus_rides: base?.bus_rides ?? 0,
    undertime_days: base?.undertime_days ?? 0,
    owns_vehicle: base?.owns_vehicle ?? false,
    mode_config: base?.mode_config ?? {},
  });

  const [result, setResult] = useState(() => calculateAllowance(form));

  const update = useCallback((patch: Partial<CalculatorInput>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      setResult(calculateAllowance(next));
      return next;
    });
  }, []);

  const numInput = (field: keyof CalculatorInput, label: string, min = 0, max?: number) => (
    <div className="space-y-1">
      <Label className="text-xs text-white/60">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={(form[field] as number) ?? 0}
        onChange={(e) => update({ [field]: parseFloat(e.target.value) || 0 })}
        className="bg-white/5 border-white/10 h-8 text-sm"
      />
    </div>
  );

  const walkDisabled = !result.walk_allowed && form.declared_mode === "walk";

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
      >
        <Calculator className="h-4 w-4" />
        What-if Calculator
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <p className="text-xs text-white/40">
            Adjust values to preview — this does not affect your actual allowance.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-white/60">Transport Mode</Label>
              <Select
                value={form.declared_mode}
                onValueChange={(v) => update({ declared_mode: v as TransportMode })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => {
                    const walkDisqualified = m === "walk" && (form.distance_km > 2.4 || form.owns_vehicle);
                    return (
                      <SelectItem key={m} value={m} disabled={walkDisqualified}>
                        <span className="flex items-center gap-2">
                          {MODE_LABELS[m]}
                          {walkDisqualified && <span className="text-xs text-amber-400">(unavailable)</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {numInput("distance_km", "Distance (km)", 0)}
            {numInput("days_worked", "Days Worked", 0, 31)}
            {numInput("wfh_days", "WFH Days", 0, 8)}
            {(form.declared_mode === "jeep" || form.jeep_rides > 0) &&
              numInput("jeep_rides", "Jeep Rides/Day", 0)}
            {(form.declared_mode === "bus" || form.bus_rides > 0) &&
              numInput("bus_rides", "Bus Rides/Day", 0)}
            {numInput("undertime_days", "Undertime Days", 0)}
          </div>

          {walkDisabled && result.walk_disqualification_reason && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded px-3 py-2">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {result.walk_disqualification_reason}
            </div>
          )}

          <div className="space-y-2">
            {result.breakdowns.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/5">
                <span className="text-white/70">{b.label}</span>
                <span className="font-mono text-white">{formatPHP(b.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-sm font-semibold text-white">Total</span>
              <span className="text-base font-bold text-red-400">{formatPHP(result.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeRequestModal({
  snapshot,
  open,
  onClose,
  onSubmitted,
}: {
  snapshot: AllowanceSnapshot;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [mode, setMode] = useState<TransportMode>(snapshot.declared_mode as TransportMode);
  const [distance, setDistance] = useState(snapshot.distance_km.toString());
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const walkDisqualified = mode === "walk" && (parseFloat(distance) > 2.4 || snapshot.owns_vehicle);

  async function handleSubmit() {
    const km = parseFloat(distance);
    if (!km || km <= 0) { toast.error("Enter a valid distance"); return; }
    if (walkDisqualified) { toast.error("Walk is not available for this distance or vehicle status"); return; }
    if (!reason.trim()) { toast.error("Please provide a reason"); return; }
    setLoading(true);
    const result = await submitDistanceChangeRequest({
      snapshot_id: snapshot.id,
      requested_distance_km: km,
      requested_mode: mode,
      reason: reason.trim(),
    });
    setLoading(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success("Change request submitted");
    onSubmitted();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-white/10">
        <DialogHeader>
          <DialogTitle>Request Mode / Distance Change</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm text-white/60">
            <div>Current mode: <span className="text-white font-medium">{MODE_LABELS[snapshot.declared_mode as TransportMode]}</span></div>
            <div>Current distance: <span className="text-white font-medium">{snapshot.distance_km} km</span></div>
          </div>

          <div className="space-y-1">
            <Label>Transport Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as TransportMode)}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => {
                  const disq = m === "walk" && (parseFloat(distance) > 2.4 || snapshot.owns_vehicle);
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
          </div>

          <div className="space-y-1">
            <Label>Distance (km)</Label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="bg-white/5 border-white/10"
              placeholder="e.g. 12.5"
            />
          </div>

          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-white/5 border-white/10 resize-none"
              rows={3}
              placeholder="Explain why your mode or distance needs to be updated..."
            />
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

export function EmployeeView({ user, snapshots, changeRequests, defaultMonth }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [localSnapshots, setLocalSnapshots] = useState(snapshots);
  const [localRequests, setLocalRequests] = useState(changeRequests);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setLocalSnapshots(snapshots);
    setLocalRequests(changeRequests);
  }, [snapshots, changeRequests]);

  const snapshot = localSnapshots.find((s) => s.month === selectedMonth) ?? null;

  const pendingRequest = localRequests.find(
    (r) => r.snapshot_id === snapshot?.id && r.status === "pending"
  ) ?? null;

  // Month options: last 12 months
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return format(d, "yyyy-MM");
  });

  function handleSubmitted() {
    // Reload change requests optimistically
    window.location.reload();
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transportation Allowance</h1>
          <p className="text-white/50 text-sm mt-1">Your monthly commute reimbursement</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 bg-white/5 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Current snapshot */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-white">{formatMonth(selectedMonth)}</CardTitle>
            <div className="flex items-center gap-2">
              {snapshot?.locked && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Lock className="h-3 w-3" /> Locked
                </Badge>
              )}
              {snapshot && (
                <Badge className="gap-1 text-xs bg-white/10 text-white/70">
                  {MODE_ICONS[snapshot.declared_mode as TransportMode]}
                  {MODE_LABELS[snapshot.declared_mode as TransportMode]}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!snapshot ? (
            <div className="text-center py-8 text-white/40">
              <Car className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No snapshot set by HR for this month yet.</p>
            </div>
          ) : (
            <>
              {/* Key figures */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-xs">Distance</p>
                  <p className="text-white font-semibold">{snapshot.distance_km} km</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-xs">Days Worked</p>
                  <p className="text-white font-semibold">{snapshot.days_worked}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-white/50 text-xs">WFH Days</p>
                  <p className="text-white font-semibold">{snapshot.wfh_days}</p>
                </div>
              </div>

              {/* Breakdown */}
              <BreakdownCard snapshot={snapshot} />

              {/* Change request */}
              {!snapshot.locked && (
                <div className="pt-2">
                  {pendingRequest ? (
                    <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-300 font-medium">Pending change request</p>
                        <p className="text-white/60 text-xs mt-0.5">
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
                      className="gap-2 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
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

          {/* What-if calculator always available */}
          <WhatIfCalculator base={snapshot} />
        </CardContent>
      </Card>

      {/* Change request history */}
      {localRequests.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/70">Change Request History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {localRequests.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between py-2 px-3 rounded-lg bg-white/5 text-sm"
              >
                <div>
                  <p className="text-white">
                    {r.snapshot?.month ? formatMonth(r.snapshot.month) : "—"} →{" "}
                    <span className="font-medium">{r.requested_distance_km} km</span>
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">{r.reason}</p>
                  {r.hr_note && (
                    <p className="text-white/50 text-xs mt-0.5 italic">HR: {r.hr_note}</p>
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

      {/* History */}
      {localSnapshots.length > 0 && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader
            className="pb-3 cursor-pointer select-none"
            onClick={() => setShowHistory((v) => !v)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                <History className="h-4 w-4" />
                Past Months
              </CardTitle>
              {showHistory ? (
                <ChevronUp className="h-4 w-4 text-white/40" />
              ) : (
                <ChevronDown className="h-4 w-4 text-white/40" />
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
                      "w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm transition-colors hover:bg-white/10",
                      selectedMonth === s.month && "bg-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {MODE_ICONS[s.declared_mode as TransportMode]}
                      <span className="text-white">{formatMonth(s.month)}</span>
                      {s.locked && <Lock className="h-3 w-3 text-white/30" />}
                    </div>
                    <span className="font-semibold text-white">{formatPHP(s.total_allowance)}</span>
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
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}
