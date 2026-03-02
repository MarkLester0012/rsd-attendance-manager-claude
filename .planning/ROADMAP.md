# Roadmap: RSD Attendance Manager

## Overview

This roadmap takes the RSD Attendance Manager from zero to a fully functional leave and attendance management system in five phases. We start with the foundation (auth, database schema, navigation shell, theming, seed data), then build the core leave system (the primary business value), add approval workflows and attendance tracking, layer on administrative features (team management, projects, holidays, departments, profile), and finish with the dashboard, reports, and engagement features that aggregate and enhance everything built before.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and App Shell** - Auth, database schema, navigation, theming, and seed data
- [ ] **Phase 2: Leave System** - Leave application, calendar, balance tracking, and leave history
- [ ] **Phase 3: Approvals and Attendance** - Leave approval workflow with realtime and daily attendance view
- [ ] **Phase 4: Administration** - Team members, departments, projects, holidays, and user profile
- [ ] **Phase 5: Dashboard, Reports, and Engagement** - Dashboard aggregations, HR reports, announcements, and suggestions

## Phase Details

### Phase 1: Foundation and App Shell
**Goal**: Users can log in, see a role-appropriate navigation shell with dark/light theming, and the system has a complete database schema with seed data ready for feature development
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, NAVT-01, NAVT-02, NAVT-03, NAVT-04, NAVT-05, SEED-01, SEED-02
**Success Criteria** (what must be TRUE):
  1. User can log in with email/password and remains logged in after browser refresh
  2. Unauthenticated user visiting any protected page is redirected to the login page
  3. User can log out from any page via the sidebar
  4. Sidebar navigation shows only the menu items appropriate for the user's role (member, leader, hr)
  5. User can toggle between dark mode and light mode, with dark mode as the default
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Leave System
**Goal**: Users can apply for leave through the calendar, view their leave history with filtering, and the system enforces all business rules (balance, caps, blocking, half-days, overlaps)
**Depends on**: Phase 1
**Requirements**: LEAV-01, LEAV-02, LEAV-03, LEAV-04, LEAV-05, LEAV-06, LEAV-07, LEAV-08, LEAV-09, LEAV-10, LEAV-11, LEAV-12, LEAV-13, LEAV-14, CALR-01, CALR-02, CALR-03, CALR-04, MLVS-01, MLVS-02, MLVS-03, MLVS-04
**Success Criteria** (what must be TRUE):
  1. User can open the calendar, select dates, choose a leave type, and submit a leave application
  2. Calendar displays leave markers color-coded by type and holiday markers on the month grid
  3. System blocks leave on weekends, holidays, overlapping dates, insufficient balance, and exceeded WFH caps
  4. User can view their leave history on My Leaves page and filter by status, type, and date range
  5. User can cancel their own pending or approved leave and see balance refunded
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Approvals and Attendance
**Goal**: Leaders and HR can approve or reject leave requests with realtime updates, and all users can see who is in the office today
**Depends on**: Phase 2
**Requirements**: APRV-01, APRV-02, APRV-03, APRV-04, ATTN-01, ATTN-02
**Success Criteria** (what must be TRUE):
  1. Leader or HR user can view all pending leave requests on the Approvals page
  2. Leader or HR user can approve or reject a pending request and see the leave balance update accordingly
  3. Approvals page updates in realtime without manual refresh when another user submits or modifies a request
  4. User can view the Office Attendance page showing per-person status cards and summary counters for in-office, WFH, and on-leave
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Administration
**Goal**: HR can manage team members, departments, and holidays; leaders can manage projects; and users can view and update their profile
**Depends on**: Phase 1
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, DEPT-01, DEPT-02, PROJ-01, PROJ-02, PROJ-03, HOLI-01, HOLI-02, PROF-01, PROF-02
**Success Criteria** (what must be TRUE):
  1. User can browse team members with search and filter, and view member details in a modal
  2. HR can register a new member with email, role, and department, and the system rolls back the auth account if profile creation fails
  3. Leader can create projects and assign or remove members with validation
  4. HR can create, edit, and delete company holidays, and those holidays appear on the calendar and block leave applications
  5. User can view their profile and change their password
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: Dashboard, Reports, and Engagement
**Goal**: Users have a rich dashboard as their landing page, HR can view leave reports, HR can manage announcements, and all users can participate in anonymous suggestions
**Depends on**: Phase 3, Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, ANNC-01, ANNC-02, REPT-01, REPT-02, SUGG-01, SUGG-02
**Success Criteria** (what must be TRUE):
  1. User sees a dashboard with stat cards showing leave balance and key metrics, a leave breakdown chart, recent activity feed, and quick action buttons
  2. HR can create, edit, and delete announcements on the dedicated announcements page, and those announcements display on the dashboard for all users
  3. HR can view aggregate leave statistics by department and leave trend data over time on the Reports page
  4. User can post anonymous suggestions and upvote existing suggestions with immediate UI feedback
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5
(Phase 4 depends on Phase 1 only, so it could run in parallel with Phases 2-3 if needed, but sequential execution is the default.)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and App Shell | 0/2 | Not started | - |
| 2. Leave System | 0/3 | Not started | - |
| 3. Approvals and Attendance | 0/2 | Not started | - |
| 4. Administration | 0/3 | Not started | - |
| 5. Dashboard, Reports, and Engagement | 0/3 | Not started | - |
