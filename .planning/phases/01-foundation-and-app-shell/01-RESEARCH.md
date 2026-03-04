# Phase 1: Foundation and App Shell - Research

**Researched:** 2026-03-04
**Domain:** Authentication, Database Schema, Navigation Shell, Theming, Seed Data
**Confidence:** HIGH

## Summary

Phase 1 establishes the complete infrastructure that every subsequent phase depends on: Supabase authentication with cookie-based sessions, a full PostgreSQL database schema with Row Level Security, a role-filtered sidebar navigation shell with dark/light theming, and realistic seed data for development and demos.

The project is **not** greenfield -- substantial code already exists. The Next.js 15 + Supabase SSR stack is already wired up with client/server/middleware/admin Supabase factories, a login page with form, a sidebar with role-filtered navigation, Zustand stores for sidebar collapse and theme persistence, a dashboard layout with server-side auth checks, and a complete CSS variable theming system. What remains to complete is: (1) the database schema as SQL migrations, (2) RLS policies, (3) a seed script to populate auth users and public data, (4) refinements to the login form per user decisions (show password toggle, remember me checkbox, inline errors), and (5) any gaps in the existing navigation/theming implementation.

**Primary recommendation:** Focus on what is missing -- the Supabase database migrations (schema + RLS), the seed script (auth users + public data), and the login form refinements. The existing app shell, middleware, stores, and layout code is solid and follows current best practices. Do not rebuild what already works.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Login page: Split layout with branding/illustration left panel, login form right panel (NOTE: current implementation uses centered single-card layout with floating orbs -- user may want to revisit or accept current design)
- Text-based "RSD" logo treatment (no image assets required)
- Login errors displayed inline under the relevant field
- Include both "Show password" toggle and "Remember me" checkbox
- Dark mode is the default first impression
- Sidebar: Icon-only rail when collapsed (not fully hidden)
- Mobile: slide-out drawer from left (hamburger icon trigger)
- Nav items: Dashboard, Calendar, My Leaves, Attendance (common); Approvals (leader/hr); Team Members (all, but HR registration for hr only); Projects (leader); Holidays (hr); Announcements (hr); Reports (hr); Suggestions (all)
- Bottom user area: avatar + name with dropdown menu containing Profile, Theme toggle, Logout
- Pending approval count badge on Approvals nav item for leader/hr roles
- Seed data: 15-20 users across departments (~12 members, 3-4 leaders, 2 HR)
- Generic tech company departments (Engineering, Design, Product, HR, QA)
- Comprehensive leave scenarios: all 9 leave types represented, mix of pending/approved/rejected, WFH near caps, half-day examples
- Named users with realistic names (john.doe@rsd.com pattern) and shared test password
- Include sample holidays, projects, and announcements
- Departments as a separate table (id, name, created_at)
- Leave balances as explicit balance table (one row per user per leave type) -- not computed from history
- Leader approval scope: same department
- Leave types as hardcoded TypeScript constant (already implemented in code)

