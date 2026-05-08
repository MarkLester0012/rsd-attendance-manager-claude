"use client";

import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subMonths,
  addMonths,
  isSameMonth,
  isSameDay,
  isWeekend,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Holiday, LeaveEntry } from "@/lib/types";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";

export interface MonthViewEntry {
  log_date: string;
  issue_id: number | undefined;
  hours: number;
  source: "redmine" | "draft" | "failed";
  project_name?: string;
  activity_name?: string;
  comment?: string;
}

interface MonthViewProps {
  entries: MonthViewEntry[];
  holidays: Holiday[];
  leaves: LeaveEntry[];
  currentMonth: Date;
  selectedDate: string;
  onMonthChange: (date: Date) => void;
  onOpenDayView: (date: string) => void;
  loading?: boolean;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

export function MonthView({
  entries,
  holidays,
  leaves,
  currentMonth,
  selectedDate,
  onMonthChange,
  onOpenDayView,
  loading,
}: MonthViewProps) {
  const [drawerDate, setDrawerDate] = useState<string | null>(null);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, MonthViewEntry[]>();
    for (const entry of entries) {
      const existing = map.get(entry.log_date) ?? [];
      existing.push(entry);
      map.set(entry.log_date, existing);
    }
    return map;
  }, [entries]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidays) map.set(h.observed_date, h);
    return map;
  }, [holidays]);

  const leaveByDate = useMemo(() => {
    const map = new Map<string, LeaveEntry>();
    for (const l of leaves) map.set(l.leave_date, l);
    return map;
  }, [leaves]);

  const days = useMemo(() => {
    const result: Date[] = [];
    let day = startOfWeek(startOfMonth(currentMonth));
    const calEnd = endOfWeek(endOfMonth(currentMonth));
    while (day <= calEnd) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [currentMonth]);

  const isCurrentMonthNow =
    format(currentMonth, "yyyy-MM") === format(new Date(), "yyyy-MM");

  const drawerEntries = drawerDate ? (entriesByDate.get(drawerDate) ?? []) : [];
  const drawerLeave = drawerDate ? (leaveByDate.get(drawerDate) ?? null) : null;

  return (
    <TooltipProvider>
      <Card className="border-border/50">
        {/* Month navigation header */}
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onMonthChange(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-base font-semibold min-w-[140px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onMonthChange(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {!isCurrentMonthNow && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onMonthChange(startOfMonth(new Date()))}
              >
                Today
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border/50">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="min-h-[80px] rounded-none border-r border-b border-border/30 last:border-r-0" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEntries = entriesByDate.get(dateStr) ?? [];
                const totalHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);

                const seenIssues = new Set<number>();
                const uniqueIssueIds: number[] = [];
                for (const e of dayEntries) {
                  if (e.issue_id && !seenIssues.has(e.issue_id)) {
                    seenIssues.add(e.issue_id);
                    uniqueIssueIds.push(e.issue_id);
                  }
                }
                const visibleIssues = uniqueIssueIds.slice(0, 3);
                const overflowCount = uniqueIssueIds.length - visibleIssues.length;

                const hasFailed = dayEntries.some((e) => e.source === "failed");
                const hasDraft = !hasFailed && dayEntries.some((e) => e.source === "draft");

                const holiday = holidayByDate.get(dateStr);
                const leave = leaveByDate.get(dateStr);
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const weekend = isWeekend(day);
                const isSelected = dateStr === selectedDate;
                const isLastCol = (idx + 1) % 7 === 0;

                const cellClass = cn(
                  "min-h-[80px] p-1.5 border-b border-border/30 transition-colors relative flex flex-col gap-0.5",
                  !isLastCol && "border-r border-border/30",
                  weekend && "bg-muted/30",
                  holiday && "bg-red-500/5",
                  inCurrentMonth && totalHours >= 8 && "bg-green-500/10",
                  inCurrentMonth && totalHours > 0 && totalHours < 8 && "bg-yellow-500/[0.08]",
                  leave && inCurrentMonth && "bg-blue-500/10",
                  !inCurrentMonth && "opacity-40",
                  inCurrentMonth && "cursor-pointer hover:bg-accent/20",
                  isSelected && "ring-2 ring-inset ring-primary/60",
                  isToday && !isSelected && "ring-1 ring-inset ring-primary/30"
                );

                return (
                  <div
                    key={dateStr}
                    className={cellClass}
                    role={inCurrentMonth ? "button" : undefined}
                    tabIndex={inCurrentMonth ? 0 : -1}
                    onClick={() => inCurrentMonth && setDrawerDate(dateStr)}
                    onKeyDown={(e) => {
                      if (inCurrentMonth && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setDrawerDate(dateStr);
                      }
                    }}
                  >
                    {/* Date number + hours + status dots row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "text-xs font-medium h-5 w-5 shrink-0 flex items-center justify-center rounded-full",
                            isToday && "bg-primary text-primary-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {inCurrentMonth && totalHours > 0 && (
                          <>
                            <span className="text-[10px] text-muted-foreground/50 leading-none mr-1">-</span>
                            <span
                              className={cn(
                                "text-[10px] font-semibold tabular-nums leading-none",
                                totalHours >= 8 ? "text-green-400" : "text-yellow-400"
                              )}
                            >
                              {formatHours(totalHours)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {hasFailed && (
                          <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        )}
                        {hasDraft && (
                          <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                        )}
                      </div>
                    </div>

                    {/* Issue chips */}
                    {inCurrentMonth && visibleIssues.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {visibleIssues.map((id) => (
                          <span
                            key={id}
                            className="text-[9px] font-mono bg-muted/60 text-muted-foreground rounded px-1 leading-4"
                          >
                            #{id}
                          </span>
                        ))}
                        {overflowCount > 0 && (
                          <span className="text-[9px] text-muted-foreground leading-4">
                            +{overflowCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Holiday name */}
                    {holiday && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[9px] text-red-400 truncate leading-none mt-auto">
                            {holiday.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>{holiday.name}</p>
                          {holiday.original_date &&
                            holiday.original_date !== holiday.observed_date && (
                              <p className="text-muted-foreground">
                                Originally:{" "}
                                {format(
                                  new Date(holiday.original_date + "T00:00:00"),
                                  "MMM d"
                                )}
                              </p>
                            )}
                          {holiday.is_local && (
                            <p className="text-muted-foreground">Local holiday</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Leave indicator */}
                    {leave && inCurrentMonth && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            "text-[9px] truncate leading-none",
                            !holiday && "mt-auto",
                            leave.status === "pending" ? "text-blue-400/60" : "text-blue-400"
                          )}>
                            {LEAVE_TYPES[leave.leave_type].label}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <p>{LEAVE_TYPES[leave.leave_type].label}</p>
                          {leave.duration !== "whole" && (
                            <p className="text-muted-foreground">
                              {leave.duration === "half_am" ? "AM half-day" : "PM half-day"}
                            </p>
                          )}
                          {leave.status === "pending" && (
                            <p className="text-muted-foreground">Pending approval</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail drawer */}
      <Sheet open={!!drawerDate} onOpenChange={(open) => !open && setDrawerDate(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>
              {drawerDate
                ? format(new Date(drawerDate + "T00:00:00"), "EEEE, MMMM d, yyyy")
                : ""}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {drawerLeave && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    drawerLeave.status === "pending" ? "text-blue-400/70" : "text-blue-300"
                  )}>
                    {LEAVE_TYPES[drawerLeave.leave_type].label}
                    {drawerLeave.duration !== "whole" && (
                      <span className="ml-1 font-normal text-xs">
                        ({drawerLeave.duration === "half_am" ? "AM half-day" : "PM half-day"})
                      </span>
                    )}
                  </p>
                  {drawerLeave.status === "pending" && (
                    <p className="text-xs text-muted-foreground">Pending approval</p>
                  )}
                </div>
              </div>
            )}
            {drawerEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No entries logged for this day.
              </p>
            ) : (
              <div className="space-y-2">
                {drawerEntries.map((entry, idx) => (
                  <div
                    key={`${entry.log_date}-${entry.issue_id ?? "no-issue"}-${idx}`}
                    className="rounded-lg border border-border/50 bg-card p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">
                        {entry.issue_id ? `#${entry.issue_id}` : entry.project_name ?? "—"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatHours(entry.hours)}
                        </span>
                        <StatusBadge source={entry.source} />
                      </div>
                    </div>
                    {entry.project_name && (
                      <p className="text-xs text-muted-foreground">
                        {entry.project_name}
                      </p>
                    )}
                    {entry.activity_name && (
                      <p className="text-xs text-muted-foreground">
                        {entry.activity_name}
                      </p>
                    )}
                    {entry.comment && (
                      <p className="text-xs text-foreground/80 line-clamp-2">
                        {entry.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 pt-4 pb-2">
            <Button
              className="w-full"
              onClick={() => {
                if (drawerDate) {
                  onOpenDayView(drawerDate);
                  setDrawerDate(null);
                }
              }}
            >
              Open in Day View
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

function StatusBadge({ source }: { source: MonthViewEntry["source"] }) {
  if (source === "redmine") {
    return (
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-green-400 border-green-400/30">
        submitted
      </Badge>
    );
  }
  if (source === "failed") {
    return (
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-destructive border-destructive/30">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-yellow-400 border-yellow-400/30">
      draft
    </Badge>
  );
}
