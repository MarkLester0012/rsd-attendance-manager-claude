# Architecture Research

**Domain:** Attendance and Leave Management System
**Researched:** 2026-03-02
**Confidence:** MEDIUM (based on training data for well-established patterns; external doc verification was unavailable)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER (Next.js App Router)         │
│                                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Layouts   │  │   Pages    │  │ Components │  │  Client Hooks │  │
│  │ (RSC Auth) │  │  (RSC +    │  │  (UI kit,  │  │ (realtime,   │  │
│  │            │  │   client)  │  │  forms)    │  │  mutations)  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  │
│        │               │               │                │          │
├────────┴───────────────┴───────────────┴────────────────┴──────────┤
│                     DATA ACCESS LAYER                               │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Server Actions  │  │  Route Handlers  │  │  Supabase        │  │
│  │  (mutations)     │  │  (API, if needed)│  │  Client Utils    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │           │
├───────────┴─────────────────────┴──────────────────────┴───────────┤
│                     SUPABASE PLATFORM                               │
│                                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │   Auth    │  │  Database  │  │  Realtime │  │  Row-Level    │   │
│  │ (GoTrue)  │  │ (Postgres) │  │ (channels)│  │  Security     │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Layouts** | Auth gate, role guard, sidebar, theme provider | `app/layout.tsx` (root), `app/(authenticated)/layout.tsx` (protected shell) |
| **Pages** | Route-specific data fetching (RSC) and page composition | `app/(authenticated)/dashboard/page.tsx` etc. |
| **Components** | Reusable UI: stat cards, calendars, modals, tables, forms | `components/` folder, organized by domain + shared |
| **Client Hooks** | Client-side state, realtime subscriptions, optimistic updates | `hooks/` folder: `useRealtime`, `useLeaveForm`, etc. |
| **Server Actions** | All write operations: apply leave, approve, register user, etc. | `app/actions/` or co-located `actions.ts` files |
| **Supabase Client Utils** | Create typed Supabase clients per context (server, client, middleware) | `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts` |
| **Auth (GoTrue)** | Email/password sign-in, session management, cookie refresh | Supabase Auth with `@supabase/ssr` package |
| **Database (Postgres)** | All tables, views, functions, triggers | Supabase-hosted Postgres with generated types |
| **Realtime** | Live subscription for Approvals page | Supabase Realtime `postgres_changes` channel |
| **Row-Level Security** | Authorization at the database level | RLS policies per table based on `auth.uid()` and user role |

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/                    # Public auth routes (no sidebar)
│   │   ├── login/
│   │   │   └── page.tsx           # Login page
│   │   └── layout.tsx             # Auth layout (centered, no chrome)
│   │
│   ├── (authenticated)/           # Protected routes (with sidebar)
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Dashboard with stats, charts, announcements
│   │   ├── calendar/
│   │   │   └── page.tsx           # My Calendar with leave markers
│   │   ├── attendance/
│   │   │   └── page.tsx           # Office Attendance daily view
│   │   ├── leaves/
│   │   │   └── page.tsx           # My Leaves list with filters
│   │   ├── approvals/
│   │   │   └── page.tsx           # Approval queue (leader/hr) + realtime
│   │   ├── team/
│   │   │   └── page.tsx           # Team Members (search, filter, register)
│   │   ├── projects/
│   │   │   └── page.tsx           # Projects management (leader)
│   │   ├── suggestions/
│   │   │   └── page.tsx           # Anonymous suggestions + upvote
│   │   ├── holidays/
│   │   │   └── page.tsx           # Holiday management (hr)
│   │   ├── announcements/
│   │   │   └── page.tsx           # Announcements management (hr)
│   │   ├── reports/
│   │   │   └── page.tsx           # Aggregate reports (hr)
│   │   ├── profile/
│   │   │   └── page.tsx           # User profile + change password
│   │   └── layout.tsx             # Authenticated layout: sidebar + main content
│   │
│   ├── actions/                   # Server Actions (grouped by domain)
│   │   ├── auth.ts                # Login, register, change password
│   │   ├── leaves.ts              # Apply, cancel leave
│   │   ├── approvals.ts           # Approve, reject
│   │   ├── team.ts                # Register member, update
│   │   ├── projects.ts            # CRUD projects
│   │   ├── suggestions.ts         # Post, upvote
│   │   ├── holidays.ts            # CRUD holidays
│   │   └── announcements.ts       # CRUD announcements
│   │
│   ├── layout.tsx                 # Root layout (html, body, theme, font)
│   └── globals.css                # CSS variables for theming
│
├── components/
│   ├── ui/                        # Generic UI primitives (Button, Modal, Card, Badge, etc.)
│   ├── layout/                    # Sidebar, Header, ThemeToggle
│   ├── dashboard/                 # StatCard, LeaveBreakdownChart, RecentActivity
│   ├── calendar/                  # CalendarGrid, DayCell, LeaveMarker, LeaveModal
│   ├── leaves/                    # LeaveForm, LeaveList, LeaveStatusBadge, LeaveTypeTag
│   ├── approvals/                 # ApprovalCard, ApprovalActions
│   ├── team/                      # MemberCard, RegisterMemberForm, MemberModal
│   ├── attendance/                # AttendanceStatusCard, AttendanceSummary
│   └── shared/                    # RoleGuard, DatePicker, SearchInput, FilterBar
│
├── hooks/
│   ├── use-realtime.ts            # Supabase Realtime subscription hook
│   ├── use-current-user.ts        # Current user context/session
│   ├── use-leave-balance.ts       # Leave balance calculations
│   └── use-optimistic.ts          # Optimistic update helpers (suggestions upvote)
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Browser client (createBrowserClient)
│   │   ├── server.ts              # Server component client (createServerClient with cookies)
│   │   ├── middleware.ts           # Middleware client (session refresh)
│   │   └── admin.ts               # Service role client (user registration rollback)
│   ├── constants.ts               # Leave types, colors, roles, WFH caps
│   ├── utils.ts                   # Date helpers, formatting, validation
│   └── types/
│       ├── database.ts            # Generated Supabase types (supabase gen types)
│       └── app.ts                 # App-specific derived types
│
├── middleware.ts                   # Auth session refresh + route protection
│
└── seed/
    └── seed.sql                   # Sample users, holidays, leaves, projects
