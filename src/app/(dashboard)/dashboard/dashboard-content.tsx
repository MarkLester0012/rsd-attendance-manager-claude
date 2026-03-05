"use client";

import Link from "next/link";
import { format } from "date-fns";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import type { User, LeaveEntry, Announcement } from "@/lib/types";

interface DashboardContentProps {
  user: User;
  recentLeaves: (LeaveEntry & { user?: { name: string } })[];
  announcements: (Announcement & { author?: { name: string } })[];
  userLeaves: LeaveEntry[];
  wfhUsed: number;
  inOfficeCount: number;
  pendingCount: number;
  nextLeave: LeaveEntry | null;
}

export function DashboardContent({
  user,
  recentLeaves,
  announcements,
  userLeaves,
  wfhUsed,
  inOfficeCount,
  pendingCount,
  nextLeave,
}: DashboardContentProps) {
  const totalUsed = userLeaves
    .filter((l) => l.leave_type !== "WFH")
    .reduce((sum, l) => sum + l.duration_value, 0);

  // Leave breakdown by type
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
        {/* Leave Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Leave Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(leaveBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No leaves taken yet
              </p>
            ) : (
              Object.entries(leaveBreakdown).map(([type, days]) => {
                const config = LEAVE_TYPES[type as keyof typeof LEAVE_TYPES];
                const maxDays = type === "WFH" ? 8 : user.leave_balance;
                const percentage = Math.min((days / maxDays) * 100, 100);
                return (
                  <div key={type} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {config?.label || type}
                      </span>
                      <span className="text-muted-foreground">
                        {days} day{days !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: config
                            ? `hsl(var(${config.cssVar}))`
                            : undefined,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">
                Announcements
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No announcements yet
              </p>
            ) : (
              announcements.map((a) => (
                <div
                  key={a.id}
                  className="space-y-1 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-foreground">
                    {a.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {a.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {a.author?.name} &middot;{" "}
                    {format(new Date(a.created_at), "MMM d")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentLeaves.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No recent activity
                </p>
              ) : (
                recentLeaves.map((leave) => {
                  const config =
                    LEAVE_TYPES[
                      leave.leave_type as keyof typeof LEAVE_TYPES
                    ];
                  return (
                    <div
                      key={leave.id}
                      className="flex items-center gap-3 rounded-lg border border-border/50 p-3"
                    >
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: config
                            ? `hsl(var(${config.cssVar}))`
                            : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {leave.user?.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(leave.leave_date), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
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
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${
                          leave.status === "approved"
                            ? "border-status-approved/30 text-status-approved"
                            : leave.status === "rejected"
                              ? "border-status-rejected/30 text-status-rejected"
                              : "border-status-pending/30 text-status-pending"
                        }`}
                      >
                        {leave.status}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
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
