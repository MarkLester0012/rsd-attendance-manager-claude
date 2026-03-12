"use client";

import { useState, useCallback } from "react";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Monitor, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { User, LeaveEntry } from "@/lib/types";

interface AttendanceContentProps {
  users: (User & { department?: { name: string } })[];
  initialLeaves: LeaveEntry[];
  initialDate: string;
}

export function AttendanceContent({
  users,
  initialLeaves,
  initialDate,
}: AttendanceContentProps) {
  const [currentDate, setCurrentDate] = useState(new Date(initialDate + "T00:00:00"));
  const [leaves, setLeaves] = useState(initialLeaves);

  const prevDay = async () => {
    const newDate = subDays(currentDate, 1);
    setCurrentDate(newDate);
    await fetchLeaves(newDate);
  };

  const nextDay = async () => {
    const newDate = addDays(currentDate, 1);
    setCurrentDate(newDate);
    await fetchLeaves(newDate);
  };

  const fetchLeaves = useCallback(async (date: Date) => {
    const supabase = createClient();
    const dateStr = format(date, "yyyy-MM-dd");

    const { data } = await supabase
      .from("leaves")
      .select("*")
      .eq("leave_date", dateStr)
      .eq("status", "approved");

    if (data) setLeaves(data);
  }, []);

  const getStatusForUser = (userId: string) => {
    const leave = leaves.find((l) => l.user_id === userId);
    if (!leave) return { status: "In Office", color: "bg-emerald-500", type: null };
    const config = LEAVE_TYPES[leave.leave_type];
    return {
      status: config?.label || leave.leave_type,
      color: "",
      type: leave.leave_type,
      cssVar: config?.cssVar,
    };
  };

  const wfhCount = leaves.filter((l) => l.leave_type === "WFH").length;
  const onLeaveCount = leaves.filter((l) => l.leave_type !== "WFH").length;
  const inOfficeCount = users.length - leaves.length;

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={prevDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[200px] text-center">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
        </h2>
        <Button variant="outline" size="icon" onClick={nextDay}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{inOfficeCount}</p>
              <p className="text-xs text-muted-foreground">In Office</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Monitor className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{wfhCount}</p>
              <p className="text-xs text-muted-foreground">Working Remotely</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <Plane className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onLeaveCount}</p>
              <p className="text-xs text-muted-foreground">On Leave</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {users.map((u) => {
          const { status, type, cssVar } = getStatusForUser(u.id);
          const isInOffice = !type;

          return (
            <Card key={u.id} className="transition-all hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-xs font-bold text-white">
                  {getInitials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.department?.name || "No Department"}
                  </p>
                </div>
                <Badge
                  className="shrink-0 text-[10px]"
                  style={
                    !isInOffice && cssVar
                      ? {
                          backgroundColor: `hsl(var(${cssVar}) / 0.15)`,
                          color: `hsl(var(${cssVar}))`,
                          borderColor: "transparent",
                        }
                      : isInOffice
                        ? {
                            backgroundColor: "hsl(var(--status-approved) / 0.15)",
                            color: "hsl(var(--status-approved))",
                            borderColor: "transparent",
                          }
                        : undefined
                  }
                >
                  {status}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
