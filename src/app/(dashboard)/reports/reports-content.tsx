"use client";

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAVE_TYPES, LEAVE_TYPE_LIST } from "@/lib/constants/leave-types";
import type { Department } from "@/lib/types";

interface ReportsContentProps {
  leaves: any[];
  departments: Department[];
}

export function ReportsContent({ leaves, departments }: ReportsContentProps) {
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = leaves.filter((l: any) => {
    if (deptFilter !== "all" && l.user?.department_id !== deptFilter) return false;
    if (typeFilter !== "all" && l.leave_type !== typeFilter) return false;
    return true;
  });

  // By department
  const byDepartment = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((l: any) => {
      const dept = l.user?.department?.name || "Unknown";
      map[dept] = (map[dept] || 0) + l.duration_value;
    });
    return Object.entries(map).map(([name, days]) => ({ name, days }));
  }, [filtered]);

  // By leave type
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((l: any) => {
      const config = LEAVE_TYPES[l.leave_type as keyof typeof LEAVE_TYPES];
      const label = config?.label || l.leave_type;
      map[label] = (map[label] || 0) + l.duration_value;
    });
    return Object.entries(map).map(([name, days]) => ({ name, days }));
  }, [filtered]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((l: any) => {
      const month = format(parseISO(l.leave_date), "yyyy-MM");
      map[month] = (map[month] || 0) + l.duration_value;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({
        month: format(parseISO(month + "-01"), "MMM yyyy"),
        days,
      }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Department */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Leave Days by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byDepartment.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byDepartment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="days" fill="hsl(213, 94%, 56%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                No data
              </p>
            )}
          </CardContent>
        </Card>

        {/* By Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Leave Days by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="days" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                No data
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Monthly Leave Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="days"
                  stroke="hsl(271, 76%, 53%)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "hsl(271, 76%, 53%)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">
              No data for the selected filters
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
