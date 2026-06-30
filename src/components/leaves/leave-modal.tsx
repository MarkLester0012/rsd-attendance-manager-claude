"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LIST,
  HALF_DAY_TYPES,
  SECONDARY_LEAVE_TYPES,
  NON_DEDUCTIBLE_TYPES,
  WFH_MONTHLY_CAP,
  WFH_DAILY_GLOBAL_CAP,
} from "@/lib/constants/leave-types";
import type { User, LeaveEntry, LeaveTypeCode, LeaveDuration } from "@/lib/types";
import { createNotifications } from "@/lib/notifications";

async function getLeaveReviewers(userId: string): Promise<{ id: string }[]> {
  const supabase = createClient();

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

interface LeaveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  date: Date | null;
  dates?: Date[] | null;
  existingLeave: LeaveEntry | null;
  onSuccess: () => void;
}

export function LeaveModal({
  open,
  onOpenChange,
  user,
  date,
  dates,
  existingLeave,
  onSuccess,
}: LeaveModalProps) {
  const [leaveType, setLeaveType] = useState<LeaveTypeCode>("VL");
  const [duration, setDuration] = useState<LeaveDuration>("whole");
  const [reason, setReason] = useState("");
  const [addSecondHalf, setAddSecondHalf] = useState(false);
  const [secondLeaveType, setSecondLeaveType] = useState<LeaveTypeCode>("WFH");
  const [secondReason, setSecondReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isMultiDay = dates && dates.length > 1;
  const isEditMode = !!existingLeave;
  const config = LEAVE_TYPES[leaveType];

  useEffect(() => {
    if (existingLeave) {
      setLeaveType(existingLeave.leave_type);
      setDuration(existingLeave.duration);
      setReason(existingLeave.reason || "");
    } else {
      setLeaveType("VL");
      setDuration("whole");
      setReason("");
    }
    setAddSecondHalf(false);
    setSecondLeaveType("WFH");
    setSecondReason("");
  }, [existingLeave, open]);

  const durationValue = duration === "whole" ? 1.0 : 0.5;
  const canHalfDay = HALF_DAY_TYPES.includes(leaveType);
  const isHalfDay = duration === "half_am" || duration === "half_pm";
  const showSecondHalf = !isMultiDay && !isEditMode && isHalfDay;
  const secondDuration: LeaveDuration = duration === "half_am" ? "half_pm" : "half_am";
  const secondConfig = LEAVE_TYPES[secondLeaveType];
  const availableSecondaryTypes = SECONDARY_LEAVE_TYPES.filter((c) => c !== leaveType);

  useEffect(() => {
    if (showSecondHalf && !availableSecondaryTypes.includes(secondLeaveType)) {
      setSecondLeaveType(availableSecondaryTypes[0]);
    }
  }, [showSecondHalf, leaveType, secondLeaveType, availableSecondaryTypes]);

  async function handleSubmit() {
    // Build entries array (1 or 2 for split-day create)
    const entries: { type: LeaveTypeCode; dur: LeaveDuration; durVal: number; reason: string }[] = [
      { type: leaveType, dur: duration, durVal: durationValue, reason },
    ];
    if (addSecondHalf && showSecondHalf) {
      entries.push({
        type: secondLeaveType,
        dur: secondDuration,
        durVal: 0.5,
        reason: secondReason,
      });
    }

    // Validate required reasons for each entry
    for (const entry of entries) {
      const entryConfig = LEAVE_TYPES[entry.type];
      if (entryConfig.requiresReason && !entry.reason.trim()) {
        toast.error(`Reason is required for ${entryConfig.label}`);
        return;
      }
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // For multi-day mode, submit for all selected dates
      const targetDates = isMultiDay ? dates! : [date!];
      const dateStrs = targetDates.map((d) => format(d, "yyyy-MM-dd"));

      // Duration-aware overlap check
      if (!isEditMode) {
        const { data: existing } = await supabase
          .from("leaves")
          .select("leave_date, duration")
          .eq("user_id", user.id)
          .in("leave_date", dateStrs);

        if (existing && existing.length > 0) {
          for (const dateStr of dateStrs) {
            const dayExisting = existing.filter((e) => e.leave_date === dateStr);
            if (dayExisting.length === 0) continue;

            const hasWhole = dayExisting.some((e) => e.duration === "whole");
            const existingSlots = new Set(dayExisting.map((e) => e.duration));

            for (const entry of entries) {
              // Block if existing whole-day leave
              if (hasWhole) {
                toast.error(`${dateStr} already has a whole-day leave`);
                setIsSubmitting(false);
                return;
              }
              // Block if submitting whole-day and any leave exists
              if (entry.dur === "whole") {
                toast.error(`${dateStr} already has a leave entry — cannot add whole-day`);
                setIsSubmitting(false);
                return;
              }
              // Block if the specific half slot is taken
              if (existingSlots.has(entry.dur)) {
                const slotLabel = entry.dur === "half_am" ? "AM" : "PM";
                toast.error(`${dateStr} already has a ${slotLabel} leave`);
                setIsSubmitting(false);
                return;
              }
            }
          }
        }
      }

      // WFH validations — check for each WFH entry
      const wfhEntries = entries.filter((e) => e.type === "WFH");
      if (wfhEntries.length > 0) {
        // Monthly cap check — group dates by month
        const monthGroups = new Map<string, Date[]>();
        for (const d of targetDates) {
          const key = format(d, "yyyy-MM");
          if (!monthGroups.has(key)) monthGroups.set(key, []);
          monthGroups.get(key)!.push(d);
        }

        // Sum WFH duration being added per date (could be 0.5 if one entry is WFH)
        const wfhDurationPerDate = wfhEntries.reduce((sum, e) => sum + e.durVal, 0);

        for (const [monthKey, monthDates] of monthGroups) {
          const [year, month] = monthKey.split("-").map(Number);
          const startOfMonth = new Date(year, month - 1, 1);
          const endOfMonth = new Date(year, month, 0);
          const { data: monthWfh } = await supabase
            .from("leaves")
            .select("duration_value")
            .eq("user_id", user.id)
            .eq("leave_type", "WFH")
            .eq("status", "approved")
            .gte("leave_date", format(startOfMonth, "yyyy-MM-dd"))
            .lte("leave_date", format(endOfMonth, "yyyy-MM-dd"));

          const currentMonthWfh =
            monthWfh?.reduce((sum, l) => sum + l.duration_value, 0) || 0;
          const addingDays = monthDates.length * wfhDurationPerDate;

          if (currentMonthWfh + addingDays > WFH_MONTHLY_CAP) {
            toast.error(
              `WFH monthly cap would be exceeded for ${format(startOfMonth, "MMMM")}. Remaining: ${WFH_MONTHLY_CAP - currentMonthWfh} days`
            );
            setIsSubmitting(false);
            return;
          }
        }

        // Daily global cap for each date
        for (const dateStr of dateStrs) {
          const { count: dailyWfh } = await supabase
            .from("leaves")
            .select("*", { count: "exact", head: true })
            .eq("leave_date", dateStr)
            .eq("leave_type", "WFH")
            .eq("status", "approved");

          if ((dailyWfh || 0) >= WFH_DAILY_GLOBAL_CAP) {
            toast.error(
              `Daily WFH limit reached on ${dateStr} (${WFH_DAILY_GLOBAL_CAP} slots). Remove that day and try again.`
            );
            setIsSubmitting(false);
            return;
          }
        }
      }

      // Balance check for deductible types (HR has unlimited balance — LEAV-14)
      const deductibleEntries = entries.filter((e) => LEAVE_TYPES[e.type].deductsBalance);
      if (deductibleEntries.length > 0 && user.role !== "hr") {
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
        const totalNeeded = deductibleEntries.reduce(
          (sum, e) => sum + targetDates.length * e.durVal, 0
        );

        if (remaining - totalNeeded < 0) {
          toast.error(
            `Insufficient leave balance. Remaining: ${remaining} days, needed: ${totalNeeded} days`
          );
          setIsSubmitting(false);
          return;
        }
      }

      if (isEditMode) {
        const status = config.requiresApproval ? "pending" : "approved";
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
          .eq("id", existingLeave.id);

        if (error) throw error;
        toast.success("Leave updated successfully");
      } else {
        // Build rows from entries × dates
        const rows = dateStrs.flatMap((dateStr) =>
          entries.map((entry) => ({
            user_id: user.id,
            leave_type: entry.type,
            leave_date: dateStr,
            duration: entry.dur,
            duration_value: entry.durVal,
            reason: entry.reason || null,
            status: LEAVE_TYPES[entry.type].requiresApproval ? "pending" : "approved",
          }))
        );

        const { error } = await supabase.from("leaves").insert(rows);

        if (error) throw error;

        // Notify reviewers if any entry requires approval
        const needsApproval = entries.some((e) => LEAVE_TYPES[e.type].requiresApproval);
        if (needsApproval) {
          const reviewers = await getLeaveReviewers(user.id);
          if (reviewers.length) {
            const dateLabel = isMultiDay
              ? `${dateStrs.length} days starting ${dateStrs[0]}`
              : dateStrs[0];
            const typeLabels = entries.map((e) => LEAVE_TYPES[e.type].label).join(" + ");
            await createNotifications(
              reviewers.map((r) => ({
                user_id: r.id,
                type: "leave_submitted" as const,
                title: `${user.name} submitted a leave request`,
                body: `${typeLabels} — ${dateLabel}`,
                data: { employee_name: user.name, leave_type: leaveType },
              }))
            );
          }
        }

        if (isMultiDay) {
          toast.success(
            needsApproval
              ? `${targetDates.length} leave requests submitted for approval`
              : `${targetDates.length} leave entries applied successfully`
          );
        } else {
          const msg = entries.length > 1
            ? "Split-day leave applied successfully"
            : needsApproval
              ? "Leave request submitted for approval"
              : "Leave applied successfully";
          toast.success(msg);
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to save leave");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingLeave) return;
    setIsDeleting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("leaves")
        .delete()
        .eq("id", existingLeave.id);

      if (error) throw error;

      if (existingLeave.status === "pending" || existingLeave.status === "approved") {
        const reviewers = await getLeaveReviewers(user.id);
        if (reviewers.length) {
          await createNotifications(
            reviewers.map((r) => ({
              user_id: r.id,
              type: "leave_cancelled" as const,
              title: `${user.name} cancelled a leave request`,
              body: `${LEAVE_TYPES[existingLeave.leave_type].label} on ${existingLeave.leave_date}`,
              data: { employee_name: user.name },
            }))
          );
        }
      }

      toast.success("Leave cancelled");
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error("Failed to cancel leave");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!date) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? "Edit Leave"
              : isMultiDay
                ? "Apply Leave for Multiple Days"
                : "Apply for Leave"}
          </DialogTitle>
          {isMultiDay ? (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {dates!.length} days selected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dates!.map((d) => (
                  <Badge
                    key={d.toISOString()}
                    variant="secondary"
                    className="text-[11px]"
                  >
                    {format(d, "MMM d (EEE)")}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {format(date, "EEEE, MMMM d, yyyy")}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Leave Type */}
          <div className="space-y-2">
            <Label>Leave Type</Label>
            <Select
              value={leaveType}
              onValueChange={(v) => {
                setLeaveType(v as LeaveTypeCode);
                if (!HALF_DAY_TYPES.includes(v as LeaveTypeCode)) {
                  setDuration("whole");
                  setAddSecondHalf(false);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPE_LIST.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: `hsl(var(${type.cssVar}))`,
                        }}
                      />
                      <span>{type.label}</span>
                      {!type.requiresApproval && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] ml-1"
                        >
                          Auto
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select
              value={duration}
              onValueChange={(v) => {
                setDuration(v as LeaveDuration);
                if (v === "whole") setAddSecondHalf(false);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whole">Whole Day (1.0)</SelectItem>
                {canHalfDay && (
                  <>
                    <SelectItem value="half_am">Half Day - AM (0.5)</SelectItem>
                    <SelectItem value="half_pm">Half Day - PM (0.5)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>
              Reason{" "}
              {config.requiresReason && (
                <span className="text-destructive">*</span>
              )}
            </Label>
            <EmojiTextarea
              placeholder={
                config.requiresReason
                  ? "Please provide a reason..."
                  : "Optional reason..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Second half-day toggle + fields */}
          {showSecondHalf && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="add-second-half" className="text-sm cursor-pointer">
                    Add {secondDuration === "half_pm" ? "afternoon (PM)" : "morning (AM)"} leave
                  </Label>
                </div>
                <Switch
                  id="add-second-half"
                  checked={addSecondHalf}
                  onCheckedChange={setAddSecondHalf}
                />
              </div>

              {addSecondHalf && (
                <div className="space-y-3 rounded-md border border-border/50 p-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      {secondDuration === "half_pm" ? "Afternoon (PM)" : "Morning (AM)"} — Leave Type
                    </Label>
                    <Select
                      value={secondLeaveType}
                      onValueChange={(v) => setSecondLeaveType(v as LeaveTypeCode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAVE_TYPE_LIST.filter((t) => availableSecondaryTypes.includes(t.code)).map((type) => (
                          <SelectItem key={type.code} value={type.code}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor: `hsl(var(${type.cssVar}))`,
                                }}
                              />
                              <span>{type.label}</span>
                              {!type.requiresApproval && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] ml-1"
                                >
                                  Auto
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Reason{" "}
                      {secondConfig.requiresReason && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <EmojiTextarea
                      placeholder={
                        secondConfig.requiresReason
                          ? "Please provide a reason..."
                          : "Optional reason..."
                      }
                      value={secondReason}
                      onChange={(e) => setSecondReason(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Info badges */}
          <div className="flex flex-wrap gap-2">
            {config.requiresApproval ? (
              <Badge variant="outline" className="text-status-pending border-status-pending/30">
                Requires Approval
              </Badge>
            ) : (
              <Badge variant="outline" className="text-status-approved border-status-approved/30">
                Auto-Approved
              </Badge>
            )}
            {config.deductsBalance ? (
              <Badge variant="outline">Deducts Balance</Badge>
            ) : (
              <Badge variant="secondary">No Balance Deduction</Badge>
            )}
            {isMultiDay && (
              <Badge variant="outline">
                Total: {(dates!.length * durationValue).toFixed(1)} days
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEditMode && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="sm:mr-auto"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Cancel Request
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isDeleting}
          >
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isDeleting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : isEditMode ? (
              "Update Leave"
            ) : isMultiDay ? (
              `Submit ${dates!.length} Days`
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
