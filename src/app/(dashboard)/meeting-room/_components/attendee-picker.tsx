import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Check, UserX } from "lucide-react";
import { AttendeeStatusPill } from "./attendee-status-pill";
import { resolveAttendeeStatus, type LeaveRecord } from "@/lib/utils/meeting-conflicts";
import type { User } from "@/lib/types";

interface AttendeePickerProps {
  users: User[];
  selectedAttendees: Set<string>;
  onToggle: (id: string) => void;
  meetingDate: string;
  startTime: string;
  leaves: LeaveRecord[];
  /** A user id that can never be deselected (the current user in the book modal, the organizer in the edit modal). */
  lockedUserId: string;
  /** Label shown next to the locked user's name, e.g. "(You)" or "(Organizer)". */
  lockedLabel: string;
}

/**
 * Shared search + scrollable attendee list with live WFH/Leave status pills,
 * identical between book-meeting-modal.tsx and edit-meeting-modal.tsx aside
 * from which user is locked-in (organizer can't be removed) and its label.
 */
export function AttendeePicker({
  users,
  selectedAttendees,
  onToggle,
  meetingDate,
  startTime,
  leaves,
  lockedUserId,
  lockedLabel,
}: AttendeePickerProps) {
  const [searchUser, setSearchUser] = useState("");

  const filteredUsers = useMemo(() => {
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
        u.email.toLowerCase().includes(searchUser.toLowerCase())
    );
  }, [users, searchUser]);

  return (
    <>
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
              const isLocked = u.id === lockedUserId;
              const status = resolveAttendeeStatus(u.id, meetingDate, leaves, startTime);

              return (
                <button
                  key={u.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => onToggle(u.id)}
                  className={`flex w-full items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-sm text-left ${
                    isSelected ? "bg-primary/15 border border-primary/30" : "hover:bg-muted/60"
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
                      {u.name} {isLocked && <span className="text-xs text-muted-foreground">{lockedLabel}</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <AttendeeStatusPill status={status} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </>
  );
}
