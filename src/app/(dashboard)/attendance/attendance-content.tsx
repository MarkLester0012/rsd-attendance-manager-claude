"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  addWeeks,
  subWeeks,
  isToday,
  isSameDay,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Users,
  Monitor,
  Plane,
  Search,
  CalendarDays,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAVE_TYPES, NON_DEDUCTIBLE_TYPES } from "@/lib/constants/leave-types";
import { getInitials, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { User, LeaveEntry } from "@/lib/types";

type ViewMode = "day" | "week";

interface AttendanceContentProps {
  users: (User & { department?: { name: string } })[];
  initialLeaves: LeaveEntry[];
  initialDate: string;
  projects: any[];
}

export function AttendanceContent({
  users,
  initialLeaves,
  initialDate,
  projects,
}: AttendanceContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [currentDate, setCurrentDate] = useState(
    new Date(initialDate + "T00:00:00")
  );
  const [leaves, setLeaves] = useState(initialLeaves);

  // Week view state
  const [weekLeaves, setWeekLeaves] = useState<Record<string, LeaveEntry[]>>(
    {}
  );
  const [weekLoading, setWeekLoading] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupByDept, setGroupByDept] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(
    new Set()
  );

  // Get Mon-Fri of the current week
  const weekDays = useMemo(() => {
    const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  }, [currentDate]);

  // Fetch leaves for a single day
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

  // Fetch leaves for the entire week (Mon-Fri)
  const fetchWeekLeaves = useCallback(
    async (days: Date[]) => {
      setWeekLoading(true);
      const supabase = createClient();
      const startStr = format(days[0], "yyyy-MM-dd");
      const endStr = format(days[days.length - 1], "yyyy-MM-dd");

      const { data } = await supabase
        .from("leaves")
        .select("*")
        .gte("leave_date", startStr)
        .lte("leave_date", endStr)
        .eq("status", "approved");

      if (data) {
        const grouped: Record<string, LeaveEntry[]> = {};
        days.forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          grouped[key] = data.filter((l) => l.leave_date === key);
        });
        setWeekLeaves(grouped);
      }
      setWeekLoading(false);
    },
    []
  );

  // Load week data when switching to week view or navigating weeks
  useEffect(() => {
    if (viewMode === "week") {
      fetchWeekLeaves(weekDays);
    }
  }, [viewMode, weekDays, fetchWeekLeaves]);

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

  const prevWeek = () => {
    setCurrentDate((d) => subWeeks(d, 1));
  };

  const nextWeek = () => {
    setCurrentDate((d) => addWeeks(d, 1));
  };

  const getStatusForUser = useCallback(
    (userId: string) => {
      const leave = leaves.find((l) => l.user_id === userId);
      if (!leave)
        return { status: "In Office", color: "bg-emerald-500", type: null };
      const config = LEAVE_TYPES[leave.leave_type];
      return {
        status: config?.label || leave.leave_type,
        color: "",
        type: leave.leave_type,
        cssVar: config?.cssVar,
      };
    },
    [leaves]
  );

  const getStatusForUserOnDate = useCallback(
    (userId: string, dateStr: string) => {
      const dayLeaves = weekLeaves[dateStr] || [];
      const leave = dayLeaves.find((l) => l.user_id === userId);
      if (!leave) return { status: "In Office", type: null, cssVar: null };
      const config = LEAVE_TYPES[leave.leave_type];
      return {
        status: config?.label || leave.leave_type,
        type: leave.leave_type,
        cssVar: config?.cssVar || null,
      };
    },
    [weekLeaves]
  );

  // Derive unique departments from users
  const departmentOptions = useMemo(() => {
    const depts = new Set<string>();
    users.forEach((u) => {
      if (u.department?.name) depts.add(u.department.name);
    });
    return Array.from(depts).sort();
  }, [users]);

  // Unfiltered totals for summary counters (day view only)
  // NW and RGA are not real leaves — exclude from on-leave count
  const actualLeaves = leaves.filter((l) => !NON_DEDUCTIBLE_TYPES.includes(l.leave_type));
  const wfhCount = leaves.filter((l) => l.leave_type === "WFH").length;
  const onLeaveCount = actualLeaves.filter((l) => l.leave_type !== "WFH").length;
  const inOfficeCount = users.length - actualLeaves.length;

  // Filtered users — in day view, status filter uses day leaves; in week view, no status filter
  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = u.name
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesDept =
        deptFilter === "all" || u.department?.name === deptFilter;

      const matchesProject =
        projectFilter === "all" ||
        projects
          .find((p: any) => p.id === projectFilter)
          ?.project_members?.some((pm: any) => pm.user_id === u.id);

      // Status filter only applies in day view
      if (viewMode === "day" && statusFilter !== "all") {
        const userStatus = getStatusForUser(u.id);
        const isNonLeaveType = userStatus.type ? NON_DEDUCTIBLE_TYPES.includes(userStatus.type) && userStatus.type !== "WFH" : false;
        const matchesStatus =
          (statusFilter === "in-office" && (!userStatus.type || isNonLeaveType)) ||
          (statusFilter === "wfh" && userStatus.type === "WFH") ||
          (statusFilter === "on-leave" &&
            userStatus.type &&
            userStatus.type !== "WFH" &&
            !isNonLeaveType);
        if (!matchesStatus) return false;
      }

      return matchesSearch && matchesDept && matchesProject;
    });
  }, [
    users,
    search,
    deptFilter,
    projectFilter,
    statusFilter,
    viewMode,
    projects,
    getStatusForUser,
  ]);

  // Grouped by department
  const groupedUsers = useMemo(() => {
    const groups: Record<
      string,
      (User & { department?: { name: string } })[]
    > = {};
    filtered.forEach((u) => {
      const dept = u.department?.name || "No Department";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(u);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleDeptCollapse = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const getGroupCounts = (groupUsers: typeof users) => {
    const groupActualLeaves = leaves.filter(
      (l) => !NON_DEDUCTIBLE_TYPES.includes(l.leave_type) || l.leave_type === "WFH"
    );
    const inOffice = groupUsers.filter(
      (u) => !groupActualLeaves.find((l) => l.user_id === u.id)
    ).length;
    const wfh = groupUsers.filter((u) =>
      groupActualLeaves.find((l) => l.user_id === u.id && l.leave_type === "WFH")
    ).length;
    const onLeave = groupUsers.filter((u) =>
      groupActualLeaves.find((l) => l.user_id === u.id && l.leave_type !== "WFH")
    ).length;
    return { inOffice, wfh, onLeave };
  };

  function renderUserCard(u: (typeof users)[0]) {
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
  }

  function renderWeekStatusCell(userId: string, dateStr: string) {
    const { status, type, cssVar } = getStatusForUserOnDate(userId, dateStr);
    if (!type) {
      return (
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" title="In Office" />
      );
    }
    return (
      <Badge
        className="text-[9px] px-1.5 py-0"
        style={
          cssVar
            ? {
                backgroundColor: `hsl(var(${cssVar}) / 0.15)`,
                color: `hsl(var(${cssVar}))`,
                borderColor: "transparent",
              }
            : undefined
        }
        title={status}
      >
        {type}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      {/* View mode toggle + navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border p-1 self-start">
          <Button
            variant={viewMode === "day" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setViewMode("day")}
          >
            <Calendar className="h-3.5 w-3.5" />
            Day
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setViewMode("week")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Week
          </Button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={viewMode === "day" ? prevDay : prevWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="flex-1 min-w-0 text-sm sm:text-lg font-semibold text-center truncate">
            {viewMode === "day"
              ? format(currentDate, "EEEE, MMMM d, yyyy")
              : `${format(weekDays[0], "MMM d")} \u2013 ${format(weekDays[4], "MMM d, yyyy")}`}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={viewMode === "day" ? nextDay : nextWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Spacer to balance layout on desktop */}
        <div className="hidden sm:block w-[120px]" />
      </div>

      {/* Summary counters — day view only */}
      {viewMode === "day" && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
              <div className="rounded-lg bg-emerald-500/10 p-1.5 sm:p-2">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{inOfficeCount}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">In Office</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
              <div className="rounded-lg bg-blue-500/10 p-1.5 sm:p-2">
                <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{wfhCount}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  WFH
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
              <div className="rounded-lg bg-orange-500/10 p-1.5 sm:p-2">
                <Plane className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold">{onLeaveCount}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">On Leave</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[160px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {viewMode === "day" && (
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in-office">In Office</SelectItem>
                <SelectItem value="wfh">WFH</SelectItem>
                <SelectItem value="on-leave">On Leave</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="group-dept"
                checked={groupByDept}
                onCheckedChange={setGroupByDept}
              />
              <Label htmlFor="group-dept" className="text-sm cursor-pointer">
                Group by Dept
              </Label>
            </div>
          </>
        )}
      </div>

      {/* Day view content */}
      {viewMode === "day" && (
        <>
          {!groupByDept ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(renderUserCard)}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedUsers.map(([dept, groupUsers]) => {
                const counts = getGroupCounts(groupUsers);
                const isCollapsed = collapsedDepts.has(dept);
                return (
                  <div key={dept}>
                    <button
                      onClick={() => toggleDeptCollapse(dept)}
                      className="flex items-center gap-2 w-full text-left mb-3 group"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isCollapsed && "-rotate-90"
                        )}
                      />
                      <h3 className="text-sm font-semibold">{dept}</h3>
                      <span className="text-xs text-muted-foreground">
                        {counts.inOffice} in office
                        {counts.wfh > 0 && `, ${counts.wfh} WFH`}
                        {counts.onLeave > 0 && `, ${counts.onLeave} on leave`}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {groupUsers.map(renderUserCard)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Week view content */}
      {viewMode === "week" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-3 text-left font-medium text-muted-foreground sticky left-0 bg-card min-w-[200px]">
                    Team Member
                  </th>
                  {weekDays.map((day) => {
                    const today = isToday(day);
                    return (
                      <th
                        key={day.toISOString()}
                        className={cn(
                          "p-3 text-center font-medium min-w-[100px]",
                          today
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      >
                        <div>{format(day, "EEE")}</div>
                        <div
                          className={cn(
                            "text-xs mt-0.5",
                            today && "font-bold"
                          )}
                        >
                          {format(day, "MMM d")}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {weekLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Loading week data...
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="p-3 sticky left-0 bg-card">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-[10px] font-bold text-white">
                            {getInitials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {u.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {u.department?.name || "No Dept"}
                            </p>
                          </div>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const today = isToday(day);
                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "p-3 text-center",
                              today && "bg-primary/5"
                            )}
                          >
                            {renderWeekStatusCell(u.id, dateStr)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          No team members match the current filters.
        </p>
      )}
    </div>
  );
}