### Claude's Discretion
- Exact color palette for dark/light themes (must use CSS variables on html element)
- Sidebar width values (expanded and collapsed)
- Specific shadcn/ui components to use for sidebar structure
- Database table naming conventions and column types
- RLS policy implementation details
- Postgres RPC function signatures for atomic operations
- Exact seed data values and leave balance numbers

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can log in with email and password | Existing `login-form.tsx` uses `supabase.auth.signInWithPassword()`. Needs: show password toggle, remember me checkbox, inline field errors per user decisions |
| AUTH-02 | User session persists across browser refresh via cookie-based auth | Existing `@supabase/ssr` middleware refreshes cookies on every request via `getUser()` call. Pattern is correct per official docs |
| AUTH-03 | User can log out from any page | Existing sidebar has `handleSignOut()` calling `supabase.auth.signOut()` then `router.push("/login")`. Functional |
| AUTH-04 | Unauthenticated users are redirected to login page | Existing middleware (`src/middleware.ts` + `src/lib/supabase/middleware.ts`) handles redirect. Dashboard layout also has server-side redirect |
| AUTH-05 | Role-based access control enforced for member, leader, and hr roles | User role stored in `users` table with `role` column. Dashboard layout fetches user profile. RLS policies needed in database |
| AUTH-06 | Navigation and page access filtered by user role | Existing `getNavItemsForRole()` in navigation constants filters sidebar items by role. `AccessDenied` component exists |
| NAVT-01 | Application has collapsible sidebar navigation | Existing `Sidebar` component with `useSidebarStore` handles collapse with `w-[72px]` (icon rail) and `w-64` (expanded) |
| NAVT-02 | Sidebar items filtered by user role | Existing `getNavItemsForRole()` filters by `item.roles.includes(role)` |
| NAVT-03 | Sidebar shows pending approval count badge for leader/hr | Existing `SidebarNavItem` renders `Badge` when `item.badgeKey === "pendingApprovals"`. Count passed from dashboard layout server query |
| NAVT-04 | Application supports dark mode (default) and light mode | Existing `ThemeProvider` + `useThemeStore` + CSS variables in `globals.css` for both `:root` (light) and `.dark` themes. Dark is default |
| NAVT-05 | Theme uses CSS variables on html element; components never hardcode colors | `tailwind.config.ts` maps all colors to `hsl(var(--xxx))`. `globals.css` defines all variables. Correct pattern |
| SEED-01 | System includes sample users for each role (member, leader, hr) | Needs: SQL seed script using `supabase.auth.admin.createUser()` or direct SQL inserts to create auth users + public profiles |
| SEED-02 | System includes sample holidays, leave entries, and projects | Needs: SQL seed data for holidays, leaves, projects, announcements, departments |
</phase_requirements>

## Existing Code Audit

**CRITICAL: The planner must account for what already exists.** This is not a from-scratch build.

### Already Implemented (DO NOT REBUILD)
| Component | File(s) | Status |
|-----------|---------|--------|
| Supabase browser client | `src/lib/supabase/client.ts` | Complete, correct pattern |
| Supabase server client | `src/lib/supabase/server.ts` | Complete, uses `await cookies()` (Next.js 15 async) |
| Supabase middleware client | `src/lib/supabase/middleware.ts` | Complete, refreshes session via `getUser()` |
| Supabase admin client | `src/lib/supabase/admin.ts` | Complete, uses `SUPABASE_SERVICE_ROLE_KEY` |
| Next.js middleware | `src/middleware.ts` | Complete, delegates to `updateSession()` |
| Auth redirect logic | `src/lib/supabase/middleware.ts` | Redirects unauth to `/login`, auth on `/login` to `/dashboard` |
| Login page | `src/app/(auth)/login/page.tsx` | Exists but needs refinements (see gaps) |
| Login form | `src/components/auth/login-form.tsx` | Exists but missing show password, remember me, inline errors |
| Dashboard layout (server) | `src/app/(dashboard)/layout.tsx` | Complete, fetches user + pending count server-side |
| Dashboard shell | `src/components/layout/dashboard-shell.tsx` | Complete |
| Sidebar with role filtering | `src/components/layout/sidebar.tsx` | Complete, icon rail collapse, mobile sheet drawer |
| Header | `src/components/layout/header.tsx` | Complete with page titles, mobile menu trigger |
| Navigation constants | `src/lib/constants/navigation.ts` | Complete with all nav items, role filtering |
| Theme provider | `src/components/theme-provider.tsx` | Complete, syncs Zustand theme to DOM |
| Theme store | `src/stores/theme-store.ts` | Complete with localStorage persistence |
| Sidebar store | `src/stores/sidebar-store.ts` | Complete with localStorage persistence |
| TypeScript types | `src/lib/types/index.ts` | Complete with User, Department, LeaveEntry, Holiday, Project, etc. |
| Leave type constants | `src/lib/constants/leave-types.ts` | Complete with all 9 types, configs, caps |
| CSS variables | `src/app/globals.css` | Complete with light/dark themes, leave colors, status colors, sidebar tokens |
| Tailwind config | `tailwind.config.ts` | Complete with `darkMode: "class"`, all CSS variable mappings |
| shadcn/ui components | `src/components/ui/*.tsx` | 16 components installed (button, input, card, label, etc.) |
| Root layout | `src/app/layout.tsx` | Complete with ThemeProvider, Toaster, Inter font |
| useUser hook | `src/hooks/use-user.ts` | Complete, fetches auth user + profile from `users` table |
| Access denied component | `src/components/access-denied.tsx` | Complete |
| Utility functions | `src/lib/utils.ts` | `cn()`, `getInitials()`, `formatDate()` |

