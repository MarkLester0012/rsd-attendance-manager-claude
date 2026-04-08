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
      announcements/     # Company announcements
      suggestions/       # Suggestion box
      profile/           # User profile
  components/
    ui/                  # shadcn/ui primitives
    layout/              # Sidebar, header
    leaves/              # Leave modal, shared leave components
    auth/                # Auth forms
  hooks/
    use-user.ts          # Current user hook
    use-pending-count.ts # Pending approvals count (sidebar badge)
  lib/
    constants/
      leave-types.ts     # 9 leave types with rules (VL, PL, ML, SPL, SL, NW, RGA, AB, WFH)
      navigation.ts      # Role-based nav items
    supabase/
      client.ts          # Browser client
      server.ts          # Server component client
      middleware.ts       # Session refresh middleware
      admin.ts           # Service role client (user registration)
    types/index.ts       # All TypeScript interfaces
    utils.ts             # cn() helper
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

- **member**: Dashboard, calendar, my-leaves, attendance, suggestions, profile
- **leader**: + approvals, reports, team (read-only)
- **hr**: + team management, holidays, projects, announcements (full CRUD)

Navigation is role-gated via `src/lib/constants/navigation.ts`. Page-level access enforced server-side.

## Leave System

9 leave types defined in `src/lib/constants/leave-types.ts`:
- **Balance-deducting**: VL, PL, ML, SPL, SL, AB
- **Non-deducting**: NW (No Work), RGA (RGA Office), WFH (Work From Home)
- HR users have unlimited leave balance
- Leave overlap checking is enforced
- Half-day support: `whole`, `half_am`, `half_pm`

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
