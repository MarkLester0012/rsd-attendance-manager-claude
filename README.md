# RSD Attendance Manager

A full-stack attendance and leave management system built for Ring System Development. Handles employee leave requests, approvals, project assignments, office attendance, Redmine time tracking, and internal communication — all in a single dark-themed web application.

---

## Tech Stack

### Framework & Language

| Technology | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 15 | App Router, server components, API routes, Turbopack dev server |
| React | 19 | UI rendering |
| TypeScript | 5.7 | End-to-end type safety |

### Backend & Database

| Technology | Purpose |
|---|---|
| [Supabase](https://supabase.com/) | PostgreSQL database, authentication, Row Level Security, Realtime |
| Supabase Auth | Cookie-based session management via `@supabase/ssr` |
| Supabase Realtime | Live notification delivery via `postgres_changes` subscriptions |

### UI & Styling

| Technology | Purpose |
|---|---|
| Tailwind CSS 3 | Utility-first styling, dark mode, CSS variable theming |
| [shadcn/ui](https://ui.shadcn.com/) | Accessible component library built on Radix UI primitives |
| Radix UI | Headless primitives: Dialog, Popover, Select, Tooltip, Sheet, Tabs, Switch, ScrollArea, and more |
| [lucide-react](https://lucide.dev/) | Icon set |

### State Management

| Technology | Purpose |
|---|---|
| [Zustand](https://zustand-demo.pmnd.rs/) v5 | Sidebar collapsed/expanded state, theme state |
| React `useState` / `useEffect` | Local component state throughout |

### Forms & Validation

| Technology | Purpose |
|---|---|
| [react-hook-form](https://react-hook-form.com/) v7 | Form state and submission handling |
| [Zod](https://zod.dev/) v3 | Schema validation for all forms |

### Date Handling

| Technology | Purpose |
|---|---|
| [date-fns](https://date-fns.org/) v4 | All date arithmetic, formatting, and comparisons throughout the app |

### Charts & Graphs

The Reports page uses **[Recharts](https://recharts.org/) v2** for data visualization.

Components used:
- `BarChart` + `Bar` — leave usage broken down by type
- `LineChart` + `Line` — monthly leave trends over time
- `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`

### Calendar Components

The app uses **two different calendar implementations** depending on context:

| Location | Implementation | Library |
|---|---|---|
| Day view date picker (`/time-logger`) | shadcn/ui `Calendar` component | [react-day-picker](https://react-day-picker.js.org/) v9 |
| Month/Year picker (`/time-logger` month view) | Custom Popover — year nav chevrons + 3×4 month grid | Radix Popover + date-fns |
| My Calendar page (`/calendar`) | Fully custom CSS grid calendar | date-fns only (no external calendar library) |

The `/calendar` page renders a 7-column CSS grid, computing all cells manually with `startOfWeek`, `endOfWeek`, `addDays`, and `isSameMonth` from date-fns. No third-party calendar widget is involved.

### Notifications

| Technology | Purpose |
|---|---|
| Supabase Realtime | `postgres_changes` subscription per user — pushes new notifications instantly |
| sonner | Toast notifications for user actions |

### Integrations

| Integration | Purpose |
|---|---|
| Redmine API | Time entry creation, issue detail lookup, activity list fetch |
| Slack OAuth | Account linking; EOD message parsing for automatic time import |

---

## Features

### Leave Management
- 9 leave types with individual rules (see table below)
- Balance-deducting vs. non-deducting enforcement
- Half-day support: AM or PM
- Leave overlap detection across submitted dates
- WFH monthly cap (per user) and daily global cap (across all users) enforcement
- HR users have unlimited leave balance
- Multi-date batch leave submission in a single modal
- Leave status flow: `pending` → `approved` / `rejected`
- Auto-approved types skip the approval queue entirely

### Leave Types

| Code | Name | Deducts Balance | Requires Approval |
|---|---|:---:|:---:|
| VL | Vacation Leave | Yes | Yes |
| PL | Paternity Leave | Yes | Yes |
| ML | Maternity Leave | Yes | Yes |
| SPL | Special Leave | Yes | Yes |
| SL | Sick Leave | Yes | Yes |
| AB | Absent | Yes | Yes |
| NW | No Work | No | No |
| RGA | RGA Office | No | No |
| WFH | Work From Home | No | Yes |

### Approvals
- HR and leaders review and act on pending leave requests
- Sidebar badge shows live pending count (Supabase Realtime)
- Approve or reject with a single action; employee is notified instantly

### My Calendar
- Personal monthly calendar showing leave entries, holidays, and WFH days
- Click any date to open the leave modal (apply or edit)
- Multi-select date range for batch submission
- Built entirely with a custom 7-column CSS grid and `date-fns` — no external calendar library

### Reports & Charts
- Available to HR and Leaders
- **Bar chart**: leave usage broken down by leave type
- **Line chart**: monthly leave trends over a selected date range
- Department filter and configurable date range

### Time Logger (Redmine Integration)

**Day View**
- Log hours against Redmine issue IDs with activity type, comments, and hours
- Date navigation uses a popover calendar powered by **react-day-picker v9** (via shadcn/ui `Calendar`)
- Draft → Save → Submit to Redmine workflow with per-status indicators
- Bulk Apply: replicate an entry across multiple selected dates
- Paste EOD: parse Slack-formatted EOD messages into draft entries
- Per-date cache for instant navigation without re-fetching

**Month View**
- Full calendar grid showing logged hours per day
- Month/Year picker: custom `Popover` with year navigation chevrons and a 3×4 month button grid — styled to match the day view date picker
- Color coding: green (≥ 8h), yellow (< 8h), red dot (failed submissions), yellow dot (unsaved drafts)
- Click any cell to open a detail drawer listing all entries for that day

### In-App Notifications (Real-time)
- Bell icon in the header with unread count badge
- Live delivery via Supabase `postgres_changes` subscriptions
- Notification events:

| Event | Recipients |
|---|---|
| Leave submitted | HR + project leaders of the submitting member |
| Leave approved / rejected | The leave applicant |
| Leave cancelled | HR + project leaders |
| Added to a project | The added user |
| Removed from a project | The removed user |
| Suggestion comment | Suggestion author |
| Suggestion reply | Parent comment author |
| Suggestion upvote | Suggestion author |
| New announcement | All users except the author |
| Upcoming holidays (computed) | All (shown inline, not stored in DB) |

- Click any notification to navigate to the relevant page
- Leaders and HR route to `/projects` for project notifications; members route to `/dashboard`
- Shows 10 most recent; "See previous notifications" loads 10 more at a time
- Mark individual or all notifications as read

### Projects
- Create and manage projects with names and descriptions
- Assign / unassign leaders and members via live checkbox UI with search
- Notifications sent on add/remove

### Suggestions
- Any user can post suggestions (optionally anonymous)
- Threaded comments and replies
- Like / dislike voting
- Notifications for comment, reply, and upvote events

### Announcements
- HR posts company-wide announcements
- All other users receive an in-app notification on creation
- Edit and delete support

### Team Management (HR)
- Register new users via Supabase Admin API — creates auth account and user profile atomically with rollback on failure
- Assign department and role at registration

### Attendance Log
- Daily office attendance tracking per employee

---

## Roles & Access

| Role | Pages |
|---|---|
| `member` | Dashboard, My Calendar, Attendance, My Leaves, Suggestions, Profile, Time Logger |
| `leader` | + Approvals, Reports (read), Team (read) |
| `hr` | + Team management, Holidays, Projects, Announcements (full CRUD), Reports |

Navigation items are role-gated via `src/lib/constants/navigation.ts`. Page-level access is enforced server-side on every route.

---

## Architecture

```
src/
  app/
    (auth)/                    # Login page
    (dashboard)/               # All authenticated routes (shared layout with sidebar)
      dashboard/               # Overview with leave balance and attendance summary
      calendar/                # Personal leave calendar (custom grid, date-fns)
      attendance/              # Office attendance log
      my-leaves/               # Personal leave history and application
      approvals/               # Leave approval queue (leader/hr)
      team/                    # Team management and user registration (hr)
      holidays/                # Holiday management (hr)
      projects/                # Project and member management (hr)
      reports/                 # Recharts-powered analytics (leader/hr)
      announcements/           # Company announcements (hr posts, all view)
      suggestions/             # Suggestion box with comments and voting
      profile/                 # User profile settings
      time-logger/             # Redmine time entry logger
      settings/
        integrations/slack/    # Slack OAuth connection management
    api/
      slack/                   # Slack OAuth callback and shortcut webhook
  components/
    ui/                        # shadcn/ui primitives
    layout/                    # Sidebar, Header, NotificationPanel, DashboardShell
    leaves/                    # LeaveModal — shared leave apply/edit/cancel component
    time-logger/               # DateNav, MonthView, EntryTable, SettingsDialog, BulkApplyDialog, etc.
    auth/                      # Login form
  hooks/
    use-user.ts                # Current authenticated user hook
    use-pending-count.ts       # Live pending approvals count (Supabase Realtime)
    use-notifications.ts       # Live in-app notifications (Supabase Realtime)
  lib/
    constants/
      leave-types.ts           # 9 leave type definitions with rules and CSS color variables
      navigation.ts            # Role-based navigation items
    notifications.ts           # createNotification / createNotifications helpers
    supabase/
      client.ts                # Browser Supabase client
      server.ts                # Server component Supabase client
      middleware.ts            # Auth session refresh middleware
      admin.ts                 # Service-role client (user registration only)
    types/index.ts             # All TypeScript interfaces and union types
    utils.ts                   # cn() Tailwind class merge helper
  stores/
    sidebar-store.ts           # Sidebar collapsed/expanded (Zustand)
    theme-store.ts             # Theme state (Zustand)
  middleware.ts                # Next.js middleware — refreshes auth session on every request
supabase/
  schema.sql                   # Full DB schema: tables, indexes, RLS policies, triggers, realtime
```

---

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

> `SUPABASE_SERVICE_ROLE_KEY` is only used server-side for user registration via the Supabase Admin API. It is never exposed to the browser.

---

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server on localhost:3000 (Turbopack)
npm run build      # Production build
npm run lint       # ESLint
```

---

## Database

The full schema is in `supabase/schema.sql`. Apply it via the Supabase SQL editor or CLI before running the app.

Key tables: `users`, `departments`, `leaves`, `holidays`, `projects`, `project_members`, `attendance`, `suggestions`, `suggestion_comments`, `suggestion_votes`, `announcements`, `notifications`, `time_log_entries`, `redmine_config`, `redmine_project_fields`, `slack_integrations`

All tables have Row Level Security (RLS) enabled. Policies ensure users can only access their own data, with HR and leader roles granted broader read access where appropriate.

---

## UI Design

- **Theme**: Dark mode only (`<html class="dark">`)
- **Accent color**: Red (`#EF1D26`)
- **Font**: Plus Jakarta Sans (via `next/font`)
- **Style**: Glass/backdrop-blur cards, subtle borders (`border-border/50`), CSS variable-driven leave type colors
- **Scrollbars**: Custom thin scrollbar (`scrollbar-thin` utility) used throughout — 6px width, muted color thumb, transparent track
