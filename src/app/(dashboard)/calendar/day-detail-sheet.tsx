"use client";

import { format, parseISO } from "date-fns";
import { CalendarPlus, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LEAVE_TYPES, WFH_DAILY_GLOBAL_CAP } from "@/lib/constants/leave-types";
import type { Holiday, LeaveEntry } from "@/lib/types";

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  holiday: Holiday | undefined;
  leaves: LeaveEntry[];
  wfh: { count: number; names: string[] } | undefined;
  canFileLeave: boolean;
  onEditLeave: (leave: LeaveEntry) => void;
  onFileLeave: () => void;
}

export function DayDetailSheet({
  open,
  onOpenChange,
  date,
  holiday,
  leaves,
  wfh,
  canFileLeave,
  onEditLeave,
  onFileLeave,
}: DayDetailSheetProps) {
  if (!date) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[80vh] overflow-y-auto pb-8"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{format(date, "EEEE, MMMM d")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Holiday */}
          {holiday && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span>🎉</span>
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {holiday.name}
                </span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {holiday.is_local ? "Local holiday" : "National holiday"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(holiday.observed_date), "EEEE, MMMM d, yyyy")}
              </p>
              {holiday.original_date &&
                holiday.original_date !== holiday.observed_date && (
                  <p className="text-xs text-muted-foreground">
                    Moved from{" "}
                    {format(parseISO(holiday.original_date), "MMMM d, yyyy")}
                  </p>
                )}
            </div>
          )}

          {/* Leaves */}
          {leaves.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                My Leaves
              </p>
              {leaves.map((leave) => {
                const lc = LEAVE_TYPES[leave.leave_type];
                return (
                  <button
                    key={leave.id}
                    type="button"
                    onClick={() => onEditLeave(leave)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border p-3 text-left hover:bg-accent/30 transition-colors"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(var(${lc.cssVar}))` }}
                    />
                    <span className="text-sm font-medium">
                      {lc.code} - {lc.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {leave.duration === "half_am"
                        ? "AM"
                        : leave.duration === "half_pm"
                          ? "PM"
                          : "Full day"}
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-auto gap-1 text-[10px] capitalize"
                    >
                      {leave.status === "pending" && (
                        <Clock className="h-2.5 w-2.5 text-status-pending" />
                      )}
                      {leave.status}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {/* WFH slots */}
          {wfh && wfh.count > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">
                  {wfh.count} of {WFH_DAILY_GLOBAL_CAP} WFH slots used
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {wfh.names.join(", ")}
              </p>
            </div>
          )}

          {!holiday && leaves.length === 0 && (!wfh || wfh.count === 0) && (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled for this day.
            </p>
          )}

          {canFileLeave && (
            <Button className="w-full gap-2" onClick={onFileLeave}>
              <CalendarPlus className="h-4 w-4" />
              File a leave
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
