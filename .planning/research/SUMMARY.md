# Project Research Summary

**Project:** RSD Attendance Manager
**Domain:** Attendance & Leave Management System (Internal Company Tool)
**Researched:** 2026-03-02
**Confidence:** MEDIUM

## Executive Summary

The RSD Attendance Manager is a focused, single-company leave and attendance management tool designed for a team of fewer than 50 people. Unlike full HRIS platforms (BambooHR, Zoho People, Keka), this is a deliberately scoped system that solves leave tracking, approval workflows, WFH coordination, and daily attendance visibility without the overhead of payroll, biometrics, or multi-tenancy. The recommended approach is a Next.js 15 App Router frontend with Supabase as the sole backend platform (auth + database + realtime), deployed on Vercel. This stack is well-matched to the domain: server components handle data-heavy read pages efficiently, server actions keep business logic server-side, and Supabase RLS provides security at the database level.

The recommended architecture follows a strict layering pattern: authentication and database schema must be established first as all other features depend on them. Leave balance logic — the financial core of the system — must be implemented with Postgres transactional functions rather than application-level read-modify-write patterns. The 9 leave types with their distinct approval, auto-approval, and cap rules make the leave domain the most complex part of the system, and getting the data model right before building any UI is the single most important early decision.

The primary risks are technical correctness risks, not capability risks. The stack is well-understood and the patterns are established. What fails in systems like this is race conditions on concurrent approvals, misconfigured RLS policies that silently hide data, and overlapping leave date validation gaps. All three must be addressed at the database layer before building any application logic on top. The system should ship incrementally: core leave management first, then approvals + attendance, then administrative features, then engagement features (suggestions, announcements, reports).

---

## Key Findings

### Recommended Stack

The stack centers on the user-specified combination of Next.js 15 (App Router), Supabase, and Vercel, which is the strongest possible alignment for this project. shadcn/ui with Tailwind CSS handles the UI layer and is the correct choice for the project's CSS variable theming requirement. React Hook Form + Zod handles form validation with reusable schemas across client and server. date-fns with react-day-picker covers all calendar and date logic. TanStack Table handles the sortable, filterable leave lists and team member tables.

See `.planning/research/STACK.md` for full version compatibility matrix and installation commands.

**Core technologies:**
- **Next.js 15 (App Router) + React 19:** Full-stack framework; server components reduce client bundle, server actions handle mutations securely
- **Supabase (supabase-js + @supabase/ssr):** Auth + Postgres + Realtime on one platform; @supabase/ssr is the required Next.js App Router integration package (not the deprecated auth-helpers)
- **TypeScript 5.6:** Non-negotiable given 9 leave types, 3 roles, and complex business rules; Supabase CLI generates DB types
- **shadcn/ui + Tailwind CSS 3.4:** Copy-paste component system with full Radix UI accessibility; correct for CSS variable theming requirement
- **React Hook Form 7.54 + Zod 3.23:** Industry-standard form + validation pairing; schemas shared between client validation and server action validation
- **date-fns 4.x + react-day-picker 9.x:** Paired together (react-day-picker v9 requires date-fns v4); handles all date math including weekend/holiday exclusions
- **Recharts 2.13:** React-native charting; shadcn/ui chart components wrap it directly
- **@tanstack/react-table 8.x:** Headless table logic; shadcn/ui DataTable wraps it
- **Zustand 5.0:** Lightweight client state for sidebar, theme preference, session cache
- **sonner 1.7:** shadcn/ui's recommended toast library

