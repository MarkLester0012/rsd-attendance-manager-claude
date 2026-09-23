"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { updateBooking } from "./actions";
import { TimeRangeFields } from "./_components/time-range-fields";
import { AttendeePicker } from "./_components/attendee-picker";
import { SlackChannelField } from "./_components/slack-channel-field";
import {
  timeToMinutes,
  isBookingInThePast,
  type LeaveRecord,
  type ExistingMeetingTime,
} from "@/lib/utils/meeting-conflicts";
import { parseSlackChannel } from "@/lib/utils/slack-channel";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import type { MeetingWithAttendees, User } from "@/lib/types";

interface EditMeetingModalProps {
  open: boolean;
  onClose: () => void;
  booking: MeetingWithAttendees;
  users: User[];
  leaves: LeaveRecord[];
  /** Active bookings on `booking.meeting_date`, used to disable already-booked start times. */
  bookings: ExistingMeetingTime[];
  /** Channel used when the field is left blank — shown as the input's placeholder. */
  defaultSlackChannel: string;
  onSuccess: () => void;
}

export function EditMeetingModal({
  open,
  onClose,
  booking,
  users,
  leaves,
  bookings,
  defaultSlackChannel,
  onSuccess,
}: EditMeetingModalProps) {
  const [title, setTitle] = useState(booking.title);
  const [description, setDescription] = useState(booking.description || "");
  const [startTime, setStartTime] = useState(booking.start_time);
  const [endTime, setEndTime] = useState(booking.end_time);
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set((booking.attendees || []).map((a) => a.user_id))
  );
  const [notifyChannel, setNotifyChannel] = useState(booking.notify_channel);
  const [slackChannel, setSlackChannel] = useState(booking.slack_channel ?? "");
  const [submitting, setSubmitting] = useState(false);

  const organizerId = booking.organizer_id;
  const todayStr = officeDateString();

  const timeError =
    timeToMinutes(endTime) <= timeToMinutes(startTime)
      ? "End time must be after start time"
      : null;

  const parsedChannel = parseSlackChannel(slackChannel);
  const channelError = parsedChannel.ok ? null : parsedChannel.error;

  const toggleAttendee = (id: string) => {
    setSelectedAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting the organizer
        if (id !== organizerId) next.delete(id);
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
    if (timeError) {
      toast.error(timeError);
      return;
    }
    if (isBookingInThePast(booking.meeting_date, startTime, officeDateString(), officeMinutesOfDay())) {
      toast.error("Cannot move this meeting to a time that has already passed");
      return;
    }
    if (channelError) {
      toast.error(channelError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await updateBooking(booking.id, {
        title: title.trim(),
        description: description.trim() || undefined,
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

      toast.success("Meeting updated successfully!");
      if (res.slackWarning) toast.warning(res.slackWarning);
      onSuccess();
    } catch {
      toast.error("Failed to update meeting");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Meeting
          </DialogTitle>
          <DialogDescription>
            {format(parseISO(booking.meeting_date), "EEEE, MMMM d, yyyy")} — the date can&apos;t
            be changed here; cancel and rebook to move it to a different day.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-meeting-title">
              Meeting Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-meeting-title"
              placeholder="e.g. Weekly Tech Sync / Architecture Discussion"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Start, End */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TimeRangeFields
              meetingDate={booking.meeting_date}
              todayStr={todayStr}
              startTime={startTime}
              endTime={endTime}
              bookings={bookings}
              ignoreBookingId={booking.id}
              onChange={({ startTime, endTime }) => {
                setStartTime(startTime);
                setEndTime(endTime);
              }}
            />
          </div>
          {timeError && <p className="text-xs text-destructive -mt-2">{timeError}</p>}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-meeting-desc">Description / Agenda (Optional)</Label>
            <EmojiTextarea
              id="edit-meeting-desc"
              placeholder="Brief agenda or topics to cover..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Attendees Selection with live WFH/Leave preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Attendees ({selectedAttendees.size})</Label>
              <span className="text-xs text-muted-foreground">
                Auto-detects WFH & Leave status
              </span>
            </div>

            <AttendeePicker
              users={users}
              selectedAttendees={selectedAttendees}
              onToggle={toggleAttendee}
              meetingDate={booking.meeting_date}
              startTime={startTime}
              leaves={leaves}
              lockedUserId={organizerId}
              lockedLabel="(Organizer)"
            />
          </div>

          {/* Slack notification toggle + channel */}
          <SlackChannelField
            inputId="edit-meeting-slack-channel"
            notifyChannel={notifyChannel}
            onNotifyChannelChange={setNotifyChannel}
            slackChannel={slackChannel}
            onSlackChannelChange={setSlackChannel}
            defaultSlackChannel={defaultSlackChannel}
            channelError={channelError}
            helperText="Leave blank to keep the current channel. The bot must already be in private channels to post there."
          />

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !!timeError || !!channelError}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