### Gaps to Fill
| Gap | What's Missing | Priority |
|-----|---------------|----------|
| Database schema | No SQL migration files exist. No `supabase/` directory. Tables referenced in code (users, departments, leaves) have no schema definition | CRITICAL |
| RLS policies | No Row Level Security policies defined | CRITICAL |
| Seed data | No seed script for auth users or public table data | CRITICAL |
| Login form refinements | Missing "Show password" toggle, "Remember me" checkbox, inline field-level error display | HIGH |
| Login page layout | Current design is centered single-card with floating orbs. User decision specifies split layout (left branding, right form). Needs reconciliation | MEDIUM |
| Leave balances table | TypeScript types reference `leave_balance: number` on User but user decision calls for separate `leave_balances` table (one row per user per leave type) | HIGH (types update needed) |
| Zustand SSR hydration | Current stores use `typeof window !== "undefined"` check instead of Zustand `persist` middleware with `skipHydration`. Works but may cause hydration mismatches | LOW (functional, improve later) |

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15.1.3 | Full-stack React framework | App Router, server components, server actions, middleware |
| @supabase/ssr | ^0.5.2 | Cookie-based Supabase auth for SSR | Official Supabase SSR package, `getAll`/`setAll` cookie API |
| @supabase/supabase-js | ^2.47.12 | Supabase client library | Database queries, auth operations, admin API |
| Zustand | ^5.0.3 | Client state management | Sidebar collapse, theme preference with localStorage |
| Tailwind CSS | ^3.4.17 | Utility-first CSS | CSS variable theming, dark mode via `class` strategy |
| shadcn/ui (new-york) | - | UI component library | Pre-built accessible components, CSS variable integration |
| Zod | ^3.24.1 | Schema validation | Form validation, data validation |
| react-hook-form | ^7.54.2 | Form state management | Login form, future forms |
| lucide-react | ^0.468.0 | Icons | Navigation icons, UI icons |
| sonner | ^1.7.1 | Toast notifications | Error/success feedback |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Date formatting | Header date display, leave date formatting |
| class-variance-authority | ^0.7.1 | Component variants | shadcn/ui button variants |
| clsx + tailwind-merge | ^2.1.1 / ^2.6.0 | Class name merging | `cn()` utility |
| recharts | ^2.15.0 | Charts | Future dashboard charts (Phase 5) |

### Tools Needed (Not Yet Set Up)
| Tool | Purpose | When to Use |
|------|---------|-------------|
| Supabase CLI | Database migrations, local development, type generation | Schema creation, seed data, `supabase db reset` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand localStorage | Zustand `persist` middleware | Persist middleware is more robust (handles serialization, SSR hydration via `skipHydration`). Current approach works but is manual. Refactoring is optional for Phase 1 |
| Custom sidebar | shadcn/ui Sidebar component | shadcn/ui has a full Sidebar primitive (`SidebarProvider`, `SidebarRail`, `SidebarMenu`, etc.) but the existing custom sidebar is fully functional and well-structured. Migrating would be unnecessary churn |
| SQL seed file | TypeScript seed script using admin API | SQL seed is simpler for `supabase db reset` workflow. TypeScript seed is better for creating auth users (needs `admin.createUser()`). Recommend hybrid: SQL for schema, TypeScript for auth+data seeding |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/login/          # Auth route group (no sidebar)
│   ├── (dashboard)/           # Dashboard route group (with sidebar)
│   │   ├── layout.tsx         # Server: fetch user, pending count
│   │   ├── dashboard/
│   │   ├── calendar/
│   │   └── ...
│   ├── globals.css
│   ├── layout.tsx             # Root: ThemeProvider, Toaster
│   └── page.tsx               # Redirect to /dashboard
├── components/
│   ├── auth/                  # Login form
│   ├── layout/                # Sidebar, Header, DashboardShell
│   ├── ui/                    # shadcn/ui primitives
│   └── ...
├── hooks/                     # useUser, future hooks
├── lib/
│   ├── constants/             # navigation.ts, leave-types.ts
│   ├── supabase/              # client.ts, server.ts, middleware.ts, admin.ts
│   ├── types/                 # TypeScript interfaces
│   └── utils.ts               # cn(), getInitials(), formatDate()
├── stores/                    # Zustand stores
│   ├── sidebar-store.ts
│   └── theme-store.ts
└── middleware.ts               # Next.js middleware entry

