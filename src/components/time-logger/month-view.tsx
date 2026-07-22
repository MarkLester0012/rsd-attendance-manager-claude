"use client";

import { useMemo, useState, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { cn, redmineIssueUrl } from "@/lib/utils";
import type { Holiday, LeaveEntry } from "@/lib/types";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { useIsMobile } from "@/hooks/use-is-mobile";

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
  redmineUrl?: string | null;
  projectColorMap?: Record<string, string>;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  redmineUrl,
  projectColorMap = {},
}: MonthViewProps) {
  const isMobile = useIsMobile();
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(currentMonth.getFullYear());

  useEffect(() => {
    setPickerYear(currentMonth.getFullYear());
  }, [currentMonth]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, MonthViewEntry[]>();
    for (const entry of entries) {
      const existing = map.get(entry.log_date) ?? [];
      existing.push(entry);
      map.set(entry.log_date, existing);
    }
    return map;
  }, [entries]);

  // Map issue_id → project color by matching first 4 chars of project_name to redmine_code
  const issueColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of entries) {
      if (entry.issue_id && entry.project_name && !map.has(entry.issue_id)) {
        const code = entry.project_name.slice(0, 4).toUpperCase();
        const color = projectColorMap[code];
        if (color) map.set(entry.issue_id, color);
      }
    }
    return map;
  }, [entries, projectColorMap]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidays) map.set(h.observed_date, h);
    return map;
  }, [holidays]);

  const leaveByDate = useMemo(() => {
    const map = new Map<string, LeaveEntry[]>();
    for (const l of leaves) {
      const existing = map.get(l.leave_date);
      if (existing) existing.push(l);
      else map.set(l.leave_date, [l]);
    }
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
  const drawerLeaves = drawerDate ? (leaveByDate.get(drawerDate) ?? []) : [];

  return (
    <TooltipProvider>
      <Card className="border-border/50">
        {/* Month navigation header */}
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onMonthChange(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[160px] gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span>{format(currentMonth, "MMMM yyyy")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="center">
                  <div className="flex items-center justify-between mb-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPickerYear((y) => y - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold">{pickerYear}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPickerYear((y) => y + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {MONTHS.map((name, idx) => {
                      const isSelected =
                        pickerYear === currentMonth.getFullYear() &&
                        idx === currentMonth.getMonth();
                      return (
                        <Button
                          key={name}
                          variant={isSelected ? "default" : "ghost"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            onMonthChange(startOfMonth(new Date(pickerYear, idx, 1)));
                            setPickerOpen(false);
                          }}
                        >
                          {name}
                        </Button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
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
                const leaves = leaveByDate.get(dateStr) ?? [];
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const weekend = isWeekend(day);
                const isSelected = dateStr === selectedDate;
                const isLastCol = (idx + 1) % 7 === 0;

                const cellClass = cn(
                  "min-h-[56px] p-1 sm:min-h-[80px] sm:p-1.5 border-b border-border/30 transition-colors relative flex flex-col gap-0.5",
                  !isLastCol && "border-r border-border/30",
                  weekend && "bg-muted/30",
                  holiday && "bg-red-500/5",
                  inCurrentMonth && totalHours >= 8 && "bg-green-500/10",
                  inCurrentMonth && totalHours > 0 && totalHours < 8 && "bg-yellow-500/[0.08]",
                  leaves.length > 0 && inCurrentMonth && "bg-blue-500/10",
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
                            "text-[10px] sm:text-xs font-medium h-5 w-5 shrink-0 flex items-center justify-center rounded-full",
                            isToday && "bg-primary text-primary-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {inCurrentMonth && totalHours > 0 && (
                          <>
                            <span className="hidden sm:inline text-[10px] text-muted-foreground/50 leading-none mr-1">-</span>
                            <span
                              className={cn(
                                "text-[10px] font-semibold tabular-nums leading-none",
                                totalHours >= 8 ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"
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
                      <div className="hidden sm:flex flex-wrap gap-0.5">
                        {visibleIssues.map((id) => {
                          const url = redmineIssueUrl(redmineUrl, id);
                          const chipColor = issueColorMap.get(id);
                          const chipStyle = chipColor
                            ? { backgroundColor: `${chipColor}20`, color: chipColor, borderColor: `${chipColor}40` }
                            : undefined;
                          const chipClass = chipColor
                            ? "text-[9px] font-mono rounded px-1 leading-4 border"
                            : "text-[9px] font-mono bg-muted/60 text-muted-foreground rounded px-1 leading-4";
                          return url ? (
                            <a
                              key={id}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={cn(chipClass, "hover:underline")}
                              style={chipStyle}
                            >
                              #{id}
                            </a>
                          ) : (
                            <span
                              key={id}
                              className={chipClass}
                              style={chipStyle}
                            >
                              #{id}
                            </span>
                          );
                        })}
                        {overflowCount > 0 && (
                          <span className="text-[9px] text-muted-foreground leading-4">
                            +{overflowCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Issue dots — mobile */}
                    {inCurrentMonth && visibleIssues.length > 0 && (
                      <div className="flex sm:hidden flex-wrap items-center gap-0.5">
                        {visibleIssues.map((id) => {
                          const dotColor = issueColorMap.get(id);
                          return (
                            <div
                              key={id}
                              className={cn(
                                "h-2 w-2 rounded-full",
                                !dotColor && "bg-muted-foreground/40"
                              )}
                              style={dotColor ? { backgroundColor: dotColor } : undefined}
                            />
                          );
                        })}
                        {overflowCount > 0 && (
                          <span className="text-[9px] text-muted-foreground leading-none">
                            +{overflowCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Holiday name */}
                    {holiday && (
                      <>
                      <span className="sm:hidden text-[10px] leading-none mt-auto">🎉</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="hidden sm:inline text-[9px] text-red-600 dark:text-red-400 truncate leading-none mt-auto">
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
                      </>
                    )}

                    {/* Leave indicator */}
                    {leaves.length > 0 && inCurrentMonth && (
                      <>
                      <div className={cn(
                        "sm:hidden flex flex-wrap items-center gap-1",
                        !holiday && "mt-auto"
                      )}>
                        {leaves.map((l) => (
                          <div
                            key={l.id}
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: `hsl(var(${LEAVE_TYPES[l.leave_type].cssVar}))` }}
                          />
                        ))}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn(
                            "hidden sm:inline text-[9px] truncate leading-none",
                            !holiday && "mt-auto",
                            leaves.every((l) => l.status === "pending") ? "text-blue-600/70 dark:text-blue-400/60" : "text-blue-600 dark:text-blue-400"
                          )}>
                            {leaves.map((l) => LEAVE_TYPES[l.leave_type].label).join(" / ")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs space-y-1">
                          {leaves.map((l) => (
                            <div key={l.id}>
                              <p>{LEAVE_TYPES[l.leave_type].label}</p>
                              {l.duration !== "whole" && (
                                <p className="text-muted-foreground">
                                  {l.duration === "half_am" ? "AM half-day" : "PM half-day"}
                                </p>
                              )}
                              {l.status === "pending" && (
                                <p className="text-muted-foreground">Pending approval</p>
                              )}
                            </div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                      </>
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
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            isMobile
              ? "rounded-t-2xl max-h-[80vh] flex flex-col"
              : "w-full sm:max-w-md flex flex-col"
          )}
        >
          <SheetHeader>
            <SheetTitle>
              {drawerDate
                ? format(new Date(drawerDate + "T00:00:00"), "EEEE, MMMM d, yyyy")
                : ""}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {drawerLeaves.map((drawerLeave) => (
              <div key={drawerLeave.id} className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    drawerLeave.status === "pending" ? "text-blue-600/70 dark:text-blue-400/70" : "text-blue-700 dark:text-blue-300"
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
            ))}
            {drawerEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No entries logged for this day.
              </p>
            ) : (
              <div className="space-y-2">
                {drawerEntries.map((entry, idx) => {
                  const issueUrl = entry.issue_id ? redmineIssueUrl(redmineUrl, entry.issue_id) : null;
                  const drawerChipColor = entry.issue_id ? issueColorMap.get(entry.issue_id) : undefined;
                  return (
                  <div
                    key={`${entry.log_date}-${entry.issue_id ?? "no-issue"}-${idx}`}
                    onClick={() => issueUrl && window.open(issueUrl, "_blank", "noopener,noreferrer")}
                    className={cn(
                      "rounded-lg border border-border/50 bg-card p-3 space-y-1 transition-colors",
                      issueUrl && "cursor-pointer hover:border-border hover:bg-accent/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {entry.issue_id ? (
                        <span
                          className={cn(
                            "font-mono text-sm font-medium rounded px-1.5 py-0.5",
                            drawerChipColor ? "border" : "bg-muted/60"
                          )}
                          style={drawerChipColor ? {
                            backgroundColor: `${drawerChipColor}20`,
                            color: drawerChipColor,
                            borderColor: `${drawerChipColor}40`,
                          } : undefined}
                        >
                          #{entry.issue_id}
                        </span>
                      ) : (
                        <span className="font-mono text-sm font-medium">
                          {entry.project_name ?? "—"}
                        </span>
                      )}
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
                ); })}
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
      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-green-600 dark:text-green-400 border-green-600/30 dark:border-green-400/30">
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
    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-yellow-600 dark:text-yellow-400 border-yellow-600/30 dark:border-yellow-400/30">
      draft
    </Badge>
  );
}
