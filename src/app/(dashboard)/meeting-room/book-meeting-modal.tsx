"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Loader2, Users } from "lucide-react";
import { createBooking } from "./actions";
import { TimeRangeFields } from "./_components/time-range-fields";
import { AttendeePicker } from "./_components/attendee-picker";
import { SlackChannelField } from "./_components/slack-channel-field";
import {
  timeToMinutes,
  minutesToTime,
  isBookingInThePast,
  type LeaveRecord,
  type ExistingMeetingTime,
} from "@/lib/utils/meeting-conflicts";
import { parseSlackChannel } from "@/lib/utils/slack-channel";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { createClient } from "@/lib/supabase/client";
import { MEETING_ROOM_START_HOUR, MEETING_ROOM_END_HOUR } from "@/lib/meetings/time-slots";
import type { User } from "@/lib/types";

const FIRST_START_MINUTES = MEETING_ROOM_START_HOUR * 60; // matches TIME_OPTIONS' first slot
const LAST_START_MINUTES = MEETING_ROOM_END_HOUR * 60 - 30; // matches TIME_OPTIONS' last start slot
const LAST_SLOT_MINUTES = MEETING_ROOM_END_HOUR * 60; // matches TIME_OPTIONS' last slot (the room's closing time)

/**
 * For today, defaults to office-now rounded up to the next 30-minute slot
 * (clamped into the pickable range) instead of a fixed 09:00 — opening the
 * modal in the afternoon used to default to a start time already in the
 * past, which the past-time validation would then just reject. Any other
 * date keeps the plain 09:00 default.
 */
function defaultStartTimeFor(meetingDateStr: string, todayStr: string): string {
  if (meetingDateStr !== todayStr) return "09:00";
  const rounded = Math.ceil(officeMinutesOfDay() / 30) * 30;
  const clamped = Math.min(Math.max(rounded, FIRST_START_MINUTES), LAST_START_MINUTES);
  return minutesToTime(clamped);
}

interface BookMeetingModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User;
  users: User[];
  leaves: LeaveRecord[];
  /** The page's currently-viewed date — `leaves` and `bookings` are scoped to this date. */
  currentDateStr: string;
  /** Active bookings on `currentDateStr`, used to disable already-booked start times. */
  bookings: ExistingMeetingTime[];
  /** Channel used when the field is left blank — shown as the input's placeholder. */
  defaultSlackChannel: string;
  /** Prefills the start time (e.g. from a timeline slot click) instead of the usual "next 30-min slot" default. */
  initialStartTime?: string;
  onSuccess: () => void;
}

