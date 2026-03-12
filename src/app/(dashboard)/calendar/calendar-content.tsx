"use client";

import { useState, useCallback, useEffect } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isWeekend,
  getDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { cn } from "@/lib/utils";
import type { User, LeaveEntry, Holiday } from "@/lib/types";
import { LeaveModal } from "@/components/leaves/leave-modal";
import { createClient } from "@/lib/supabase/client";

interface CalendarContentProps {
  user: User;
  initialLeaves: LeaveEntry[];
  holidays: Holiday[];
}

export function CalendarContent({
  user,
  initialLeaves,
  holidays,
}: CalendarContentProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaves, setLeaves] = useState(initialLeaves);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  // Build calendar days
  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const getLeaveForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return leaves.find((l) => l.leave_date === dateStr);
  };

  const getHolidayForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return allHolidays.find((h) => h.observed_date === dateStr);
  };

  const handleDayClick = (date: Date) => {
    if (!isSameMonth(date, currentMonth)) return;

    const holiday = getHolidayForDate(date);
    if (isWeekend(date) || holiday) return;

    const existingLeave = getLeaveForDate(date);
    if (existingLeave) {
      setSelectedLeave(existingLeave);
      setSelectedDate(date);
    } else {
      setSelectedLeave(null);
      setSelectedDate(date);
    }
    setIsModalOpen(true);
  };

  const [allHolidays, setAllHolidays] = useState(holidays);

  const fetchMonthData = useCallback(async () => {
    const supabase = createClient();
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const [leavesRes, holidaysRes] = await Promise.all([
      supabase
        .from("leaves")
        .select("*")
        .eq("user_id", user.id)
        .gte("leave_date", start)
        .lte("leave_date", end)
        .in("status", ["approved", "pending"]),
      supabase
        .from("holidays")
        .select("*")
        .gte("observed_date", start)
        .lte("observed_date", end),
    ]);

    if (leavesRes.data) setLeaves(leavesRes.data);
    if (holidaysRes.data) setAllHolidays(holidaysRes.data);
  }, [currentMonth, user.id]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Calendar stats
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const wfhCount = leaves.filter(
    (l) => l.leave_type === "WFH" && l.status === "approved"
  ).length;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Calendar Grid */}
      <div className="flex-1">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <TooltipProvider>
              <div className="grid grid-cols-7 gap-px bg-border/30 rounded-lg overflow-hidden">
                {days.map((day, i) => {
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());
                  const weekend = isWeekend(day);
                  const leave = getLeaveForDate(day);
                  const holiday = getHolidayForDate(day);
                  const leaveConfig = leave
                    ? LEAVE_TYPES[leave.leave_type]
                    : null;

                  return (
                    <div
                      key={i}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "min-h-[80px] p-1.5 bg-background transition-colors",
                        isCurrentMonth
                          ? "cursor-pointer hover:bg-accent/30"
                          : "opacity-30 cursor-default",
                        weekend && "bg-muted/30",
                        holiday && "bg-red-500/5",
                        isToday && "ring-1 ring-inset ring-primary/30"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isToday &&
                            "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                            weekend && "text-muted-foreground/50"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                      </div>

                      {/* Holiday marker */}
                      {holiday && isCurrentMonth && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="mt-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px]">🎉</span>
                                <span className="text-[10px] text-red-400 truncate">
                                  {holiday.name}
                                </span>
                              </div>
                              {holiday.original_date && holiday.original_date !== holiday.observed_date && (
                                <div className="text-[9px] text-muted-foreground/70 mt-0.5 pl-[18px] truncate">
                                  Originally: {format(parseISO(holiday.original_date), "MMM d, yyyy")}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div>
                              <p>{holiday.name}</p>
                              {holiday.original_date && holiday.original_date !== holiday.observed_date && (
                                <p className="text-xs text-muted-foreground">
                                  Originally: {format(parseISO(holiday.original_date), "MMM d, yyyy")}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Leave marker */}
                      {leave && isCurrentMonth && (
                        <div className="mt-1 flex items-center gap-1">
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: leaveConfig
                                ? `hsl(var(${leaveConfig.cssVar}))`
                                : undefined,
                            }}
                          />
                          <span
                            className="text-[10px] font-medium truncate"
                            style={{
                              color: leaveConfig
                                ? `hsl(var(${leaveConfig.cssVar}))`
                                : undefined,
                            }}
                          >
                            {leave.leave_type}
                          </span>
                          {leave.status === "pending" && (
                            <Clock className="h-2.5 w-2.5 text-status-pending shrink-0" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-72 space-y-4">
        {/* Monthly Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Monthly Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Leaves</span>
              <span className="font-medium">{leaves.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Approved</span>
              <span className="font-medium text-status-approved">
                {approvedCount}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pending</span>
              <span className="font-medium text-status-pending">
                {pendingCount}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">WFH Days</span>
              <span className="font-medium text-leave-wfh">{wfhCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* Color Legend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Legend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.values(LEAVE_TYPES).map((type) => (
              <div key={type.code} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: `hsl(var(${type.cssVar}))`,
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {type.code} - {type.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tip */}
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Click any weekday to apply for leave. Click an existing leave
                marker to edit it.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leave Modal */}
      <LeaveModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        user={user}
        date={selectedDate}
        existingLeave={selectedLeave}
        onSuccess={fetchMonthData}
      />
    </div>
  );
}
