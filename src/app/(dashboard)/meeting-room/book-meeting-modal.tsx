"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
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
import { Loader2, Search, Check, Users, ShieldAlert } from "lucide-react";
import { createBooking } from "./actions";
import { resolveAttendeeStatus, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import type { User } from "@/lib/types";

// Standard 30-min time slots from 07:00 to 20:00
const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

interface BookMeetingModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User;
  users: User[];
  leaves: LeaveRecord[];
  onSuccess: () => void;
}

export function BookMeetingModal({
  open,
  onClose,
  currentUser,
  users,
  leaves,
  onSuccess,
}: BookMeetingModalProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set([currentUser.id])
  );
  const [notifyChannel, setNotifyChannel] = useState(true);
  const [searchUser, setSearchUser] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

    setSubmitting(true);
    const res = await createBooking({
      title: title.trim(),
      description: description.trim() || undefined,
      meeting_date: meetingDate,
      start_time: startTime,
      end_time: endTime,
      attendee_ids: Array.from(selectedAttendees),
      notify_channel: notifyChannel,
    });
    setSubmitting(false);

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
              <Label htmlFor="meeting-date">Date</Label>
              <Input
                id="meeting-date"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                required
              />
            </div>

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
              <div className="space-y-1">
                {filteredUsers.map((u) => {
                  const isSelected = selectedAttendees.has(u.id);
                  const isSelf = u.id === currentUser.id;
                  const status = resolveAttendeeStatus(u.id, meetingDate, leaves);

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
            </ScrollArea>
          </div>

          {/* Slack notification toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                Notify #rsd-leader-team on Slack
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

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
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