```

### Structure Rationale

- **`app/(auth)` vs `app/(authenticated)`:** Route groups separate public and protected layouts cleanly. The auth layout is minimal (centered card), while the authenticated layout has sidebar + content area. No duplication.
- **`app/actions/`:** Centralized server actions rather than co-located. For this project's size (~10 pages, ~8 action domains), a single actions folder is easier to navigate than hunting through route folders. Each file maps to one domain.
- **`components/` by domain:** Components grouped by feature domain (dashboard, calendar, leaves) rather than by type (forms, cards, tables). This keeps related components together and makes it obvious where new components go. The `ui/` subfolder holds truly generic primitives.
- **`lib/supabase/` with 4 clients:** Next.js App Router requires different Supabase client creation depending on context. This is non-negotiable architecture -- you need separate factory functions for browser, server component, middleware, and admin (service role) contexts.
- **`seed/`:** SQL seed file lives in the project for reproducibility. Run via Supabase CLI or dashboard SQL editor.

## Architectural Patterns

### Pattern 1: Three Supabase Client Types + Admin Client

**What:** Next.js App Router requires different Supabase clients depending on execution context. The `@supabase/ssr` package provides `createBrowserClient` and `createServerClient` functions that handle cookie-based auth properly.

**When to use:** Every Supabase call. There is no single "supabase client" in App Router.

**Trade-offs:** More boilerplate, but cookies-based auth works correctly across SSR/CSR boundaries. The alternative (JWT in localStorage) breaks SSR and is insecure.

**Example:**
```typescript
// lib/supabase/client.ts -- Browser (Client Components)
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// lib/supabase/server.ts -- Server Components & Server Actions
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/lib/types/database';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

// lib/supabase/admin.ts -- Service role for user registration rollback
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/types/database';

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Never expose to client
  );
}
```

### Pattern 2: Server Components for Data, Client Components for Interaction

**What:** Pages are Server Components that fetch data at the top level using the server Supabase client. Interactive parts (forms, modals, realtime) are Client Components that receive initial data as props and use the browser Supabase client for mutations.

**When to use:** Every page. This is the fundamental Next.js App Router pattern.

**Trade-offs:** Requires clear thinking about the server/client boundary. You cannot use hooks in Server Components. You cannot use `cookies()` in Client Components.

**Example:**
```typescript
// app/(authenticated)/approvals/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server';
import { ApprovalsList } from '@/components/approvals/ApprovalsList';
import { RoleGuard } from '@/components/shared/RoleGuard';

