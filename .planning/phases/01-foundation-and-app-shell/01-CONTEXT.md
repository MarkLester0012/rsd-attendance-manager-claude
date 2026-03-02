# Phase 1: Foundation and App Shell - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working authentication system with email/password login, a complete Supabase database schema with RLS policies, a navigation shell with role-filtered sidebar and dark/light theming, and seed data for all roles. This is the infrastructure every other phase depends on.

</domain>

<decisions>
## Implementation Decisions

### Login Page
- Split layout: left panel with branding/illustration, right panel with login form
- Text-based "RSD" logo treatment (no image assets required)
- Login errors displayed inline under the relevant field
- Include both "Show password" toggle and "Remember me" checkbox
- Dark mode is the default first impression

### Sidebar & Navigation
- Icon-only rail when collapsed (not fully hidden) — keeps navigation discoverable
- Mobile: slide-out drawer from the left (hamburger icon trigger)
- Nav items derived from requirements: Dashboard, Calendar, My Leaves, Attendance as common items; Approvals (leader/hr), Team Members (all, but HR registration for hr only), Projects (leader), Holidays (hr), Announcements (hr), Reports (hr), Suggestions (all)
- Bottom user area: avatar + name with dropdown menu containing Profile, Theme toggle, Logout
- Pending approval count badge on Approvals nav item for leader/hr roles

### Seed Data
- Realistic count: 15-20 users across departments (~12 members, 3-4 leaders, 2 HR)
- Generic tech company departments (Engineering, Design, Product, HR, QA)
- Comprehensive leave scenarios: all 9 leave types represented, mix of pending/approved/rejected, WFH near caps, half-day examples
- Named users with realistic names (john.doe@rsd.com pattern) and shared test password
- Include sample holidays, projects, and announcements

### Database Schema
- Departments as a separate table (id, name, created_at) — HR manages via UI
- Leave balances stored as explicit balance table (one row per user per leave type) — not computed from history — enables atomic decrement with row locking for race condition prevention
- Leader approval scope: same department — leaders approve requests from members in their department
- Leave types as hardcoded TypeScript constant — 9 fixed types don't need database flexibility; color, approval rules, half-day eligibility defined in code

### Claude's Discretion
- Exact color palette for dark/light themes (must use CSS variables on html element)
- Sidebar width values (expanded and collapsed)
- Specific shadcn/ui components to use for sidebar structure
- Database table naming conventions and column types
- RLS policy implementation details
- Postgres RPC function signatures for atomic operations
- Exact seed data values and leave balance numbers

</decisions>

<specifics>
## Specific Ideas

- Login page should feel polished — the split layout with branding panel gives a professional first impression
- Sidebar collapse should persist across page navigation (Zustand with localStorage)
- Theme preference should also persist (Zustand with localStorage)
- Seed data should be realistic enough for a stakeholder demo — not obviously fake

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, starting from scratch

### Established Patterns
- None yet — Phase 1 establishes all patterns (Supabase client factories, server components, server actions, RLS)

### Integration Points
- Supabase project must be created and configured before development begins
- Environment variables needed: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-and-app-shell*
*Context gathered: 2026-03-02*