supabase/                       # NEW - Supabase project directory
├── migrations/
│   └── 00001_initial_schema.sql  # Tables, RLS, functions, indexes
├── seed.sql                    # Static data (departments, holidays, etc.)
└── config.toml                 # Supabase local config
```

### Pattern 1: Server Component Layout with Auth Gate
**What:** Dashboard layout is a server component that fetches the authenticated user and their profile, then passes data down to client components.
**When to use:** Every protected route group.
**Already implemented in:** `src/app/(dashboard)/layout.tsx`
```typescript
// Source: Existing code - src/app/(dashboard)/layout.tsx
export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("*, department:departments(*)")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) redirect("/login");
  // ... pass user to DashboardShell
}
```

### Pattern 2: Middleware Session Refresh
**What:** Next.js middleware intercepts every request to refresh the Supabase session cookie and redirect unauthenticated users.
**When to use:** Applied globally via matcher config.
**Already implemented in:** `src/middleware.ts` + `src/lib/supabase/middleware.ts`
**Key detail:** Must call `supabase.auth.getUser()` in middleware to refresh the session token. Using `getSession()` alone is insufficient -- it only reads the JWT without verifying it.

### Pattern 3: Role-Based Navigation Filtering
**What:** Navigation items are defined as a constant array with `roles` property. A filter function returns only items the user's role can see.
**When to use:** Sidebar rendering, page access control.
**Already implemented in:** `src/lib/constants/navigation.ts`

### Pattern 4: CSS Variable Theming with Tailwind
**What:** All colors are CSS custom properties (`--background`, `--foreground`, etc.) on `:root` and `.dark`. Tailwind config maps them via `hsl(var(--xxx))`. Theme switching toggles the `dark` class on `<html>`.
**When to use:** All component styling.
**Already implemented in:** `globals.css` + `tailwind.config.ts` + `theme-store.ts`

### Pattern 5: Database Schema with RLS
**What:** Every table has RLS enabled. Policies use `(select auth.uid())` pattern (subselect, not direct function call) for performance. Service role key bypasses RLS for admin operations.
**When to use:** All public tables.
```sql
-- Source: Supabase official docs (Context7 /llmstxt/supabase_llms_txt)
-- IMPORTANT: Use (select auth.uid()) not auth.uid() directly for policy performance
alter table users enable row level security;

create policy "Users can view own profile"
  on users for select
  to authenticated
  using ((select auth.uid()) = auth_id);
