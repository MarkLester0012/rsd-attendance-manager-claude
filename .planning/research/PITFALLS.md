# Pitfalls Research

**Domain:** Attendance & Leave Management System (Next.js App Router + Supabase + Vercel)
**Researched:** 2026-03-02
**Confidence:** MEDIUM (training data only -- WebSearch and WebFetch unavailable; no live verification performed. Findings are based on well-established patterns for Next.js App Router, Supabase, and leave/attendance domain logic.)

## Critical Pitfalls

### Pitfall 1: Leave Balance Race Conditions on Concurrent Approvals

**What goes wrong:**
Two leaders simultaneously approve leave requests for the same employee. Both read the current balance (e.g., 10.0), both deduct (e.g., 1.0 each), both write back 9.0. The employee loses only 1.0 credit instead of 2.0. Over time, balances drift from reality, and employees can overdraw their leave.

**Why it happens:**
The approval flow is: read balance -> check sufficient -> deduct -> save. Without transactional isolation, concurrent writes cause lost updates. This is the classic read-modify-write race condition. Supabase's default client-side operations do not provide row-level locking.

**How to avoid:**
Use a Postgres function (RPC) for balance deduction that runs atomically inside a transaction. The function should: (1) SELECT the current balance with `FOR UPDATE` row lock, (2) check sufficiency, (3) UPDATE the balance, (4) UPDATE the leave request status, all in one transaction. Call via `supabase.rpc('approve_leave', { ... })`. Never do read-then-write from the client for financial/balance operations.

```sql
CREATE OR REPLACE FUNCTION approve_leave(p_leave_id uuid, p_approver_id uuid)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_deduction numeric;
  v_balance numeric;
BEGIN
  -- Lock the leave request row
  SELECT user_id, duration INTO v_user_id, v_deduction
  FROM leave_requests WHERE id = p_leave_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Leave request not found or already processed');
  END IF;

  -- Lock and check balance
  SELECT balance INTO v_balance
  FROM leave_balances WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_balance < v_deduction THEN
    RETURN json_build_object('error', 'Insufficient balance');
  END IF;

  -- Atomic deduction
  UPDATE leave_balances SET balance = balance - v_deduction WHERE user_id = v_user_id;
  UPDATE leave_requests SET status = 'approved', approved_by = p_approver_id WHERE id = p_leave_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
```

**Warning signs:**
- Balance values that don't match the sum of approved leaves when audited
- Negative balances appearing despite client-side checks
- "It works in testing" but breaks when two leaders use the app simultaneously

**Phase to address:**
Database schema & core API phase. This must be baked into the data layer from day one -- retrofitting transactional balance logic after building client-side approval flows means rewriting every approval endpoint.

---

### Pitfall 2: Supabase RLS Policies That Silently Return Empty Results Instead of Errors

**What goes wrong:**
Row Level Security policies are misconfigured. Instead of throwing a permission error, queries silently return zero rows. A leader queries their team's leave requests but gets an empty list -- not because there are none, but because the RLS policy doesn't match their role correctly. The UI shows "No pending requests" and the leader assumes there's nothing to approve. Requests rot in pending state.

