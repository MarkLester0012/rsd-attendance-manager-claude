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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LIST,
  HALF_DAY_TYPES,
  NON_DEDUCTIBLE_TYPES,
  WFH_MONTHLY_CAP,
  WFH_DAILY_GLOBAL_CAP,
} from "@/lib/constants/leave-types";
import type { User, LeaveEntry, LeaveTypeCode, LeaveDuration } from "@/lib/types";

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
  }, [existingLeave, open]);

  const durationValue = duration === "whole" ? 1.0 : 0.5;
  const canHalfDay = HALF_DAY_TYPES.includes(leaveType);

  async function handleSubmit() {
    if (config.requiresReason && !reason.trim()) {
      toast.error("Reason is required for this leave type");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // For multi-day mode, submit for all selected dates
      const targetDates = isMultiDay ? dates! : [date!];
      const dateStrs = targetDates.map((d) => format(d, "yyyy-MM-dd"));

      // Overlap check — check all dates at once
      if (!isEditMode) {
        const { data: existing } = await supabase
          .from("leaves")
          .select("leave_date")
          .eq("user_id", user.id)
          .in("leave_date", dateStrs);

        if (existing && existing.length > 0) {
          const conflicting = existing.map((e) => e.leave_date).join(", ");
          toast.error(`You already have leave entries on: ${conflicting}`);
          setIsSubmitting(false);
          return;
        }
      }

      // WFH validations
      if (leaveType === "WFH") {
        // Monthly cap check — group dates by month
        const monthGroups = new Map<string, Date[]>();
        for (const d of targetDates) {
          const key = format(d, "yyyy-MM");
          if (!monthGroups.has(key)) monthGroups.set(key, []);
          monthGroups.get(key)!.push(d);
        }

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
          const addingDays = monthDates.length * durationValue;

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
      if (config.deductsBalance && user.role !== "hr") {
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
        const totalNeeded = targetDates.length * durationValue;

        if (remaining - totalNeeded < 0) {
          toast.error(
            `Insufficient leave balance. Remaining: ${remaining} days, needed: ${totalNeeded} days`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const status = config.requiresApproval ? "pending" : "approved";

      if (isEditMode) {
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
        // Insert all dates
        const rows = dateStrs.map((dateStr) => ({
          user_id: user.id,
          leave_type: leaveType,
          leave_date: dateStr,
          duration,
          duration_value: durationValue,
          reason: reason || null,
          status,
        }));

        const { error } = await supabase.from("leaves").insert(rows);

        if (error) throw error;

        if (isMultiDay) {
          toast.success(
            config.requiresApproval
              ? `${targetDates.length} leave requests submitted for approval`
              : `${targetDates.length} leave entries applied successfully`
          );
        } else {
          toast.success(
            config.requiresApproval
              ? "Leave request submitted for approval"
              : "Leave applied successfully"
          );
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
              onValueChange={(v) => setDuration(v as LeaveDuration)}
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
            <Textarea
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
