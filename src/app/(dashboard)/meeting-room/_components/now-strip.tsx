"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, Clock, DoorOpen, Hourglass, MessageSquare, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  timeToMinutes,
  formatMinutesAsDuration,
  getChainedAvailableUntil,
} from "@/lib/utils/meeting-conflicts";
import type { MeetingBooking, MeetingWithAttendees } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NowStripProps {
  isCurrentDayToday: boolean;
  currentDateStr: string;
  liveStatus: {
    isOccupied: boolean;
    currentMeeting: MeetingBooking | null;
    nextMeeting: MeetingBooking | null;
    availableUntil?: string | null;
  };
  bookings: MeetingWithAttendees[];
  defaultSlackChannel: string;
  canManageMeetings: boolean;
  actionLoading: string | null;
  handleStartMeeting: (id: string, title: string) => void;
  handleExtend: (id: string, mins?: number) => void;
  handleEndEarly: (id: string) => void;
}

/**
 * Merges the old room-status-hero.tsx + room-stats.tsx into one compact card:
 * status dot/label, current-or-next meeting details, live actions (relocated
 * from the hero verbatim), plus inline summary chips (relocated from the
 * stats row). On a non-today date it shrinks to a single summary line,
 * mirroring the hero's own isCurrentDayToday branch.
 */
export function NowStrip({
  isCurrentDayToday,
  currentDateStr,
  liveStatus,
  bookings,
  defaultSlackChannel,
  canManageMeetings,
  actionLoading,
  handleStartMeeting,
  handleExtend,
  handleEndEarly,
}: NowStripProps) {
  const activeBookings = bookings.filter(
    (b) => b.status === "scheduled" || b.status === "in_progress"
  );
  const roomMinutesBooked = activeBookings.reduce(
    (sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)),
    0
  );

  if (!isCurrentDayToday) {
    const activeCount = activeBookings.length;
    return (
      <Card className="border-border">
        <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex rounded-full h-3 w-3 bg-muted-foreground/40" />
            <h3 className="text-sm font-semibold text-foreground">
              {format(parseISO(currentDateStr), "EEEE, MMMM d")}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeCount > 0
              ? `${activeCount} meeting${activeCount === 1 ? "" : "s"} scheduled`
              : "No meetings scheduled"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const freeChipLabel =
    liveStatus.isOccupied && liveStatus.currentMeeting
      ? `free from ${getChainedAvailableUntil(liveStatus.currentMeeting, bookings)}`
      : liveStatus.nextMeeting
      ? `free until ${liveStatus.availableUntil ?? liveStatus.nextMeeting.start_time}`
      : "free all day";

  return (
    <Card
      className={cn(
        "border-2 transition-all duration-300 shadow-sm",
        liveStatus.isOccupied ? "border-amber-500/50" : "border-emerald-500/40"
      )}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5">
                {liveStatus.isOccupied && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-400" />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-3.5 w-3.5",
                    liveStatus.isOccupied ? "bg-amber-500" : "bg-emerald-500"
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  liveStatus.isOccupied
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {liveStatus.isOccupied
                  ? liveStatus.currentMeeting?.status === "scheduled"
                    ? "Booked — not started yet"
                    : "Meeting Room is Currently Occupied"
                  : "Meeting Room is Currently Available"}
              </span>
            </div>

            {liveStatus.isOccupied && liveStatus.currentMeeting ? (
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-foreground">
                  {liveStatus.currentMeeting.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    {liveStatus.currentMeeting.start_time} - {liveStatus.currentMeeting.end_time}
                  </span>
                  <span>•</span>
                  <span>
                    Organized by{" "}
                    <strong>{liveStatus.currentMeeting.organizer?.name || "Organizer"}</strong>
                  </span>
                  {liveStatus.currentMeeting.notify_channel && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <MessageSquare className="h-3 w-3 text-blue-500" /> #
                      {liveStatus.currentMeeting.slack_channel || defaultSlackChannel}
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  Ready for Ad-hoc or Scheduled Meetings
                </h3>
                <p className="text-sm text-muted-foreground">
                  {liveStatus.nextMeeting ? (
                    <>
                      Next booking today:{" "}
                      <strong className="text-foreground">
                        &quot;{liveStatus.nextMeeting.title}&quot;
                      </strong>{" "}
                      at <strong>{liveStatus.nextMeeting.start_time}</strong>
                    </>
                  ) : (
                    "No further meetings are scheduled for today."
                  )}
                </p>
              </div>
            )}

            {/* Inline summary chips (relocated from room-stats.tsx) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {activeBookings.length} meeting{activeBookings.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Hourglass className="h-3.5 w-3.5" />
                {formatMinutesAsDuration(roomMinutesBooked)} booked
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <DoorOpen className="h-3.5 w-3.5" />
                {freeChipLabel}
              </span>
            </div>
          </div>

          {/* Right side live actions */}
          {liveStatus.isOccupied && liveStatus.currentMeeting ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {canManageMeetings && (
                <>
                  {liveStatus.currentMeeting.status === "scheduled" ? (
                    <Button
                      size="sm"
                      disabled={actionLoading === liveStatus.currentMeeting.id}
                      onClick={() =>
                        handleStartMeeting(liveStatus.currentMeeting!.id, liveStatus.currentMeeting!.title)
                      }
                      className="text-xs gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start & Notify Slack
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading === liveStatus.currentMeeting.id}
                        onClick={() => handleExtend(liveStatus.currentMeeting!.id, 15)}
                        className="text-xs"
                      >
                        +15m Extend
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={actionLoading === liveStatus.currentMeeting.id}
                        onClick={() => handleEndEarly(liveStatus.currentMeeting!.id)}
                        className="text-xs"
                      >
                        End Meeting Early
                      </Button>
                    </>
                  )}
                </>
              )}
              <a
                href={`https://slack.com/app_redirect?channel=${encodeURIComponent(
                  liveStatus.currentMeeting.slack_channel || defaultSlackChannel
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline px-2 py-1"
                title="Open Slack channel / huddle"
              >
                <Radio className="h-3.5 w-3.5 text-blue-500" />
                Slack Huddle
              </a>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
