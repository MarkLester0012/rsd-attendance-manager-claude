# RSD Attendance Manager

A full-stack attendance and leave management system built for Ring System Development. Handles employee leave requests, approvals, project assignments, office attendance, transportation allowance, Redmine time tracking, Slack integration, and an AI chat assistant — all in a single dark-themed web application.

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

### Animation

| Technology | Purpose |
|---|---|
| [Framer Motion](https://www.framer.com/motion/) v12 | Open/close animations for the AI chat assistant widget |

### Markdown Rendering

| Technology | Purpose |
|---|---|
| [react-markdown](https://github.com/remarkjs/react-markdown) v10 + [remark-gfm](https://github.com/remarkjs/remark-gfm) | Renders the AI chat assistant's markdown-formatted responses (tables, lists, code blocks) |

### Emoji Support

| Technology | Purpose |
|---|---|
| [emoji-mart](https://github.com/missive/emoji-mart) + `@emoji-mart/data` + `@emoji-mart/react` | Emoji picker UI, used by the shared `EmojiTextarea` component |

`EmojiTextarea` (`src/components/ui/emoji-textarea.tsx`) wraps the standard `Textarea` with an emoji picker button and is used wherever users enter freeform text (suggestions, comments, announcements, etc.). On display, `:shortcode:` text is converted to native emoji via `emojify()` (`src/lib/emoji.ts`).

### Data Export

| Technology | Purpose |
|---|---|
| [exceljs](https://github.com/exceljs/exceljs) v4 | Generates downloadable Excel (.xlsx) reports for transportation allowance data (`src/lib/utils/export-allowance.ts`) |

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
| [OpenRouter](https://openrouter.ai/) | Backs the AI chat assistant via a single global server-side API key |

---

## Features

### Leave Management
- 11 leave types with individual rules (see table below)
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
| BL | Birthday Leave | No | Yes |
| EWFH | Extended WFH | No | No |

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

### AI Chat Assistant
- Floating chat widget available on supported pages, lets users ask natural-language questions about the data currently shown on screen
- Scoped to the **current page only** — does not run open-ended database queries or access data outside what the page already displays
- Backed by OpenRouter via a single global server-side API key (not per-user, not encrypted)
- Pages opt in by publishing a summarized snapshot of their on-screen data via `useRegisterPageContext(pageTitle, data)` — context is registered on mount/update and cleared on unmount so it never leaks across navigation
- Currently wired into: Dashboard, My Leaves, My Calendar, Office Attendance, Reports
- Chat history is ephemeral — resets whenever the route changes; responses are streamed as plain text with no database persistence
- Responses render as Markdown (tables, lists, code blocks) via `react-markdown` + `remark-gfm`

### Transportation Allowance
Monthly transportation allowance based on each employee's commute mode and attendance.

- **Snapshot-based**: one snapshot per employee per month — declares transport mode, distance (km), and vehicle ownership
- **Pay period**: calendar month; payment is issued on the 15th of the following month
- **Effective days**: `days_worked - undertime_days + (undertime_days × 0.5)`, where `days_worked = business_days - wfh_days - leave_days`
- **WFH days**: capped at 8/month, always paid additively on top of the primary mode
- **Walk eligibility**: only available if `distance_km ≤ 2.4` (1.2km each way) AND the employee doesn't own a vehicle
- **Secondary jeep/bus**: if the primary mode isn't jeep/bus but the employee also takes jeep/bus rides, those are paid additively using `days_worked` (not `effective_days`)
- HR can override `unit_price`, `gas_mileage`, or `refund_pct` per mode per snapshot
- Locked snapshots block edits; each snapshot allows at most one pending change request

| Mode | Unit Price | Gas Mileage | Refund % | Formula |
|---|---|---|---|---|
| Car | ₱95 | 8 km/L | 50% | `unit_price × (distance ÷ mileage) × effective_days × refund%` |
| Motorcycle | ₱95 | 25 km/L | 80% | same as Car |
| Walk | ₱80/km | — | 100% | `unit_price × distance_km × effective_days × refund%` |
| Jeep | ₱15/ride | — | 100% | `unit_price × rides × effective_days × refund%` |
| Bus | ₱20/ride | — | 100% | same as Jeep |
| Work From Home | ₱120/day | — | 100% | `unit_price × min(wfh_days, 8) × refund%` |

- Employees can submit a monthly allowance **submission request** (proposed distance, mode, days worked, etc.) for HR review; only one pending submission request is allowed per employee per month
- Employees can also request a **distance/mode change** against an existing snapshot, with a reason; HR approves or rejects with an optional note
- HR can export snapshot data for a given month/pay period to an Excel (.xlsx) file

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

### AI Assistant
- Floating chat widget (`src/components/ai-chat/`) available on every authenticated page
- Streams responses from OpenRouter via the auth-gated edge route `api/ai/chat` (`src/lib/ai/client.ts`)
- Context-aware: each page registers its on-screen data via `useRegisterPageContext` so the assistant's answers are grounded in the current view
- Formatted with `src/lib/ai/format-context.ts` before being sent as the system prompt

### AI News (Dashboard)
- Dashboard card showing latest AI-model and programming-related news
- Server-fetched from Google News RSS via `getAINews()` in `src/lib/news/client.ts`
- Cached daily (`revalidate: 86400`); two focused queries (AI models + TechCrunch) merged, de-duped, and sorted by date
- Each headline links to the original article (opens in new tab)
- Feed topics are controlled via `QUERY_*` constants in `src/lib/news/client.ts`

---

## Roles & Access

| Role | Pages |
|---|---|
| `member` | Dashboard, My Calendar, Office Attendance, My Leaves, Suggestions, Profile, Time Logger, Transportation Allowance, Settings → Integrations (Slack) |
| `leader` | + Approvals, Team Members (read), Projects |
| `hr` | + Team Members (management), Holidays, Announcements (full CRUD), Reports |

Navigation items are role-gated via `src/lib/constants/navigation.ts`. Page-level access is enforced server-side on every route.

> **Note**: `/projects` is restricted to the `leader` role and `/reports` is restricted to the `hr` role, as enforced in each page's server component (`projects/page.tsx`, `reports/page.tsx`).

---

## Architecture

```
src/
  app/
    (auth)/                    # Login page
    (dashboard)/               # All authenticated routes (shared layout with sidebar)
      dashboard/               # Overview with leave balance and attendance summary
      calendar/                # Personal leave calendar (custom grid, date-fns)
      attendance/              # Office attendance log (derived from leaves/users/projects)
      my-leaves/               # Personal leave history and application
      approvals/               # Leave approval queue (leader/hr)
      team/                    # Team management and user registration (leader read / hr manage)
      holidays/                # Holiday management (hr)
      projects/                # Project and member management (leader)
      reports/                 # Recharts-powered analytics (hr)
      announcements/           # Company announcements (hr posts, all view)
      suggestions/             # Suggestion box with comments and voting
      profile/                 # User profile settings
      time-logger/             # Redmine time entry logger (Slack + manual entry)
      transportation-allowance/ # Transportation allowance management
      settings/
        integrations/slack/    # Slack OAuth connection management
    api/
      ai/                      # AI assistant chat endpoint (edge runtime, OpenRouter)
      slack/                   # Slack OAuth callback and shortcut webhook
  components/
    ui/                        # shadcn/ui primitives
    ai-chat/                   # Floating AI assistant widget + chat UI
    layout/                    # Sidebar, Header, NotificationPanel, DashboardShell
    leaves/                    # LeaveModal — shared leave apply/edit/cancel component
    shared/                    # Cross-feature shared components
    ai-chat/                   # Floating AI chat widget and content panel
    time-logger/               # DateNav, MonthView, EntryTable, SettingsDialog, BulkApplyDialog, etc.
    transportation-allowance/  # Transportation allowance UI components
    auth/                      # Login form
  hooks/
    use-user.ts                # Current authenticated user hook
    use-pending-count.ts       # Live pending approvals count (Supabase Realtime)
    use-notifications.ts       # Live in-app notifications (Supabase Realtime)
    use-register-page-context.ts # Registers/clears page data snapshot for the AI chat assistant
  lib/
    constants/
      leave-types.ts           # 11 leave type definitions with rules and CSS color variables
      navigation.ts            # Role-based navigation items
    ai/
      client.ts                # OpenRouter chat client (SSE streaming)
      format-context.ts        # Formats page context for the AI prompt
    news/
      client.ts                # Dashboard "AI News" — Google News RSS, cached daily
    notifications.ts           # createNotification / createNotifications helpers
    emoji.ts                   # emojify() — converts :shortcode: to native emoji
    supabase/
      client.ts                # Browser Supabase client
      server.ts                # Server component Supabase client
      middleware.ts            # Auth session refresh middleware
      admin.ts                 # Service-role client (user registration only)
    slack/
      client.ts                # Slack API client
      modal.ts                 # Time-logger modal builder
      signature.ts             # Webhook signature verification
      state.ts                 # Modal state persistence
      encryption.ts            # OAuth token encryption
    redmine/
      client.ts                # Redmine REST API client
      parser.ts                # Formats descriptions/comments for Redmine
      encryption.ts            # API key encryption
    ai/
      client.ts                # OpenRouter API client
      format-context.ts        # Formats per-page context for the AI assistant
    types/index.ts             # All TypeScript interfaces and union types
    utils.ts                   # cn() Tailwind class merge helper
    utils/                     # Domain-specific utilities (allowance calculator, pay period, export)
  stores/
    sidebar-store.ts            # Sidebar collapsed/expanded (Zustand)
    theme-store.ts              # Theme state (Zustand)
  middleware.ts                # Next.js middleware — refreshes auth session on every request
supabase/
  schema.sql                   # Full DB schema: tables, indexes, RLS policies, triggers, realtime
  seed-production.mjs          # Clean seed script (1 HR user, 2 departments, 17 holidays)
  seed-database.mjs            # Full seed with sample data (13 users, 5 departments)
```

---

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Used by admin.ts for user registration

# Slack integration
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=              # Webhook signature verification
SLACK_ENCRYPTION_KEY=              # Encrypts stored OAuth tokens

# Redmine integration
REDMINE_URL=
REDMINE_ENCRYPTION_KEY=            # Encrypts stored API keys

# AI chat assistant (OpenRouter)
OPENROUTER_API_KEY=                # Single global server-side key
```

> `SUPABASE_SERVICE_ROLE_KEY` is only used server-side for user registration via the Supabase Admin API. It is never exposed to the browser. The Slack/Redmine encryption keys and the OpenRouter key are likewise server-side only.

---

## Development

```bash
npm install        # Install dependencies
npm run dev        # Start dev server on localhost:3000 (Turbopack)
npm run build      # Production build
npm run lint       # ESLint
```

### Database Seeding

```bash
node supabase/seed-production.mjs   # Clean seed: 1 HR user, 2 departments, 17 holidays
node supabase/seed-database.mjs     # Full seed with sample data: 13 users, 5 departments
```

> Do not use `supabase/seed.sql` — it inserts directly into `auth.users`, which Supabase does not support. Use one of the seed scripts above instead.

---

## Database

The full schema is in `supabase/schema.sql`. Apply it via the Supabase SQL editor or CLI before running the app, then seed it with one of the scripts in [Development](#development).

Key tables: `users`, `departments`, `leaves`, `holidays`, `projects`, `project_members`, `suggestions`, `suggestion_upvotes`, `suggestion_comments`, `suggestion_comment_votes`, `announcements`, `notifications`, `time_log_entries`, `redmine_configs`, `redmine_project_fields`, `allowance_snapshots`, `distance_change_requests`, `allowance_submission_requests`

All tables have Row Level Security (RLS) enabled. Policies ensure users can only access their own data, with HR and leader roles granted broader read access where appropriate.

> **Notes**:
> - There is no dedicated `attendance` table — the Office Attendance page is derived from `leaves`, `users`, and `projects` data.
> - Slack account linking is stored as `slack_user_id` / `slack_team_id` columns on `users` (added via `supabase/alter-slack-integration.sql`), not a separate table.
> - `allowance_snapshots`, `distance_change_requests`, and `allowance_submission_requests` back the Transportation Allowance feature.

---

## UI Design

- **Theme**: Dark mode only (`<html class="dark">`)
- **Accent color**: Red (`#EF1D26`)
- **Font**: Inter (via `next/font/google`)
- **Style**: Glass/backdrop-blur cards, subtle borders (`border-border/50`), CSS variable-driven leave type colors
- **Scrollbars**: Custom thin scrollbar (`scrollbar-thin` utility) used throughout — 6px width, muted color thumb, transparent track
