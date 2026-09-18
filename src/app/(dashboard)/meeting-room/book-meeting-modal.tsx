"use client";

import { useState, useMemo, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { EmojiTextarea } from "@/components/ui/emoji-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Loader2, Search, Check, Users, UserX } from "lucide-react";
import { createBooking } from "./actions";
import { resolveAttendeeStatus, timeToMinutes, minutesToTime, isBookingInThePast, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import { parseSlackChannel } from "@/lib/utils/slack-channel";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import { createClient } from "@/lib/supabase/client";
import { TIME_OPTIONS } from "@/lib/meetings/time-slots";
import type { User } from "@/lib/types";

// 20:00 (the last slot) can never be a valid start time — there's no later
// slot to end at — so it's excluded from the start picker's own options.
const START_TIME_OPTIONS = TIME_OPTIONS.slice(0, -1);

const FIRST_START_MINUTES = 7 * 60; // 07:00, matches TIME_OPTIONS' first slot
const LAST_START_MINUTES = 19 * 60 + 30; // 19:30, matches TIME_OPTIONS' last start slot

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
  /** The page's currently-viewed date — `leaves` is scoped to this date. */
  currentDateStr: string;
  /** Channel used when the field is left blank — shown as the input's placeholder. */
  defaultSlackChannel: string;
  onSuccess: () => void;
}

export function BookMeetingModal({
  open,
  onClose,
  currentUser,
  users,
  leaves,
  currentDateStr,
  defaultSlackChannel,
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
  const initialStartTime = defaultStartTimeFor(initialMeetingDate, todayStr);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(
    minutesToTime(Math.min(timeToMinutes(initialStartTime) + 60, 20 * 60))
  );
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set([currentUser.id])
  );
  const [notifyChannel, setNotifyChannel] = useState(true);
  const [slackChannel, setSlackChannel] = useState("");
  const [searchUser, setSearchUser] = useState("");
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

  // Only slots strictly after the selected start time are valid end times.
  const endTimeOptions = TIME_OPTIONS.filter((t) => timeToMinutes(t) > timeToMinutes(startTime));

  // Shift the end time by the same delta the start time just moved, clamped
  // to the last available slot — otherwise moving a 09:00-10:00 meeting to
  // 15:00 would strand an invalid 10:00 end.
  const handleStartTimeChange = (newStart: string) => {
    const delta = timeToMinutes(newStart) - timeToMinutes(startTime);
    const lastSlotMinutes = timeToMinutes(TIME_OPTIONS[TIME_OPTIONS.length - 1]);
    const newEndMinutes = Math.min(timeToMinutes(endTime) + delta, lastSlotMinutes);
    setStartTime(newStart);
    setEndTime(minutesToTime(newEndMinutes));
  };

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

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase())
    );
  }, [users, searchUser]);

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
      // Reset state
      setTitle("");
      setDescription("");
      setSelectedAttendees(new Set([currentUser.id]));
      setSlackChannel("");
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

            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={handleStartTimeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {START_TIME_OPTIONS.map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      disabled={isBookingInThePast(meetingDate, t, todayStr, officeMinutesOfDay())}
                    >
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {endTimeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="pl-8 text-sm h-9"
              />
            </div>

            <ScrollArea className="h-44 rounded-md border p-2">
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-center text-muted-foreground">
                  <UserX className="h-6 w-6 mb-1.5 opacity-50" />
                  <p className="text-xs">No team members match &quot;{searchUser}&quot;</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.map((u) => {
                    const isSelected = selectedAttendees.has(u.id);
                    const isSelf = u.id === currentUser.id;
                    const status = resolveAttendeeStatus(u.id, meetingDate, dateLeaves, startTime);

                    return (
                      <div
                        key={u.id}
                        onClick={() => toggleAttendee(u.id)}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/30"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-4 w-4 rounded flex items-center justify-center border text-[10px] ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="font-medium text-foreground">
                            {u.name} {isSelf && <span className="text-xs text-muted-foreground">(You)</span>}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {status === "virtual" && (
                            <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/30">
                              💻 WFH (Slack Huddle)
                            </Badge>
                          )}
                          {status === "on_leave" && (
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                              🏖️ On Leave
                            </Badge>
                          )}
                          {status === "in_office" && (
                            <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                              🏢 In-Office
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Slack notification toggle + channel */}
          <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  Notify Slack channel
                </Label>
                <p className="text-xs text-muted-foreground">
                  Posts a Block Kit card to the channel and sends direct messages to attendees when meeting starts
                </p>
              </div>
              <Switch
                checked={notifyChannel}
                onCheckedChange={setNotifyChannel}
              />
            </div>

            {notifyChannel && (
              <div className="space-y-1.5 border-t pt-3">
                <Label htmlFor="meeting-slack-channel">Slack channel</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    #
                  </span>
                  <Input
                    id="meeting-slack-channel"
                    placeholder={defaultSlackChannel}
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    aria-invalid={!!channelError}
                    className="pl-6"
                  />
                </div>
                {channelError ? (
                  <p className="text-xs text-destructive">{channelError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use #{defaultSlackChannel}. The bot must already be in private
                    channels to post there.
                  </p>
                )}
              </div>
            )}
          </div>

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
