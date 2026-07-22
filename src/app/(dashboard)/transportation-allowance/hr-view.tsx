"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Car, Bike, PersonStanding, Bus, Navigation,
  Lock, LockOpen, Save, Trash2, Users, AlertCircle, Check, X, Loader2,
  Settings2, ChevronDown, ChevronUp, Search, ClipboardList, Download,
  Send, CalendarDays, TreePalm, CheckCircle2, ChevronRight, ArrowRight,
} from "lucide-react";
import { getPayPeriod, getPaymentDate } from "@/lib/utils/pay-period";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NumericInput } from "@/components/ui/numeric-input";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserCard } from "@/components/shared/user-card";
import { StatsPanel } from "@/components/transportation-allowance/stats-panel";
import {
  calculateAllowance, formatPHP, MODE_LABELS, MODE_DEFAULTS,
  type TransportMode, type CalculatorInput, type SnapshotModeConfig,
} from "@/lib/utils/allowance-calculator";
import { buildTransportationEmployeeDefaults, buildEmployeeStats } from "@/lib/utils/transportation-defaults";
import {
  saveSnapshot, setSnapshotLocked, lockMonth, reviewChangeRequest, deleteSnapshot,
  reviewSubmissionRequest,
} from "./actions";
import { createNotification } from "@/lib/notifications";
import type { AllowanceSnapshot, AllowanceSubmissionRequest, DistanceChangeRequest, User } from "@/lib/types";
import type { EmployeeDefaults, EmployeeStats } from "./page";
import { useRegisterPageContext } from "@/hooks/use-register-page-context";

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

