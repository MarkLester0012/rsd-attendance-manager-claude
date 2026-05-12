"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Car, Bike, PersonStanding, Bus, Navigation,
  Lock, LockOpen, Save, Trash2, Users, AlertCircle, Check, X, Loader2,
  Settings2, ChevronDown, ChevronUp, Search, CalendarIcon,
} from "lucide-react";
import { getPayPeriod, getPaymentDate } from "@/lib/utils/pay-period";
import { Card, CardContent } from "@/components/ui/card";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import {
  calculateAllowance, formatPHP, MODE_LABELS, MODE_DEFAULTS,
  type TransportMode, type CalculatorInput, type SnapshotModeConfig,
} from "@/lib/utils/allowance-calculator";
import { buildTransportationEmployeeDefaults } from "@/lib/utils/transportation-defaults";
import {
  saveSnapshot, setSnapshotLocked, lockMonth, reviewChangeRequest, deleteSnapshot,
} from "./actions";
import { createNotification } from "@/lib/notifications";
import type { AllowanceSnapshot, DistanceChangeRequest, User } from "@/lib/types";
import type { EmployeeDefaults } from "./page";

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

type RowForm = CalculatorInput & {
  payment_date: Date | null;
  mode_config: SnapshotModeConfig;
};

function defaultRow(empDefault: { days_worked: number; wfh_days: number }, month?: string): RowForm {
  return {
    distance_km: 0,
    declared_mode: "walk",
    days_worked: empDefault.days_worked,
    wfh_days: empDefault.wfh_days,
    jeep_rides: 0,
    bus_rides: 0,
    undertime_days: 0,
    owns_vehicle: false,
    payment_date: month ? getPaymentDate(month) : null,
    mode_config: {},
  };
}

function rowFromSnapshot(s: AllowanceSnapshot): RowForm {
  return {
    distance_km: s.distance_km,
    declared_mode: s.declared_mode as TransportMode,
    days_worked: s.days_worked,
    wfh_days: s.wfh_days,
    jeep_rides: s.jeep_rides,
    bus_rides: s.bus_rides,
    undertime_days: s.undertime_days,
    owns_vehicle: s.owns_vehicle,
    payment_date: s.payment_date ? parseISO(s.payment_date) : null,
    mode_config: s.mode_config ?? {},
  };
}

// Smart numeric input — shows empty when value is 0, commits on blur
function NumericInput({
  value, onChange, disabled, min, max, step = 1, className,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [local, setLocal] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setLocal(value === 0 ? "" : String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder="0"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = local === "" ? 0 : parseFloat(local);
        const safe = isNaN(parsed) ? 0 : parsed;
        setLocal(safe === 0 ? "" : String(safe));
        onChange(safe);
      }}
      disabled={disabled}
      className={cn("bg-white/5 border-white/10 h-8 text-sm", className)}
    />
  );
}