```

### Anti-Patterns to Avoid
- **Using `getSession()` for auth verification:** `getSession()` reads the JWT from cookies without server verification. Always use `getUser()` which contacts the Supabase auth server. The existing middleware correctly uses `getUser()`.
- **Hardcoding colors in components:** All colors must go through CSS variables. The existing setup enforces this via Tailwind config.
- **Storing role in JWT claims alone:** The role is stored in the `users` table and fetched server-side. This is correct -- JWT claims can be stale.
- **Calling `auth.uid()` directly in RLS policies:** Always wrap in a subselect `(select auth.uid())` for PostgreSQL query planner optimization. Direct calls cause the function to be re-evaluated per row.
- **Creating Supabase client at module level:** Always create inside function/component scope. The existing factories follow this pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based auth | Custom JWT/cookie logic | `@supabase/ssr` with `getAll`/`setAll` | Token refresh, cookie splitting, PKCE flow are complex edge cases |
| Session refresh | Manual token refresh middleware | `supabase.auth.getUser()` in middleware | Handles expired tokens, cookie updates atomically |
| Form validation | Manual `if/else` validation | `zod` + `react-hook-form` with `@hookform/resolvers` | Type inference, error messages, field-level validation |
| Row-level security | Application-level auth checks only | PostgreSQL RLS policies | Defense in depth -- even if app code has bugs, DB enforces access control |
| Theme persistence | Manual localStorage + DOM sync | Zustand store (already implemented) | Reactive state, single source of truth |
| UI components | Custom buttons/inputs/modals | shadcn/ui | Accessibility, keyboard navigation, focus management |
| Admin user creation | Direct SQL inserts to `auth.users` | `supabase.auth.admin.createUser()` | Proper password hashing, email confirmation, metadata handling |

**Key insight:** The Supabase auth + RLS combination provides two layers of security. The application layer (middleware + server components) handles UX redirects, while RLS provides database-level enforcement. Never rely on only one layer.

## Common Pitfalls

### Pitfall 1: Seed Data Auth Users via SQL Instead of Admin API
**What goes wrong:** Inserting directly into `auth.users` table with raw SQL skips password hashing, email confirmation, and identity linking.
**Why it happens:** Developers want a simple `INSERT INTO auth.users` in `seed.sql`.
**How to avoid:** Use a TypeScript seed script that calls `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via the service role key. This properly hashes passwords and creates the auth identity.
**Warning signs:** Users can't log in even though they appear in the database.

### Pitfall 2: Hydration Mismatch with Zustand localStorage
**What goes wrong:** Server renders with default state, client hydrates with localStorage state, causing React hydration mismatch warnings.
**Why it happens:** `typeof window !== "undefined"` check in store initializer runs on the client but server always uses defaults.
**How to avoid:** The current code suppresses this with `suppressHydrationWarning` on `<html>`. For a more robust solution, use Zustand's `persist` middleware with `skipHydration: true` and call `rehydrate()` in a `useEffect`. However, the current approach is functional.
**Warning signs:** Console warnings about hydration mismatches, brief flash of wrong theme on page load.

### Pitfall 3: Missing `await` on `cookies()` in Next.js 15
**What goes wrong:** `cookies()` returns a Promise in Next.js 15 (breaking change from 14). Forgetting `await` causes the server client to silently fail auth.
**Why it happens:** Many tutorials still show Next.js 14 patterns without `await`.
**How to avoid:** The existing `src/lib/supabase/server.ts` correctly uses `const cookieStore = await cookies()`. Maintain this pattern.
**Warning signs:** Auth always returns null user in server components.

### Pitfall 4: RLS Policies Blocking Seed Data
**What goes wrong:** After enabling RLS, seed data inserts fail because they run as the `postgres` role or `anon` role, not as an authenticated user.
**Why it happens:** RLS policies restrict to `authenticated` role with `auth.uid()` checks.
**How to avoid:** Run seed data using the service role key (bypasses RLS) or use a TypeScript seed script with the admin client. For SQL seed files, run them before enabling RLS, or use `SET ROLE postgres` (superuser bypasses RLS).
**Warning signs:** Seed script runs but tables remain empty.

### Pitfall 5: Leave Balances Table Mismatch with Types
**What goes wrong:** TypeScript `User` interface has `leave_balance: number` (single number), but the user decision specifies a separate `leave_balances` table with one row per user per leave type.
**Why it happens:** Types were defined before the database design was finalized.
**How to avoid:** Update the `User` interface to remove the single `leave_balance` field. Add a `LeaveBalance` interface: `{ id, user_id, leave_type, balance, updated_at }`. Update the `useUser` hook and dashboard layout to fetch balances separately or via a join.
**Warning signs:** Mismatch between TypeScript types and actual database schema.