export default async function ApprovalsPage() {
  const supabase = await createClient();

  const { data: pendingLeaves } = await supabase
    .from('leave_requests')
    .select('*, profiles(full_name, department)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (
    <RoleGuard roles={['leader', 'hr']}>
      <ApprovalsList initialData={pendingLeaves ?? []} />
    </RoleGuard>
  );
}

// components/approvals/ApprovalsList.tsx (Client Component)
'use client';
// Receives initialData, sets up realtime subscription, handles approve/reject
```

### Pattern 3: Middleware for Auth Refresh and Route Protection

**What:** Next.js middleware intercepts every request to refresh the Supabase auth session (preventing stale cookies) and redirect unauthenticated users.

**When to use:** Always. Without middleware session refresh, server-side auth checks will fail after the session token expires.

**Trade-offs:** Middleware runs on every request including static assets. Use a matcher to limit it to relevant paths.

**Example:**
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

### Pattern 4: Server Actions for All Mutations

**What:** Use Next.js Server Actions (functions with `'use server'` directive) for all write operations. They run server-side, have access to cookies (so Supabase server client works), and integrate with `useActionState` / `useTransition` for loading states.

**When to use:** Every create, update, delete operation. Never use API route handlers for mutations if server actions can handle it.

**Trade-offs:** Server actions are RPC-style, not REST. Fine for this app size. They serialize arguments and return values, so no streaming or file uploads without extra handling.

**Example:**
```typescript
// app/actions/approvals.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function approveLeave(leaveId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['leader', 'hr'].includes(profile.role)) {
    throw new Error('Unauthorized');
  }

  // Update leave request status and deduct balance
  const { error } = await supabase.rpc('approve_leave', { leave_id: leaveId });
  if (error) throw new Error(error.message);

  revalidatePath('/approvals');
}
```

### Pattern 5: Role-Based Access at Three Levels

**What:** Authorization enforced at three layers: (1) UI-level -- hide/show components based on role, (2) Server Action-level -- check role before executing mutations, (3) Database-level -- RLS policies on every table.

**When to use:** Always. Defense in depth. UI guards are for UX, not security. RLS is the real security boundary.

**Trade-offs:** Triple authorization is more work. But skipping any layer creates vulnerabilities. RLS alone is sufficient for security, but server action checks provide better error messages, and UI guards prevent users from seeing actions they cannot take.

## Data Flow

### Request Flow (Read - Server Component)

```
[User navigates to /dashboard]
    |
[Middleware] --> Refresh auth session cookie
    |
[Page Server Component] --> Create server Supabase client (with cookies)
    |
[Supabase query] --> Database (RLS enforced based on auth.uid())
    |
[Return data] --> Render RSC HTML with data --> [Send to browser]
```

### Request Flow (Write - Server Action)

```
[User clicks "Approve"]
    |
[Client Component] --> Call server action (approve_leave)
    |
[Server Action] --> Create server Supabase client (with cookies)
    |
[Auth check] --> Verify user role
    |
[Supabase RPC/query] --> Database (RLS + business logic in Postgres function)
    |
[revalidatePath] --> Invalidate cached page data
    |
[Response] --> Client receives result, page re-renders with fresh data
```

### Realtime Flow (Approvals Page Only)

```
[Client Component mounts]
    |
[Create browser Supabase client]
    |
[Subscribe to channel] --> supabase.channel('approvals')
    |                         .on('postgres_changes', {
    |                           event: '*',
    |                           schema: 'public',
    |                           table: 'leave_requests',
    |                           filter: 'status=eq.pending'
    |                         }, callback)
    |                         .subscribe()
    |
[Another user applies for leave / leader approves]
    |
[Postgres fires change event] --> Supabase Realtime --> [Channel callback]
    |
[Update local state] --> Re-render approval list without page refresh
    |
