"use client";

import { format, parseISO } from "date-fns";
import { Clock, MessageSquare, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MeetingBooking, MeetingWithAttendees } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RoomStatusHeroProps {
  isCurrentDayToday: boolean;
  currentDateStr: string;
  liveStatus: {
    isOccupied: boolean;
    currentMeeting: MeetingBooking | null;
    nextMeeting: MeetingBooking | null;
  };
  bookings: MeetingWithAttendees[];
  defaultSlackChannel: string;
  canManageMeetings: boolean;
  actionLoading: string | null;
  handleStartMeeting: (id: string, title: string) => void;
  handleExtend: (id: string, mins?: number) => void;
  handleEndEarly: (id: string) => void;
}

export function RoomStatusHero({
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
}: RoomStatusHeroProps) {
  return (
    <Card
      className={cn(
        "border-2 transition-all duration-300 shadow-sm",
        !isCurrentDayToday
          ? "border-border"
          : liveStatus.isOccupied
          ? "border-amber-500/50"
          : "border-emerald-500/40"
      )}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3.5 w-3.5">
                {isCurrentDayToday && liveStatus.isOccupied && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-400" />
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-3.5 w-3.5",
                    !isCurrentDayToday
                      ? "bg-muted-foreground/40"
                      : liveStatus.isOccupied
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  !isCurrentDayToday
                    ? "text-muted-foreground"
                    : liveStatus.isOccupied
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {!isCurrentDayToday
                  ? "Viewing Schedule"
                  : liveStatus.isOccupied
                  ? liveStatus.currentMeeting?.status === "scheduled"
                    ? "Booked — not started yet"
                    : "Meeting Room is Currently Occupied"
                  : "Meeting Room is Currently Available"}
              </span>
            </div>

            {!isCurrentDayToday ? (
              <div>
                <h3 className="text-xl font-semibold text-foreground">
                  {format(parseISO(currentDateStr), "EEEE, MMMM d")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const activeCount = bookings.filter(
                      (b) => b.status === "scheduled" || b.status === "in_progress"
                    ).length;
                    return activeCount > 0
                      ? `${activeCount} meeting${activeCount === 1 ? "" : "s"} scheduled for this date.`
                      : "No meetings scheduled for this date.";
                  })()}
                </p>
              </div>
            ) : liveStatus.isOccupied && liveStatus.currentMeeting ? (
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
          </div>

          {/* Right side live actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {liveStatus.isOccupied && liveStatus.currentMeeting ? (
              <>
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
              </>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