// Reject modal
function RejectModal({
  open, onClose, onReject,
}: {
  open: boolean;
  onClose: () => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-white/10">
        <DialogHeader>
          <DialogTitle>Reject Change Request</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <Label>Note (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="bg-white/5 border-white/10 resize-none"
            rows={3}
            placeholder="Reason for rejection…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onReject(note); onClose(); }}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Employee edit modal — 2-column layout: form left, live calc right
function EmployeeEditModal({
  employee, snapshot, month, employeeDefault, onSaved, onDeleted, onClose,
}: {
  employee: User;
  snapshot: AllowanceSnapshot | null;
  month: string;
  employeeDefault: { days_worked: number; wfh_days: number };
  onSaved: (data: Partial<AllowanceSnapshot> & { employee_id: string }) => void;
  onDeleted: (snapshotId: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RowForm>(() =>
    snapshot ? rowFromSnapshot(snapshot) : defaultRow(employeeDefault, month)
  );
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const result = calculateAllowance(form);
  const isLocked = snapshot?.locked ?? false;

  const update = useCallback((patch: Partial<RowForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateModeConfig = useCallback((
    mode: TransportMode | "wfh",
    field: "unit_price" | "gas_mileage" | "refund_pct",
    value: number
  ) => {
    setForm((prev) => ({
      ...prev,
      mode_config: {
        ...prev.mode_config,
        [mode]: { ...prev.mode_config?.[mode as keyof SnapshotModeConfig], [field]: value },
      },
    }));
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await saveSnapshot({
      employee_id: employee.id,
      month,
      payment_date: form.payment_date ? format(form.payment_date, "yyyy-MM-dd") : null,
      distance_km: form.distance_km,
      declared_mode: form.declared_mode,
      days_worked: form.days_worked,
      wfh_days: form.wfh_days,
      jeep_rides: form.jeep_rides,
      bus_rides: form.bus_rides,
      undertime_days: form.undertime_days,
      owns_vehicle: form.owns_vehicle,
      mode_config: form.mode_config,
    });
    setSaving(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`Saved ${employee.name}'s allowance`);
    onSaved({
      employee_id: employee.id,
      distance_km: form.distance_km,
      declared_mode: form.declared_mode,
      days_worked: form.days_worked,
      wfh_days: form.wfh_days,
      jeep_rides: form.jeep_rides,
      bus_rides: form.bus_rides,
      undertime_days: form.undertime_days,
      owns_vehicle: form.owns_vehicle,
      mode_config: form.mode_config,
      payment_date: form.payment_date ? format(form.payment_date, "yyyy-MM-dd") : null,
      total_allowance: res.total!,
      month,
    });
    onClose();
  }

  async function handleDelete() {
    if (!snapshot) return;
    setDeleting(true);
    const res = await deleteSnapshot(snapshot.id);
    setDeleting(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`Deleted ${employee.name}'s snapshot`);
    onDeleted(snapshot.id);
    onClose();
  }

  async function handleLockToggle() {
    if (!snapshot) return;
    setLocking(true);
    const res = await setSnapshotLocked(snapshot.id, !isLocked);
    setLocking(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(isLocked ? "Snapshot unlocked" : "Snapshot locked");
    onSaved({ employee_id: employee.id, locked: !isLocked, month });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-white/10 max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
              {getInitials(employee.name)}
            </div>
            <div>
              <span className="text-white">{employee.name}</span>
              <span className="ml-2 text-white/40 font-normal text-sm">— {formatMonth(month)}</span>
            </div>
            {isLocked && <Lock className="h-4 w-4 text-amber-400 ml-auto mr-6" />}
          </DialogTitle>
        </DialogHeader>

        {isLocked && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded px-3 py-2">
            <Lock className="h-3 w-3 shrink-0" />
            This snapshot is locked. Unlock to make changes.
          </div>
        )}

        <div className="grid md:grid-cols-5 gap-6 max-h-[65vh] overflow-y-auto pr-1">
          {/* Left col: form inputs */}
          <div className="md:col-span-3 space-y-4">
            {/* Declared mode */}
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Declared Mode</Label>
              <Select
                value={form.declared_mode}
                onValueChange={(v) => update({ declared_mode: v as TransportMode })}
                disabled={isLocked}
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
                          {MODE_ICONS[m]} {MODE_LABELS[m]}
                          {walkDisqualified && (
                            <span className="text-xs text-amber-400">(unavailable)</span>
                          )}
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
              <div className="space-y-1">
                <Label className="text-xs text-white/60">Distance (km)</Label>
                <NumericInput
                  value={form.distance_km}
                  onChange={(v) => update({ distance_km: v })}
                  min={0} step={0.1} disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/60">Days Worked</Label>
                <NumericInput
                  value={form.days_worked}
                  onChange={(v) => update({ days_worked: v })}
                  min={0} max={31} disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/60">WFH Days (max 8)</Label>
                <NumericInput
                  value={form.wfh_days}
                  onChange={(v) => update({ wfh_days: v })}
                  min={0} max={8} disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/60">Undertime Days</Label>
                <NumericInput
                  value={form.undertime_days}
                  onChange={(v) => update({ undertime_days: v })}
                  min={0} disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/60">Jeep Rides/Day</Label>
                <NumericInput
                  value={form.jeep_rides}
                  onChange={(v) => update({ jeep_rides: v })}
                  min={0} disabled={isLocked}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-white/60">Bus Rides/Day</Label>
                <NumericInput
                  value={form.bus_rides}
                  onChange={(v) => update({ bus_rides: v })}
                  min={0} disabled={isLocked}
                />
              </div>
            </div>

            {/* Owns vehicle */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
              <Label
                htmlFor={`owns-${employee.id}`}
                className="text-sm text-white/70 cursor-pointer"
              >
                Registered vehicle on file
              </Label>
              <Switch
                id={`owns-${employee.id}`}
                checked={form.owns_vehicle}
                onCheckedChange={(v) => update({ owns_vehicle: v })}
                disabled={isLocked}
              />
            </div>

            {/* Payment date */}
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLocked}
                    className="w-full justify-start gap-2 bg-white/5 border-white/10 text-sm font-normal h-8"
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-white/50" />
                    {form.payment_date
                      ? format(form.payment_date, "MMM d, yyyy")
                      : <span className="text-white/40">Select date</span>
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.payment_date ?? undefined}
                    onSelect={(d) => update({ payment_date: d ?? null })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Advanced overrides */}
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <Settings2 className="h-3 w-3" />
                Advanced overrides
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 rounded-lg bg-white/5 p-3">
                  <p className="text-xs text-white/40">
                    Override policy defaults per mode. Leave blank to use defaults.
                  </p>
                  {(["car", "motorcycle", "walk", "jeep", "bus", "wfh"] as (TransportMode | "wfh")[]).map((m) => {
                    const def = MODE_DEFAULTS[m];
                    return (
                      <div key={m} className="space-y-2">
                        <p className="text-xs font-medium text-white/60 capitalize">
                          {m === "wfh" ? "WFH" : MODE_LABELS[m as TransportMode]}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-white/40">Unit Price</Label>
                            <Input
                              type="number" min={0} step={0.01}
                              placeholder={def.unit_price.toString()}
                              value={(form.mode_config?.[m as keyof SnapshotModeConfig]?.unit_price) ?? ""}
                              onChange={(e) => updateModeConfig(m as TransportMode, "unit_price", parseFloat(e.target.value) || 0)}
                              disabled={isLocked}
                              className="bg-white/5 border-white/10 h-7 text-xs"
                            />
                          </div>
                          {def.gas_mileage !== undefined && (
                            <div className="space-y-1">
                              <Label className="text-xs text-white/40">Gas (km/L)</Label>
                              <Input
                                type="number" min={1} step={0.1}
                                placeholder={def.gas_mileage.toString()}
                                value={(form.mode_config?.[m as keyof SnapshotModeConfig]?.gas_mileage) ?? ""}
                                onChange={(e) => updateModeConfig(m as TransportMode, "gas_mileage", parseFloat(e.target.value) || 0)}
                                disabled={isLocked}
                                className="bg-white/5 border-white/10 h-7 text-xs"
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-xs text-white/40">Refund %</Label>
                            <Input
                              type="number" min={0} max={100} step={1}
                              placeholder={Math.round(def.refund_pct * 100).toString()}
                              value={
                                form.mode_config?.[m as keyof SnapshotModeConfig]?.refund_pct !== undefined
                                  ? Math.round((form.mode_config[m as keyof SnapshotModeConfig]!.refund_pct!) * 100)
                                  : ""
                              }
                              onChange={(e) => updateModeConfig(m as TransportMode, "refund_pct", (parseFloat(e.target.value) || 0) / 100)}
                              disabled={isLocked}
                              className="bg-white/5 border-white/10 h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right col: live calculation */}
          <div className="md:col-span-2">
            <div className="sticky top-0 rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">
                Live Calculation
              </p>
              {result.breakdowns.map((b, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{b.label}</span>
                    <span className="font-mono text-white">{formatPHP(b.amount)}</span>
                  </div>
                  {b.formula && (
                    <p className="text-[10px] text-white/30 font-mono pl-1 truncate">{b.formula}</p>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/10">
                <span className="text-sm font-semibold text-white">Total</span>
                <span className="text-xl font-bold text-emerald-400">{formatPHP(result.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          {snapshot && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </Button>
          )}
          {snapshot && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-2 border-white/10",
                isLocked
                  ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
              onClick={handleLockToggle}
              disabled={locking}
            >
              {locking
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : isLocked
                  ? <LockOpen className="h-3 w-3" />
                  : <Lock className="h-3 w-3" />
              }
              {isLocked ? "Unlock" : "Lock"}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!isLocked && (
            <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Compact employee grid card (display only — click to open modal)
function EmployeeCard({
  employee, snapshot, onEdit,
}: {
  employee: User;
  snapshot: AllowanceSnapshot | null;
  onEdit: () => void;
}) {
  const result = snapshot
    ? calculateAllowance({
        distance_km: snapshot.distance_km,
        declared_mode: snapshot.declared_mode as TransportMode,
        days_worked: snapshot.days_worked,
        wfh_days: snapshot.wfh_days,
        jeep_rides: snapshot.jeep_rides,
        bus_rides: snapshot.bus_rides,
        undertime_days: snapshot.undertime_days,
        owns_vehicle: snapshot.owns_vehicle,
        mode_config: snapshot.mode_config,
      })
    : null;

  return (
    <Card
      className={cn(
        "border-white/10 cursor-pointer transition-all hover:border-white/25 hover:bg-white/8 active:scale-[0.98]",
        snapshot?.locked ? "bg-white/3 opacity-80" : "bg-white/5"
      )}
      onClick={onEdit}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
            {getInitials(employee.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{employee.name}</p>
            <p className="text-xs text-white/40 truncate">
              {(employee as any).department?.name ?? "—"}
            </p>
          </div>
          {snapshot?.locked && <Lock className="h-3.5 w-3.5 text-amber-400/60 shrink-0 mt-0.5" />}
        </div>

        {snapshot ? (
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="gap-1 text-xs border-white/10 text-white/60">
              {MODE_ICONS[snapshot.declared_mode as TransportMode]}
              {MODE_LABELS[snapshot.declared_mode as TransportMode]}
            </Badge>
            <span className="text-sm font-semibold text-emerald-400 tabular-nums">
              {formatPHP(result!.total)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-white/30 italic">No snapshot — click to set</p>
        )}
      </CardContent>
    </Card>
  );
}

// Change request row
function ChangeRequestRow({
  request, onReviewed,
}: {
  request: DistanceChangeRequest;
  onReviewed: (id: string) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  async function handleApprove() {
    setApproving(true);
    const res = await reviewChangeRequest({ request_id: request.id, status: "approved" });
    setApproving(false);
    if (res.error) { toast.error(res.error); return; }

    try {
      await createNotification({
        user_id: request.employee_id,
        type: "allowance_request_reviewed",
        title: "Your allowance change request was approved",
        body: `${request.requested_distance_km} km — updated in your snapshot`,
        data: { request_id: request.id },
      });
    } catch { /* notification failure shouldn't block */ }

    toast.success("Request approved — snapshot updated");
    onReviewed(request.id);
  }

  async function handleReject(note: string) {
    const res = await reviewChangeRequest({ request_id: request.id, status: "rejected", hr_note: note });
    if (res.error) { toast.error(res.error); return; }

    try {
      await createNotification({
        user_id: request.employee_id,
        type: "allowance_request_reviewed",
        title: "Your allowance change request was rejected",
        body: note ? `HR note: ${note}` : `${request.requested_distance_km} km request was declined`,
        data: { request_id: request.id },
      });
    } catch { /* notification failure shouldn't block */ }

    toast.success("Request rejected");
    onReviewed(request.id);
  }

  return (
    <>
      <div className="flex items-start justify-between py-3 px-4 rounded-lg bg-white/5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            {(request as any).employee?.name ?? "—"}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            {request.snapshot?.month ? formatMonth(request.snapshot.month) : ""}
            {" · "}
            {request.snapshot?.declared_mode
              ? `${MODE_LABELS[request.snapshot.declared_mode as TransportMode]} · `
              : ""}
            {(request as any).snapshot?.distance_km ?? "?"}km →{" "}
            {request.requested_mode
              ? `${MODE_LABELS[request.requested_mode as TransportMode]} · `
              : ""}
            <span className="text-white font-medium">{request.requested_distance_km}km</span>
          </p>
          <p className="text-xs text-white/40 mt-1 italic">{request.reason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <Button
            size="sm" variant="ghost"
            className="h-7 gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
            onClick={handleApprove} disabled={approving}
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Approve
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => setRejectOpen(true)}
          >
            <X className="h-3 w-3" />
            Reject
          </Button>
        </div>
      </div>
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onReject={handleReject}
      />
    </>
  );
}

interface HRViewProps {
  user: User;
  employees: User[];
  initialSnapshots: AllowanceSnapshot[];
  initialChangeRequests: DistanceChangeRequest[];
  defaultMonth: string;
  employeeDefaults: EmployeeDefaults;
}

export function HRView({
  employees,
  initialSnapshots,
  initialChangeRequests,
  defaultMonth,
  employeeDefaults,
}: HRViewProps) {
  const [month, setMonth] = useState(defaultMonth);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [changeRequests, setChangeRequests] = useState(initialChangeRequests);
  const [lockingAll, setLockingAll] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [snapshotFilter, setSnapshotFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [localDefaults, setLocalDefaults] = useState<EmployeeDefaults>(employeeDefaults);

  const monthOptions = Array.from({ length: 9 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    return format(d, "yyyy-MM");
  });

  const departments = useMemo(() => {
    const seen = new Map<string, any>();
    for (const e of employees) {
      const dept = (e as any).department;
      if (dept?.id && !seen.has(dept.id)) seen.set(dept.id, dept);
    }
    return Array.from(seen.values());
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const matchSearch =
        e.name.toLowerCase().includes(q) ||
        ((e as any).department?.name ?? "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" || (e as any).department?.id === deptFilter;
      const hasSnap = snapshots.some((s) => s.employee_id === e.id);
      const matchSnap =
        snapshotFilter === "all" ||
        (snapshotFilter === "with" && hasSnap) ||
        (snapshotFilter === "without" && !hasSnap);
      return matchSearch && matchDept && matchSnap;
    });
  }, [employees, search, deptFilter, snapshotFilter, snapshots]);

  async function handleMonthChange(newMonth: string) {
    setMonth(newMonth);
    setLoadingMonth(true);
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { start: periodStart, end: periodEnd } = getPayPeriod(newMonth);
    const startStr = format(periodStart, "yyyy-MM-dd");
    const endStr = format(periodEnd, "yyyy-MM-dd");
    const [{ data: snaps }, { data: holidays }, { data: monthLeaves }] = await Promise.all([
      sb.from("allowance_snapshots")
        .select("*, employee:users!allowance_snapshots_employee_id_fkey(id, name, email, role, department_id)")
        .eq("month", newMonth),
      sb.from("holidays").select("observed_date")
        .gte("observed_date", startStr).lte("observed_date", endStr),
      sb.from("leaves").select("user_id, leave_type, duration_value")
        .eq("status", "approved").gte("leave_date", startStr).lte("leave_date", endStr),
    ]);
    setSnapshots(snaps || []);
    setLocalDefaults(
      buildTransportationEmployeeDefaults(
        employees.map((employee) => employee.id),
        periodStart,
        periodEnd,
        (holidays ?? []).map((holiday: { observed_date: string }) => holiday.observed_date),
        (monthLeaves ?? []).map((leave: {
          user_id: string;
          leave_type: string;
          duration_value: number | null;
        }) => leave)
      )
    );
    setLoadingMonth(false);
  }

  async function handleLockAll(locked: boolean) {
    setLockingAll(true);
    const res = await lockMonth(month, locked);
    setLockingAll(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success(locked ? "Month locked" : "Month unlocked");
    setSnapshots((prev) => prev.map((s) => ({ ...s, locked })));
  }

  function handleSnapshotSaved(data: Partial<AllowanceSnapshot> & { employee_id: string }) {
    setSnapshots((prev) => {
      const idx = prev.findIndex(
        (s) => s.employee_id === data.employee_id && s.month === (data.month ?? month)
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...data };
        return updated;
      }
      const newSnap: AllowanceSnapshot = {
        id: "optimistic-" + data.employee_id,
        month,
        payment_date: null,
        distance_km: 0,
        declared_mode: "walk",
        days_worked: 0,
        wfh_days: 0,
        jeep_rides: 0,
        bus_rides: 0,
        undertime_days: 0,
        owns_vehicle: false,
        mode_config: {},
        total_allowance: 0,
        locked: false,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data,
      };
      return [...prev, newSnap];
    });
  }

  function handleRequestReviewed(id: string) {
    setChangeRequests((prev) => prev.filter((r) => r.id !== id));
  }

  function handleSnapshotDeleted(snapshotId: string) {
    setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== snapshotId));
    setChangeRequests((prev) => prev.filter((request) => request.snapshot_id !== snapshotId));
  }

  const allLocked = snapshots.length > 0 && snapshots.every((s) => s.locked);
  const totalBudget = snapshots.reduce((sum, s) => sum + s.total_allowance, 0);
  const editSnapshot = editTarget
    ? snapshots.find((s) => s.employee_id === editTarget.id) ?? null
    : null;
  const editDefault = editTarget
    ? (localDefaults[editTarget.id] ?? { days_worked: 22, wfh_days: 0 })
    : { days_worked: 22, wfh_days: 0 };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Pay Period: {getPayPeriod(month).label}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select value={month} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-44 bg-white/5 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-2 border-white/10",
              allLocked
                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                : "text-white/60 hover:text-white hover:bg-white/10"
            )}
            onClick={() => handleLockAll(!allLocked)}
            disabled={lockingAll || snapshots.length === 0}
          >
            {lockingAll
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : allLocked
                ? <LockOpen className="h-4 w-4" />
                : <Lock className="h-4 w-4" />
            }
            {allLocked ? "Unlock Month" : "Lock Month"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-white/50">Employees with snapshots</p>
            <p className="text-2xl font-bold text-white mt-1">
              {snapshots.length} / {employees.length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-white/50">Total budget {formatMonth(month)}</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{formatPHP(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-white/50">Pending change requests</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{changeRequests.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending change requests */}
      {changeRequests.length > 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm text-amber-400 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Pending Change Requests ({changeRequests.length})
            </p>
          </div>
          <CardContent className="pt-2 space-y-2">
            {changeRequests.map((r) => (
              <ChangeRequestRow key={r.id} request={r} onReviewed={handleRequestReviewed} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Search & filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            placeholder="Search by name or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[160px] bg-white/5 border-white/10">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {(departments as any[]).map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={snapshotFilter} onValueChange={setSnapshotFilter}>
          <SelectTrigger className="w-[170px] bg-white/5 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            <SelectItem value="with">With Snapshot</SelectItem>
            <SelectItem value="without">Missing Snapshot</SelectItem>
          </SelectContent>
        </Select>
        {loadingMonth && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
      </div>

      {/* Employee grid */}
      <div>
        <div className="flex items-center gap-2 text-xs text-white/40 px-1 mb-3">
          <Users className="h-3.5 w-3.5" />
          <span>{filtered.length} of {employees.length} employees</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((emp) => {
            const snap = snapshots.find((s) => s.employee_id === emp.id) ?? null;
            return (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                snapshot={snap}
                onEdit={() => setEditTarget(emp)}
              />
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-white/30">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No employees match your filters</p>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EmployeeEditModal
          key={editTarget.id}
          employee={editTarget}
          snapshot={editSnapshot}
          month={month}
          employeeDefault={editDefault}
          onSaved={handleSnapshotSaved}
          onDeleted={handleSnapshotDeleted}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
