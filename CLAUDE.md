# RSD Attendance Manager

Attendance and leave management system for Ring System Development.

## Commands

```bash
npm run dev          # Start dev server (Turbopack) on localhost:3000
npm run build        # Production build
npm run lint         # ESLint
node supabase/seed-production.mjs   # Seed DB (1 HR user, 2 depts, 17 holidays)
node supabase/seed-database.mjs     # Seed DB (13 users, 5 depts, sample data)
```

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # Used by admin.ts for user registration

# Slack integration
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=              # Webhook signature verification
SLACK_ENCRYPTION_KEY=              # Encrypts stored OAuth tokens
SLACK_BOT_TOKEN=                   # Workspace bot token used to post meeting room Slack messages/DMs
SLACK_MEETING_ROOM_CHANNEL=        # Channel for meeting room broadcasts (default: rsd-leader-team)

# Redmine integration
REDMINE_URL=
REDMINE_ENCRYPTION_KEY=            # Encrypts stored API keys

# AI assistant (OpenRouter)
OPENROUTER_API_KEY=                # Used by api/ai/chat

NEXT_PUBLIC_APP_URL=               # Public base URL (Slack OAuth redirects — client-visible)
APP_URL=                           # Same base URL, server-only. Slack Block Kit builders (meeting
                                    # room, cron) must read this instead of NEXT_PUBLIC_APP_URL:
                                    # NEXT_PUBLIC_* vars are inlined at build time, so if unset at
                                    # build time every Slack button/link is permanently baked in as
                                    # localhost regardless of the runtime environment.
CRON_SECRET=                       # Bearer token required by api/cron/meetings — mandatory in
                                    # production; the route rejects unauthenticated requests when
                                    # this is unset rather than allowing them through
```

## Architecture

```
src/
  app/
    (auth)/              # Login page
    (dashboard)/         # All authenticated routes (shared layout with sidebar)
      dashboard/         # Main dashboard
      calendar/          # Personal calendar
      attendance/        # Office attendance log
      my-leaves/         # Personal leave history
      approvals/         # Leave approval (leader/hr)
      team/              # Team members + registration (hr)
      holidays/          # Holiday management (hr)
      projects/          # Project management (hr)
      reports/           # Reports (leader/hr)
      announcements/     # Company announcements (hr CRUD, all read)
      suggestions/       # Suggestion box with voting + comments
      profile/           # User profile
      time-logger/       # Daily time logging (Slack + manual entry)
      transportation-allowance/ # Transportation allowance management
      payslip-stats/     # HR payslip stats — semi-monthly pay periods (26th–10th, 11th–25th)
      settings/
        integrations/    # Slack OAuth connection
    api/
      ai/               # AI assistant chat endpoint (edge runtime, OpenRouter)
      slack/             # Slack webhook endpoints (shortcut, OAuth install/callback)
  components/
    ui/                  # shadcn/ui primitives + EmojiTextarea
    ai-chat/             # Floating AI assistant widget + chat UI
    layout/              # Sidebar, header
    leaves/              # Leave modal, shared leave components
    auth/                # Auth forms
    shared/              # Cross-feature shared components
    time-logger/         # Time logger UI components
    transportation-allowance/ # TA UI components
  hooks/
    use-user.ts          # Current user hook
    use-pending-count.ts # Pending approvals count (sidebar badge)
    use-notifications.ts # Unread notification count + list
    use-register-page-context.ts # Registers per-page context for the AI assistant
  lib/
    constants/
      leave-types.ts     # 10 leave types with rules (VL, PL, ML, SPL, SL, NW, RGA, AB, WFH, BL)
      navigation.ts      # Role-based nav items
    supabase/
      client.ts          # Browser client
      server.ts          # Server component client
      middleware.ts      # Session refresh middleware
      admin.ts           # Service role client (user registration)
    slack/
      client.ts          # Slack API client
      modal.ts           # Time-logger modal builder
      signature.ts       # Webhook signature verification
      state.ts           # Modal state persistence
      encryption.ts      # OAuth token encryption
    redmine/
      client.ts          # Redmine REST API client
      parser.ts          # Formats descriptions/comments for Redmine
      encryption.ts      # API key encryption
    ai/
      client.ts          # OpenRouter chat client (SSE streaming)
      format-context.ts  # Formats page context for the AI prompt
    news/
      client.ts          # Dashboard "AI News" — Google News RSS, cached daily
    types/index.ts       # All TypeScript interfaces
    notifications.ts     # createNotification / createNotifications helpers
    emoji.ts             # emojify() — converts :shortcode: to native emoji
    utils.ts             # cn() helper
    utils/               # Domain-specific utilities (allowance, pay-period, export)
  stores/
    sidebar-store.ts     # Sidebar open/close (Zustand)
    theme-store.ts       # Theme state (Zustand)
  middleware.ts          # Next.js middleware (session refresh)
supabase/
  schema.sql             # Full DB schema (tables, RLS, indexes, triggers)
  seed-production.mjs    # Clean seed script
  seed-database.mjs      # Full seed with sample data
  seed.sql               # BROKEN - do not use (direct auth.users inserts)