**What to avoid:** Moment.js (deprecated), MUI/Ant Design (bundle weight, fights Tailwind), next-auth (duplicate auth system), Prisma/Drizzle (unnecessary ORM over Supabase's PostgREST), next-themes (replaceable with Zustand + CSS class strategy).

---

### Expected Features

See `.planning/research/FEATURES.md` for the full prioritization matrix and competitor analysis.

**Must have — table stakes (P1, ship at launch):**
- Authentication with role-based access (member / leader / hr) — root dependency for everything
- Leave types and balance model (9 types: VL, SL, EL, ML, PL, SPL, NW, RGA, AB, WFH) — core data foundation
- Leave application via calendar with weekend/holiday blocking — primary user action
- Approval workflow with auto-approve for select types (SL, NW, RGA, AB, WFH) — core process flow
- My Leaves history with status/type/date filtering — employee self-service baseline
- Holiday management (HR-managed) — enables leave blocking validation
- Department management — user organization, required for reporting
- Team members management and HR registration flow — HR must onboard employees
- Dashboard with stat cards, leave breakdown chart, recent activity — daily landing page
- Collapsible sidebar with role-filtered navigation — core navigation shell
- Dark/light theme via CSS variables — must ship on day 1; retrofitting theming is painful
- Office attendance daily view (who is in today) — high daily usage, unique differentiator
- WFH monthly cap (8.0/user) and daily global cap (12 slots) enforcement — deliberate business rule
- Half-day leave support (AM/PM for SL, VL, WFH) — expected in target market
- Seed data for demo-ready experience — enables immediate stakeholder testing

**Should have — add after core validation (P2, v1.x):**
- Approvals page with Supabase Realtime updates — real-time is a differentiator; add after basic approval works
- Reports page with departmental aggregates — valuable after 1+ month of data exists
- Projects page with member assignments — workforce visibility; not core leave management
- Announcements management with dashboard integration — makes the app a daily communication hub
- Suggestions board with anonymous posting and upvoting — genuine differentiator for internal tools
- User profile with password change — important but lower urgency than leave flows

**Defer to v2+:**
- Email/push notifications — only after usage patterns show where gaps cause real problems
- In-app notification system — only if daily check-in pattern proves insufficient
- OAuth/SSO — only at 200+ users or IT policy mandate
- Leave accrual automation — only if manual balance management becomes burdensome
- CSV export for payroll/compliance — only on explicit HR request
- Audit log for leave modifications — only if disputes arise

**Critical anti-features (deliberately excluded):** Email notifications (ops overhead disproportionate to value at <50 users), OAuth/SSO (external dependency without proportional value), real-time on all pages (connection overhead, state complexity), payroll integration (separate product domain), file attachments (storage infrastructure complexity), multi-tenancy (architectural rewrite if added later), biometric/GPS tracking (privacy and trust concerns).

---

### Architecture Approach

The architecture is a standard Next.js App Router layered system: Server Components fetch data using the Supabase server client (cookie-based auth), pass data as props to Client Components that handle interaction, and Server Actions handle all mutations server-side with Zod validation. Authorization is enforced at three levels: UI guards (UX), Server Action role checks (defense), and RLS policies (real security). The only page using Supabase Realtime is the Approvals page — this is the correct scoping.

See `.planning/research/ARCHITECTURE.md` for full project file structure, data model diagrams, Supabase client factory patterns, and RLS policy matrix.

**Major components:**
1. **Middleware** — Auth session refresh on every request + unauthenticated redirect; uses `getUser()` (not `getSession()`) for security
2. **Four Supabase client factories** — `server.ts` (Server Components + Actions), `client.ts` (Client Components), `middleware.ts` (middleware), `admin.ts` (HR registration rollback) — non-negotiable for App Router cookie-based auth
3. **Route Groups** — `(auth)/` for public login layout, `(authenticated)/` for protected sidebar layout
4. **Server Actions** (`app/actions/`) — all mutations; validates with Zod, calls Supabase server client or RPC
5. **Postgres Functions (RPC)** — atomic multi-step operations: `approve_leave` (lock + balance check + deduct + status update), WFH cap enforcement; these must be database-level transactions
6. **RLS Policies** — every table has policies for every role; the `get_user_role()` helper function is used across all policies

**Key patterns:** Server Components for reads, Client Components for interaction, no `useEffect` data fetching, no shared Supabase client across contexts, no business logic in application code when a Postgres function provides atomicity.

---

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full SQL examples, warning signs, and recovery strategies.

1. **Leave balance race conditions on concurrent approvals** — Two leaders approving simultaneously without row-level locking causes lost updates and balance drift. Prevention: `approve_leave` Postgres function with `SELECT ... FOR UPDATE` locking. Must be built in Phase 1 database schema, not retrofitted. Confidence: HIGH (fundamental database concurrency).

2. **Supabase RLS policies silently returning empty results** — Misconfigured policies hide data instead of throwing errors; leaders see "no pending requests" when requests exist. Prevention: write and test RLS policies with a role matrix (member/leader/hr x SELECT/INSERT/UPDATE/DELETE) for every table before building any UI. Confidence: HIGH (well-documented Supabase behavior).

3. **Auth session desync between Server Components and Client Components** — Stale or expired tokens cause phantom logouts, hydration mismatches, and 401s on server actions. Prevention: use `@supabase/ssr` with the correct three-client factory pattern; middleware must call `getUser()` (not `getSession()`) and refresh cookies on both request and response. Must be verified before building any protected features. Confidence: MEDIUM (Next.js App Router patterns evolve).

4. **WFH daily cap race condition** — Check-then-insert without locking allows the global cap of 12 to be exceeded by concurrent submissions. Prevention: atomic Postgres function with `UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0 RETURNING *` pattern. Especially critical because WFH is auto-approved (no human gatekeeper). Confidence: HIGH (classic database concurrency).

5. **Overlapping leave date validation gaps** — Auto-approved types (SL, WFH) bypass approval-stage checks, creating double-booking possibilities. Prevention: database trigger or Postgres function checks for existing approved/pending leaves on the same dates before every insert, with correct half-day logic. Confidence: HIGH (domain logic).

**Additional high-priority pitfalls:**
- Registration rollback failure leaves orphaned auth accounts (use `handle_new_user` DB trigger or retry-with-logging)
- Duration calculated client-side can diverge from server (always calculate server-side in Postgres)
- Leave dates stored as TIMESTAMP instead of DATE causes timezone boundary bugs (use DATE type)
- HR leave balance as a magic number (999999) surfaces literally in UI (handle display separately)

---

## Implications for Roadmap

Based on the dependency tree in FEATURES.md and the build order in ARCHITECTURE.md, the following phase structure is recommended. Six phases align with the architecture research's build order.

---

### Phase 1: Foundation (Auth, Schema, Infrastructure)

**Rationale:** Authentication is the root dependency for every feature. The database schema must be finalized before any application code is written — changing the schema after building leave logic means rewriting server actions and queries. RLS policies must be written and tested at schema creation time, not added later. The three critical pitfalls (session desync, RLS silent failures, balance race conditions) are all addressed here.

**Delivers:** Working login/logout, protected routes via middleware, all database tables with RLS policies, four Supabase client factories, Postgres functions for atomic balance operations, TypeScript types generated from schema, seed data.

**Features addressed:** Authentication & RBAC, holiday management (data layer), department management (data layer), leave types and balance model (data layer).

**Pitfalls to address here:**
- Auth session desync: implement three-client factory pattern with `getUser()` in middleware
- RLS silent empty results: write and test full role matrix for every table
- Balance race conditions: implement `approve_leave` Postgres RPC function with row locking
- WFH cap race condition: implement atomic WFH cap enforcement in database
- Registration rollback: implement `handle_new_user` trigger

**Research flag:** This phase has well-documented patterns. Standard patterns apply — skip `research-phase`.

---

### Phase 2: Core Layout and Navigation Shell

**Rationale:** Before building any feature pages, the application shell (sidebar, route groups, theme, layout) must exist. Building features into a real layout catches responsive/theming issues early. This phase is low-risk but must precede all feature work.

**Delivers:** Collapsible sidebar with role-filtered navigation, authenticated layout route group, dark/light theme via CSS variables and Zustand persist, root layout with font and globals.css theming, login page UI.

**Features addressed:** Dark/light theme, sidebar navigation, collapsible sidebar state.

**Stack used:** shadcn/ui (Sidebar, Sheet, Avatar, DropdownMenu), Tailwind CSS variables, Zustand for sidebar state and theme preference.

**Pitfalls to address here:** Dark mode calendar color variants (define both light and dark CSS variable sets for all 9 leave type colors upfront).

**Research flag:** Standard patterns. Skip `research-phase`.

---

### Phase 3: Leave System Core (The Business Logic Phase)

**Rationale:** Leave application, calendar, and My Leaves are the core value of the system. These features have the most complex business logic (9 types, balance tracking, half-days, WFH caps, weekend/holiday exclusions, overlapping date validation). Building them thoroughly before moving to approval or admin features ensures the data foundation is solid. Duration calculation, balance deduction, and overlap checking must all be server-side and tested here.

**Delivers:** Leave application form with type selection, half-day toggle, and date picker; leave submission server action with full validation (balance, dates, WFH cap, overlaps); My Calendar page with leave markers and holiday markers; My Leaves history page with filters; leave balance display on Dashboard and My Leaves; leave cancellation with balance refund.

**Features addressed:** Leave application via calendar, My Leaves history, half-day support, WFH cap enforcement (monthly per-user), holiday blocking in leave picker, leave balance tracking, auto-approved leave types.

**Stack used:** react-day-picker + date-fns (calendar rendering, date math, holiday exclusion), React Hook Form + Zod (form + validation), Server Actions, Supabase RPC calls.

**Pitfalls to address here:**
- Overlapping leave date validation: database-level constraint implemented in Phase 1 schema; verify it fires correctly
- Duration calculation: server-side only, excludes weekends and holidays, handles half-days (0.5 deduction)
- Half-day balance: verify 0.5 deduction for SL/VL, 0 deduction for WFH (WFH deducts from WFH cap, not leave balance)
- Multi-day range weekend exclusion: verify 5-day leave spanning weekend deducts 3 days, not 5
- Date type: store as DATE, not TIMESTAMP; all comparisons use date-only logic

**Research flag:** Leave date math and half-day logic may warrant a `research-phase` call during planning to confirm the exact deduction rules and edge cases before coding begins. The business rules are complex enough that ambiguities could create rework.

---

### Phase 4: Approval Workflow and Attendance

**Rationale:** The approval workflow depends on the leave system being correct and tested. It introduces the only Supabase Realtime feature in the app. Office Attendance is grouped here because it also depends on the leave data model (attendance status derives from approved leaves). This phase completes the core daily workflow: apply leave → get approved → visible on attendance.

**Delivers:** Approvals page with pending leave queue, approve/reject server actions calling the `approve_leave` Postgres RPC, Supabase Realtime subscription for live updates, balance deduction and refund on approval and rejection, Office Attendance daily view showing per-user status with summary counters.

**Features addressed:** Approval workflow (approve/reject), realtime approvals, office attendance daily view, balance deduction on approval, balance refund on rejection.

**Stack used:** Supabase Realtime (`postgres_changes` channel), `useOptimistic` (React 19) for instant UI updates, server actions, TanStack Table for approval queue.

**Pitfalls to address here:**
- Realtime subscription cleanup: verify `supabase.removeChannel()` in `useEffect` cleanup
- Realtime + RLS: verify the approving user's role has SELECT permission on `leave_requests` rows they expect to receive events for
- Approval context missing from UI: show team availability summary alongside each pending request
- Approval page route guard: verify direct navigation to `/approvals` as a member redirects, not just shows empty state

**Research flag:** Supabase Realtime with `postgres_changes` and RLS filtering is a known complexity. Consider a `research-phase` call during planning to verify the current filter syntax and RLS interaction before implementation.

---

### Phase 5: Administrative Features

**Rationale:** Team management, projects, holidays, announcements, and reports are independent of each other and can be built in parallel or sequence. They are grouped here because they all depend on the auth system and leave data established in Phases 1-3, but none depend on each other. Reports are the most complex and should come last in this phase because they aggregate data that only becomes meaningful after phases 3-4 have populated real records.

**Delivers:** Team Members page (HR registers, all view with search/filter); HR registration flow with admin client and rollback handling; Projects page with leader-managed assignments; Holidays management CRUD (HR); Announcements management CRUD (HR) with dashboard display; Reports page with department-level leave aggregates and charts.

**Features addressed:** Team members management, HR registration, projects and assignments, holiday management, announcements, reports and analytics.

**Stack used:** TanStack Table (team members, reports), Recharts (reports charts), React Hook Form + Zod (registration form), Supabase admin client (HR user creation).

**Pitfalls to address here:**
- Registration rollback: test failure path explicitly (force profile INSERT to fail, verify auth cleanup)
- Leader scope on projects: leader can only manage their own projects; RLS enforces this
- Reports N+1: use Postgres aggregate queries (`GROUP BY department`), not client-side aggregation
- Adding indexes for report queries: `(user_id, start_date, end_date)` and `(status, start_date)` on `leave_requests`

**Research flag:** Standard CRUD patterns. Skip `research-phase`.

---

### Phase 6: Dashboard, Suggestions, and Polish

**Rationale:** The Dashboard is intentionally built last because it aggregates data from every other feature (leave stats, balance, attendance, announcements, recent activity). Building it last means all data sources are available and the dashboard reflects the real system state without placeholder components. Suggestions is the most independent feature and fits naturally at the end. Polish (responsive testing, edge cases, empty states) requires all features to be complete.

**Delivers:** Dashboard with stat cards (leave balance per type, pending count, who is in today), leave breakdown pie/bar chart, recent activity feed, announcements display; Suggestions page with anonymous posting and upvote; final responsive layout verification across breakpoints; empty state handling; edge case testing (HR unlimited balance display, weekend-only leave rejection, etc.).

**Features addressed:** Dashboard with statistics and charts, announcements dashboard integration, suggestions board with upvoting, dark mode color verification for all leave types, responsive design, seed data consistency verification.

**Stack used:** Recharts (dashboard charts), `useOptimistic` (suggestions upvote), all shadcn/ui components in final composition.

**Pitfalls to address here:**
- HR balance display: show "Unlimited" not "999999" or arbitrary magic number
- Dark mode leave type colors: test all 9 leave type CSS variable colors on dark theme
- Seed data consistency: verify seed leave balances = initial credits minus sum of approved leave durations
- Dashboard as last build: verify stat queries don't produce N+1 patterns; use parallel Supabase queries

**Research flag:** Standard patterns. Skip `research-phase`.

---

### Phase Ordering Rationale

- **Auth and schema first** because every feature depends on users, roles, and data tables. Changing the schema mid-project is the highest-cost refactor.
- **Leave system before approvals** because approvals require tested leave requests to exist, and the balance mutation logic must be verified before the approval action calls it.
- **Admin features after core leave flow** because team management, projects, and reports enhance the system but are not on the critical path to the core leave lifecycle.
- **Dashboard last** because it synthesizes all other features. Building it first means constant updates as new data sources come online; building it last means it works on day one.
- **Suggestions independent** — it only needs auth and can technically be built in any phase, but fits naturally in the polish phase.

---

### Research Flags

Phases likely needing `/gsd:research-phase` during planning:
- **Phase 3 (Leave System Core):** Half-day deduction rules, WFH cap interaction with monthly/daily limits, and overlapping leave edge cases with multiple leave types in the same date range. Business rules are complex enough that a planning-time research call prevents implementation ambiguity.
- **Phase 4 (Approvals + Realtime):** Supabase Realtime `postgres_changes` channel filter syntax combined with RLS is documented but frequently has version-specific nuances. Verify current pattern before coding.

Phases with well-documented, standard patterns (skip `research-phase`):
- **Phase 1 (Foundation):** Next.js App Router + Supabase auth pattern is extensively documented. The three-client factory and middleware pattern is the official recommended approach.
- **Phase 2 (Layout Shell):** Standard Next.js route groups, shadcn/ui sidebar, and Zustand theme persistence are straightforward.
- **Phase 5 (Admin Features):** CRUD with server actions, TanStack Table, and Recharts are standard patterns.
- **Phase 6 (Dashboard + Polish):** Parallel Supabase queries in Server Components and Recharts chart composition are well-documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | User-specified core stack (Next.js, Supabase, Vercel). Supporting libraries (shadcn/ui, RHF, date-fns, etc.) are industry-standard choices with well-established ecosystem positions. Version numbers need verification before install (`npm view <pkg> version`). |
| Features | MEDIUM | Feature set derived from domain knowledge of comparable products (BambooHR, Zoho People, Keka). Core leave management patterns are stable; competitor feature sets may have evolved. Feature scope is well-defined in PROJECT.md and the analysis aligns with it. |
| Architecture | MEDIUM | Next.js App Router + Supabase patterns are well-documented but the SSR integration (`@supabase/ssr`) evolves with framework updates. Core architectural patterns (server components for reads, server actions for mutations, four client factories) are the official recommended approach. Specific API signatures should be verified against current docs during Phase 1. |
| Pitfalls | HIGH | Database concurrency (race conditions, row locking, atomic transactions) and RLS behavior are fundamental concepts that do not change. Leave domain business rules (overlap checking, half-day logic, balance deduction) are stable domain knowledge. Auth session management patterns are MEDIUM — they follow official guidance but may have version-specific nuances. |

**Overall confidence:** MEDIUM-HIGH

The stack and pitfall prevention strategies are high-confidence. Architecture patterns are solid but should be verified against current Supabase docs during Phase 1 implementation. Feature scope is well-aligned with the PROJECT.md requirements and validated against known competitors.

---

### Gaps to Address

- **Tailwind CSS v3 vs v4:** shadcn/ui's v4 support status was uncertain at research time. Run `npx shadcn@latest init` and follow its guidance — it will pick the correct Tailwind version. Do not pin to v3 if shadcn/ui suggests v4.
- **Exact WFH deduction rules:** Does WFH deduct from the WFH-specific monthly balance (8.0/month) AND the daily cap (12/day) but NOT from the general leave balance? Or does it deduct from the general balance? This must be confirmed with the product owner before Phase 3 implementation.
- **Leave overlap rules for same-day half-days:** Can an employee have AM VL + PM SL on the same day? The pitfalls research says this is valid, but the explicit rule should be confirmed before implementing the database-level overlap check.
- **Leader team scope:** Does a leader approve only their direct reports, or all members in their department? This affects both the `approve_leave` Postgres function's authorization check and the RLS policy for `leave_requests`. Confirm before Phase 4.
- **`@supabase/ssr` cookie API:** The exact `getAll`/`setAll` cookie handler signature may have evolved since training data. Verify against the current `@supabase/ssr` changelog during Phase 1 before writing the client factories.

---

## Sources

### Primary (HIGH confidence)
- Next.js 15 App Router documentation (training data, May 2025) — Server Components, Server Actions, middleware, route groups
- Supabase documentation for `@supabase/ssr` (training data, May 2025) — cookie-based auth, client factory patterns
- PostgreSQL documentation (training data) — row-level locking, `SELECT FOR UPDATE`, transaction isolation, RLS behavior

### Secondary (MEDIUM confidence)
- shadcn/ui documentation (training data, May 2025) — component library, DataTable, Calendar, Chart wrappers
- React Hook Form + Zod integration patterns (training data, May 2025) — `@hookform/resolvers`, schema reuse
- date-fns v4 + react-day-picker v9 (training data, May 2025) — version pairing requirements
- Recharts documentation (training data, May 2025) — PieChart, BarChart, composable API
- Competitor product knowledge: BambooHR, Zoho People, Keka HR, greytHR, Calamari, LeaveBoard (training data) — feature landscape analysis

### Tertiary (LOW confidence)
- Tailwind CSS v4 support in shadcn/ui — uncertain at research time; verify at install
- Specific npm package versions — all version numbers require verification with `npm view <package> version` before installation

---

*Research completed: 2026-03-02*
*Ready for roadmap: yes*
