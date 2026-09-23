import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  timeToMinutes,
  minutesToTime,
  isBookingInThePast,
  isStartTimeBooked,
  type ExistingMeetingTime,
} from "@/lib/utils/meeting-conflicts";
import { officeMinutesOfDay } from "@/lib/utils/office-time";
import { TIME_OPTIONS } from "@/lib/meetings/time-slots";

// 20:00 (the last slot) can never be a valid start time — there's no later
// slot to end at — so it's excluded from the start picker's own options.
const START_TIME_OPTIONS = TIME_OPTIONS.slice(0, -1);

interface TimeRangeFieldsProps {
  /** The date the start-time options are validated against (`booking.meeting_date` in the edit modal, the picked date in the book modal). */
  meetingDate: string;
  todayStr: string;
  startTime: string;
  endTime: string;
  /** Active bookings on `meetingDate`, used to disable already-booked start times. */
  bookings: ExistingMeetingTime[];
  /** The booking currently being edited, excluded from its own collision check. */
  ignoreBookingId?: string;
  onChange: (next: { startTime: string; endTime: string }) => void;
}

/**
 * Shared Start Time / End Time Select pair, identical between book-meeting-modal.tsx
 * and edit-meeting-modal.tsx — including the "shift the end time by the same
 * delta the start time just moved" logic. Each parent renders this inside its
 * own grid (the book modal adds a third Date cell; the edit modal doesn't).
 */
export function TimeRangeFields({
  meetingDate,
  todayStr,
  startTime,
  endTime,
  bookings,
  ignoreBookingId,
  onChange,
}: TimeRangeFieldsProps) {
  // Only slots strictly after the selected start time are valid end times.
  const endTimeOptions = TIME_OPTIONS.filter((t) => timeToMinutes(t) > timeToMinutes(startTime));

  // Shift the end time by the same delta the start time just moved, clamped
  // to the last available slot — otherwise moving a 09:00-10:00 meeting to
  // 15:00 would strand an invalid 10:00 end.
  const handleStartTimeChange = (newStart: string) => {
    const delta = timeToMinutes(newStart) - timeToMinutes(startTime);
    const lastSlotMinutes = timeToMinutes(TIME_OPTIONS[TIME_OPTIONS.length - 1]);
    const newEndMinutes = Math.min(timeToMinutes(endTime) + delta, lastSlotMinutes);
    onChange({ startTime: newStart, endTime: minutesToTime(newEndMinutes) });
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Start Time</Label>
        <Select value={startTime} onValueChange={handleStartTimeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-52">
            {START_TIME_OPTIONS.map((t) => {
              const isPast = isBookingInThePast(meetingDate, t, todayStr, officeMinutesOfDay());
              const isBooked = !isPast && isStartTimeBooked(t, bookings, ignoreBookingId);
              return (
                <SelectItem key={t} value={t} disabled={isPast || isBooked}>
                  {t}
                  {isBooked ? " (Booked)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>End Time</Label>
        <Select value={endTime} onValueChange={(newEnd) => onChange({ startTime, endTime: newEnd })}>
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
    </>
  );
}