[Component unmounts] --> supabase.removeAllChannels()
```

### Key Data Flows

1. **Leave Application:** User fills form (Client Component) --> Server Action validates (balance check, date check, WFH cap check) --> Insert into `leave_requests` --> If auto-approved type, also deduct balance --> `revalidatePath` --> Calendar and Leaves pages show updated data.

2. **Leave Approval:** Leader/HR clicks approve on Approvals page --> Server Action calls Postgres function `approve_leave` (atomically updates status + deducts balance) --> `revalidatePath` --> Realtime notifies other connected Approvals viewers.

3. **User Registration (HR):** HR fills registration form --> Server Action creates auth user via admin client --> Inserts profile row --> If profile insert fails, deletes auth user (rollback) --> `revalidatePath` team page.

4. **Dashboard Load:** Server Component fetches stats (leave balance, pending count, recent activity, announcements) in parallel queries --> Renders stat cards, chart, activity list, announcements.

## Data Model

### Core Tables

```
┌──────────────┐      ┌──────────────────┐      ┌────────────────┐
│   profiles   │      │  leave_requests  │      │   holidays     │
├──────────────┤      ├──────────────────┤      ├────────────────┤
│ id (FK auth) │──┐   │ id               │      │ id             │
│ email        │  │   │ user_id (FK)  ◄──┼──┐   │ name           │
│ full_name    │  │   │ leave_type       │  │   │ date           │
│ role         │  └──►│ start_date       │  │   │ year           │
│ department   │      │ end_date         │  │   └────────────────┘
│ leave_balance│      │ half_day         │  │
│ is_active    │      │ half_day_period  │  │   ┌────────────────┐
│ created_at   │      │ status           │  │   │  departments   │
└──────────────┘      │ reason           │  │   ├────────────────┤
                      │ approved_by (FK) │  │   │ id             │
                      │ created_at       │  │   │ name           │
                      └──────────────────┘  │   └────────────────┘
                                            │
┌──────────────┐      ┌──────────────────┐  │   ┌────────────────┐
│   projects   │      │ project_members  │  │   │ announcements  │
├──────────────┤      ├──────────────────┤  │   ├────────────────┤
│ id           │──┐   │ id               │  │   │ id             │
│ name         │  └──►│ project_id (FK)  │  │   │ title          │
│ leader_id(FK)│      │ user_id (FK)  ◄──┼──┘   │ content        │
│ description  │      └──────────────────┘      │ created_by(FK) │
│ is_active    │                                │ created_at     │
└──────────────┘      ┌──────────────────┐      └────────────────┘
                      │   suggestions    │
                      ├──────────────────┤      ┌────────────────┐
                      │ id               │      │suggestion_votes│
                      │ content          │      ├────────────────┤
                      │ is_anonymous     │      │ id             │
                      │ created_at       │      │ suggestion_id  │
                      │ vote_count       │      │ user_id        │
                      └──────────────────┘      └────────────────┘
