"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAVE_TYPES, LEAVE_TYPE_LIST } from "@/lib/constants/leave-types";
import { cn } from "@/lib/utils";
import type { User, LeaveEntry, LeaveStatus } from "@/lib/types";
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
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedLeave, setSelectedLeave] = useState<LeaveEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filtered = leaves.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (typeFilter !== "all" && l.leave_type !== typeFilter) return false;
    if (dateFrom && l.leave_date < dateFrom) return false;
    if (dateTo && l.leave_date > dateTo) return false;
    return true;
  });

  // Pie chart data
  const statusCounts = leaves.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = [
    { name: "Approved", value: statusCounts.approved || 0, color: "hsl(142, 71%, 45%)" },
    { name: "Pending", value: statusCounts.pending || 0, color: "hsl(45, 93%, 47%)" },
    { name: "Rejected", value: statusCounts.rejected || 0, color: "hsl(0, 84%, 60%)" },
  ].filter((d) => d.value > 0);

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
    if (leave.status === "pending" || (leave.status === "approved" && new Date(leave.leave_date) >= new Date())) {
      setSelectedLeave(leave);
      setIsModalOpen(true);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters + Chart */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Leave Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {LEAVE_TYPE_LIST.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
                className="w-[160px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
                className="w-[160px]"
              />

              {(statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setTypeFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No leave data
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leave List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Leave History ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No leaves found
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((leave) => {
                const config = LEAVE_TYPES[leave.leave_type];
                const isEditable =
                  leave.status === "pending" ||
                  (leave.status === "approved" &&
                    new Date(leave.leave_date) >= new Date());

                return (
                  <div
                    key={leave.id}
                    onClick={() => handleLeaveClick(leave)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border/50 p-3 transition-all",
                      isEditable && "cursor-pointer hover:bg-accent/30 hover:border-border"
                    )}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: config
                          ? `hsl(var(${config.cssVar}))`
                          : undefined,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {format(new Date(leave.leave_date), "MMM d, yyyy")}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                          style={{
                            backgroundColor: config
                              ? `hsl(var(${config.cssVar}) / 0.15)`
                              : undefined,
                            color: config
                              ? `hsl(var(${config.cssVar}))`
                              : undefined,
                          }}
                        >
                          {config?.label || leave.leave_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {leave.duration_value === 1 ? "Full day" : "Half day"}
                        </span>
                      </div>
                      {leave.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {leave.reason}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] shrink-0",
                        leave.status === "approved" &&
                          "border-status-approved/30 text-status-approved",
                        leave.status === "pending" &&
                          "border-status-pending/30 text-status-pending",
                        leave.status === "rejected" &&
                          "border-status-rejected/30 text-status-rejected"
                      )}
                    >
                      {leave.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:block">
                      {format(new Date(leave.created_at), "MMM d")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
