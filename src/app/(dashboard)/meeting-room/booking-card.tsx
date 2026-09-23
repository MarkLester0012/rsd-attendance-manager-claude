"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Radio,
  Play,
  Timer,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AttendeeStatusPill } from "./_components/attendee-status-pill";
import {
  resolveAttendeeStatus,
  findApplicableLeave,
  formatDuration,
  formatRelativeMinutes,
  timeToMinutes,
  isWithinStartWindow,
  type LeaveRecord,
} from "@/lib/utils/meeting-conflicts";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import type { MeetingWithAttendees, MeetingAttendee, User, LeaveTypeCode, MeetingAttendeeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { emojify } from "@/lib/emoji";
import { officeDateString } from "@/lib/utils/office-time";

// The avatar stack shows at most this many attendees before collapsing the
// rest behind a "+N" overflow trigger.
const VISIBLE_ATTENDEE_COUNT = 4;

type AttendeeWithStatus = MeetingAttendee & {
  resolvedStatus: MeetingAttendeeStatus;
  leaveRecord: LeaveRecord | undefined;
};

function statusDotClass(status: MeetingAttendeeStatus): string {
  switch (status) {
    case "virtual":
      return "bg-blue-500";
    case "on_leave":
      return "bg-amber-500";
    case "in_office":
    default:
      return "bg-emerald-500";
  }
}

/** Full attendee detail — reused by both the per-avatar popover and the "+N" overflow list. */
function AttendeeDetail({ att }: { att: AttendeeWithStatus }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <UserAvatar name={att.user?.name || "User"} size="xs" className="h-6 w-6 text-[10px]" />
        <p className="font-medium text-foreground">{att.user?.name}</p>
      </div>
      <AttendeeStatusPill status={att.resolvedStatus} />
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Role: <span className="text-foreground capitalize">{att.user?.role}</span>
        </p>
        {att.user?.department?.name && (
          <p>
            Department: <span className="text-foreground">{att.user.department.name}</span>
          </p>
        )}
        <p>
          Slack:{" "}
          {att.user?.slack_user_id ? (
            <span className="text-emerald-600 dark:text-emerald-400">Linked</span>
          ) : (
            <span className="text-muted-foreground">Not linked</span>
          )}
        </p>
        {att.leaveRecord && (
          <p>
            {LEAVE_TYPES[att.leaveRecord.leave_type as LeaveTypeCode]?.label || att.leaveRecord.leave_type} —{" "}
            {durationLabel(att.leaveRecord.duration)}
          </p>
        )}
      </div>
    </div>
  );
}

interface BookingCardProps {
  booking: MeetingWithAttendees;
  currentUser: User;
  leaves: LeaveRecord[];
  defaultSlackChannel: string;
  canManageMeetings: boolean;
  isHighlighted: boolean;
  actionLoading: string | null;
  isCurrentDayToday: boolean;
  currentTimeMinutes: number;
  onCardRef: (el: HTMLDivElement | null) => void;
  handleStartMeeting: (id: string, title: string) => void;
  handleExtend: (id: string, mins?: number) => void;
  handleEndEarly: (id: string) => void;
  handleCancel: (id: string) => void;
  onEdit: (booking: MeetingWithAttendees) => void;
  onMessage: (booking: MeetingWithAttendees) => void;
}

function durationLabel(duration: string | undefined): string {
  if (duration === "half_am") return "AM half-day";
  if (duration === "half_pm") return "PM half-day";
  return "Full day";
}

