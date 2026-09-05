"use client";

import { useState, useMemo } from "react";
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
import { Loader2, Search, Check, Pencil, UserX } from "lucide-react";
import { updateBooking } from "./actions";
import { resolveAttendeeStatus, timeToMinutes, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import type { MeetingWithAttendees, User } from "@/lib/types";

// Standard 30-min time slots from 07:00 to 20:00 — matches book-meeting-modal.tsx.
const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

interface EditMeetingModalProps {
  open: boolean;
  onClose: () => void;
  booking: MeetingWithAttendees;
  users: User[];
  leaves: LeaveRecord[];
  onSuccess: () => void;
}

export function EditMeetingModal({
  open,
  onClose,
  booking,
  users,
  leaves,
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
  const [searchUser, setSearchUser] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const organizerId = booking.organizer_id;

  const timeError =
    timeToMinutes(endTime) <= timeToMinutes(startTime)
      ? "End time must be after start time"
      : null;

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
    if (timeError) {
      toast.error(timeError);
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
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      toast.success("Meeting updated successfully!");
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
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
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
                  {TIME_OPTIONS.map((t) => (
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
                    const isOrganizer = u.id === organizerId;
                    const status = resolveAttendeeStatus(u.id, booking.meeting_date, leaves, startTime);

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
                            {u.name}{" "}
                            {isOrganizer && (
                              <span className="text-xs text-muted-foreground">(Organizer)</span>
                            )}
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

          {/* Slack notification toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Notify Slack channel</Label>
              <p className="text-xs text-muted-foreground">
                Posts a Block Kit card to the channel and sends direct messages to attendees when meeting starts
              </p>
            </div>
            <Switch checked={notifyChannel} onCheckedChange={setNotifyChannel} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !!timeError}>
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