```

## Roles & Access

Three roles: `member`, `leader`, `hr`. Defined in `src/lib/types/index.ts`.

- **member**: Dashboard, calendar, my-leaves, attendance, suggestions, time-logger, transportation-allowance, profile, settings/integrations
- **leader**: + approvals, reports, team (read-only)
- **hr**: + team management, holidays, projects, announcements (full CRUD)

Navigation is role-gated via `src/lib/constants/navigation.ts`. Page-level access enforced server-side.

## Leave System

10 leave types defined in `src/lib/constants/leave-types.ts`:
- **Balance-deducting**: VL, PL, ML, SPL, SL, AB
- **Non-deducting**: NW (No Work), RGA (RGA Office), WFH (Work From Home), BL (Birthday Leave)
- HR users have unlimited leave balance
- Leave overlap checking is enforced
- Half-day support: `whole`, `half_am`, `half_pm`
- Split-day pairing: a secondary half-day leave may only be SL, NW, RGA, AB, or WFH (`SECONDARY_LEAVE_TYPES` in leave-types.ts), and never the same type as the primary
- WFH and BL are excluded from "leaves used" counts (payslip-stats, reports)
- Birthday Leave (BL) does not deduct balance but still requires approval, is capped at 1 day per calendar year (enforced client-side in leave-modal.tsx, applies to all roles including HR), and is excluded from worked days for payroll/transportation-allowance calculations (`NON_WORKING_TYPES` in `src/lib/utils/payroll-stats.ts`)
- Payroll uses semi-monthly pay periods: 26th–10th and 11th–25th (`src/lib/utils/pay-period.ts`); holidays falling on weekends are excluded from holiday counts

## Integrations

### Slack
- Users connect their Slack workspace via OAuth at `settings/integrations/`
- A Slack shortcut opens a time-logger modal (`api/slack/shortcut` → `src/lib/slack/modal.ts`)
- The modal parses EOD ticket entries, then posts them to Redmine or saves them as drafts (`api/slack/shortcut` block_actions → `src/lib/redmine/client.ts`)
- Every incoming webhook is signature-verified (`src/lib/slack/signature.ts`) — requests without a valid `X-Slack-Signature` are rejected

### Redmine
- Time entries and comments are posted via the Redmine REST API (`src/lib/redmine/client.ts`)
- `src/lib/redmine/parser.ts` normalizes descriptions (strips Slack markdown, formats bullets) before posting
- Per-user API keys are stored encrypted in the DB

### AI Assistant & News
- Floating chat widget (`src/components/ai-chat/`) calls the auth-gated edge route `api/ai/chat`, which streams from OpenRouter via `src/lib/ai/client.ts`.
- Pages call `useRegisterPageContext(...)` (`src/hooks/use-register-page-context.ts`) so the assistant sees the current page's data; `src/lib/ai/format-context.ts` formats it into the prompt.
- The dashboard "AI News" card is server-fetched via `getAINews()` in `src/lib/news/client.ts` (Google News RSS, `revalidate: 86400` daily cache). Tune the feed by editing the `QUERY_*` constants there.

### AI Chat Assistant
- A floating widget (`src/components/ai-chat/`, mounted in `dashboard-shell.tsx`) lets users ask questions about data on their *current page only* — it does not run open-ended database queries
- Backed by OpenRouter (`src/lib/ai/client.ts`) via a single global `OPENROUTER_API_KEY` (plain env var, not per-user/encrypted)
- Pages publish a summarized snapshot of their on-screen data with `useRegisterPageContext(pageTitle, data)` (`src/hooks/use-register-page-context.ts`); the hook handles registering on mount/update and clearing on unmount so context never leaks across navigation. **Always summarize/cap what you pass** (e.g. `slice(0, 30)`, pick relevant fields) — never dump raw arrays. Currently wired into: dashboard, my-leaves, calendar, attendance, reports
- Chat history is ephemeral — resets whenever the route changes (`api/ai/chat/route.ts` streams plain-text responses; no DB persistence)

## Code Patterns

- **Path alias**: `@/*` maps to `./src/*`
- **Supabase clients**: Use `server.ts` in Server Components, `client.ts` in Client Components, `admin.ts` only for privileged operations (user creation)
- **UI components**: shadcn/ui with Radix primitives in `src/components/ui/`
- **Styling**: Tailwind CSS, dark mode default (`<html class="dark">`), CSS variables for leave type colors
- **Toasts**: `sonner` — use `toast.success()`, `toast.error()`
- **Forms**: react-hook-form + zod validation
- **Font**: Inter (via next/font)

## Gotchas

- **Never use `supabase/seed.sql`** — it inserts directly into `auth.users` which doesn't work. Use `seed-production.mjs` or `seed-database.mjs` instead.
- **User registration** uses Supabase Admin API (service role key) with rollback — see `src/app/(dashboard)/team/actions.ts`
- **RLS is enabled** on all tables — queries must go through authenticated Supabase clients
- **Middleware** refreshes auth sessions on every request — don't bypass it
- The app is hardcoded to dark mode (`<html class="dark">`)
- **Emoji input**: use `EmojiTextarea` from `src/components/ui/emoji-textarea.tsx` (wraps `Textarea` + picker button) wherever users enter freeform text. Use `emojify()` from `src/lib/emoji.ts` to render `:shortcode:` → native emoji on display.
- **`npm run lint`** currently launches an interactive ESLint setup prompt (deprecated `next lint`, no v9 flat config) — it won't run clean non-interactively. Use `npx tsc --noEmit` for a quick type check.
