"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays, subDays, parseISO } from "date-fns";
import {
  DoorOpen,
  Calendar,
  Clock,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Radio,
  Building2,
  Laptop,
  Palmtree,
  Timer,
  MoreVertical,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { BookMeetingModal } from "./book-meeting-modal";
import { EditMeetingModal } from "./edit-meeting-modal";
import {
  startMeetingAndNotify,
  endMeetingEarly,
  extendMeeting,
  cancelBooking,
  messageAttendees,
} from "./actions";
import {
  timeToMinutes,
  minutesToTime,
  getLiveRoomStatus,
  resolveAttendeeStatus,
  type LeaveRecord,
} from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import type {
  MeetingWithAttendees,
  User,
  MeetingAttendeeStatus,
  LeaveTypeCode,
} from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRegisterPageContext } from "@/hooks/use-register-page-context";

interface MeetingRoomContentProps {
  currentUser: User;
  allUsers: User[];
  initialBookings: MeetingWithAttendees[];
  leaves: LeaveRecord[];
  currentDateStr: string;
  highlightMeetingId: string | null;
}

// Matches the 07:00-20:00 range offered in the booking modal's time picker,
// so a booking at either edge of the day is never silently clipped off the
// timeline.
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 20;
const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

function durationLabel(duration: string | undefined): string {
  if (duration === "half_am") return "AM half-day";
  if (duration === "half_pm") return "PM half-day";
  return "Full day";
}

