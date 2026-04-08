"use client";

import { cn } from "@/lib/utils";

interface HoursSummaryProps {
  totalHours: number;
  entryCount: number;
  submittedCount: number;
  failedCount: number;
}

export function HoursSummary({
  totalHours,
  entryCount,
  submittedCount,
  failedCount,
}: HoursSummaryProps) {
  const targetHours = 8;
  const percentage = Math.min((totalHours / targetHours) * 100, 100);

  return (
    <div className="flex items-center gap-6 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Total</span>
        <span
          className={cn(
            "text-lg font-bold tabular-nums",
            totalHours >= targetHours
              ? "text-green-400"
              : totalHours > 0
              ? "text-yellow-400"
              : "text-muted-foreground"
          )}
        >
          {totalHours.toFixed(1)}h
        </span>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-lg font-bold tabular-nums text-muted-foreground">
          {targetHours}h
        </span>
      </div>

      <div className="h-8 w-px bg-border" />

      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              totalHours >= targetHours ? "bg-green-500" : "bg-yellow-500"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{entryCount} entries</span>
        {submittedCount > 0 && (
          <span className="text-green-400">{submittedCount} submitted</span>
        )}
        {failedCount > 0 && (
          <span className="text-destructive">{failedCount} failed</span>
        )}
      </div>
    </div>
  );
}
