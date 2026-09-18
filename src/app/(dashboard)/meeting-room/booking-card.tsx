"use client";

import { useMemo } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Radio,
  Building2,
  Laptop,
  Palmtree,
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
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  resolveAttendeeStatus,
  formatDuration,
  timeToMinutes,
  type LeaveRecord,
} from "@/lib/utils/meeting-conflicts";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import type {
  MeetingWithAttendees,
  User,
  MeetingAttendeeStatus,
  LeaveTypeCode,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  handleCancel: (id: string, title: string) => void;
  onEdit: (booking: MeetingWithAttendees) => void;
  onMessage: (booking: MeetingWithAttendees) => void;
}

function durationLabel(duration: string | undefined): string {
  if (duration === "half_am") return "AM half-day";
  if (duration === "half_pm") return "PM half-day";
  return "Full day";
}

// Helper for attendee status pill — colors match the "in_office/virtual/on_leave"
// badges used in the attendee picker inside book-meeting-modal.tsx.
function renderAttendeeStatusPill(status: MeetingAttendeeStatus) {
  switch (status) {
    case "virtual":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/30">
          <Laptop className="h-3 w-3" /> WFH (Huddle)
        </span>
      );
    case "on_leave":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
          <Palmtree className="h-3 w-3" /> On Leave
        </span>
      );
    case "in_office":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
          <Building2 className="h-3 w-3" /> In-Office
        </span>
      );
  }
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
  const canModify = canManageMeetings || isOrganizer;
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
      const leaveRecord = leaves.find(
        (l) => l.user_id === att.user_id && l.leave_date === b.meeting_date && l.status === "approved"
      );
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
      return `starts in ${diff} min`;
    }
    if (b.status === "in_progress") {
      const endMin = timeToMinutes(b.end_time);
      const diff = endMin - currentTimeMinutes;
      if (diff <= 0) return null;
      return `ends in ${diff} min`;
    }
    return null;
  }, [isCurrentDayToday, b.status, b.start_time, b.end_time, currentTimeMinutes]);

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
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          {/* Main Meeting Details */}
          <div className="space-y-3 flex-1">
            {/* Status and Time badges */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Time slot badge */}
              <Badge
                variant="secondary"
                className="font-mono text-xs px-2.5 py-1 gap-1.5 bg-primary/10 text-primary border-primary/20"
              >
                <Clock className="h-3 w-3" />
                {b.start_time} - {b.end_time} ({formatDuration(b.start_time, b.end_time)})
              </Badge>

              {relativeTimeHint && (
                <Badge variant="outline" className="text-xs text-muted-foreground border-border/70">
                  {relativeTimeHint}
                </Badge>
              )}

              {/* Status badge */}
              {b.status === "in_progress" && (
                <Badge className="bg-amber-600 hover:bg-amber-600 text-white gap-1 text-xs">
                  <Radio className="h-3 w-3" /> In Progress
                </Badge>
              )}
              {b.status === "scheduled" && (
                <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-300 text-xs">
                  Scheduled
                </Badge>
              )}
              {b.status === "completed" && (
                <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Completed
                </Badge>
              )}
              {b.status === "cancelled" && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <XCircle className="h-3 w-3" /> Cancelled
                </Badge>
              )}

              {/* Slack integration indicator */}
              {b.notify_channel && (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground gap-1 border-border/70"
                >
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
                {b.title}
              </h4>
              {b.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {b.description}
                </p>
              )}
            </div>

            {/* Organizer */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Organized by:</span>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <UserAvatar
                  name={b.organizer?.name || "Organizer"}
                  size="xs"
                  className="h-5 w-5 text-[10px]"
                />
                <span>{b.organizer?.name || "Organizer"}</span>
              </div>
            </div>

            {/* Attendees with detected status */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium text-muted-foreground">
                Attendees ({attendeesWithStatus.length}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {attendeesWithStatus.map((att) => (
                  <Popover key={att.id}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 bg-muted/60 hover:bg-muted px-2 py-1 rounded-md text-xs border border-border/50"
                      >
                        <UserAvatar
                          name={att.user?.name || "User"}
                          size="xs"
                          className="h-4 w-4 text-[9px]"
                        />
                        <span className="font-medium text-foreground">
                          {att.user?.name || "Unknown"}
                        </span>
                        {renderAttendeeStatusPill(att.resolvedStatus)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 text-sm">
                      <div className="space-y-1.5">
                        <p className="font-medium text-foreground">{att.user?.name}</p>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>
                            Role: <span className="text-foreground capitalize">{att.user?.role}</span>
                          </p>
                          {att.user?.department?.name && (
                            <p>
                              Department:{" "}
                              <span className="text-foreground">{att.user.department.name}</span>
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
                              {LEAVE_TYPES[att.leaveRecord.leave_type as LeaveTypeCode]?.label ||
                                att.leaveRecord.leave_type}{" "}
                              — {durationLabel(att.leaveRecord.duration)}
                            </p>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                ))}
              </div>
            </div>
          </div>

          {/* Right side actions */}
          {canModify && b.status !== "cancelled" && b.status !== "completed" && (
            <div className="flex md:flex-col items-end justify-end gap-2 shrink-0">
              {b.status === "scheduled" && (
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
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-2" />
                    Message Attendees
                  </DropdownMenuItem>
                  {b.status === "scheduled" && canEditOrCancel && (
                    <DropdownMenuItem
                      onClick={() => handleCancel(b.id, b.title)}
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