export function MeetingRoomContent({
  currentUser,
  allUsers,
  initialBookings,
  leaves,
  currentDateStr,
  highlightMeetingId,
}: MeetingRoomContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookings, setBookings] = useState<MeetingWithAttendees[]>(initialBookings);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<MeetingWithAttendees | null>(null);
  const [messagingBooking, setMessagingBooking] = useState<MeetingWithAttendees | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "in_progress" | "scheduled" | "completed">("all");
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => officeMinutesOfDay());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightMeetingId);

  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Sync state when props change
  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Scroll to and briefly highlight the meeting a notification linked to.
  useEffect(() => {
    if (!highlightMeetingId) return;
    const el = cardRefs.current.get(highlightMeetingId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMeetingId]);

  // Keep clock updated every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMinutes(officeMinutesOfDay());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const isCurrentDayToday = useMemo(() => {
    return currentDateStr === officeDateString();
  }, [currentDateStr]);

  const canManageMeetings = currentUser.role === "leader" || currentUser.role === "hr";

  // Calculate live room status
  const liveStatus = useMemo(() => {
    if (!isCurrentDayToday) {
      return { isOccupied: false, currentMeeting: null, nextMeeting: null };
    }
    return getLiveRoomStatus(currentTimeMinutes, bookings);
  }, [bookings, currentTimeMinutes, isCurrentDayToday]);

  // Date Navigation handlers
  const handleDateChange = (newDateStr: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("date", newDateStr);
    params.delete("meeting");
    router.push(`/meeting-room?${params.toString()}`);
  };

  const handlePrevDay = () => {
    const current = parseISO(currentDateStr);
    handleDateChange(format(subDays(current, 1), "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    const current = parseISO(currentDateStr);
    handleDateChange(format(addDays(current, 1), "yyyy-MM-dd"));
  };

  const handleToday = () => {
    handleDateChange(officeDateString());
  };

  // Filter bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (filterTab === "all") return true;
      if (filterTab === "in_progress") return b.status === "in_progress";
      if (filterTab === "scheduled") return b.status === "scheduled";
      if (filterTab === "completed") return b.status === "completed" || b.status === "cancelled";
      return true;
    });
  }, [bookings, filterTab]);

  useRegisterPageContext("Meeting Room", {
    date: currentDateStr,
    roomStatus: liveStatus.isOccupied ? "occupied" : "available",
    bookings: bookings.slice(0, 30).map((b) => ({
      title: b.title,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      organizer: b.organizer?.name ?? null,
      attendeeCount: b.attendees?.length ?? 0,
    })),
  });

  // Actions
  const handleStartMeeting = async (id: string, title: string) => {
    setActionLoading(id);
    try {
      const res = await startMeetingAndNotify(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Meeting "${title}" started! Announcements broadcasted.`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to start meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndEarly = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await endMeetingEarly(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Meeting ended. Room is now available.");
        router.refresh();
      }
    } catch {
      toast.error("Failed to end meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtend = async (id: string, mins: number = 15) => {
    setActionLoading(id);
    try {
      const res = await extendMeeting(id, mins);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Meeting extended to ${res.newEndTime}`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to extend meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to cancel "${title}"?`)) return;
    setActionLoading(id);
    try {
      const res = await cancelBooking(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Meeting "${title}" cancelled.`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to cancel meeting");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!messagingBooking) return;
    const trimmed = messageText.trim();
    if (!trimmed) return;
    setSendingMessage(true);
    try {
      const res = await messageAttendees(messagingBooking.id, trimmed);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          `Message sent to ${res.sentTo} attendee${res.sentTo === 1 ? "" : "s"}.`
        );
        setMessagingBooking(null);
        setMessageText("");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  }, [messagingBooking, messageText]);

  // Helper for attendee status pill — colors match the "in_office/virtual/on_leave"
  // badges used in the attendee picker inside book-meeting-modal.tsx.
  const renderAttendeeStatusPill = (status: MeetingAttendeeStatus) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Physical meeting room occupancy, calendar schedules, and automated Slack announcements.
        </p>

        <div className="flex items-center gap-2">
          {canManageMeetings ? (
            <Button onClick={() => setIsBookModalOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" /> Book Room
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground py-1 px-2.5">
              Leaders & HR can book
            </Badge>
          )}
        </div>
      </div>

      {/* Live Room Status Hero Banner (Shown prominently) */}
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
                  {liveStatus.isOccupied ? "Meeting Room is Currently Occupied" : "Meeting Room is Currently Available"}
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
                        {liveStatus.currentMeeting.slack_channel || "rsd-leader-team"}
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
                  <a
                    href="slack://channel?id=rsd-leader-team"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline px-2 py-1"
                    title="Open Slack channel / huddle"
                  >
                    <Radio className="h-3.5 w-3.5 text-blue-500 animate-pulse" />
                    Slack Huddle
                  </a>
                </>
              ) : (
                canManageMeetings && (
                  <Button size="sm" onClick={() => setIsBookModalOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Book Now
                  </Button>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hourly Visual Timeline Track */}
      <Card className="shadow-sm border-border">
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
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

              {/* Booking blocks on timeline */}
              {bookings
                .filter((b) => b.status === "scheduled" || b.status === "in_progress")
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

                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-xs font-medium text-white truncate shadow-sm transition-all",
                        isInProgress
                          ? "bg-amber-600 border border-amber-400"
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
                    </div>
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
                positions). */}
            <div className="relative mt-2 h-4 text-[11px] text-muted-foreground font-mono">
              {Array.from({ length: TIMELINE_HOURS + 1 }).map((_, idx) => {
                const hour = TIMELINE_START_HOUR + idx;
                const percent = (idx / TIMELINE_HOURS) * 100;
                const isFirst = idx === 0;
                const isLast = idx === TIMELINE_HOURS;
                return (
                  <span
                    key={idx}
                    className="absolute whitespace-nowrap"
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
        </CardContent>
      </Card>

      {/* Date Navigation & Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay} title="Previous Day">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant={isCurrentDayToday ? "default" : "outline"}
            size="sm"
            onClick={handleToday}
            className="text-xs"
          >
            Today
          </Button>

          <Button variant="outline" size="icon" onClick={handleNextDay} title="Next Day">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 ml-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {format(parseISO(currentDateStr), "EEEE, MMMM d, yyyy")}
            </span>
            {isCurrentDayToday && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                Today
              </Badge>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs
          value={filterTab}
          onValueChange={(val) => setFilterTab(val as typeof filterTab)}
          className="w-auto"
        >
          <TabsList className="grid grid-cols-4 w-full sm:w-auto h-9">
            <TabsTrigger value="all" className="text-xs">
              All ({bookings.length})
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">
              In Progress
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="text-xs">
              Scheduled
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">
              Past
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Bookings List */}
      <div className="space-y-3">
        {filteredBookings.length === 0 ? (
          <Card className="border-dashed border-border bg-card/40">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <DoorOpen className="h-10 w-10 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-semibold text-foreground">No meetings found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                {filterTab === "all"
                  ? `There are no meeting room bookings on ${format(parseISO(currentDateStr), "MMM d, yyyy")}.`
                  : `No meetings in status "${filterTab}" on this date.`}
              </p>
              {canManageMeetings && (
                <Button
                  onClick={() => setIsBookModalOpen(true)}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Schedule a Meeting
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredBookings.map((b) => {
            const isOrganizer = b.organizer_id === currentUser.id;
            const canModify = canManageMeetings || isOrganizer;

            // Resolve attendee statuses
            const attendeesWithStatus = (b.attendees || []).map((att) => {
              const status = resolveAttendeeStatus(att.user_id, b.meeting_date, leaves, b.start_time);
              const leaveRecord = leaves.find(
                (l) => l.user_id === att.user_id && l.leave_date === b.meeting_date && l.status === "approved"
              );
              return { ...att, resolvedStatus: status, leaveRecord };
            });

            return (
              <Card
                key={b.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(b.id, el);
                  else cardRefs.current.delete(b.id);
                }}
                className={cn(
                  "transition-all duration-200 shadow-sm border",
                  b.id === highlightedId && "ring-2 ring-primary ring-offset-2 ring-offset-background",
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
                          {b.start_time} - {b.end_time}
                        </Badge>

                        {/* Status badge */}
                        {b.status === "in_progress" && (
                          <Badge className="bg-amber-600 hover:bg-amber-600 text-white gap-1 text-xs animate-pulse">
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
                            #{b.slack_channel || "rsd-leader-team"}
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
                          <span>{b.organizer?.name}</span>
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
                            {b.status === "scheduled" && (
                              <DropdownMenuItem onClick={() => setEditingBooking(b)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit Meeting
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setMessageText("");
                                setMessagingBooking(b);
                              }}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-2" />
                              Message Attendees
                            </DropdownMenuItem>
                            {b.status === "scheduled" && (
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
          })
        )}
      </div>

      {/* Book Meeting Modal */}
      {isBookModalOpen && (
        <BookMeetingModal
          open={isBookModalOpen}
          onClose={() => setIsBookModalOpen(false)}
          currentUser={currentUser}
          users={allUsers}
          leaves={leaves}
          currentDateStr={currentDateStr}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* Edit Meeting Modal */}
      {editingBooking && (
        <EditMeetingModal
          open={!!editingBooking}
          onClose={() => setEditingBooking(null)}
          booking={editingBooking}
          users={allUsers}
          leaves={leaves}
          onSuccess={() => {
            setEditingBooking(null);
            router.refresh();
          }}
        />
      )}

      {/* Message Attendees Dialog */}
      <Dialog
        open={!!messagingBooking}
        onOpenChange={(o) => {
          if (!o) setMessagingBooking(null);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Message Attendees
            </DialogTitle>
            <DialogDescription>
              Sends a Slack DM and in-app notification to everyone in &quot;
              {messagingBooking?.title}&quot; except you.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <EmojiTextarea
              rows={4}
              placeholder="e.g. Running 5 minutes late, please wait in the lobby."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMessagingBooking(null)} disabled={sendingMessage}>
              Cancel
            </Button>
            <Button onClick={handleSendMessage} disabled={sendingMessage || !messageText.trim()}>
              {sendingMessage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
