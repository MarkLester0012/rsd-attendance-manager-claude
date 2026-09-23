"use client";

import { useState, useMemo, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays, subDays, parseISO } from "date-fns";
import { DoorOpen, Plus, ChevronLeft, ChevronRight, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { NowStrip } from "./_components/now-strip";
import { RoomTimeline } from "./room-timeline";
import { BookingCard } from "./booking-card";
import {
  startMeetingAndNotify,
  endMeetingEarly,
  extendMeeting,
  cancelBooking,
  messageAttendees,
} from "./actions";
import { getLiveRoomStatus, timeToMinutes, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { MEETING_BOOKINGS_SELECT } from "@/lib/meetings/queries";
import { createClient } from "@/lib/supabase/client";
import type { MeetingWithAttendees, User } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  const [showEarlier, setShowEarlier] = useState(false);
  const [prefillStartTime, setPrefillStartTime] = useState<string | null>(null);
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => officeMinutesOfDay());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(highlightMeetingId);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [isDateChangePending, startDateChangeTransition] = useTransition();

  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state when the viewed date actually changes (prev/next/today/a deep
  // link) — not on every parent re-render. Every mutating action already
  // calls revalidatePath, which causes this page's server props to refresh
  // and initialBookings to get a new array identity even when the date
  // hasn't changed; syncing on that identity alone let a stale server-
  // rendered snapshot clobber a newer state already applied by the realtime
  // subscription below (see refetchBookings). Keying on currentDateStr
  // instead means a same-date refresh no longer touches `bookings` here —
  // the realtime subscription (or an action's own refetchBookings() call) is
  // the sole path for in-place updates.
  useEffect(() => {
    setBookings(initialBookings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateStr]);

  // Refetch bookings for the currently-viewed date. Used by the realtime
  // subscription below so a meeting started/cancelled/auto-transitioned by
  // someone else (or by the cron) shows up here without a manual reload —
  // mirrors the query in page.tsx and the pattern in room-status-badge.tsx.
  // Also called directly after this tab's own actions succeed (instead of
  // router.refresh()), since it's a single narrow query rather than a full
  // page re-render and doesn't depend on the realtime channel being up.
  const refetchBookings = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("meeting_room_bookings")
      .select(MEETING_BOOKINGS_SELECT)
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

  // Scrolls to and briefly highlights a booking's card — used by both the
  // notification deep-link below and the timeline's block-click. A completed
  // or cancelled booking's card only exists once the collapsed "Earlier"
  // section is expanded, so this expands it first and defers the actual
  // scroll to the effect below (cardRefs isn't populated for an unmounted
  // card yet).
  const focusBooking = useCallback(
    (id: string) => {
      const booking = bookings.find((b) => b.id === id);
      if (booking && (booking.status === "completed" || booking.status === "cancelled")) {
        setShowEarlier(true);
      }
      setHighlightedId(id);
      setPendingScrollId(id);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 3000);
    },
    [bookings]
  );

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Scroll to and briefly highlight the meeting a notification linked to.
  useEffect(() => {
    if (!highlightMeetingId) return;
    focusBooking(highlightMeetingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMeetingId]);

  // Runs the actual scroll once the target card is mounted — after a
  // showEarlier expansion commits, or immediately for an already-visible
  // Now/Upcoming card.
  useEffect(() => {
    if (!pendingScrollId) return;
    const el = cardRefs.current.get(pendingScrollId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, showEarlier]);

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

  // Grouped sections replacing the old 4-tab filter — "Now" (in progress),
  // "Upcoming" (scheduled, soonest first), and a collapsible "Earlier"
  // (completed + cancelled). A single room has few meetings a day, so
  // grouping beats hiding things behind tabs.
  const nowBookings = useMemo(() => bookings.filter((b) => b.status === "in_progress"), [bookings]);
  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "scheduled")
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
    [bookings]
  );
  const earlierBookings = useMemo(
    () => bookings.filter((b) => b.status === "completed" || b.status === "cancelled"),
    [bookings]
  );

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
        refetchBookings();
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
        refetchBookings();
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
        refetchBookings();
      }
    } catch {
      toast.error("Failed to extend meeting");
    } finally {
      setActionLoading(null);
    }
  };

  // Opens the book modal prefilled with a timeline slot click's rounded time.
  const handleTimelineSlotClick = useCallback((time: string) => {
    setPrefillStartTime(time);
    setIsBookModalOpen(true);
  }, []);

  const handleCancel = (id: string) => {
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
        refetchBookings();
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

  const openBookModal = () => {
    setPrefillStartTime(null);
    setIsBookModalOpen(true);
  };

  const renderCard = (b: MeetingWithAttendees) => (
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
  );

  return (
    <div className="space-y-6">
      {/* Toolbar: date navigation on the left, Book Room on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevDay}
            disabled={isDateChangePending}
            title="Previous Day"
            aria-label="Previous Day"
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
            aria-label="Next Day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <DatePickerButton
            value={parseISO(currentDateStr)}
            onChange={(d) => d && handleDateChange(format(d, "yyyy-MM-dd"))}
            disabled={isDateChangePending}
            align="center"
            dateFormat="EEEE, MMMM d, yyyy"
            className="min-w-[220px]"
          />
        </div>

        <div className="flex items-center gap-2">
          {canManageMeetings ? (
            <Button onClick={openBookModal} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" /> Book Room
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground py-1 px-2.5">
              Leaders & HR can book
            </Badge>
          )}
        </div>
      </div>

      {/* Now strip — merges the old hero + stat cards into one compact card */}
      <NowStrip
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

      {/* Hourly Visual Timeline Track — click an empty slot to book, click a block to jump to its card */}
      <RoomTimeline
        isCurrentDayToday={isCurrentDayToday}
        currentDateStr={currentDateStr}
        isDateChangePending={isDateChangePending}
        bookings={bookings}
        currentTimeMinutes={currentTimeMinutes}
        canManageMeetings={canManageMeetings}
        onSlotClick={handleTimelineSlotClick}
        onBookingClick={focusBooking}
      />

      {/* Agenda: Now / Upcoming / Earlier */}
      {nowBookings.length === 0 && upcomingBookings.length === 0 && earlierBookings.length === 0 ? (
        <Card className="border-dashed border-border bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DoorOpen className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <h3 className="text-base font-semibold text-foreground">No meetings found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              There are no meeting room bookings on {format(parseISO(currentDateStr), "MMM d, yyyy")}.
            </p>
            {canManageMeetings && (
              <Button onClick={openBookModal} variant="outline" size="sm" className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Schedule a Meeting
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {nowBookings.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Now</h3>
              {nowBookings.map(renderCard)}
            </div>
          )}

          {upcomingBookings.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Upcoming</h3>
              {upcomingBookings.map(renderCard)}
            </div>
          )}

          {earlierBookings.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowEarlier((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={showEarlier}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", !showEarlier && "-rotate-90")} />
                Earlier ({earlierBookings.length})
              </button>
              {showEarlier && earlierBookings.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {/* Book Meeting Modal */}
      {isBookModalOpen && (
        <BookMeetingModal
          open={isBookModalOpen}
          onClose={() => {
            setIsBookModalOpen(false);
            setPrefillStartTime(null);
          }}
          currentUser={currentUser}
          users={allUsers}
          leaves={leaves}
          currentDateStr={currentDateStr}
          bookings={bookings}
          defaultSlackChannel={defaultSlackChannel}
          initialStartTime={prefillStartTime ?? undefined}
          onSuccess={() => {
            refetchBookings();
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
          bookings={bookings}
          defaultSlackChannel={defaultSlackChannel}
          onSuccess={() => {
            setEditingBooking(null);
            refetchBookings();
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