export function BookMeetingModal({
  open,
  onClose,
  currentUser,
  users,
  leaves,
  currentDateStr,
  bookings,
  defaultSlackChannel,
  initialStartTime,
  onSuccess,
}: BookMeetingModalProps) {
  const todayStr = officeDateString();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Default to the date currently being viewed, but never pre-fill a date
  // before today (e.g. when opened while browsing a past date's schedule) —
  // 'yyyy-MM-dd' strings compare correctly as plain strings.
  const initialMeetingDate = currentDateStr >= todayStr ? currentDateStr : todayStr;
  const [meetingDate, setMeetingDate] = useState(initialMeetingDate);
  const initialStartTimeValue = initialStartTime ?? defaultStartTimeFor(initialMeetingDate, todayStr);
  const [startTime, setStartTime] = useState(initialStartTimeValue);
  const [endTime, setEndTime] = useState(
    minutesToTime(Math.min(timeToMinutes(initialStartTimeValue) + 60, LAST_SLOT_MINUTES))
  );
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set([currentUser.id])
  );
  const [notifyChannel, setNotifyChannel] = useState(true);
  const [slackChannel, setSlackChannel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The `leaves` prop is scoped to currentDateStr. If the user picks a
  // different meetingDate, refetch leaves for that date so the WFH/leave
  // preview reflects the actual chosen day instead of silently showing
  // everyone as in-office.
  const [dateLeaves, setDateLeaves] = useState<LeaveRecord[]>(leaves);
  useEffect(() => {
    if (meetingDate === currentDateStr) {
      setDateLeaves(leaves);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("leaves")
      .select("user_id, leave_type, leave_date, duration, status")
      .eq("leave_date", meetingDate)
      .eq("status", "approved")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load leaves for selected date:", error.message);
          return;
        }
        setDateLeaves((data as LeaveRecord[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingDate, currentDateStr, leaves]);

  // Same pattern as dateLeaves above: `bookings` is scoped to currentDateStr,
  // so a different picked meetingDate needs its own active-bookings fetch for
  // the conflict-aware start-time picker (TimeRangeFields) to disable the
  // right slots.
  const [otherDateBookings, setOtherDateBookings] = useState<ExistingMeetingTime[]>([]);
  useEffect(() => {
    if (meetingDate === currentDateStr) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("meeting_room_bookings")
      .select("id, start_time, end_time, status")
      .eq("meeting_date", meetingDate)
      .in("status", ["scheduled", "in_progress"])
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load bookings for selected date:", error.message);
          return;
        }
        setOtherDateBookings((data as ExistingMeetingTime[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingDate, currentDateStr]);

  const effectiveBookings: ExistingMeetingTime[] =
    meetingDate === currentDateStr ? bookings : otherDateBookings;

  const timeError =
    timeToMinutes(endTime) <= timeToMinutes(startTime)
      ? "End time must be after start time"
      : null;

  const parsedChannel = parseSlackChannel(slackChannel);
  const channelError = parsedChannel.ok ? null : parsedChannel.error;

  // Toggle attendee
  const toggleAttendee = (id: string) => {
    setSelectedAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting oneself as organizer
        if (id !== currentUser.id) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a meeting title");
      return;
    }
    if (meetingDate < todayStr) {
      toast.error("Cannot book a meeting in the past");
      return;
    }
    if (isBookingInThePast(meetingDate, startTime, todayStr, officeMinutesOfDay())) {
      toast.error("Cannot book a meeting for a time that has already passed");
      return;
    }
    if (timeError) {
      toast.error(timeError);
      return;
    }
    if (channelError) {
      toast.error(channelError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await createBooking({
        title: title.trim(),
        description: description.trim() || undefined,
        meeting_date: meetingDate,
        start_time: startTime,
        end_time: endTime,
        attendee_ids: Array.from(selectedAttendees),
        notify_channel: notifyChannel,
        slack_channel: parsedChannel.ok ? parsedChannel.value ?? undefined : undefined,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success("Meeting scheduled successfully!");
      onSuccess();
      onClose();
      // No state reset here — the modal unmounts on close
      // ({isBookModalOpen && <BookMeetingModal .../>} in meeting-room-content.tsx),
      // so a fresh open always starts from this component's initial state anyway.
    } catch {
      toast.error("Failed to schedule meeting");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Book Meeting Room
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting-title">
              Meeting Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="meeting-title"
              placeholder="e.g. Weekly Tech Sync / Architecture Discussion"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Date, Start, End */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <DatePickerButton
                value={parseISO(meetingDate)}
                onChange={(d) => d && setMeetingDate(format(d, "yyyy-MM-dd"))}
                minDate={parseISO(todayStr)}
                className="w-full"
              />
            </div>

            <TimeRangeFields
              meetingDate={meetingDate}
              todayStr={todayStr}
              startTime={startTime}
              endTime={endTime}
              bookings={effectiveBookings}
              onChange={({ startTime, endTime }) => {
                setStartTime(startTime);
                setEndTime(endTime);
              }}
            />
          </div>
          {timeError && <p className="text-xs text-destructive -mt-2">{timeError}</p>}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="meeting-desc">Description / Agenda (Optional)</Label>
            <EmojiTextarea
              id="meeting-desc"
              placeholder="Brief agenda or topics to cover..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Attendees Selection with live WFH/Leave preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Invite Attendees ({selectedAttendees.size})</Label>
              <span className="text-xs text-muted-foreground">
                Auto-detects WFH & Leave status
              </span>
            </div>

            <AttendeePicker
              users={users}
              selectedAttendees={selectedAttendees}
              onToggle={toggleAttendee}
              meetingDate={meetingDate}
              startTime={startTime}
              leaves={dateLeaves}
              lockedUserId={currentUser.id}
              lockedLabel="(You)"
            />
          </div>

          {/* Slack notification toggle + channel */}
          <SlackChannelField
            inputId="meeting-slack-channel"
            notifyChannel={notifyChannel}
            onNotifyChannelChange={setNotifyChannel}
            slackChannel={slackChannel}
            onSlackChannelChange={setSlackChannel}
            defaultSlackChannel={defaultSlackChannel}
            channelError={channelError}
            helperText={`Leave blank to use #${defaultSlackChannel}. The bot must already be in private channels to post there.`}
          />

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !!timeError || !!channelError}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scheduling...
                </>
              ) : (
                "Confirm Booking"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
