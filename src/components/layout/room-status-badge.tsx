"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLiveRoomStatus } from "@/lib/utils/meeting-conflicts";
import type { MeetingBooking } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoomStatusBadge() {
  const [isOccupied, setIsOccupied] = useState<boolean | null>(null);
  const [currentMeetingEndTime, setCurrentMeetingEndTime] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function checkStatus() {
      try {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        const { data: bookings } = await supabase
          .from("meeting_room_bookings")
          .select("id, title, start_time, end_time, status, meeting_date")
          .eq("meeting_date", todayStr)
          .in("status", ["scheduled", "in_progress"]);

        if (!isMounted) return;

        const now = new Date();
        const live = getLiveRoomStatus(now, (bookings || []) as MeetingBooking[]);

        setIsOccupied(live.isOccupied);
        if (live.isOccupied && live.currentMeeting) {
          setCurrentMeetingEndTime(live.currentMeeting.end_time);
        } else {
          setCurrentMeetingEndTime(null);
        }
      } catch {
        // Silently handle any offline / transient error
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // refresh every 30s

    // Realtime listener for immediate updates on booking changes
    const channel = supabase
      .channel("meeting_room_badge_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_room_bookings" },
        () => {
          checkStatus();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  if (isOccupied === null) {
    return null; // Initial loading, avoid layout shift
  }

  return (
    <Link
      href="/meeting-room"
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shadow-2xs hover:opacity-90",
        isOccupied
          ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20"
      )}
      title={
        isOccupied
          ? `Meeting Room is currently occupied until ${currentMeetingEndTime}. Click to view details.`
          : "Meeting Room is currently free. Click to view schedule or book."
      }
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            isOccupied ? "bg-amber-400" : "bg-emerald-400"
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full h-2 w-2",
            isOccupied ? "bg-amber-500" : "bg-emerald-500"
          )}
        />
      </span>
      <DoorOpen className="h-3.5 w-3.5 opacity-80" />
      <span>{isOccupied ? `In Use (${currentMeetingEndTime})` : "Room Free"}</span>
    </Link>
  );
}
