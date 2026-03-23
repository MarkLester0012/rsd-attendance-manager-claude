"use client";

import { useState, useMemo } from "react";
import { format, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2,
  Clock,
  XCircle,
  ListFilter,
  FileText,
  ArrowUpDown,
  X,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LIST,
  NON_DEDUCTIBLE_TYPES,
} from "@/lib/constants/leave-types";
import { cn } from "@/lib/utils";
import type { User, LeaveEntry, LeaveTypeCode } from "@/lib/types";
import { LeaveModal } from "@/components/leaves/leave-modal";
import { createClient } from "@/lib/supabase/client";

interface MyLeavesContentProps {
  user: User;
  initialLeaves: LeaveEntry[];
}

export function MyLeavesContent({ user, initialLeaves }: MyLeavesContentProps) {
  const [leaves, setLeaves] = useState(initialLeaves);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedLeave, setSelectedLeave] = useState<LeaveEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: leaves.length, approved: 0, pending: 0, rejected: 0 };
    leaves.forEach((l) => {
      counts[l.status as keyof typeof counts]++;
    });
    return counts;
  }, [leaves]);

  // Type counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    leaves.forEach((l) => {
      counts[l.leave_type] = (counts[l.leave_type] || 0) + 1;
    });
    return counts;
  }, [leaves]);

  // Total days used (deductible only)
  const totalDaysUsed = useMemo(() => {
    return leaves
      .filter(
        (l) =>
          l.status === "approved" &&
          !NON_DEDUCTIBLE_TYPES.includes(l.leave_type)
      )
      .reduce((sum, l) => sum + l.duration_value, 0);
  }, [leaves]);

  const filtered = useMemo(() => {
    const result = leaves.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (typeFilter !== "all" && l.leave_type !== typeFilter) return false;
      if (dateFrom && l.leave_date < format(dateFrom, "yyyy-MM-dd"))
        return false;
      if (dateTo && l.leave_date > format(dateTo, "yyyy-MM-dd")) return false;
      return true;
    });
    return result.sort((a, b) =>
      sortOrder === "desc"
        ? b.leave_date.localeCompare(a.leave_date)
        : a.leave_date.localeCompare(b.leave_date)
    );
  }, [leaves, statusFilter, typeFilter, dateFrom, dateTo, sortOrder]);

  // Total filtered days
  const filteredDays = useMemo(() => {
    return filtered.reduce((sum, l) => sum + l.duration_value, 0);
  }, [filtered]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    dateFrom !== undefined ||
    dateTo !== undefined;

  async function fetchLeaves() {
    const supabase = createClient();
    const { data } = await supabase
      .from("leaves")
      .select("*")
      .eq("user_id", user.id)
      .order("leave_date", { ascending: false });
    if (data) setLeaves(data);
  }

  function handleLeaveClick(leave: LeaveEntry) {
    if (
      leave.status === "pending" ||
      (leave.status === "approved" &&
        new Date(leave.leave_date) >= new Date())
    ) {
      setSelectedLeave(leave);
      setIsModalOpen(true);
    }
  }

  function clearFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  const statusConfig = [
    {
      key: "all",
      label: "Total",
      count: statusCounts.all,
      icon: FileText,
      color: "text-foreground",
      bgActive: "bg-foreground/10 border-foreground/20",
    },
    {
      key: "approved",
      label: "Approved",
      count: statusCounts.approved,
      icon: CheckCircle2,
      color: "text-status-approved",
      bgActive: "bg-status-approved/10 border-status-approved/30",
    },
    {
      key: "pending",
      label: "Pending",
      count: statusCounts.pending,
      icon: Clock,
      color: "text-status-pending",
      bgActive: "bg-status-pending/10 border-status-pending/30",
    },
    {
      key: "rejected",
      label: "Rejected",
      count: statusCounts.rejected,
      icon: XCircle,
      color: "text-status-rejected",
      bgActive: "bg-status-rejected/10 border-status-rejected/30",
    },
  ];

  // Group leaves by month for the list
  const groupedByMonth = useMemo(() => {
    const groups: Record<string, LeaveEntry[]> = {};
    filtered.forEach((l) => {
      const key = format(parseISO(l.leave_date), "MMMM yyyy");
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    });
    return Object.entries(groups);
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Balance Summary Bar */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-primary/20">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Leave Balance</p>
              <p className="text-2xl font-bold tabular-nums">
                {user.leave_balance - totalDaysUsed}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  / {user.leave_balance}
                </span>
              </p>
            </div>
            <Separator orientation="vertical" className="h-10 hidden sm:block" />
            <div>
              <p className="text-xs text-muted-foreground">Days Used</p>
              <p className="text-2xl font-bold tabular-nums">{totalDaysUsed}</p>
            </div>
            <Separator orientation="vertical" className="h-10 hidden sm:block" />
            <div>
              <p className="text-xs text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold tabular-nums">{leaves.length}</p>
            </div>
            <Separator orientation="vertical" className="h-10 hidden sm:block" />
            <div className="flex-1 min-w-[120px]">
              <p className="text-xs text-muted-foreground mb-1.5">Balance Used</p>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min((totalDaysUsed / user.leave_balance) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {((totalDaysUsed / user.leave_balance) * 100).toFixed(0)}% used
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Filter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statusConfig.map((s) => {
          const Icon = s.icon;
          const isActive = statusFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() =>
                setStatusFilter(isActive ? "all" : s.key)
              }
              className={cn(
                "relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md",
                isActive
                  ? s.bgActive
                  : "border-border/50 hover:border-border hover:bg-accent/30"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                  isActive ? "bg-background/80" : "bg-muted"
                )}
              >
                <Icon className={cn("h-5 w-5", s.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none">
                  {s.count}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.label}
                </p>
              </div>
              {isActive && s.key !== "all" && (
                <div className="absolute top-2 right-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Leave Type Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ListFilter className="h-4 w-4 text-muted-foreground" />
              By Type
            </CardTitle>
            {typeFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setTypeFilter("all")}
              >
                Clear
                <X className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {LEAVE_TYPE_LIST.map((type) => {
              const count = typeCounts[type.code] || 0;
              const isActive = typeFilter === type.code;
              return (
                <button
                  key={type.code}
                  onClick={() =>
                    setTypeFilter(isActive ? "all" : type.code)
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all",
                    isActive
                      ? "border-current shadow-sm"
                      : "border-border/50 hover:border-border hover:bg-accent/30",
                    count === 0 && !isActive && "opacity-40"
                  )}
                  style={
                    isActive
                      ? {
                          backgroundColor: `hsl(var(${type.cssVar}) / 0.1)`,
                          borderColor: `hsl(var(${type.cssVar}) / 0.4)`,
                          color: `hsl(var(${type.cssVar}))`,
                        }
                      : undefined
                  }
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: `hsl(var(${type.cssVar}))`,
                    }}
                  />
                  <span className="font-medium">{type.code}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums rounded-full px-1.5 py-0.5 min-w-[20px] text-center",
                      isActive
                        ? "bg-background/60"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Date Range + Sort Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-2 text-sm",
                dateFrom && "border-primary/40 text-primary"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground text-sm">to</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-2 text-sm",
                dateTo && "border-primary/40 text-primary"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === "desc" ? "Newest first" : "Oldest first"}
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs ml-auto"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear all filters
          </Button>
        )}
      </div>

      {/* Results Summary */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing <span className="font-medium text-foreground">{filtered.length}</span> entries
            {filteredDays > 0 && (
              <>
                {" "}({filteredDays % 1 === 0 ? filteredDays : filteredDays.toFixed(1)} day
                {filteredDays !== 1 ? "s" : ""})
              </>
            )}
          </span>
        </div>
      )}

      {/* Leave History - Grouped by Month */}
      {groupedByMonth.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No leaves found</p>
            {hasActiveFilters && (
              <Button
                variant="link"
                size="sm"
                className="mt-2"
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByMonth.map(([monthLabel, monthLeaves]) => (
            <div key={monthLabel}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {monthLabel}
                </h3>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {monthLeaves.reduce((s, l) => s + l.duration_value, 0)} day
                  {monthLeaves.reduce((s, l) => s + l.duration_value, 0) !== 1
                    ? "s"
                    : ""}
                </span>
              </div>
              <div className="space-y-2">
                {monthLeaves.map((leave) => {
                  const config = LEAVE_TYPES[leave.leave_type];
                  const isEditable =
                    leave.status === "pending" ||
                    (leave.status === "approved" &&
                      !isBefore(
                        startOfDay(parseISO(leave.leave_date)),
                        startOfDay(new Date())
                      ));
                  const isPast = isBefore(
                    parseISO(leave.leave_date),
                    startOfDay(new Date())
                  );
                  const dayOfWeek = format(
                    parseISO(leave.leave_date),
                    "EEE"
                  );

                  return (
                    <div
                      key={leave.id}
                      onClick={() => handleLeaveClick(leave)}
                      className={cn(
                        "group flex items-center gap-4 rounded-xl border p-4 transition-all",
                        isEditable
                          ? "cursor-pointer hover:shadow-md hover:border-border hover:bg-accent/20"
                          : "",
                        isPast && "opacity-70",
                        leave.status === "rejected" && "opacity-50"
                      )}
                    >
                      {/* Date block */}
                      <div
                        className="flex flex-col items-center justify-center rounded-lg h-14 w-14 shrink-0"
                        style={{
                          backgroundColor: config
                            ? `hsl(var(${config.cssVar}) / 0.1)`
                            : "hsl(var(--muted))",
                        }}
                      >
                        <span
                          className="text-[10px] font-medium leading-none"
                          style={{
                            color: config
                              ? `hsl(var(${config.cssVar}))`
                              : undefined,
                          }}
                        >
                          {dayOfWeek}
                        </span>
                        <span
                          className="text-lg font-bold leading-tight"
                          style={{
                            color: config
                              ? `hsl(var(${config.cssVar}))`
                              : undefined,
                          }}
                        >
                          {format(parseISO(leave.leave_date), "d")}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {config?.label || leave.leave_type}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] font-normal"
                            style={{
                              backgroundColor: config
                                ? `hsl(var(${config.cssVar}) / 0.12)`
                                : undefined,
                              color: config
                                ? `hsl(var(${config.cssVar}))`
                                : undefined,
                            }}
                          >
                            {leave.duration === "whole"
                              ? "Full day"
                              : leave.duration === "half_am"
                                ? "AM"
                                : "PM"}
                          </Badge>
                          {!config?.deductsBalance && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal border-border/50 text-muted-foreground"
                            >
                              No deduction
                            </Badge>
                          )}
                        </div>
                        {leave.reason && (
                          <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                            {leave.reason}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          Applied {format(parseISO(leave.created_at), "MMM d, yyyy")}
                          {leave.reviewed_at && (
                            <> &middot; Reviewed {format(parseISO(leave.reviewed_at), "MMM d, yyyy")}</>
                          )}
                        </p>
                      </div>

                      {/* Status + Edit */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            leave.status === "approved" &&
                              "border-status-approved/30 text-status-approved bg-status-approved/5",
                            leave.status === "pending" &&
                              "border-status-pending/30 text-status-pending bg-status-pending/5",
                            leave.status === "rejected" &&
                              "border-status-rejected/30 text-status-rejected bg-status-rejected/5"
                          )}
                        >
                          {leave.status === "approved" && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {leave.status === "pending" && (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {leave.status === "rejected" && (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {leave.status}
                        </Badge>
                        {isEditable && (
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <LeaveModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        user={user}
        date={selectedLeave ? new Date(selectedLeave.leave_date) : null}
        existingLeave={selectedLeave}
        onSuccess={fetchLeaves}
      />
    </div>
  );
}