**Why it happens:**
Postgres RLS filters rows silently by design -- it never raises "permission denied" on SELECT; it just hides rows. Developers write RLS policies, see no errors, and assume they work. Testing with a single role (e.g., the user who created the data) passes because the owner can always see their own rows. The bug only surfaces when testing cross-role access (leader seeing member's leaves).

**How to avoid:**
1. Write RLS policies with explicit test cases for every role combination BEFORE building UI. Create seed users for each role (member, leader, hr) and verify each can see exactly what they should.
2. Use a `roles` column on the `profiles` table and reference it explicitly in policies via `auth.uid()` joins.
3. Create a RLS testing checklist: for each table, verify SELECT/INSERT/UPDATE/DELETE for each role.
4. Use Supabase's SQL editor to test policies by running queries `SET ROLE authenticated; SET request.jwt.claims ...` to simulate different users.
5. For the approval workflow specifically: ensure leader can SELECT leaves from members in their team/department, not just their own leaves.

**Warning signs:**
- "Empty state" UI appearing when you know data exists
- Features working for HR (who may have broad access) but not leaders
- RLS policies that use only `auth.uid() = user_id` without role-based branches

**Phase to address:**
Database schema phase. RLS policies must be written and tested as part of table creation, not added later. Every migration that creates a table should include its RLS policies in the same migration file.

---

### Pitfall 3: Supabase Auth Session Desync Between Server and Client in Next.js App Router

**What goes wrong:**
The Supabase auth session expires or becomes stale. Server Components read one session state (or none), Client Components read another. Middleware refreshes the token but the Server Component has already rendered with the old/missing session. Users see logged-in UI with unauthorized API calls, or get randomly logged out, or see flash-of-unauthenticated-content.

**Why it happens:**
Next.js App Router has three execution contexts: (1) Server Components, (2) Client Components, (3) Middleware. Each needs its own Supabase client instance configured differently. The official `@supabase/ssr` package provides `createServerClient` and `createBrowserClient`, but the cookie handling between middleware and Server Components is subtle. If middleware doesn't properly refresh the session cookie before the Server Component reads it, you get stale auth state.

**How to avoid:**
1. Use `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`). Create three separate utility files:
   - `lib/supabase/server.ts` -- for Server Components and Server Actions (uses `cookies()` from `next/headers`)
   - `lib/supabase/client.ts` -- for Client Components (uses `createBrowserClient`)
   - `lib/supabase/middleware.ts` -- for middleware (refreshes session, sets cookies on response)
2. Middleware MUST call `supabase.auth.getUser()` (not `getSession()`) on every request. `getSession()` reads from the JWT without verifying it; `getUser()` validates against Supabase Auth server. This is a critical security distinction.
3. Middleware must pass refreshed cookies to the response via `request.cookies.set()` and `response.cookies.set()` pattern.
4. Never cache Server Component pages that depend on auth state (use `export const dynamic = 'force-dynamic'` or rely on cookies to opt out of caching).

**Warning signs:**
- Users reporting random logouts
- "Hydration mismatch" errors related to auth-dependent UI
- Server Actions returning 401 when the user appears logged in
- Auth state working in development but failing in production (Vercel edge caching)

**Phase to address:**
Auth & infrastructure phase (first phase). This is foundational -- every feature depends on correct auth. Getting this wrong means debugging phantom auth issues throughout the entire project.

---

### Pitfall 4: WFH Daily Global Cap Creates Unfair First-Come-First-Served Race

**What goes wrong:**
The system has a daily global WFH cap of 12 slots. When multiple employees try to book WFH for the same day, it becomes a race condition. The check "are there fewer than 12 WFH entries for this date?" and the insert "add my WFH entry" are separate operations. Two employees check simultaneously, both see 11/12, both insert, result is 13/12. Alternatively, the cap creates frustration because early risers always get WFH slots and others never can.

**Why it happens:**
WFH cap enforcement is a shared resource contention problem. Client-side or even server-side check-then-insert without locking is inherently racy. Additionally, the UX of "first come first served" for a limited daily resource is a domain design problem, not just a technical one.

**How to avoid:**
1. **Technical fix:** Use a Postgres function with advisory lock or row-level lock to atomically check count and insert. Alternatively, use a `wfh_daily_slots` table with a row per date and a `remaining_slots` counter, updated atomically with `UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0 RETURNING *`.
2. **Domain fix:** Consider whether the daily cap should be a hard block or a soft warning. For <50 employees, a cap of 12 means roughly 25% can WFH on any day. Decide if this is enforced at submission time or only surfaces as a warning to HR.
3. Since WFH is auto-approved on submission (per project spec), the race condition is especially dangerous -- there's no human gatekeeper to catch the overcounting.

**Warning signs:**
- WFH counts for a date exceeding 12 in the database
- Employee complaints about "I tried to submit WFH but it said the cap was reached, then my colleague submitted after me and got in"
- The monthly per-user cap (8.0) and daily global cap (12) interacting in unexpected ways

