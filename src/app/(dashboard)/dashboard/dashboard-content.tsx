"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import {
  Calendar,
  Users,
  ClipboardList,
  ArrowRight,
  Plane,
  Monitor,
  CheckSquare,
  Lightbulb,
  Clock,
  Megaphone,
  ChevronDown,
  CalendarDays,
  PartyPopper,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAVE_TYPES, NON_DEDUCTIBLE_TYPES } from "@/lib/constants/leave-types";
import type { User, LeaveEntry, Announcement, Holiday } from "@/lib/types";

interface DashboardContentProps {
  user: User;
  upcomingHolidays: Holiday[];
  announcements: (Announcement & { author?: { name: string } })[];
  userLeaves: LeaveEntry[];
  wfhUsed: number;
  inOfficeCount: number;
  pendingCount: number;
  nextLeave: LeaveEntry | null;
}

export function DashboardContent({
  user,
  upcomingHolidays,
  announcements,
  userLeaves,
  wfhUsed,
  inOfficeCount,
  pendingCount,
  nextLeave,
}: DashboardContentProps) {
  const totalUsed = userLeaves
    .filter((l) => !NON_DEDUCTIBLE_TYPES.includes(l.leave_type))
    .reduce((sum, l) => sum + l.duration_value, 0);

  // Monthly leave data for bar chart
  const monthlyChartData = useMemo(() => {
    const months: Record<string, Record<string, number>> = {};

    // Initialize all 12 months
    for (let m = 0; m < 12; m++) {
      const key = format(new Date(2026, m, 1), "MMM");
      months[key] = {};
    }

    userLeaves.forEach((leave) => {
      const monthKey = format(parseISO(leave.leave_date), "MMM");
      if (months[monthKey]) {
        months[monthKey][leave.leave_type] =
          (months[monthKey][leave.leave_type] || 0) + leave.duration_value;
      }
    });

    return Object.entries(months).map(([month, types]) => ({
      month,
      ...types,
    }));
  }, [userLeaves]);

  // Get unique leave types used for chart bars
  const usedLeaveTypes = useMemo(() => {
    const types = new Set(userLeaves.map((l) => l.leave_type));
    return Array.from(types);
  }, [userLeaves]);

  // Leave breakdown by type (for summary)
  const leaveBreakdown = userLeaves.reduce(
    (acc, leave) => {
      acc[leave.leave_type] = (acc[leave.leave_type] || 0) + leave.duration_value;
      return acc;
    },
    {} as Record<string, number>
  );

  const statCards = [
    {
      title: "Leave Balance",
      value: `${user.leave_balance - totalUsed}`,
      subtitle: `of ${user.leave_balance} credits`,
      icon: Plane,
      href: "/my-leaves",
      gradient: "from-emerald-500/10 to-green-500/10",
      iconColor: "text-emerald-500",
    },
    {
      title: "WFH This Month",
      value: `${wfhUsed}`,
      subtitle: "of 8.0 days",
      icon: Monitor,
      href: "/my-leaves",
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500",
    },
    {
      title:
        user.role === "member" ? "In Office Today" : "Pending Approvals",
      value:
        user.role === "member"
          ? `${inOfficeCount}`
          : `${pendingCount}`,
      subtitle:
        user.role === "member" ? "team members" : "awaiting review",
      icon: user.role === "member" ? Users : CheckSquare,
      href: user.role === "member" ? "/attendance" : "/approvals",
      gradient:
        user.role === "member"
          ? "from-violet-500/10 to-purple-500/10"
          : "from-amber-500/10 to-orange-500/10",
      iconColor:
        user.role === "member" ? "text-violet-500" : "text-amber-500",
    },
    {
      title: "Next Scheduled Leave",
      value: nextLeave
        ? format(new Date(nextLeave.leave_date), "MMM d")
        : "None",
      subtitle: nextLeave
        ? LEAVE_TYPES[nextLeave.leave_type]?.label || nextLeave.leave_type
        : "No upcoming leaves",
      icon: Clock,
      href: "/calendar",
      gradient: "from-pink-500/10 to-rose-500/10",
      iconColor: "text-pink-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/5 hover:border-border/80">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {card.title}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {card.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {card.subtitle}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl bg-gradient-to-br ${card.gradient} p-2.5`}
                  >
                    <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Leave Breakdown - Monthly Chart + Summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Leave Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userLeaves.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No leaves taken yet
              </p>
            ) : (
              <div className="space-y-5">
                {/* Monthly Bar Chart */}
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyChartData}
                      margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border/50"
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                          color: "hsl(var(--popover-foreground))",
                        }}
                        formatter={(value: number, name: string) => {
                          const config =
                            LEAVE_TYPES[name as keyof typeof LEAVE_TYPES];
                          return [
                            `${value} day${value !== 1 ? "s" : ""}`,
                            config?.label || name,
                          ];
                        }}
                      />
                      <Legend
                        formatter={(value: string) => {
                          const config =
                            LEAVE_TYPES[value as keyof typeof LEAVE_TYPES];
                          return (
                            <span className="text-xs text-muted-foreground">
                              {config?.label || value}
                            </span>
                          );
                        }}
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      {usedLeaveTypes.map((type) => {
                        const config =
                          LEAVE_TYPES[type as keyof typeof LEAVE_TYPES];
                        return (
                          <Bar
                            key={type}
                            dataKey={type}
                            stackId="leaves"
                            fill={
                              config
                                ? `hsl(var(${config.cssVar}))`
                                : "hsl(var(--muted-foreground))"
                            }
                            radius={[2, 2, 0, 0]}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary by Type */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(leaveBreakdown).map(([type, days]) => {
                    const config =
                      LEAVE_TYPES[type as keyof typeof LEAVE_TYPES];
                    return (
                      <div
                        key={type}
                        className="flex items-center gap-2 rounded-lg border border-border/50 p-2.5"
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: config
                              ? `hsl(var(${config.cssVar}))`
                              : undefined,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {config?.label || type}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {days} day{days !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Announcements - Scrollable */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">
                Announcements
              </CardTitle>
              {announcements.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {announcements.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No announcements yet
              </p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-4 scrollbar-thin">
                {announcements.map((a) => (
                  <AnnouncementItem key={a.id} announcement={a} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming Holidays */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">
                Holidays This Month
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingHolidays.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No holidays this month
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingHolidays.map((holiday) => {
                  const daysUntil = differenceInCalendarDays(
                    parseISO(holiday.observed_date),
                    new Date()
                  );
                  const isThisWeek = daysUntil <= 7;
                  return (
                    <div
                      key={holiday.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        isThisWeek
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/50"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 flex-col items-center justify-center rounded-lg shrink-0 ${
                          isThisWeek
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span className="text-[10px] font-medium leading-none">
                          {format(parseISO(holiday.observed_date), "MMM")}
                        </span>
                        <span className="text-sm font-bold leading-tight">
                          {format(parseISO(holiday.observed_date), "d")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {holiday.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(
                            parseISO(holiday.observed_date),
                            "EEEE, MMMM d"
                          )}
                          {holiday.original_date &&
                            holiday.original_date !== holiday.observed_date && (
                              <span className="text-muted-foreground/60">
                                {" "}
                                (moved from{" "}
                                {format(parseISO(holiday.original_date), "MMM d")}
                                )
                              </span>
                            )}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {daysUntil === 0 ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-primary/15 text-primary"
                          >
                            <PartyPopper className="h-3 w-3 mr-1" />
                            Today
                          </Badge>
                        ) : daysUntil === 1 ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-primary/15 text-primary"
                          >
                            Tomorrow
                          </Badge>
                        ) : daysUntil < 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {Math.abs(daysUntil)} day{Math.abs(daysUntil) !== 1 ? "s" : ""} ago
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            in {daysUntil} day{daysUntil !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                label: "My Calendar",
                icon: Calendar,
                href: "/calendar",
                desc: "View & apply for leaves",
              },
              {
                label: "Office Attendance",
                icon: ClipboardList,
                href: "/attendance",
                desc: "See who's in today",
              },
              {
                label: "Suggestions",
                icon: Lightbulb,
                href: "/suggestions",
                desc: "Share your ideas",
              },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="group flex items-center gap-3 rounded-lg border border-border/50 p-3 transition-all duration-200 hover:bg-accent/50 hover:border-border cursor-pointer">
                  <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {action.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {action.desc}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AnnouncementItem({
  announcement: a,
}: {
  announcement: Announcement & { author?: { name: string } };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((prev) => !prev)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((prev) => !prev); } }}
      className="w-full text-left space-y-1 border-b border-border/50 pb-3 last:border-0 last:pb-0 rounded-md transition-colors hover:bg-accent/50 -mx-1 px-1 py-1 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{a.title}</p>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 mt-0.5 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>
      <p
        className={`text-xs text-muted-foreground whitespace-pre-line transition-all duration-200 ${
          expanded ? "" : "line-clamp-2"
        }`}
      >
        {a.content}
      </p>
      <p className="text-[10px] text-muted-foreground/60">
        {a.author?.name} &middot; {format(new Date(a.created_at), "MMM d")}
      </p>
    </div>
  );
}
