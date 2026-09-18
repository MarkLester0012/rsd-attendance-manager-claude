"use client";

import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { timeToMinutes, minutesToTime } from "@/lib/utils/meeting-conflicts";
import { MEETING_ROOM_START_HOUR, MEETING_ROOM_END_HOUR } from "@/lib/meetings/time-slots";
import type { MeetingWithAttendees } from "@/lib/types";
import { cn } from "@/lib/utils";

// Matches the 07:00-20:00 range offered in the booking modal's time picker,
// so a booking at either edge of the day is never silently clipped off the
// timeline.
const TIMELINE_START_HOUR = MEETING_ROOM_START_HOUR;
const TIMELINE_END_HOUR = MEETING_ROOM_END_HOUR;
const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

interface RoomTimelineProps {
  isCurrentDayToday: boolean;
  currentDateStr: string;
  isDateChangePending: boolean;
  bookings: MeetingWithAttendees[];
  currentTimeMinutes: number;
}

export function RoomTimeline({
  isCurrentDayToday,
  currentDateStr,
  isDateChangePending,
  bookings,
  currentTimeMinutes,
}: RoomTimelineProps) {
  return (
    <Card
      className={cn(
        "shadow-sm border-border transition-opacity",
        isDateChangePending && "opacity-50 pointer-events-none"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              {isCurrentDayToday ? "Today's" : format(parseISO(currentDateStr), "MMM d")} Room Timeline
            </CardTitle>
            <CardDescription>
              Visual schedule overview from {String(TIMELINE_START_HOUR).padStart(2, "0")}:00 to{" "}
              {String(TIMELINE_END_HOUR).padStart(2, "0")}:00
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Scheduled
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> In Progress
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Completed
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="relative pt-2 pb-6">
            {/* Timeline base track */}
            <div className="relative h-10 w-full rounded-lg bg-muted/50 border border-border/60 overflow-hidden">
              {/* Hourly division lines */}
              {Array.from({ length: TIMELINE_HOURS + 1 }).map((_, idx) => {
                const percent = (idx / TIMELINE_HOURS) * 100;
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 border-l border-border/40 pointer-events-none"
                    style={{ left: `${percent}%` }}
                  />
                );
              })}

              {/* Booking blocks on timeline. Cancelled bookings never render
                  here (they're still visible in the list below) — scheduled/
                  in-progress/completed all do, so the track isn't empty on a
                  past date. */}
              {bookings
                .filter(
                  (b) =>
                    b.status === "scheduled" ||
                    b.status === "in_progress" ||
                    b.status === "completed"
                )
                .map((b) => {
                  const startMin = timeToMinutes(b.start_time);
                  const endMin = timeToMinutes(b.end_time);
                  const timelineStartMin = TIMELINE_START_HOUR * 60;
                  const timelineEndMin = TIMELINE_END_HOUR * 60;

                  // Bound within timeline
                  const clampedStart = Math.max(timelineStartMin, startMin);
                  const clampedEnd = Math.min(timelineEndMin, endMin);

                  if (clampedEnd <= clampedStart) return null;

                  const leftPercent =
                    ((clampedStart - timelineStartMin) / TIMELINE_TOTAL_MINUTES) * 100;
                  const widthPercent =
                    ((clampedEnd - clampedStart) / TIMELINE_TOTAL_MINUTES) * 100;

                  const isInProgress = b.status === "in_progress";
                  const isCompleted = b.status === "completed";
                  const isClippedAtEnd = endMin > timelineEndMin;
                  const attendeeCount = b.attendees?.length ?? 0;

                  return (
                    <Tooltip key={b.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-xs font-medium text-white truncate shadow-sm transition-all overflow-hidden",
                            isInProgress
                              ? "bg-amber-600 border border-amber-400"
                              : isCompleted
                              ? "bg-slate-500 border border-slate-400"
                              : "bg-blue-600 border border-blue-400"
                          )}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(widthPercent, 2)}%`,
                          }}
                          title={`${b.title} (${b.start_time} - ${b.end_time})`}
                        >
                          <span className="truncate">{b.title}</span>
                          <span className="hidden sm:inline text-[10px] opacity-90 ml-1">
                            {b.start_time}
                          </span>
                          {isClippedAtEnd && (
                            <span
                              className="absolute right-0 top-0 bottom-0 w-2 pointer-events-none"
                              style={{
                                backgroundImage:
                                  "repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 2px, transparent 2px, transparent 5px)",
                              }}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px] space-y-0.5">
                        <p className="font-semibold">{b.title}</p>
                        <p>Organizer: {b.organizer?.name || "Unknown"}</p>
                        <p>
                          {b.start_time} - {b.end_time}
                          {isClippedAtEnd && " (continues past 20:00)"}
                        </p>
                        <p>
                          {attendeeCount} attendee{attendeeCount === 1 ? "" : "s"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}

              {/* Current time vertical indicator line (if viewing today) */}
              {isCurrentDayToday &&
                currentTimeMinutes >= TIMELINE_START_HOUR * 60 &&
                currentTimeMinutes <= TIMELINE_END_HOUR * 60 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow"
                    style={{
                      left: `${((currentTimeMinutes - TIMELINE_START_HOUR * 60) / TIMELINE_TOTAL_MINUTES) * 100}%`,
                    }}
                    title={`Current time: ${minutesToTime(currentTimeMinutes)}`}
                  >
                    <div className="h-2 w-2 -ml-[3px] -mt-0.5 rounded-full bg-red-600" />
                  </div>
                )}
            </div>

            {/* Time labels below bar — positioned with the same percent math as
                the gridlines above so they line up exactly (a flex `justify-between`
                row of unequal-width labels does not align with fixed percent
                positions). Below `sm`, only every other hour is rendered — the
                full 14-label set collides at phone width. */}
            <div className="relative mt-2 h-4 text-[11px] text-muted-foreground font-mono">
              {Array.from({ length: TIMELINE_HOURS + 1 }).map((_, idx) => {
                const hour = TIMELINE_START_HOUR + idx;
                const percent = (idx / TIMELINE_HOURS) * 100;
                const isFirst = idx === 0;
                const isLast = idx === TIMELINE_HOURS;
                return (
                  <span
                    key={idx}
                    className={cn(
                      "absolute whitespace-nowrap",
                      idx % 2 !== 0 && "hidden sm:inline"
                    )}
                    style={{
                      left: `${percent}%`,
                      transform: isFirst ? undefined : isLast ? "translateX(-100%)" : "translateX(-50%)",
                    }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                );
              })}
            </div>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
