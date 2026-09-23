import { Laptop, Palmtree, Building2 } from "lucide-react";
import type { MeetingAttendeeStatus } from "@/lib/types";

/**
 * Shared attendee-status pill — standardized on lucide icons (Slack messages
 * already moved off emoji per a past commit). Previously duplicated as
 * booking-card.tsx's renderAttendeeStatusPill (lucide) and book-meeting-modal.tsx
 * / edit-meeting-modal.tsx's inline emoji (💻🏖️🏢) badges.
 */
export function AttendeeStatusPill({ status }: { status: MeetingAttendeeStatus }) {
  switch (status) {
    case "virtual":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/30">
          <Laptop className="h-3 w-3" /> WFH (Huddle)
        </span>
      );
    case "on_leave":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
          <Palmtree className="h-3 w-3" /> On Leave
        </span>
      );
    case "in_office":
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
          <Building2 className="h-3 w-3" /> In-Office
        </span>
      );
  }
}
