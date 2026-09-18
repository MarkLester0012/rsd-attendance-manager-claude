"use client";

import { useState, useMemo, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays, subDays, parseISO } from "date-fns";
import { DoorOpen, Plus, ChevronLeft, ChevronRight, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import { BookMeetingModal } from "./book-meeting-modal";
import { EditMeetingModal } from "./edit-meeting-modal";
import { RoomStatusHero } from "./room-status-hero";
import { RoomStats } from "./room-stats";
import { RoomTimeline } from "./room-timeline";
import { BookingCard } from "./booking-card";
import {
  startMeetingAndNotify,
  endMeetingEarly,
  extendMeeting,
  cancelBooking,
  messageAttendees,
} from "./actions";
import { getLiveRoomStatus, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { createClient } from "@/lib/supabase/client";
import type { MeetingWithAttendees, User } from "@/lib/types";
import { toast } from "sonner";
import { useRegisterPageContext } from "@/hooks/use-register-page-context";

interface MeetingRoomContentProps {
  currentUser: User;
  allUsers: User[];
  initialBookings: MeetingWithAttendees[];
  leaves: LeaveRecord[];
  currentDateStr: string;
  highlightMeetingId: string | null;
  /** SLACK_MEETING_ROOM_CHANNEL, server-read (it isn't NEXT_PUBLIC_) — the channel used when a booking doesn't specify one. */
  defaultSlackChannel: string;
}

export function MeetingRoomContent({
  currentUser,
  allUsers,
  initialBookings,
  leaves,
  currentDateStr,
  highlightMeetingId,
  defaultSlackChannel,
}: MeetingRoomContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bookings, setBookings] = useState<MeetingWithAttendees[]>(initialBookings);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<MeetingWithAttendees | null>(null);
  const [messagingBooking, setMessagingBooking] = useState<MeetingWithAttendees | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<MeetingWithAttendees | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "in_progress" | "scheduled" | "completed">("all");
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => officeMinutesOfDay());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightMeetingId);
  const [isDateChangePending, startDateChangeTransition] = useTransition();

  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Sync state when props change
  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Refetch bookings for the currently-viewed date. Used by the realtime
  // subscription below so a meeting started/cancelled/auto-transitioned by
  // someone else (or by the cron) shows up here without a manual reload —
  // mirrors the query in page.tsx and the pattern in room-status-badge.tsx.
  const refetchBookings = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("meeting_room_bookings")
      .select(`
        *,
        organizer:users!meeting_room_bookings_organizer_id_fkey(*),
        attendees:meeting_attendees(
          id,
          booking_id,
          user_id,
          created_at,
          user:users(*, department:departments(*))
        )
      `)
      .eq("meeting_date", currentDateStr)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Failed to refresh meeting room bookings:", error.message);
      return;
    }
    setBookings((data || []) as unknown as MeetingWithAttendees[]);
  }, [currentDateStr]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`meeting_room_bookings_${currentDateStr}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_room_bookings",
          filter: `meeting_date=eq.${currentDateStr}`,
        },
        () => {
          refetchBookings();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Meeting room realtime subscription failed:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentDateStr, refetchBookings]);

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

  // Date Navigation handlers. Wrapped in useTransition so prev/next/today
  // clicks get immediate pending feedback (buttons disable, timeline dims) —
  // a searchParams-only navigation to this same route segment does not
  // reliably re-trigger loading.tsx's Suspense boundary, so without this the
  // click otherwise looks like it did nothing until the server responds.
  const handleDateChange = (newDateStr: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("date", newDateStr);
    params.delete("meeting");
    startDateChangeTransition(() => {
      router.push(`/meeting-room?${params.toString()}`);
    });
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

  // Per-tab counts for the filter Tabs below, computed the same way filteredBookings is.
  const inProgressCount = useMemo(
    () => bookings.filter((b) => b.status === "in_progress").length,
    [bookings]
  );
  const scheduledCount = useMemo(
    () => bookings.filter((b) => b.status === "scheduled").length,
    [bookings]
  );
  const pastCount = useMemo(
    () => bookings.filter((b) => b.status === "completed" || b.status === "cancelled").length,
    [bookings]
  );

  const FILTER_TAB_LABELS: Record<typeof filterTab, string> = {
    all: "All",
    in_progress: "In Progress",
    scheduled: "Scheduled",
    completed: "Past",
  };

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
        if (res.slackWarning) toast.warning(res.slackWarning);
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

  const handleCancel = (id: string, _title: string) => {
    const booking = bookings.find((b) => b.id === id);
    if (booking) setCancellingBooking(booking);
  };

  const confirmCancel = async () => {
    if (!cancellingBooking) return;
    const { id, title } = cancellingBooking;
    setActionLoading(id);
    try {
      const res = await cancelBooking(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Meeting "${title}" cancelled.`);
        if (res.slackWarning) toast.warning(res.slackWarning);
        router.refresh();
      }
    } catch {
      toast.error("Failed to cancel meeting");
    } finally {
      setActionLoading(null);
      setCancellingBooking(null);
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
      <RoomStatusHero
        isCurrentDayToday={isCurrentDayToday}
        currentDateStr={currentDateStr}
        liveStatus={liveStatus}
        bookings={bookings}
        defaultSlackChannel={defaultSlackChannel}
        canManageMeetings={canManageMeetings}
        actionLoading={actionLoading}
        handleStartMeeting={handleStartMeeting}
        handleExtend={handleExtend}
        handleEndEarly={handleEndEarly}
      />

      {/* Stat row */}
      <RoomStats bookings={bookings} isCurrentDayToday={isCurrentDayToday} liveStatus={liveStatus} />

      {/* Hourly Visual Timeline Track */}
      <RoomTimeline
        isCurrentDayToday={isCurrentDayToday}
        currentDateStr={currentDateStr}
        isDateChangePending={isDateChangePending}
        bookings={bookings}
        currentTimeMinutes={currentTimeMinutes}
      />

      {/* Date Navigation & Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevDay}
            disabled={isDateChangePending}
            title="Previous Day"
          >
            {isDateChangePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant={isCurrentDayToday ? "default" : "outline"}
            size="sm"
            onClick={handleToday}
            disabled={isDateChangePending}
            className="text-xs"
          >
            Today
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleNextDay}
            disabled={isDateChangePending}
            title="Next Day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2 ml-2">
            <DatePickerButton
              value={parseISO(currentDateStr)}
              onChange={(d) => d && handleDateChange(format(d, "yyyy-MM-dd"))}
              disabled={isDateChangePending}
              align="center"
              dateFormat="EEEE, MMMM d, yyyy"
              className="min-w-[220px]"
            />
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
              In Progress ({inProgressCount})
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="text-xs">
              Scheduled ({scheduledCount})
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">
              Past ({pastCount})
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
                  : `No ${FILTER_TAB_LABELS[filterTab]} meetings on this date.`}
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
          filteredBookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              currentUser={currentUser}
              leaves={leaves}
              defaultSlackChannel={defaultSlackChannel}
              canManageMeetings={canManageMeetings}
              isHighlighted={b.id === highlightedId}
              actionLoading={actionLoading}
              isCurrentDayToday={isCurrentDayToday}
              currentTimeMinutes={currentTimeMinutes}
              onCardRef={(el) => {
                if (el) cardRefs.current.set(b.id, el);
                else cardRefs.current.delete(b.id);
              }}
              handleStartMeeting={handleStartMeeting}
              handleExtend={handleExtend}
              handleEndEarly={handleEndEarly}
              handleCancel={handleCancel}
              onEdit={(booking) => setEditingBooking(booking)}
              onMessage={(booking) => {
                setMessageText("");
                setMessagingBooking(booking);
              }}
            />
          ))
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
          defaultSlackChannel={defaultSlackChannel}
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
          defaultSlackChannel={defaultSlackChannel}
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

      {/* Cancel Meeting Confirmation */}
      <AlertDialog
        open={!!cancellingBooking}
        onOpenChange={(o) => {
          if (!o) setCancellingBooking(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel &quot;{cancellingBooking?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Attendees will be notified in Slack and in-app. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
            >
              Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