export function BookingCard({
  booking: b,
  currentUser,
  leaves,
  defaultSlackChannel,
  canManageMeetings,
  isHighlighted,
  actionLoading,
  isCurrentDayToday,
  currentTimeMinutes,
  onCardRef,
  handleStartMeeting,
  handleExtend,
  handleEndEarly,
  handleCancel,
  onEdit,
  onMessage,
}: BookingCardProps) {
  const isOrganizer = b.organizer_id === currentUser.id;
  // Every organizer is already a leader or HR (createBooking/createBookingCore
  // only ever run for a caller who passed getAuthorizedLeaderOrHR), so
  // `|| isOrganizer` here was always redundant with canManageMeetings.
  const canModify = canManageMeetings;
  // Edit/Cancel are narrower than the rest of canModify's actions
  // (Start/Extend/End Early/Message Attendees stay open to any
  // leader helping run the room in person) — only the organizer or
  // HR can edit or cancel someone's booking, matching the server's
  // own check in actions.ts.
  const canEditOrCancel = currentUser.role === "hr" || isOrganizer;

  // Resolve attendee statuses. Memoized so this doesn't rerun on every
  // render — in particular the 30-second clock-tick re-render in the
  // parent (currentTimeMinutes) — since attendee status doesn't depend
  // on the live clock, only on this booking's attendees/leaves/date/time.
  const attendeesWithStatus = useMemo(() => {
    return (b.attendees || []).map((att) => {
      const status = resolveAttendeeStatus(att.user_id, b.meeting_date, leaves, b.start_time);
      const leaveRecord = findApplicableLeave(att.user_id, b.meeting_date, leaves, b.start_time);
      return { ...att, resolvedStatus: status, leaveRecord };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.attendees, b.meeting_date, b.start_time, leaves]);

  // Live "starts in X min" / "ends in X min" hint. Deliberately its own tiny
  // memo (not folded into attendeesWithStatus above) so the 30-second clock
  // tick that drives currentTimeMinutes doesn't invalidate that heavier memo.
  const relativeTimeHint = useMemo(() => {
    if (!isCurrentDayToday) return null;
    if (b.status === "scheduled") {
      const startMin = timeToMinutes(b.start_time);
      const diff = startMin - currentTimeMinutes;
      if (diff <= 0) return null;
      return `starts in ${formatRelativeMinutes(diff)}`;
    }
    if (b.status === "in_progress") {
      const endMin = timeToMinutes(b.end_time);
      const diff = endMin - currentTimeMinutes;
      if (diff <= 0) return null;
      return `ends in ${formatRelativeMinutes(diff)}`;
    }
    return null;
  }, [isCurrentDayToday, b.status, b.start_time, b.end_time, currentTimeMinutes]);

  // messageAttendees excludes the current user from its recipients server-side
  // (actions.ts), so a solo booking would report "sent to 0" — disable the
  // action instead.
  const hasOtherAttendees = attendeesWithStatus.some((att) => att.user_id !== currentUser.id);

  // "Start & Notify Slack" only works server-side from 15 min before start_time
  // through end_time (see isWithinStartWindow) — hide it outside that window
  // rather than let it fail silently on click.
  const canStartNow = isWithinStartWindow(
    b.meeting_date,
    b.start_time,
    b.end_time,
    officeDateString(),
    currentTimeMinutes
  );

  return (
    <Card
      ref={onCardRef}
      className={cn(
        "transition-all duration-200 shadow-sm border",
        isHighlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        b.status === "in_progress"
          ? "border-amber-400 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10"
          : b.status === "cancelled"
          ? "opacity-60 bg-muted/30"
          : "border-border hover:border-border/80"
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          {/* Main Meeting Details: fixed-width time column + content */}
          <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
            {/* Time column */}
            <div className="flex flex-col items-center shrink-0 w-14 sm:w-16 text-center border-r border-border/50 pr-3 sm:pr-4">
              <span
                className={cn(
                  "text-sm sm:text-base font-semibold text-foreground tabular-nums",
                  b.status === "cancelled" && "line-through text-muted-foreground"
                )}
              >
                {b.start_time}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{b.end_time}</span>
              <span className="text-[10px] text-muted-foreground/80 mt-1 whitespace-nowrap">
                {formatDuration(b.start_time, b.end_time)}
              </span>
            </div>

            <div className="space-y-2 flex-1 min-w-0">
              {/* Status and misc badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                {relativeTimeHint && (
                  <Badge variant="outline" className="text-xs text-muted-foreground border-border/70">
                    {relativeTimeHint}
                  </Badge>
                )}
                {b.status === "in_progress" && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs bg-amber-500/10 text-amber-500 border-amber-500/30"
                  >
                    <Radio className="h-3 w-3" /> In Progress
                  </Badge>
                )}
                {b.status === "scheduled" && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30"
                  >
                    Scheduled
                  </Badge>
                )}
                {b.status === "completed" && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Completed
                  </Badge>
                )}
                {b.status === "cancelled" && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-xs bg-red-500/10 text-red-500 border-red-500/30"
                  >
                    <XCircle className="h-3 w-3" /> Cancelled
                  </Badge>
                )}

                {/* Slack integration indicator */}
                {b.notify_channel && (
                  <Badge variant="outline" className="text-xs text-muted-foreground gap-1 border-border/70">
                    <MessageSquare className="h-3 w-3 text-blue-500" />
                    #{b.slack_channel || defaultSlackChannel}
                  </Badge>
                )}
              </div>

              {/* Title & Description */}
              <div>
                <h4
                  className={cn(
                    "text-base font-semibold text-foreground",
                    b.status === "cancelled" && "line-through text-muted-foreground"
                  )}
                >
                  {emojify(b.title)}
                </h4>
                {b.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {emojify(b.description)}
                  </p>
                )}
              </div>

              {/* Organizer + attendee avatar stack */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Organized by:</span>
                  <UserAvatar
                    name={b.organizer?.name || "Organizer"}
                    size="xs"
                    className="h-5 w-5 text-[10px]"
                  />
                  <span className="font-medium text-foreground">{b.organizer?.name || "Organizer"}</span>
                </div>

                {attendeesWithStatus.length > 0 && (
                  <div className="flex items-center -space-x-2">
                    {attendeesWithStatus.slice(0, VISIBLE_ATTENDEE_COUNT).map((att) => (
                      <Popover key={att.id}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${att.user?.name || "Attendee"} — ${att.resolvedStatus.replace("_", " ")}`}
                            className="relative rounded-full ring-2 ring-card hover:z-10 focus:z-10 focus:outline-none focus:ring-primary"
                          >
                            <UserAvatar
                              name={att.user?.name || "User"}
                              size="xs"
                              className="h-7 w-7 text-[10px]"
                            />
                            <span
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                                statusDotClass(att.resolvedStatus)
                              )}
                              aria-hidden="true"
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 text-sm">
                          <AttendeeDetail att={att} />
                        </PopoverContent>
                      </Popover>
                    ))}

                    {attendeesWithStatus.length > VISIBLE_ATTENDEE_COUNT && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${attendeesWithStatus.length - VISIBLE_ATTENDEE_COUNT} more attendees`}
                            className="relative h-7 w-7 rounded-full ring-2 ring-card bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground hover:z-10 focus:z-10 focus:outline-none focus:ring-primary"
                          >
                            +{attendeesWithStatus.length - VISIBLE_ATTENDEE_COUNT}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 text-sm">
                          <ScrollArea className="max-h-64 pr-2">
                            <div className="divide-y divide-border">
                              {attendeesWithStatus.slice(VISIBLE_ATTENDEE_COUNT).map((att) => (
                                <div key={att.id} className="py-3 first:pt-0 last:pb-0">
                                  <AttendeeDetail att={att} />
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right side actions */}
          {canModify && b.status !== "cancelled" && b.status !== "completed" && (
            <div className="flex md:flex-col items-end justify-end gap-2 shrink-0">
              {b.status === "scheduled" && canStartNow && (
                <Button
                  size="sm"
                  onClick={() => handleStartMeeting(b.id, b.title)}
                  disabled={actionLoading === b.id}
                  className="gap-1.5 text-xs shadow-sm"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start & Notify Slack
                </Button>
              )}

              {b.status === "in_progress" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExtend(b.id, 15)}
                    disabled={actionLoading === b.id}
                    className="text-xs gap-1"
                  >
                    <Timer className="h-3.5 w-3.5" />
                    +15m
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleEndEarly(b.id)}
                    disabled={actionLoading === b.id}
                    className="text-xs"
                  >
                    End Early
                  </Button>
                </>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={actionLoading === b.id}
                    title="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {b.status === "scheduled" && canEditOrCancel && (
                    <DropdownMenuItem onClick={() => onEdit(b)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Edit Meeting
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onMessage(b)}
                    disabled={!hasOtherAttendees}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-2" />
                    Message Attendees
                  </DropdownMenuItem>
                  {b.status === "scheduled" && canEditOrCancel && (
                    <DropdownMenuItem
                      onClick={() => handleCancel(b.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-2" />
                      Cancel Meeting
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
