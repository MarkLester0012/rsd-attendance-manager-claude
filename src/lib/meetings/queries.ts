// Shared bookings select — used by the server page load (meeting-room/page.tsx)
// and the client realtime refetch (meeting-room-content.tsx's refetchBookings).
// Narrowed to the columns the UI actually reads (see booking-card.tsx,
// _components/now-strip.tsx, edit-meeting-modal.tsx, book-meeting-modal.tsx) instead
// of a nested `users(*)` select, which shipped every organizer's and
// attendee's leave_balance and auth_id to every viewer. Plain string constant
// with no imports — this file is bundled into the client as well as the server.
export const MEETING_BOOKINGS_SELECT = `
  *,
  organizer:users!meeting_room_bookings_organizer_id_fkey(id, name),
  attendees:meeting_attendees(
    id,
    booking_id,
    user_id,
    created_at,
    user:users(id, name, role, slack_user_id, department:departments(name))
  )
`;