### Pitfall 6: Forgetting Indexes on RLS Policy Columns
**What goes wrong:** RLS policies on large tables become slow because PostgreSQL does a sequential scan on the column used in the policy.
**Why it happens:** Developers add policies but forget indexes on the columns used in `USING` and `WITH CHECK` clauses.
**How to avoid:** Add B-tree indexes on every column referenced in RLS policies: `auth_id` on `users`, `user_id` on `leaves`, `department_id` on `users`, etc.
**Warning signs:** Slow queries that worked fine with small datasets.

## Code Examples

Verified patterns from official sources and existing codebase:

### Database Schema: Core Tables
```sql
-- Source: Supabase docs patterns + project requirements
-- Departments table
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Users table (linked to auth.users)
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  email text not null unique,
  role text not null default 'member' check (role in ('member', 'leader', 'hr')),
  department_id uuid not null references departments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Leave balances (one row per user per leave type)
create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  leave_type text not null check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH')),
  balance numeric(5,1) not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, leave_type)
);

-- Leaves table (individual leave entries, one per date)
create table leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  leave_type text not null check (leave_type in ('VL','PL','ML','SPL','SL','NW','RGA','AB','WFH')),
  leave_date date not null,
  duration text not null default 'whole' check (duration in ('whole', 'half_am', 'half_pm')),
  duration_value numeric(3,1) not null default 1.0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, leave_date)
);

-- Holidays
create table holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  observed_date date not null unique,
  original_date date,
  is_local boolean not null default false,
  created_at timestamptz not null default now()
);

-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project members
create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

-- Announcements
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  author_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Suggestions
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  content text not null,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);

-- Suggestion upvotes
create table suggestion_upvotes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(suggestion_id, user_id)
);
```

### RLS Policy Pattern
```sql
-- Source: Supabase docs (Context7 /llmstxt/supabase_llms_txt)
-- Enable RLS on all tables
alter table users enable row level security;
alter table departments enable row level security;
alter table leave_balances enable row level security;
alter table leaves enable row level security;

-- Users: all authenticated can read, only own profile update
create policy "Authenticated users can view all users"
  on users for select to authenticated
  using (true);

create policy "Users can update own profile"
  on users for update to authenticated
  using ((select auth.uid()) = auth_id);

-- Leave balances: users see own, HR sees all
create policy "Users can view own balances"
  on leave_balances for select to authenticated
  using (
    user_id in (select id from users where auth_id = (select auth.uid()))
  );

-- Leaves: users see own, leaders see department, HR sees all
create policy "Users can view own leaves"
  on leaves for select to authenticated
  using (
    user_id in (select id from users where auth_id = (select auth.uid()))
    or exists (
      select 1 from users u
      where u.auth_id = (select auth.uid())
      and u.role in ('leader', 'hr')
    )
  );
```

### Seed Script Pattern: Auth Users via Admin API
```typescript
// Source: Supabase docs - admin.createUser (Context7 /llmstxt/supabase_llms_txt)
// TypeScript seed script using admin client
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SEED_PASSWORD = "password123";

const users = [
  { email: "john.doe@rsd.com", name: "John Doe", role: "member", dept: "Engineering" },
  { email: "jane.smith@rsd.com", name: "Jane Smith", role: "leader", dept: "Engineering" },
  { email: "admin.hr@rsd.com", name: "Admin HR", role: "hr", dept: "HR" },
  // ... more users
];

for (const u of users) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  if (error) throw error;

  // Insert into public.users table with the auth_id
  const deptId = /* lookup department by name */;
  await supabase.from("users").insert({
    auth_id: data.user.id,
    name: u.name,
    username: u.email.split("@")[0],
    email: u.email,
    role: u.role,
    department_id: deptId,
  });
}
```