**Phase to address:**
Leave system core logic phase. The WFH cap enforcement must be implemented as a database-level constraint or atomic function, not as application-level validation.

---

### Pitfall 5: Overlapping Leave Date Validation Gaps

**What goes wrong:**
An employee submits VL for March 10-12, gets approved. Then submits SL for March 11 (auto-approved). Now they have two approved leaves overlapping on March 11. The calendar shows conflicting entries, balance is double-deducted, and reports are inaccurate. Alternatively: employee submits WFH for a day they already have approved VL -- the system doesn't catch it.

**Why it happens:**
Leave submission validation checks balance, checks weekends/holidays, but forgets to check for existing approved/pending leaves on the same dates. This is especially tricky with half-day leaves: an employee could have AM half-day VL and PM half-day SL on the same day, which IS valid. But full-day VL + any leave on the same day is NOT valid. The combinatorial logic of date ranges, half-days, and multiple leave types makes this easy to miss.

**How to avoid:**
1. Create a database constraint or check function that runs on every leave INSERT/UPDATE:
   - For each date in the requested range, check if there's an existing approved/pending leave
   - If the new leave is half-day (AM or PM), only block if there's an existing full-day leave OR a half-day leave for the same period (AM/PM)
   - If the new leave is full-day, block if there's ANY existing leave on that date
2. Implement this as a Postgres trigger or a CHECK constraint using a function, so it cannot be bypassed regardless of which code path creates the leave.
3. Include pending leaves in the overlap check -- not just approved ones -- otherwise two pending requests can both get approved for the same dates.

**Warning signs:**
- Calendar showing two colored markers on the same date for the same user
- Balance deducted twice for overlapping days
- HR reports showing more leave days taken than calendar days in a period

**Phase to address:**
Leave system core logic phase. This validation must be a database-level constraint, not just UI validation, because auto-approved leave types (SL, WFH) bypass any approval-stage checks entirely.

---

### Pitfall 6: Registration Rollback Failure Leaves Orphaned Auth Accounts

**What goes wrong:**
HR registers a new member. Supabase Auth account is created successfully (Step 1), but the profile row INSERT fails (Step 2) -- maybe due to a unique constraint on employee ID, a network timeout, or an RLS policy blocking the insert. The project spec says "delete the auth account" on failure. But the Supabase Admin API call to delete the auth user also fails (network error, rate limit), leaving an orphaned auth account with no profile. The employee can log in but has no profile, crashing every page.

**Why it happens:**
Supabase Auth and the database are separate subsystems. There's no distributed transaction spanning both. The "create auth user then create profile" pattern is inherently a two-phase operation without atomicity guarantees. The rollback (delete auth user on profile failure) is itself fallible.

**How to avoid:**
1. Use Supabase's database trigger approach: create a `handle_new_user` trigger on `auth.users` that automatically creates a profile row when a new auth user is inserted. This way, both happen in the same database transaction.
2. If the trigger approach doesn't fit (because HR needs to set role, department, etc. at registration time), use a Supabase Edge Function or a Next.js Server Action that:
   - Creates the auth user via Admin API
   - Creates the profile via Admin API (bypassing RLS)
   - On profile failure: deletes auth user with retry (up to 3 attempts)
   - On complete failure: logs the orphaned auth user ID for manual cleanup
3. Add a startup/background check that detects orphaned auth users (users in `auth.users` with no matching `profiles` row) and either cleans them up or alerts HR.
4. Test the failure path explicitly: temporarily make the profile INSERT fail and verify rollback works.

**Warning signs:**
- Users who can log in but see "profile not found" errors
- Auth user count in Supabase dashboard exceeding profile row count
- HR reporting "I registered someone but they can't access the system"

