"use client";

import { useMemo } from "react";
import { CalendarClock, Hourglass, Radio, DoorOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { timeToMinutes, formatMinutesAsDuration } from "@/lib/utils/meeting-conflicts";
import type { MeetingBooking, MeetingWithAttendees } from "@/lib/types";

interface RoomStatsProps {
  bookings: MeetingWithAttendees[];
  isCurrentDayToday: boolean;
  liveStatus: {
    isOccupied: boolean;
    currentMeeting: MeetingBooking | null;
    nextMeeting: MeetingBooking | null;
  };
}

export function RoomStats({ bookings, isCurrentDayToday, liveStatus }: RoomStatsProps) {
  const activeBookings = useMemo(
    () => bookings.filter((b) => b.status === "scheduled" || b.status === "in_progress"),
    [bookings]
  );

  const inProgressCount = useMemo(
    () => bookings.filter((b) => b.status === "in_progress").length,
    [bookings]
  );

  const roomMinutesBooked = useMemo(
    () =>
      activeBookings.reduce(
        (sum, b) => sum + Math.max(0, timeToMinutes(b.end_time) - timeToMinutes(b.start_time)),
        0
      ),
    [activeBookings]
  );

  const nextFreeSlot = isCurrentDayToday
    ? liveStatus.isOccupied
      ? liveStatus.currentMeeting?.end_time ?? "—"
      : "Now"
    : "—";

  const cards = [
    {
      title: isCurrentDayToday ? "Meetings today" : "Meetings",
      value: String(activeBookings.length),
      icon: CalendarClock,
      gradient: "from-blue-500/10 to-indigo-500/10",
      iconColor: "text-blue-500",
    },
    {
      title: "Room hours booked",
      value: formatMinutesAsDuration(roomMinutesBooked),
      icon: Hourglass,
      gradient: "from-emerald-500/10 to-teal-500/10",
      iconColor: "text-emerald-500",
    },
    {
      title: "In progress now",
      value: String(inProgressCount),
      icon: Radio,
      gradient: "from-amber-500/10 to-orange-500/10",
      iconColor: "text-amber-500",
    },
    {
      title: "Next free slot",
      value: nextFreeSlot,
      icon: DoorOpen,
      gradient: "from-slate-500/10 to-zinc-500/10",
      iconColor: "text-slate-500",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{card.value}</p>
              </div>
              <div className={`rounded-xl bg-gradient-to-br ${card.gradient} p-2.5`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