### Login Form with Show Password Toggle
```typescript
// Pattern for password visibility toggle + inline errors
const [showPassword, setShowPassword] = useState(false);
const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

<div className="relative">
  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input
    type={showPassword ? "text" : "password"}
    // ...
  />
  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    className="absolute right-3 top-1/2 -translate-y-1/2"
  >
    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
</div>
{fieldErrors.password && (
  <p className="text-sm text-destructive mt-1">{fieldErrors.password}</p>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` with `getAll`/`setAll` | 2024 | Old package deprecated. New package is framework-agnostic. Project already uses correct package |
| `cookies()` sync (Next.js 14) | `await cookies()` async (Next.js 15) | Next.js 15 (Oct 2024) | Breaking change. Project already uses `await cookies()` correctly |
| `getSession()` for auth checks | `getUser()` for auth checks | Supabase SSR best practice | `getSession()` reads unverified JWT. `getUser()` contacts auth server. Project uses `getUser()` correctly |
| Single `auth.uid()` in RLS | `(select auth.uid())` subselect | PostgreSQL optimization | Subselect prevents per-row function evaluation. Use this pattern |
| `next-themes` for theme | Zustand + manual DOM class | Project decision | Project chose Zustand for simplicity and control. Works correctly |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`. Do not use.
- `createMiddlewareClient` / `createServerComponentClient`: Old API from auth-helpers. The project correctly uses `createServerClient` from `@supabase/ssr`.

## Open Questions

1. **Login page layout discrepancy**
   - What we know: User decision specifies "split layout: left panel with branding/illustration, right panel with login form." Current implementation uses a centered card with animated floating orbs.
   - What's unclear: Whether the user wants to keep the current design or switch to the specified split layout.
   - Recommendation: Implement the split layout as specified in decisions. The existing orb animations could be repurposed for the branding panel.

2. **Supabase project setup**
   - What we know: Environment variables are defined (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). No `.env.local` file in git.
   - What's unclear: Whether the Supabase project has been created yet (cloud or local).
   - Recommendation: The planner should include a prerequisite step for Supabase project creation / local setup via `supabase init`. The seed script needs a running Supabase instance.

3. **Seed script execution approach**
   - What we know: Auth users need the admin API (TypeScript). Static data could be SQL.
   - What's unclear: Whether to use `supabase/seed.sql` (runs on `supabase db reset`), a standalone TypeScript script, or both.
   - Recommendation: Use a TypeScript seed script (e.g., `scripts/seed.ts`) that handles both auth user creation and public data insertion. This is more flexible than SQL-only since auth users require the admin API. Run via `npx tsx scripts/seed.ts`.

4. **User type update for leave_balances**
   - What we know: Current `User` type has `leave_balance: number`. Decision says separate `leave_balances` table.
   - What's unclear: Whether to update types now or defer to Phase 2.
   - Recommendation: Update types now since the schema is being created in this phase. Remove `leave_balance` from `User`, add `LeaveBalance` interface.

## Sources

### Primary (HIGH confidence)
- `/supabase/ssr` (Context7) - Cookie API patterns, `createServerClient`, `createBrowserClient`, `getAll`/`setAll` interface
- `/llmstxt/supabase_llms_txt` (Context7) - RLS policies, admin user creation, trigger functions, schema patterns
- `/supabase/cli` (Context7) - Migration commands, `supabase db reset`, seed file conventions
- `/vercel/next.js` (Context7) - Middleware auth patterns, `redirect()`, server actions, route protection
- `/pmndrs/zustand` (Context7) - `persist` middleware, `skipHydration` for SSR
- `/websites/ui_shadcn` (Context7) - Sidebar component primitives, collapsible patterns

### Secondary (MEDIUM confidence)
- Existing project codebase analysis - All files in `src/` reviewed to assess current state

### Tertiary (LOW confidence)
- None - all findings verified against Context7 or existing code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and verified via Context7
- Architecture: HIGH - Patterns already implemented in existing code, verified against official docs
- Pitfalls: HIGH - Verified through Context7 docs and code review of existing patterns
- Database schema: MEDIUM - Schema design based on requirements and Supabase patterns, but exact column types and RLS policy scope need validation during implementation
- Seed data approach: MEDIUM - Admin API for auth users is confirmed, but exact seed script execution workflow needs testing

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable libraries, 30-day window)
