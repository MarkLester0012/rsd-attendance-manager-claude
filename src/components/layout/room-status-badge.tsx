"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLiveRoomStatus } from "@/lib/utils/meeting-conflicts";
import { officeDateString, officeMinutesOfDay } from "@/lib/utils/office-time";
import type { MeetingBooking } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoomStatusBadge() {
  const [isOccupied, setIsOccupied] = useState<boolean | null>(null);
  const [currentMeetingEndTime, setCurrentMeetingEndTime] = useState<string | null>(null);
  const [bookings, setBookings] = useState<MeetingBooking[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function checkStatus() {
      try {
        const todayStr = officeDateString();
        const { data, error } = await supabase
          .from("meeting_room_bookings")
          .select("id, title, start_time, end_time, status, meeting_date")
          .eq("meeting_date", todayStr)
          .in("status", ["scheduled", "in_progress"]);

        if (!isMounted) return;
        if (error) {
          console.error("Failed to load meeting room status:", error.message);
          return;
        }

        const rows = (data || []) as MeetingBooking[];
        setBookings(rows);

        const live = getLiveRoomStatus(officeMinutesOfDay(), rows);

        setIsOccupied(live.isOccupied);
        setCurrentMeetingEndTime(live.isOccupied && live.currentMeeting ? live.currentMeeting.end_time : null);
      } catch {
        // Silently handle any offline / transient error
      }
    }

    checkStatus();

    // Realtime listener for immediate updates on booking changes. This table
    // is published via supabase_realtime (see 2026-09-05-meeting-room-fixes
    // migration) — no polling fallback is needed alongside it.
    const channel = supabase
      .channel("meeting_room_badge_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_room_bookings" },
        () => {
          checkStatus();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Meeting room realtime subscription failed:", status);
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Occupancy is purely time-derived, so recompute it from the already-fetched
  // bookings every 60 seconds — no DB read needed. This closes the gap between
  // a meeting's start/end time passing and the next DB write (e.g. the cron
  // tick, up to 15 minutes later) that would otherwise leave the badge stale.
  useEffect(() => {
    const tick = setInterval(() => {
      const live = getLiveRoomStatus(officeMinutesOfDay(), bookings);
      setIsOccupied(live.isOccupied);
      setCurrentMeetingEndTime(live.isOccupied && live.currentMeeting ? live.currentMeeting.end_time : null);
    }, 60000);
    return () => clearInterval(tick);
  }, [bookings]);

  if (isOccupied === null) {
    return null; // Initial loading, avoid layout shift
  }

  return (
    <Link
      href="/meeting-room"
      className={cn(
        "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shadow-sm hover:opacity-90",
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
        {isOccupied && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-400" />
        )}
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