**Phase to address:**
Auth & user management phase. The registration flow must be hardened before HR starts onboarding real users.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side balance checks only (no DB constraint) | Faster to implement, simpler code | Balances can go negative via race conditions or direct API manipulation | Never -- always enforce at DB level |
| Hardcoding leave type configs in frontend code | Quick UI development, no extra DB table | Adding/modifying leave types requires code changes and redeployment | MVP only -- plan to move to a `leave_types` config table |
| Using `getSession()` instead of `getUser()` in middleware | Slightly faster (no network call to Supabase Auth) | JWT can be tampered with or expired; security vulnerability | Never in middleware -- always use `getUser()` for auth verification |
| Storing leave duration as a frontend-calculated field | Less backend logic | Half-day calculations, holiday exclusions can diverge between client and server | Never -- server must be source of truth for duration calculation |
| Single "admin" role instead of separate leader/hr roles | Simpler RLS policies | Cannot restrict leader to only their team; HR features leak to leaders | Never for this project -- three roles are a core requirement |
| Skipping database indexes on leave queries | No impact at <50 users | Query patterns (by user, by date range, by status, by department) will slow down on Reports page | Acceptable for first month, but add indexes in the same phase as Reports |
| Using Supabase Realtime on all pages | "Everything is live!" | Connection count explodes, battery drain on mobile, unnecessary load | Never -- spec correctly limits Realtime to Approvals page only |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Auth + Middleware | Not refreshing session in middleware, causing Server Components to read expired tokens | Middleware must call `getUser()`, set refreshed cookies on both request and response objects |
| Supabase Realtime | Subscribing to a channel but not cleaning up on component unmount, causing memory leaks and duplicate event handlers | Use `useEffect` cleanup to call `supabase.removeChannel(channel)` on unmount. Return cleanup function. |
| Supabase Realtime + RLS | Subscribing to a table but RLS policies don't allow the user to see the rows, resulting in no events received | Realtime respects RLS. The subscribing user must have SELECT permission on rows they expect to receive updates for. Test with each role. |
| Supabase Storage (if used later for attachments) | Uploading files without RLS on storage buckets, making all uploads publicly accessible | Always create storage buckets with RLS enabled and add policies matching your access model |
| Vercel + Supabase | Using Supabase URL and anon key as build-time env vars that get baked into client bundles | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally public. The `SERVICE_ROLE_KEY` must NEVER be prefixed with `NEXT_PUBLIC_` and must only be used in server-side code. |
| Vercel Edge Runtime | Using Node.js-specific APIs in middleware (which runs on Edge runtime) | Ensure Supabase client creation in middleware uses only Edge-compatible APIs. `@supabase/ssr` handles this, but custom code in middleware must avoid Node.js-only modules. |
| Supabase RPC + TypeScript | Calling `supabase.rpc()` without proper return type, getting `any` types throughout the codebase | Generate TypeScript types from your database schema using `supabase gen types typescript`. Keep types in sync with schema changes. |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all leave requests for calendar (no date range filter) | Calendar page loads slowly, transfers excessive data | Always filter by visible month range: `WHERE start_date <= :end_of_month AND end_date >= :start_of_month` | After 6+ months of data (~500+ leave records) |
| N+1 queries on Office Attendance page (one query per user to get their status) | Page load time scales linearly with employee count | Single query joining users with their leave status for the selected date | At 30+ employees, noticeable at 50 |
| Reports page computing aggregates client-side | Reports page freezes browser, excessive data transfer | Use Postgres aggregate queries (`GROUP BY department`, `COUNT`, `SUM`) or database views for report data | After 1 year of data |
| Unindexed date range queries on leave_requests | Full table scans on leave queries by date range | Add composite index on `(user_id, start_date, end_date)` and `(status, start_date)` | After 1000+ leave records (roughly 2 years for 50 users) |
| Supabase Realtime subscriptions not scoped | Receiving ALL changes to a table instead of filtered subset | Use channel filters: `.on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: 'status=eq.pending' })` | Not a scale issue but a bandwidth/noise issue from day one |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No RLS on leave_balances table | Any authenticated user can UPDATE their own balance to any value via Supabase client directly | RLS: members can only SELECT their own balance. Only server-side functions (with SECURITY DEFINER) can UPDATE balances. |
| Role stored only in JWT/client state, not verified server-side | User modifies localStorage or JWT claims to escalate from "member" to "hr" | Always read role from the `profiles` table via `auth.uid()` join in RLS policies. Never trust client-provided role. |
| Leader can approve leaves for users not in their team | A leader could approve any pending leave by calling the RPC directly | The `approve_leave` function must verify that the approver is the leader of the requesting user's team/department. Enforce in the DB function, not just UI. |
| HR registration endpoint accessible to non-HR users | Anyone with a valid session could create new user accounts | Protect the registration Server Action with role check: read the caller's role from the database, verify it's "hr". Use `service_role` key only in server-side code. |
| Sensitive leave types (ML, SPL) visible to unauthorized roles | Privacy violation -- maternity leave or special leave reasons exposed to peers | RLS policy: members can only see their OWN leave details. Leaders can see leave type/dates for their team but not detailed reasons (if a reason/notes field exists). HR can see everything. |
| Supabase service_role key in client bundle | Complete database bypass -- attacker has full admin access | Verify `SUPABASE_SERVICE_ROLE_KEY` is never prefixed with `NEXT_PUBLIC_`. Only import it in files under `app/api/`, Server Actions, or server-only utility files. Add a build-time check or linting rule. |
| No rate limiting on leave submission | Malicious or buggy client submits hundreds of leave requests | Add a Postgres constraint or trigger: max N pending requests per user. Optionally add rate limiting at the API route level. |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Calendar only shows the logged-in user's leaves | Employees can't see team availability, defeating the purpose of the system | Show team/department leaves on the calendar (with privacy-appropriate detail level). Members see "3 people on leave" or color dots; leaders see names. |
| Approval page has no context about team impact | Leader approves VL without knowing 3 others are already off that day | Show team availability summary alongside each pending request: "2/8 team members already on leave for these dates" |
| Leave balance shown only on the apply-leave modal | Users must start the application flow just to check their balance | Show balance prominently on Dashboard and My Leaves page. Balance should be visible without any clicks. |
| No confirmation or undo for auto-approved leaves | Employee accidentally submits SL or WFH; it's immediately approved and balance deducted | Show a confirmation dialog for all submissions. For auto-approved types, allow cancellation within a grace period (e.g., same day). |
| Half-day selection buried or unclear | Users submit full-day when they meant half-day, or vice versa | Make AM/PM toggle visually prominent. Show the balance impact ("This will deduct 0.5 from your VL balance") before submission. |
| Dark mode calendar colors are unreadable | Leave type colors that look great on light mode become invisible or clash on dark mode | Define separate color palettes for dark and light mode using CSS variables. Test every leave type color on both themes. The spec's color coding (WFH=blue, VL=green, etc.) needs dark-mode variants. |
| Holiday blocking is invisible until submission fails | User picks dates, fills out the form, submits, and THEN learns a date is a holiday | Visually mark holidays on the calendar date picker. Disable holiday dates in the picker. Show inline warnings as dates are selected. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Leave balance deduction:** Often missing refund-on-rejection and refund-on-cancellation. Verify that rejecting/cancelling an approved leave restores the balance atomically (same transaction).
- [ ] **Date range leave (multi-day):** Often counts weekends and holidays in the duration. Verify that a 5-day leave spanning a weekend correctly deducts 3 days (Mon-Wed + next Mon-Tue), excluding Saturday, Sunday, and any company holidays in the range.
- [ ] **Half-day balance:** Often deducts 1.0 instead of 0.5. Verify that half-day SL, VL, and WFH correctly deduct 0.5 from balance (or 0 for WFH since WFH is exempt from balance deduction).
- [ ] **WFH monthly cap:** Often checks current count but doesn't account for the month boundary correctly. Verify: count is per calendar month, resets on the 1st, and pending WFH requests count toward the cap.
- [ ] **Role-based navigation:** Often hides menu items but doesn't protect the actual routes. Verify that navigating directly to `/approvals` as a member returns a redirect or 403, not just a page with no data.
- [ ] **Realtime subscription cleanup:** Often subscribes on mount but doesn't unsubscribe on unmount. Verify no duplicate event handlers accumulate when navigating away and back to Approvals.
- [ ] **Seed data consistency:** Often creates users and leaves but the leave balances don't reflect the approved leaves. Verify that seed data balances = initial credit minus sum of approved leave durations.
- [ ] **Timezone handling:** Often stores dates as timestamps with timezone, causing date-boundary bugs. Verify: leave dates are stored as DATE type (not TIMESTAMP), and comparisons use date-only logic.
- [ ] **HR infinite balance display:** Often stores infinity as a magic number (999999) that shows up literally in the UI. Verify HR balance displays as "Unlimited" or an infinity symbol, and that balance checks for HR always pass.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Balance race condition (drifted balances) | MEDIUM | Write a SQL script that recalculates all balances from the leave_requests table: `initial_credit - SUM(approved_leave_durations)`. Run as a one-time migration. Then add the atomic DB function to prevent recurrence. |
| Orphaned auth users | LOW | Query `auth.users LEFT JOIN profiles` to find orphans. Delete via Supabase Admin API. Add the startup-check to prevent recurrence. |
| RLS policies too permissive | HIGH | Audit all existing data access. Check if any user viewed/modified data they shouldn't have. Rewrite policies, test with role matrix, redeploy. If sensitive data was exposed, this may require notifying affected users. |
| Overlapping leaves in database | MEDIUM | Query for overlapping approved leaves per user. Manually resolve conflicts with HR (which leave to keep). Add the database constraint to prevent recurrence. |
| Session desync issues | LOW | Update the Supabase client utilities to use the correct pattern. Mostly a code change, no data migration needed. But debugging the symptoms can take days if you don't know the cause. |
| WFH cap exceeded | LOW | Query dates where WFH count > 12. Notify HR to resolve manually. Add atomic cap enforcement. |
| Client-side duration calculation diverging from server | HIGH | Recalculate all leave durations server-side, adjust balances. High cost because every existing leave record may have incorrect duration stored. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Balance race conditions | Database schema & functions | Test: two concurrent approvals for same user, verify balance is correct |
| RLS silent empty results | Database schema (RLS policies) | Test matrix: for each table, test SELECT/INSERT/UPDATE/DELETE with each of 3 roles |
| Auth session desync | Auth & infrastructure (Phase 1) | Test: Server Component, Client Component, and Server Action all see consistent auth state |
| WFH cap race condition | Leave system core logic | Test: 12 concurrent WFH submissions for the same date, verify exactly 12 succeed |
| Overlapping leave dates | Leave system core logic | Test: submit leave for dates that overlap with existing approved leave, verify rejection |
| Registration rollback | User management | Test: make profile INSERT fail (e.g., violate unique constraint), verify auth user is cleaned up |
| Duration calculation divergence | Leave system core logic | Test: multi-day leave spanning weekends and holidays, verify duration matches hand-calculated value |
| Timezone date boundary bugs | Database schema | Test: submit leave for "today" at 11:59 PM, verify it records the correct date |
| Calendar N+1 queries | Calendar/Attendance UI | Monitor: check Supabase query logs for excessive queries on calendar page load |
| Role escalation via direct API calls | Auth & RLS | Test: use Supabase client directly (not the UI) to attempt operations as wrong role |
| Hardcoded leave type configuration | Leave system core logic | Design: create a `leave_types` table from the start, or at minimum a shared config object used by both server and client |

## Sources

- Training data knowledge of Next.js App Router patterns (MEDIUM confidence -- well-documented but may have evolved)
- Training data knowledge of Supabase Auth, RLS, and Realtime patterns (MEDIUM confidence -- stable APIs but SSR integration evolves)
- Training data knowledge of Postgres transaction isolation and locking (HIGH confidence -- these are fundamental database concepts that do not change)
- Training data knowledge of leave management domain logic (HIGH confidence -- business rules for leave/attendance are stable domain knowledge)
- No live sources were consulted (WebSearch and WebFetch were unavailable during this research)

---
*Pitfalls research for: RSD Attendance Manager*
*Researched: 2026-03-02*
