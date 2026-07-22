"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { cn, redmineIssueUrl } from "@/lib/utils";
import {
  filterToMonth,
  hoursByProject,
  hoursByTicket,
  busiestDay,
  busiestWeek,
  timeLogTotals,
  formatHours,
} from "@/lib/utils/time-log-stats";
import type { MonthViewEntry } from "./month-view";

interface MonthStatsProps {
  entries: MonthViewEntry[];
  currentMonth: Date;
  projectColorMap?: Record<string, string>;
  redmineUrl?: string | null;
}

const MAX_TICKETS = 6;
const MAX_DONUT_SEGMENTS = 6;

export function MonthStats({
  entries,
  currentMonth,
  projectColorMap = {},
  redmineUrl,
}: MonthStatsProps) {
  const [open, setOpen] = useState(false);

  const monthEntries = useMemo(
    () => filterToMonth(entries, currentMonth),
    [entries, currentMonth]
  );

  const projects = useMemo(
    () => hoursByProject(monthEntries, projectColorMap),
    [monthEntries, projectColorMap]
  );
  const tickets = useMemo(
    () => hoursByTicket(monthEntries, projectColorMap),
    [monthEntries, projectColorMap]
  );
  const topDay = useMemo(() => busiestDay(monthEntries), [monthEntries]);
  const topWeek = useMemo(() => busiestWeek(monthEntries), [monthEntries]);
  const totals = useMemo(() => timeLogTotals(monthEntries), [monthEntries]);

  const donutData = useMemo(() => {
    const top = projects.slice(0, MAX_DONUT_SEGMENTS);
    const rest = projects.slice(MAX_DONUT_SEGMENTS);
    const restHours = rest.reduce((sum, p) => sum + p.hours, 0);
    const segments =
      rest.length > 0
        ? [...top, { name: "Other", hours: restHours, color: null }]
        : top;
    return segments.map((p) => ({
      name: p.name,
      hours: p.hours,
      color: p.color ?? "hsl(var(--muted-foreground))",
    }));
  }, [projects]);

  if (monthEntries.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="px-3 py-2">
          <p className="text-xs text-muted-foreground">
            No time logged this month.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visibleTickets = tickets.slice(0, MAX_TICKETS);
  const overflowTickets = tickets.length - visibleTickets.length;

  return (
    <Card className="border-border/50">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="truncate text-xs font-medium text-muted-foreground">
          Month Stats · {formatHours(totals.totalHours)} · {totals.daysLogged}d
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <CardContent className="grid gap-4 border-t border-border/50 p-3 sm:grid-cols-3">
          {/* Hours per project: donut + legend side by side */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">
              Hours per Project
            </p>
            <div className="flex items-center gap-2">
              <div className="relative h-[110px] w-[110px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="hours"
                      nameKey="name"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {donutData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatHours(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-semibold tabular-nums">
                    {formatHours(totals.totalHours)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">total</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {d.name}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatHours(d.hours)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top tickets */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">
              Top Tickets
            </p>
            <div className="space-y-1">
              {visibleTickets.map((t) => {
                const url = redmineIssueUrl(redmineUrl, t.issueId);
                const rowContent = (
                  <>
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        !t.color && "bg-muted-foreground/40"
                      )}
                      style={t.color ? { backgroundColor: t.color } : undefined}
                    />
                    <span className="truncate font-mono">#{t.issueId}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                      {formatHours(t.hours)}
                    </span>
                  </>
                );
                return url ? (
                  <a
                    key={t.issueId}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs hover:underline"
                  >
                    {rowContent}
                  </a>
                ) : (
                  <div key={t.issueId} className="flex items-center gap-1.5 text-xs">
                    {rowContent}
                  </div>
                );
              })}
              {overflowTickets > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  +{overflowTickets} more
                </p>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">
              Totals
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Total Hours" value={formatHours(totals.totalHours)} />
              <StatTile label="Days Logged" value={String(totals.daysLogged)} />
              <StatTile
                label="Busiest Week"
                value={
                  topWeek
                    ? `${format(parseISO(topWeek.weekStart), "MMM d")}–${format(parseISO(topWeek.weekEnd), "d")}`
                    : "—"
                }
                sub={topWeek ? formatHours(topWeek.hours) : undefined}
              />
              <StatTile
                label="Busiest Day"
                value={topDay ? format(parseISO(topDay.date), "EEE, MMM d") : "—"}
                sub={topDay ? formatHours(topDay.hours) : undefined}
              />
              <StatTile
                label="Avg / Day"
                value={formatHours(totals.avgHoursPerLoggedDay)}
                className="col-span-2"
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold tabular-nums">{value}</p>
      {sub && (
        <p className="text-[10px] text-muted-foreground tabular-nums">{sub}</p>
      )}
    </div>
  );
}
