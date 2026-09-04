"use client";

import { format, parseISO } from "date-fns";
import Link from "next/link";
import { CalendarPlus, Clock, Users, DoorOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LEAVE_TYPES, WFH_DAILY_GLOBAL_CAP } from "@/lib/constants/leave-types";
import type { Holiday, LeaveEntry, MeetingWithAttendees } from "@/lib/types";

interface DayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  holiday: Holiday | undefined;
  leaves: LeaveEntry[];
  wfh: { count: number; names: string[] } | undefined;
  meetings?: MeetingWithAttendees[];
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
  meetings,
  canFileLeave,
  onEditLeave,
  onFileLeave,
}: DayDetailSheetProps) {
  if (!date) return null;

  const dateStr = format(date, "yyyy-MM-dd");

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

          {/* Meeting Room Bookings */}
          {meetings && meetings.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Meeting Room ({meetings.length})
                </p>
                <Link
                  href={`/meeting-room?date=${dateStr}`}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Manage
                </Link>
              </div>
              {meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meeting-room?date=${m.meeting_date}`}
                  className="flex w-full items-center justify-between rounded-lg border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-2.5 hover:bg-indigo-50/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.start_time} - {m.end_time} • {m.organizer?.name || "Organizer"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] capitalize text-indigo-700 dark:text-indigo-300 border-indigo-300 shrink-0"
                  >
                    {m.status.replace("_", " ")}
                  </Badge>
                </Link>
              ))}
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