```

### Key Design Decisions in the Data Model

1. **`profiles` extends `auth.users`:** Supabase Auth manages the `auth.users` table. `profiles` is a public table with `id` foreign-keyed to `auth.users.id`. All app-specific user data (role, department, leave_balance) lives in `profiles`. A trigger or manual insert creates the profile row on user registration.

2. **`leave_balance` as a numeric field on profiles:** For <50 users, storing the balance directly on the profile and updating it transactionally during approval/cancellation is simpler and more performant than computing it from leave history on every request. A Postgres function ensures atomic balance updates.

3. **`leave_requests.status` enum:** Values: `pending`, `approved`, `rejected`, `cancelled`. Auto-approved types (SL, NW, RGA, AB, WFH) are inserted directly as `approved`.

4. **`departments` as a separate table:** Rather than a freetext field on profiles, a fixed department list enables consistent filtering and reporting. `profiles.department` is a foreign key to `departments.id` (or `departments.name`).

5. **`suggestion_votes` junction table:** Enables one-vote-per-user enforcement at the database level with a unique constraint on `(suggestion_id, user_id)`. `suggestions.vote_count` is a denormalized counter updated via trigger or RPC for fast reads.

### Row-Level Security Strategy

| Table | Policy | Logic |
|-------|--------|-------|
| `profiles` | SELECT | All authenticated users can read all profiles (needed for team view, attendance) |
| `profiles` | UPDATE | Users can update their own profile; HR can update any |
| `leave_requests` | SELECT | Users see their own; leaders see their team's; HR sees all |
| `leave_requests` | INSERT | Users can insert for themselves only |
| `leave_requests` | UPDATE | Leaders/HR can update status; users can cancel their own pending |
| `holidays` | SELECT | All authenticated users |
| `holidays` | INSERT/UPDATE/DELETE | HR only |
| `announcements` | SELECT | All authenticated users |
| `announcements` | INSERT/UPDATE/DELETE | HR only |
| `projects` | SELECT | All authenticated users |
| `projects` | INSERT/UPDATE/DELETE | Leaders (their own) and HR |
| `suggestions` | SELECT | All authenticated users |
| `suggestions` | INSERT | All authenticated users |
| `suggestion_votes` | INSERT/DELETE | Users can vote/unvote; unique constraint prevents double-voting |

**RLS for role checks:** Create a Postgres function `get_user_role()` that queries `profiles.role` for `auth.uid()`. Use this in RLS policies rather than repeating the subquery.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| <50 users (current) | Single Supabase project, no caching layer, direct queries from RSC, single realtime channel. This is the right level of simplicity. |
| 50-500 users | Add indexes on `leave_requests(user_id, status)` and `leave_requests(start_date, end_date)`. Consider Supabase connection pooling (PgBouncer, enabled by default on Supabase). No architecture changes needed. |
| 500+ users | If realtime usage grows beyond Approvals, consider message fan-out patterns. Consider caching dashboard aggregates. But realistically, this is a company-internal tool -- you will not hit scaling issues at <50 users. |

### Scaling Priorities

1. **First bottleneck (theoretical):** Dashboard aggregate queries. Multiple parallel queries for stats on every page load. Mitigation: Postgres materialized view or a summary table updated by trigger. Not needed at <50 users.
2. **Second bottleneck (theoretical):** Calendar rendering with many leave entries. Mitigation: Query only the visible month. Already the natural UX pattern.

## Anti-Patterns

### Anti-Pattern 1: Fetching Data in Client Components by Default

**What people do:** Make every component a Client Component and fetch data using `useEffect` + browser Supabase client.
**Why it's wrong:** Causes loading spinners everywhere, double round-trips (browser -> Supabase instead of server -> Supabase), exposes query logic to the client, misses the core benefit of App Router.
**Do this instead:** Fetch in Server Components (pages/layouts) using the server client. Pass data as props to Client Components. Only use browser client for realtime subscriptions and client-side mutations.

### Anti-Pattern 2: Skipping RLS and Relying on UI/Server Action Checks Only

**What people do:** Disable RLS on tables and rely on server-side code to enforce authorization.
**Why it's wrong:** Any direct Supabase client access (e.g., from browser devtools using the anon key) bypasses server action checks. One missed auth check in a server action exposes all data.
**Do this instead:** Enable RLS on every table. Write policies for all operations. Server action checks are a second layer, not the only layer.

### Anti-Pattern 3: Single Supabase Client Shared Across Contexts

**What people do:** Create one Supabase client and import it everywhere.
**Why it's wrong:** Server Components need cookie access (read-only). Server Actions need cookie access (read-write). Client Components need browser storage. Middleware needs request/response cookie manipulation. A single client cannot handle all these contexts.
**Do this instead:** Four factory functions in `lib/supabase/`: `server.ts`, `client.ts`, `middleware.ts`, `admin.ts`. Each creates the right client for its context.

### Anti-Pattern 4: Storing WFH/Leave Balance as Computed Aggregates Only

**What people do:** Calculate leave balance by summing all approved leave_requests on every request.
**Why it's wrong:** As leave history grows, the aggregate query gets slower. More importantly, race conditions during concurrent approvals can lead to negative balances.
**Do this instead:** Store `leave_balance` on `profiles`. Use a Postgres function with `SELECT ... FOR UPDATE` to atomically check and deduct balance during approval. The function is the single source of truth for balance mutation.

### Anti-Pattern 5: Putting Business Logic in Server Actions Instead of Postgres Functions

**What people do:** Write all validation and mutation logic in TypeScript server actions.
**Why it's wrong:** Business rules like "deduct balance on approval" or "enforce WFH daily cap" involve multiple table reads and writes. Doing this in application code requires multiple round-trips and lacks atomicity.
**Do this instead:** For multi-step business logic (approve leave, check balance, deduct balance), use Postgres functions (`supabase.rpc('approve_leave', ...)`). The function runs in a single transaction with guaranteed atomicity.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth (GoTrue) | `@supabase/ssr` package, cookie-based sessions | Session refresh in middleware is critical; without it, SSR auth breaks after token expiry |
| Supabase Database | Typed queries via generated types (`supabase gen types typescript`) | Regenerate types after every schema change |
| Supabase Realtime | Client-side `postgres_changes` subscription | Only on Approvals page; must enable Realtime on `leave_requests` table in Supabase dashboard |
| Vercel | Standard Next.js deployment, environment variables for Supabase keys | Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Server Component <-> Client Component | Props (initial data down), Server Actions (mutations up) | Client Components never call Supabase server client directly |
| Server Action <-> Database | Supabase server client or RPC calls | All writes go through server actions, never direct client-side inserts |
| Client Component <-> Realtime | Browser Supabase client channel subscription | Only Approvals page; cleanup subscription on unmount |
| Middleware <-> Auth | Cookie read/write to refresh session | Runs on every navigation; must not block on slow networks |
| HR registration <-> Admin client | Service role client for creating auth users and rollback | Service role key is server-only (`SUPABASE_SERVICE_ROLE_KEY`), never exposed to client |

## Build Order (Dependencies)

The following build order reflects component dependencies -- each phase requires the previous to be functional.

```
Phase 1: Foundation
  ├── Supabase project setup (database, auth, RLS skeleton)
  ├── Next.js project scaffolding (App Router, layouts, theming)
  ├── Supabase client utilities (4 client types)
  ├── Middleware (auth refresh + route protection)
  └── Login page
       |
