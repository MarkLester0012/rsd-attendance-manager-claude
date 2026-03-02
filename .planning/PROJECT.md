# RSD Attendance Manager

## What This Is

A full-stack attendance and leave management system for Ring Systems Development (RSD). It allows employees to apply for leaves, track WFH days, and view office attendance, while leaders and HR manage approvals, team members, projects, holidays, and company announcements. Built with Next.js and Supabase, deployed on Vercel.

## Core Value

Employees can apply for leave and track attendance in one place, while leaders/HR can approve requests and monitor team availability — replacing manual tracking with a reliable, real-time system.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Email/password authentication with role-based access (member, leader, hr)
- [ ] Dashboard with stat cards, leave breakdown chart, recent activity, announcements, and quick actions
- [ ] My Calendar with full month grid, leave markers, holiday markers, and leave application modal
- [ ] Office Attendance daily view with per-user status cards and summary counters
- [ ] Leave system with 9 leave types, balance tracking, WFH caps, half-day support, and approval workflow
- [ ] Approvals page with realtime updates (leader/hr)
- [ ] Team Members page with search, filters, user modals, and HR member registration with rollback
- [ ] Projects page with leader/member assignments and validation (leader only)
- [ ] Suggestions page with anonymous posting, upvoting with optimistic updates
- [ ] Holidays management page (hr only)
- [ ] Company Announcements dedicated page (hr only)
- [ ] My Leaves page with list view, status/type/date filtering
- [ ] User Profile page with change password functionality
- [ ] Reports page with aggregate leave stats by department and trends (hr only)
- [ ] Department management — HR manages a fixed department list
- [ ] Collapsible sidebar with role-filtered navigation, theme toggle, and pending approval badge
- [ ] Dark mode (default) and light mode with CSS variable theming
- [ ] Seed data: sample users per role, holidays, leave entries, projects

### Out of Scope

- Email/push notifications — complexity exceeds v1 value; bell icon is visual placeholder
- In-app notification system — deferred to v2
- Mobile native app — web-first, responsive design sufficient for small team
- OAuth/SSO login — email/password sufficient for <50 users
- Payroll integration — separate concern, not in scope
- File attachments on leave requests — not needed for v1
- Multi-company/tenant support — single company system

## Context

- **Company:** Ring Systems Development, small team (<50 employees)
- **Roles:** Three roles — member (standard employee), leader (team/project lead), hr (human resources with admin privileges)
- **Leave system:** Credit-based balance that decreases with approved leaves. WFH is separate with monthly cap (8.0/user) and daily global cap (12 slots). HR has unlimited leave balance (displayed as infinity).
- **9 leave types:** VL, PL, ML, SPL require approval (pending → approved/rejected). SL, NW, RGA, AB, WFH are auto-approved on submission. Half-day (AM/PM) available for SL, VL, WFH only.
- **Balance rules:** Deducted on approval, refunded on rejection/cancellation. WFH exempt from balance deduction.
- **Blocking rules:** Weekends and company holidays are blocked. Negative balance blocked. WFH monthly/daily caps enforced.
- **Realtime:** Supabase Realtime on Approvals page only. Other pages refresh on navigation/focus.
- **Color coding:** Each leave type has a distinct, consistent color across all UI (calendar, badges, charts): WFH=blue, VL=green, SL=orange, PL=purple, ML=pink, NW=gray, AB=red, RGA=teal, SPL=yellow
- **Announcements:** HR manages announcements via dedicated `/announcements` page. Displayed on Dashboard for all users.

## Constraints

- **Tech stack:** Next.js (App Router) + Supabase (Auth, Database, Realtime) + Vercel deployment
- **Team size:** <50 users, no special scaling considerations
- **Theming:** All colors as CSS variables on `<html>`, components never hardcode colors
- **Auth:** Supabase Auth with cookie-based sessions, middleware-refreshed
- **Realtime:** Supabase Realtime subscriptions on Approvals page only
- **Registration rollback:** If Supabase profile creation fails after auth account creation, delete the auth account

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + Supabase | User preference; Supabase provides auth, DB, realtime in one platform | — Pending |
| Vercel deployment | Natural fit for Next.js, easy CI/CD | — Pending |
| Realtime on Approvals only | Other pages don't need live updates for <50 users; reduces complexity | — Pending |
| Dedicated announcements page | More manageable than inline dashboard forms; HR can edit/delete | — Pending |
| Fixed department list | Prevents typos, enables reliable filtering and reporting | — Pending |
| CSS variable theming | Components stay theme-agnostic, easy dark/light toggle | — Pending |
| Full seed data | Enables immediate testing and demo without manual setup | — Pending |

---
*Last updated: 2026-03-02 after initialization*
