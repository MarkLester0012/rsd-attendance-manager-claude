import { Loader2 } from "lucide-react";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { cn } from "@/lib/utils";
import type { EmployeeStats } from "@/lib/utils/transportation-defaults";

interface StatsPanelProps {
  stats: EmployeeStats;
  title?: string;
  loading?: boolean;
  compact?: boolean;
}

export function StatsPanel({ stats, title = "Pay Period Stats", loading, compact }: StatsPanelProps) {
  const leaveEntries = Object.entries(stats.leave_breakdown).filter(([code]) => code !== "WFH");

  return (
    <div className={cn("rounded-xl border border-border bg-muted/40", compact ? "p-3 space-y-2" : "p-4 space-y-3")}>
      <p className={cn("font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5", compact ? "text-[10px]" : "text-[11px]")}>
        {title}
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </p>

      <div className={cn(compact ? "space-y-1.5 text-xs" : "space-y-2 text-sm")}>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Business days</span>
          <span className="font-semibold text-foreground">{stats.business_days}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Holidays</span>
          <span className="font-semibold text-foreground">{stats.holiday_count}</span>
        </div>

        {leaveEntries.length > 0 && (
          <div className={cn("border-t border-border/60", compact ? "pt-1.5 space-y-1" : "pt-2 space-y-1.5")}>
            {!compact && (
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wide">Approved Leaves</p>
            )}
            {leaveEntries.map(([code, count]) => (
              <div key={code} className="flex items-center justify-between">
                <span className={cn("text-muted-foreground", compact && "text-muted-foreground/80")}>
                  {LEAVE_TYPES[code as keyof typeof LEAVE_TYPES]?.label ?? code}
                </span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}

        <div className={cn("border-t border-border/60", compact ? "pt-1.5 space-y-1" : "pt-2 space-y-1.5")}>
          <div className="flex items-center justify-between">
            <span className={cn("text-muted-foreground", compact && "text-muted-foreground/80")}>WFH days</span>
            <span className="font-semibold text-foreground">{stats.wfh_days}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">Days worked</span>
            <span className="font-bold text-foreground">{stats.days_worked}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