Phase 2: Core Data & Layout
  ├── Database schema (all tables, RLS policies, functions)
  ├── Seed data
  ├── Authenticated layout (sidebar, navigation, role filtering)
  ├── Profile page
  └── Department management
       |
Phase 3: Leave System (core business logic)
  ├── Leave application form + server actions
  ├── My Leaves page (list, filter)
  ├── My Calendar (grid, leave markers, holiday markers)
  ├── Balance tracking logic (Postgres functions)
  └── WFH cap enforcement
       |
Phase 4: Approval & Attendance
  ├── Approvals page + server actions
  ├── Realtime subscription on Approvals
  ├── Office Attendance daily view
  └── Approval workflow (approve/reject with balance mutations)
       |
Phase 5: Admin Features
  ├── Team Members page (HR: register, all: view)
  ├── Projects page (leader: manage)
  ├── Holidays management (HR)
  ├── Announcements management (HR)
  └── Reports page (HR)
       |
Phase 6: Social & Polish
  ├── Dashboard (stat cards, charts, recent activity, announcements)
  ├── Suggestions page (anonymous posting, upvoting)
  └── Final polish (dark/light theme, responsive, edge cases)
```

**Build order rationale:**
- Auth and database schema must come first -- everything depends on them.
- Leave system is the core domain logic; building it before approvals means you can test the full leave lifecycle end-to-end.
- Approvals depend on leave requests existing and the balance mutation logic being solid.
- Admin features (team, projects, holidays, announcements) are independent of each other but depend on the auth/role system.
- Dashboard is built last because it aggregates data from all other features (leaves, attendance, announcements). Building it first means constantly updating it as new data sources come online.
- Suggestions is the most independent feature -- it can be built anytime but fits naturally at the end.

## Sources

- Supabase official documentation for Next.js App Router integration (training data, MEDIUM confidence -- external verification unavailable during research)
- Next.js App Router documentation for Server Components, Server Actions, and middleware patterns (training data, MEDIUM confidence)
- Common attendance/leave management system data modeling patterns (training data, MEDIUM confidence)
- `@supabase/ssr` package patterns for cookie-based auth (training data, MEDIUM confidence)

**Note:** WebSearch, WebFetch, and Brave Search were all unavailable during this research session. All findings are based on training data for well-established patterns (Next.js App Router + Supabase is a widely documented stack). Confidence is MEDIUM rather than HIGH because external verification was not possible. The patterns described here are standard and well-known, but specific API details (function signatures, exact cookie handling) should be verified against current `@supabase/ssr` documentation during implementation.

---
*Architecture research for: RSD Attendance Manager*
*Researched: 2026-03-02*