function RejectModal({ open, onClose, onReject }: { open: boolean; onClose: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-background border-border max-w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader><DialogTitle>Reject Request</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <Label>Note (optional)</Label>
          <EmojiTextarea value={note} onChange={(e) => setNote(e.target.value)}
            className="bg-background border-border resize-none" rows={3} placeholder="Reason for rejection…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onReject(note); onClose(); }}>Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee Edit Modal ─────────────────────────────────────────────────────

function EmployeeEditModal({
  employee, snapshot, month, employeeDefault, employeeStats, onSaved, onDeleted, onClose,
}: {
  employee: User;
  snapshot: AllowanceSnapshot | null;
  month: string;
  employeeDefault: { days_worked: number; wfh_days: number };
  employeeStats?: EmployeeStats;
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
      <DialogContent className="bg-background border-border max-w-[calc(100%-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <UserAvatar name={employee.name} size="xs" />
            <div>
              <span className="text-foreground">{employee.name}</span>
              <span className="ml-2 text-muted-foreground/70 font-normal text-sm">— {formatMonth(month)}</span>
            </div>
            {isLocked && <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 ml-auto mr-6" />}
          </DialogTitle>
        </DialogHeader>

        {isLocked && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-3 py-2">
            <Lock className="h-3 w-3 shrink-0" />
            This snapshot is locked. Unlock to make changes.
          </div>
        )}

        <div className="grid md:grid-cols-5 gap-6 max-h-[65vh] overflow-y-auto pr-1">
          {/* Left: form */}
          <div className="md:col-span-3 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Declared Mode</Label>
              <Select value={form.declared_mode} onValueChange={(v) => update({ declared_mode: v as TransportMode })} disabled={isLocked}>
                <SelectTrigger className="bg-background border-border h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => {
                    const walkDisqualified = m === "walk" && (form.distance_km > 2.4 || form.owns_vehicle);
                    return (
                      <SelectItem key={m} value={m} disabled={walkDisqualified}>
                        <span className="flex items-center gap-2">
                          {MODE_ICONS[m]} {MODE_LABELS[m]}
                          {walkDisqualified && <span className="text-xs text-amber-600 dark:text-amber-400">(unavailable)</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {!result.walk_allowed && form.declared_mode === "walk" && result.walk_disqualification_reason && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />{result.walk_disqualification_reason}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Distance (km)</Label>
                <NumericInput value={form.distance_km} onChange={(v) => update({ distance_km: v })} min={0} step={0.1} disabled={isLocked} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Days Worked</Label>
                <NumericInput value={form.days_worked} onChange={(v) => update({ days_worked: v })} min={0} max={31} step={0.5} disabled={isLocked} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">WFH Days (max 8)</Label>
                <NumericInput value={form.wfh_days} onChange={(v) => update({ wfh_days: v })} min={0} max={8} step={0.5} disabled={isLocked} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Undertime Days</Label>
                <NumericInput value={form.undertime_days} onChange={(v) => update({ undertime_days: v })} min={0} disabled={isLocked} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Jeep Rides/Day</Label>
                <NumericInput value={form.jeep_rides} onChange={(v) => update({ jeep_rides: v })} min={0} disabled={isLocked} /></div>
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">Bus Rides/Day</Label>
                <NumericInput value={form.bus_rides} onChange={(v) => update({ bus_rides: v })} min={0} disabled={isLocked} /></div>
            </div>

            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40">
              <Label htmlFor={`owns-${employee.id}`} className="text-sm text-foreground/70 cursor-pointer">Registered vehicle on file</Label>
              <Switch id={`owns-${employee.id}`} checked={form.owns_vehicle} onCheckedChange={(v) => update({ owns_vehicle: v })} disabled={isLocked} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Payment Date</Label>
              <DatePickerButton
                value={form.payment_date}
                onChange={(d) => update({ payment_date: d })}
                disabled={isLocked}
                size="sm"
                className="w-full"
              />
            </div>

            <div>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground/70 transition-colors"
                onClick={() => setShowAdvanced((v) => !v)}>
                <Settings2 className="h-3 w-3" />
                Advanced overrides
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground/70">Override policy defaults per mode. Leave blank to use defaults.</p>
                  {(["car", "motorcycle", "walk", "jeep", "bus", "wfh"] as (TransportMode | "wfh")[]).map((m) => {
                    const def = MODE_DEFAULTS[m];
                    return (
                      <div key={m} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground capitalize">{m === "wfh" ? "WFH" : MODE_LABELS[m as TransportMode]}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground/70">Unit Price</Label>
                            <Input type="number" min={0} step={0.01} placeholder={def.unit_price.toString()}
                              value={(form.mode_config?.[m as keyof SnapshotModeConfig]?.unit_price) ?? ""}
                              onChange={(e) => updateModeConfig(m as TransportMode, "unit_price", parseFloat(e.target.value) || 0)}
                              disabled={isLocked} className="bg-background border-border h-7 text-xs" />
                          </div>
                          {def.gas_mileage !== undefined && (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground/70">Gas (km/L)</Label>
                              <Input type="number" min={1} step={0.1} placeholder={def.gas_mileage.toString()}
                                value={(form.mode_config?.[m as keyof SnapshotModeConfig]?.gas_mileage) ?? ""}
                                onChange={(e) => updateModeConfig(m as TransportMode, "gas_mileage", parseFloat(e.target.value) || 0)}
                                disabled={isLocked} className="bg-background border-border h-7 text-xs" />
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground/70">Refund %</Label>
                            <Input type="number" min={0} max={100} step={1}
                              placeholder={Math.round(def.refund_pct * 100).toString()}
                              value={form.mode_config?.[m as keyof SnapshotModeConfig]?.refund_pct !== undefined
                                ? Math.round((form.mode_config[m as keyof SnapshotModeConfig]!.refund_pct!) * 100) : ""}
                              onChange={(e) => updateModeConfig(m as TransportMode, "refund_pct", (parseFloat(e.target.value) || 0) / 100)}
                              disabled={isLocked} className="bg-background border-border h-7 text-xs" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: live calc + stats */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Live Calculation</p>
              {result.breakdowns.map((b, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground/70">{b.label}</span>
                    <span className="font-mono text-foreground">{formatPHP(b.amount)}</span>
                  </div>
                  {b.formula && <p className="text-[10px] text-muted-foreground/50 font-mono pl-1 truncate">{b.formula}</p>}
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(result.total)}</span>
              </div>
            </div>
            {employeeStats && <StatsPanel stats={employeeStats} title="Employee Stats" compact />}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          {snapshot && (
            <Button variant="ghost" size="sm" className="gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
            </Button>
          )}
          {snapshot && (
            <Button variant="outline" size="sm"
              className={cn("gap-2 border-border", isLocked ? "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60")}
              onClick={handleLockToggle} disabled={locking}>
              {locking ? <Loader2 className="h-3 w-3 animate-spin" /> : isLocked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {isLocked ? "Unlock" : "Lock"}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!isLocked && (
            <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  employee, snapshot, hasPendingSubmission, onEdit,
}: {
  employee: User;
  snapshot: AllowanceSnapshot | null;
  hasPendingSubmission: boolean;
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
    <UserCard
      name={employee.name}
      department={(employee as any).department?.name ?? "—"}
      avatarSize="sm"
      locked={snapshot?.locked}
      onClick={onEdit}
      headerActions={
        <>
          {hasPendingSubmission && (
            <Send className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-label="Pending submission" />
          )}
          {snapshot?.locked && <Lock className="h-3.5 w-3.5 text-amber-600/70 dark:text-amber-400/60" />}
        </>
      }
    >
      {snapshot ? (
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1 text-xs border-border/50 text-foreground/70">
            {MODE_ICONS[snapshot.declared_mode as TransportMode]}
            {MODE_LABELS[snapshot.declared_mode as TransportMode]}
          </Badge>
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatPHP(result!.total)}
          </span>
        </div>
      ) : hasPendingSubmission ? (
        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 italic">Employee submitted — awaiting approval</p>
      ) : (
        <p className="text-xs text-muted-foreground/40 italic">No snapshot — click to set</p>
      )}
    </UserCard>
  );
}

// ─── Change Request Detail Modal ─────────────────────────────────────────────

function ChangeRequestDetailModal({
  request, employeeStats, onReviewed, onClose,
}: {
  request: DistanceChangeRequest;
  employeeStats: EmployeeStats;
  onReviewed: (id: string) => void;
  onClose: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const snap = request.snapshot;

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
        body: `Changes updated in your snapshot`,
        data: { request_id: request.id },
      });
    } catch { /* ignore */ }
    toast.success("Request approved — snapshot updated");
    onReviewed(request.id);
    onClose();
  }

  async function handleReject(note: string) {
    const res = await reviewChangeRequest({ request_id: request.id, status: "rejected", hr_note: note });
    if (res.error) { toast.error(res.error); return; }
    try {
      await createNotification({
        user_id: request.employee_id,
        type: "allowance_request_reviewed",
        title: "Your allowance change request was rejected",
        body: note ? `HR note: ${note}` : "Your change request was declined",
        data: { request_id: request.id },
      });
    } catch { /* ignore */ }
    toast.success("Request rejected");
    onReviewed(request.id);
    onClose();
  }

  const changedFields: { label: string; before: string; after: string }[] = [];

  if (snap) {
    if (request.requested_mode && request.requested_mode !== snap.declared_mode) {
      changedFields.push({
        label: "Transport Mode",
        before: MODE_LABELS[snap.declared_mode as TransportMode],
        after: MODE_LABELS[request.requested_mode as TransportMode],
      });
    }
    if (request.requested_distance_km !== snap.distance_km) {
      changedFields.push({
        label: "Distance",
        before: `${snap.distance_km} km`,
        after: `${request.requested_distance_km} km`,
      });
    }
    if (request.requested_days_worked != null && request.requested_days_worked !== snap.days_worked) {
      changedFields.push({ label: "Days Worked", before: String(snap.days_worked), after: String(request.requested_days_worked) });
    }
    if (request.requested_wfh_days != null && request.requested_wfh_days !== snap.wfh_days) {
      changedFields.push({ label: "WFH Days", before: String(snap.wfh_days), after: String(request.requested_wfh_days) });
    }
    if (request.requested_jeep_rides != null && request.requested_jeep_rides !== snap.jeep_rides) {
      changedFields.push({ label: "Jeep Rides/Day", before: String(snap.jeep_rides), after: String(request.requested_jeep_rides) });
    }
    if (request.requested_bus_rides != null && request.requested_bus_rides !== snap.bus_rides) {
      changedFields.push({ label: "Bus Rides/Day", before: String(snap.bus_rides), after: String(request.requested_bus_rides) });
    }
    if (request.requested_undertime_days != null && request.requested_undertime_days !== snap.undertime_days) {
      changedFields.push({ label: "Undertime Days", before: String(snap.undertime_days), after: String(request.requested_undertime_days) });
    }
    if (request.requested_owns_vehicle != null && request.requested_owns_vehicle !== snap.owns_vehicle) {
      changedFields.push({ label: "Registered Vehicle", before: snap.owns_vehicle ? "Yes" : "No", after: request.requested_owns_vehicle ? "Yes" : "No" });
    }
  }

  const currentTotal = snap ? calculateAllowance({
    distance_km: snap.distance_km,
    declared_mode: snap.declared_mode as TransportMode,
    days_worked: snap.days_worked,
    wfh_days: snap.wfh_days,
    jeep_rides: snap.jeep_rides,
    bus_rides: snap.bus_rides,
    undertime_days: snap.undertime_days,
    owns_vehicle: snap.owns_vehicle,
    mode_config: snap.mode_config,
  }).total : 0;

  const requestedTotal = snap ? calculateAllowance({
    distance_km: request.requested_distance_km,
    declared_mode: (request.requested_mode ?? snap.declared_mode) as TransportMode,
    days_worked: request.requested_days_worked ?? snap.days_worked,
    wfh_days: request.requested_wfh_days ?? snap.wfh_days,
    jeep_rides: request.requested_jeep_rides ?? snap.jeep_rides,
    bus_rides: request.requested_bus_rides ?? snap.bus_rides,
    undertime_days: request.requested_undertime_days ?? snap.undertime_days,
    owns_vehicle: request.requested_owns_vehicle ?? snap.owns_vehicle,
    mode_config: snap.mode_config,
  }).total : 0;

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-background border-border max-w-[calc(100%-2rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <UserAvatar name={(request as any).employee?.name ?? "?"} size="xs" />
              <div>
                <span className="text-foreground">{(request as any).employee?.name ?? "—"}</span>
                <span className="ml-2 text-muted-foreground/70 font-normal text-sm">
                  — Change Request {snap?.month ? `· ${formatMonth(snap.month)}` : ""}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="grid sm:grid-cols-5 gap-5 max-h-[65vh] overflow-y-auto pr-1">
            <div className="sm:col-span-3 space-y-4">
              {changedFields.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/40 px-3 py-2">
                    <span>Field</span>
                    <span>Before</span>
                    <span>After</span>
                  </div>
                  {changedFields.map((f, i) => (
                    <div key={i} className="grid grid-cols-3 px-3 py-2.5 text-sm border-t border-border/50 items-center">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="text-muted-foreground/60 line-through">{f.before}</span>
                      <span className="text-foreground font-medium flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />{f.after}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">No field changes detected (legacy request).</p>
              )}

              {snap && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Allowance Impact</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current total</span>
                    <span className="font-mono text-muted-foreground line-through">{formatPHP(currentTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Requested total</span>
                    <span className={cn("font-mono font-bold", requestedTotal > currentTotal ? "text-emerald-600 dark:text-emerald-400" : requestedTotal < currentTotal ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                      {formatPHP(requestedTotal)}
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Reason</p>
                <p className="text-sm text-foreground italic">{request.reason}</p>
              </div>

              <p className="text-[11px] text-muted-foreground/50">
                Submitted {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>

            <div className="sm:col-span-2">
              <StatsPanel stats={employeeStats} title="Employee Stats" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="ghost" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setRejectOpen(true)}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button className="gap-1.5 bg-green-600 hover:bg-green-500 text-white"
              onClick={handleApprove} disabled={approving}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} onReject={handleReject} />
    </>
  );
}

// ─── Change Request Row ───────────────────────────────────────────────────────

function ChangeRequestRow({
  request, employeeStats, onReviewed,
}: {
  request: DistanceChangeRequest;
  employeeStats: EmployeeStats;
  onReviewed: (id: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const snap = request.snapshot;

  const changeSummary: string[] = [];
  if (request.requested_mode && request.requested_mode !== snap?.declared_mode) {
    changeSummary.push(`${MODE_LABELS[snap?.declared_mode as TransportMode] ?? "?"} → ${MODE_LABELS[request.requested_mode as TransportMode]}`);
  }
  if (snap && request.requested_distance_km !== snap.distance_km) {
    changeSummary.push(`${snap.distance_km} → ${request.requested_distance_km} km`);
  }
  if (request.requested_days_worked != null && snap && request.requested_days_worked !== snap.days_worked) {
    changeSummary.push(`${snap.days_worked} → ${request.requested_days_worked} days worked`);
  }
  if (request.requested_wfh_days != null && snap && request.requested_wfh_days !== snap.wfh_days) {
    changeSummary.push(`WFH ${snap.wfh_days} → ${request.requested_wfh_days}`);
  }

  return (
    <>
      <div
        className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors gap-3"
        onClick={() => setDetailOpen(true)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-foreground">{(request as any).employee?.name ?? "—"}</p>
            {snap?.month && <span className="text-xs text-muted-foreground/60">{formatMonth(snap.month)}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {changeSummary.length > 0 ? changeSummary.join(" · ") : `${request.requested_distance_km} km`}
          </p>
          <p className="text-xs text-muted-foreground/50 italic mt-0.5 truncate">{request.reason}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </div>
      {detailOpen && (
        <ChangeRequestDetailModal
          request={request}
          employeeStats={employeeStats}
          onReviewed={onReviewed}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

// ─── Submission Detail Modal ──────────────────────────────────────────────────

function SubmissionDetailModal({
  request, employeeStats, onReviewed, onClose,
}: {
  request: AllowanceSubmissionRequest;
  employeeStats: EmployeeStats;
  onReviewed: (id: string, status: "approved" | "rejected", snapPayload?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const estimated = calculateAllowance({
    distance_km: request.distance_km,
    declared_mode: request.declared_mode as TransportMode,
    days_worked: request.days_worked,
    wfh_days: request.wfh_days,
    jeep_rides: request.jeep_rides,
    bus_rides: request.bus_rides,
    undertime_days: request.undertime_days,
    owns_vehicle: request.owns_vehicle,
    mode_config: {},
  });

  async function handleApprove() {
    setApproving(true);
    const res = await reviewSubmissionRequest({ request_id: request.id, status: "approved" });
    setApproving(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Submission approved — snapshot created");
    onReviewed(request.id, "approved", "snapPayload" in res ? (res.snapPayload as Record<string, unknown>) : undefined);
    onClose();
  }

  async function handleReject(note: string) {
    const res = await reviewSubmissionRequest({ request_id: request.id, status: "rejected", hr_note: note });
    if ("error" in res) { toast.error(res.error); return; }
    toast.success("Submission rejected");
    onReviewed(request.id, "rejected");
    onClose();
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-background border-border max-w-[calc(100%-2rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <UserAvatar name={(request as any).employee?.name ?? "?"} size="xs" />
              <div>
                <span className="text-foreground">{(request as any).employee?.name ?? "—"}</span>
                <span className="ml-2 text-muted-foreground/70 font-normal text-sm">— {formatMonth(request.month)}</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="grid sm:grid-cols-5 gap-5 max-h-[65vh] overflow-y-auto pr-1">
            <div className="sm:col-span-3 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Mode</p>
                  <p className="text-sm font-semibold flex items-center gap-1.5 mt-1">
                    {MODE_ICONS[request.declared_mode as TransportMode]}
                    {MODE_LABELS[request.declared_mode as TransportMode]}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Distance</p>
                  <p className="text-sm font-semibold mt-1">{request.distance_km} km</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Days Worked</p>
                  <p className="text-sm font-semibold mt-1">{request.days_worked}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">WFH Days</p>
                  <p className="text-sm font-semibold mt-1">{request.wfh_days}</p>
                </div>
                {request.jeep_rides > 0 && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Jeep Rides/Day</p>
                    <p className="text-sm font-semibold mt-1">{request.jeep_rides}</p>
                  </div>
                )}
                {request.bus_rides > 0 && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Bus Rides/Day</p>
                    <p className="text-sm font-semibold mt-1">{request.bus_rides}</p>
                  </div>
                )}
                {request.undertime_days > 0 && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Undertime Days</p>
                    <p className="text-sm font-semibold mt-1">{request.undertime_days}</p>
                  </div>
                )}
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Registered Vehicle</p>
                  <p className="text-sm font-semibold mt-1">{request.owns_vehicle ? "Yes" : "No"}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Estimated Allowance</p>
                {estimated.breakdowns.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-foreground/70">{b.label}</span>
                    <span className="font-mono text-foreground">{formatPHP(b.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(estimated.total)}</span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground/50">
                Submitted {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>

            <div className="sm:col-span-2">
              <StatsPanel stats={employeeStats} title="Employee Stats" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="ghost" className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setRejectOpen(true)}>
              <X className="h-4 w-4 mr-1" /> Reject
            </Button>
            <Button className="gap-1.5 bg-green-600 hover:bg-green-500 text-white"
              onClick={handleApprove} disabled={approving}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RejectModal open={rejectOpen} onClose={() => setRejectOpen(false)} onReject={handleReject} />
    </>
  );
}

// ─── Submission Row ───────────────────────────────────────────────────────────

function SubmissionRow({
  request, employeeStats, onReviewed,
}: {
  request: AllowanceSubmissionRequest;
  employeeStats: EmployeeStats;
  onReviewed: (id: string, status: "approved" | "rejected", snapPayload?: Record<string, unknown>) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  const estimated = calculateAllowance({
    distance_km: request.distance_km,
    declared_mode: request.declared_mode as TransportMode,
    days_worked: request.days_worked,
    wfh_days: request.wfh_days,
    jeep_rides: request.jeep_rides,
    bus_rides: request.bus_rides,
    undertime_days: request.undertime_days,
    owns_vehicle: request.owns_vehicle,
    mode_config: {},
  });

  return (
    <>
      <div
        className="rounded-lg bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors p-4"
        onClick={() => setDetailOpen(true)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{(request as any).employee?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatMonth(request.month)} · {MODE_LABELS[request.declared_mode as TransportMode]} · {request.distance_km} km
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {request.days_worked} days · {request.wfh_days} WFH
              {request.jeep_rides > 0 && ` · ${request.jeep_rides} jeep`}
              {request.bus_rides > 0 && ` · ${request.bus_rides} bus`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatPHP(estimated.total)}</p>
              <p className="text-[10px] text-muted-foreground/50">estimated</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/40 mt-2">
          Submitted {format(new Date(request.created_at), "MMM d, h:mm a")}
        </p>
      </div>
      {detailOpen && (
        <SubmissionDetailModal
          request={request}
          employeeStats={employeeStats}
          onReviewed={onReviewed}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}
// ─── HR View ─────────────────────────────────────────────────────────────────

interface HRViewProps {
  user: User;
  employees: User[];
  initialSnapshots: AllowanceSnapshot[];
  initialChangeRequests: DistanceChangeRequest[];
  initialSubmissionRequests: AllowanceSubmissionRequest[];
  defaultMonth: string;
  employeeDefaults: EmployeeDefaults;
  employeeStatsList: Record<string, EmployeeStats>;
  initialTab?: string;
}

export function HRView({
  employees,
  initialSnapshots,
  initialChangeRequests,
  initialSubmissionRequests,
  defaultMonth,
  employeeDefaults,
  employeeStatsList,
  initialTab,
}: HRViewProps) {
  const [month, setMonth] = useState(defaultMonth);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [changeRequests, setChangeRequests] = useState(initialChangeRequests);
  const [submissionRequests, setSubmissionRequests] = useState(initialSubmissionRequests);
  const [lockingAll, setLockingAll] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [snapshotFilter, setSnapshotFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [localDefaults, setLocalDefaults] = useState<EmployeeDefaults>(employeeDefaults);
  const [localStatsList, setLocalStatsList] = useState<Record<string, EmployeeStats>>(employeeStatsList);
  const [activeTab, setActiveTab] = useState(
    initialTab === "requests" ? "requests" : "snapshots"
  );
  const [exporting, setExporting] = useState(false);

  async function handleExportExcel() {
    setExporting(true);
    try {
      const { exportAllowanceToExcel } = await import("@/lib/utils/export-allowance");
      await exportAllowanceToExcel({
        snapshots,
        employees,
        month,
        payPeriodLabel: getPayPeriod(month).label,
      });
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

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
      const matchSearch = e.name.toLowerCase().includes(q) || ((e as any).department?.name ?? "").toLowerCase().includes(q);
      const matchDept = deptFilter === "all" || (e as any).department?.id === deptFilter;
      const snap = snapshots.find((s) => s.employee_id === e.id);
      const hasSnap = !!snap;
      const matchSnap = snapshotFilter === "all" || (snapshotFilter === "with" && hasSnap) || (snapshotFilter === "without" && !hasSnap);
      const matchMode = modeFilter === "all" || snap?.declared_mode === modeFilter;
      return matchSearch && matchDept && matchSnap && matchMode;
    });
  }, [employees, search, deptFilter, snapshotFilter, modeFilter, snapshots]);

  async function handleMonthChange(newMonth: string) {
    setMonth(newMonth);
    setLoadingMonth(true);
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { start: periodStart, end: periodEnd } = getPayPeriod(newMonth);
    const startStr = format(periodStart, "yyyy-MM-dd");
    const endStr = format(periodEnd, "yyyy-MM-dd");
    const [{ data: snaps }, { data: holidays }, { data: monthLeaves }, { data: subs }] = await Promise.all([
      sb.from("allowance_snapshots")
        .select("*, employee:users!allowance_snapshots_employee_id_fkey(id, name, email, role, department_id)")
        .eq("month", newMonth),
      sb.from("holidays").select("observed_date").gte("observed_date", startStr).lte("observed_date", endStr),
      sb.from("leaves").select("user_id, leave_type, duration_value")
        .eq("status", "approved").gte("leave_date", startStr).lte("leave_date", endStr),
      sb.from("allowance_submission_requests")
        .select("*, employee:users!allowance_submission_requests_employee_id_fkey(id, name, email, role, department_id)")
        .eq("month", newMonth).eq("status", "pending").order("created_at", { ascending: true }),
    ]);

    const holidayDates = (holidays ?? []).map((h: { observed_date: string }) => h.observed_date);
    const leaveSummaries = (monthLeaves ?? []) as { user_id: string; leave_type: string; duration_value: number | null }[];

    setSnapshots(snaps || []);
    setSubmissionRequests(subs || []);
    setLocalDefaults(
      buildTransportationEmployeeDefaults(
        employees.map((e) => e.id),
        periodStart,
        periodEnd,
        holidayDates,
        leaveSummaries
      )
    );

    const newStats: Record<string, EmployeeStats> = {};
    for (const emp of employees) {
      newStats[emp.id] = buildEmployeeStats(emp.id, periodStart, periodEnd, holidayDates, leaveSummaries);
    }
    setLocalStatsList(newStats);
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
      const idx = prev.findIndex((s) => s.employee_id === data.employee_id && s.month === (data.month ?? month));
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
    setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
    setChangeRequests((prev) => prev.filter((r) => r.snapshot_id !== snapshotId));
  }

  function handleSubmissionReviewed(
    id: string,
    status: "approved" | "rejected",
    snapPayload?: Record<string, unknown>
  ) {
    setSubmissionRequests((prev) => prev.filter((r) => r.id !== id));
    if (status === "approved" && snapPayload) {
      handleSnapshotSaved({
        ...(snapPayload as Partial<AllowanceSnapshot>),
        employee_id: snapPayload.employee_id as string,
        month: snapPayload.month as string,
        total_allowance: snapPayload.total_allowance as number,
      });
    }
  }

  const allLocked = snapshots.length > 0 && snapshots.every((s) => s.locked);
  const totalBudget = snapshots.reduce((sum, s) => sum + s.total_allowance, 0);
  const editSnapshot = editTarget ? snapshots.find((s) => s.employee_id === editTarget.id) ?? null : null;
  const editDefault = editTarget ? (localDefaults[editTarget.id] ?? { days_worked: 22, wfh_days: 0 }) : { days_worked: 22, wfh_days: 0 };
  const editStats = editTarget ? localStatsList[editTarget.id] : undefined;

  const pendingSubmissionEmployeeIds = useMemo(
    () => new Set(submissionRequests.map((r) => r.employee_id)),
    [submissionRequests]
  );

  // Register page context for the AI assistant
  useRegisterPageContext("Transportation Allowance", {
    view: "hr",
    payPeriod: getPayPeriod(month).label,
    month,
    coverage: { withSnapshots: snapshots.length, totalEmployees: employees.length },
    totalBudget: formatPHP(totalBudget),
    pendingRequests: submissionRequests.length + changeRequests.length,
    allLocked,
    activeFilters: {
      search,
      department: deptFilter,
      snapshot: snapshotFilter,
      mode: modeFilter,
    },
    employees: filtered.slice(0, 30).map((e) => {
      const snap = snapshots.find((s) => s.employee_id === e.id);
      return {
        name: e.name,
        department: (e as any).department?.name ?? null,
        mode: snap?.declared_mode ?? null,
        distanceKm: snap?.distance_km ?? null,
        total: snap ? formatPHP(snap.total_allowance) : null,
        locked: snap?.locked ?? false,
        hasPendingSubmission: pendingSubmissionEmployeeIds.has(e.id),
      };
    }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pay Period: {getPayPeriod(month).label}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select value={month} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-44 bg-background border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm"
            className={cn("gap-2 border-border", allLocked ? "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/60")}
            onClick={() => handleLockAll(!allLocked)} disabled={lockingAll || snapshots.length === 0}>
            {lockingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : allLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {allLocked ? "Unlock Month" : "Lock Month"}
          </Button>
          <Button variant="outline" size="sm"
            className="gap-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
            onClick={handleExportExcel} disabled={exporting || snapshots.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Employees with snapshots</p>
            <p className="text-2xl font-bold text-foreground mt-1">{snapshots.length} / {employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total budget for {formatMonth(month)}</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatPHP(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "cursor-pointer transition-colors",
            (submissionRequests.length + changeRequests.length) > 0 && "border-blue-500/30 bg-blue-500/5"
          )}
          onClick={() => (submissionRequests.length + changeRequests.length) > 0 && setActiveTab("requests")}
        >
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pending requests</p>
            <div className="flex items-end gap-3 mt-1">
              <p className={cn("text-2xl font-bold", (submissionRequests.length + changeRequests.length) > 0 ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>
                {submissionRequests.length + changeRequests.length}
              </p>
              {(submissionRequests.length > 0 || changeRequests.length > 0) && (
                <p className="text-xs text-muted-foreground/60 mb-0.5">
                  {submissionRequests.length > 0 && `${submissionRequests.length} submission${submissionRequests.length > 1 ? "s" : ""}`}
                  {submissionRequests.length > 0 && changeRequests.length > 0 && " · "}
                  {changeRequests.length > 0 && `${changeRequests.length} change${changeRequests.length > 1 ? "s" : ""}`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40">
          <TabsTrigger value="snapshots" className="gap-2">
            <Users className="h-3.5 w-3.5" /> Snapshots
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <ClipboardList className="h-3.5 w-3.5" />
            Requests
            {(submissionRequests.length + changeRequests.length) > 0 && (
              <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500/20 px-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                {submissionRequests.length + changeRequests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Snapshots tab */}
        <TabsContent value="snapshots" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input placeholder="Search by name or department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background border-border" />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[160px] bg-background border-border"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {(departments as any[]).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={snapshotFilter} onValueChange={setSnapshotFilter}>
              <SelectTrigger className="w-[170px] bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                <SelectItem value="with">With Snapshot</SelectItem>
                <SelectItem value="without">Missing Snapshot</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modeFilter} onValueChange={setModeFilter}>
              <SelectTrigger className="w-[150px] bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {(["car", "motorcycle", "walk", "jeep", "bus"] as TransportMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    <span className="flex items-center gap-2">{MODE_ICONS[m]} {MODE_LABELS[m]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingMonth && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />}
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70 px-1 mb-3">
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
                    hasPendingSubmission={pendingSubmissionEmployeeIds.has(emp.id)}
                    onEdit={() => setEditTarget(emp)}
                  />
                );
              })}
            </div>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground/50">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No employees match your filters</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Requests tab — submissions + change requests unified */}
        <TabsContent value="requests" className="mt-4 space-y-4">
          {submissionRequests.length === 0 && changeRequests.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground/50">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No pending requests</p>
            </div>
          ) : (
            <>
              {submissionRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600/70 dark:text-blue-400/80 flex items-center gap-1.5">
                    <Send className="h-3 w-3" /> Submissions ({submissionRequests.length})
                  </p>
                  <div className="space-y-2">
                    {submissionRequests.map((r) => (
                      <SubmissionRow
                        key={r.id}
                        request={r}
                        employeeStats={localStatsList[r.employee_id] ?? { business_days: 0, holiday_count: 0, days_worked: 0, wfh_days: 0, leave_breakdown: {} }}
                        onReviewed={handleSubmissionReviewed}
                      />
                    ))}
                  </div>
                </div>
              )}
              {changeRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600/70 dark:text-amber-400/80 flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3" /> Change Requests ({changeRequests.length})
                  </p>
                  <div className="space-y-2">
                    {changeRequests.map((r) => (
                      <ChangeRequestRow
                        key={r.id}
                        request={r}
                        employeeStats={localStatsList[r.employee_id] ?? { business_days: 0, holiday_count: 0, days_worked: 0, wfh_days: 0, leave_breakdown: {} }}
                        onReviewed={handleRequestReviewed}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit modal */}
      {editTarget && (
        <EmployeeEditModal
          key={editTarget.id}
          employee={editTarget}
          snapshot={editSnapshot}
          month={month}
          employeeDefault={editDefault}
          employeeStats={editStats}
          onSaved={handleSnapshotSaved}
          onDeleted={handleSnapshotDeleted}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
