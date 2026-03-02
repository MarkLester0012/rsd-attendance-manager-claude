# Requirements: RSD Attendance Manager

**Defined:** 2026-03-02
**Core Value:** Employees can apply for leave and track attendance in one place, while leaders/HR can approve requests and monitor team availability

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can log in with email and password
- [ ] **AUTH-02**: User session persists across browser refresh via cookie-based auth
- [ ] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: Unauthenticated users are redirected to login page
- [ ] **AUTH-05**: Role-based access control enforced for member, leader, and hr roles
- [ ] **AUTH-06**: Navigation and page access filtered by user role

### Leave System

- [ ] **LEAV-01**: User can apply for leave by selecting type, date range, and optional notes
- [ ] **LEAV-02**: System supports 9 leave types: VL, PL, ML, SPL, SL, NW, RGA, AB, WFH
- [ ] **LEAV-03**: VL, PL, ML, SPL require leader/hr approval (pending → approved/rejected)
- [ ] **LEAV-04**: SL, NW, RGA, AB, WFH are auto-approved on submission
- [ ] **LEAV-05**: User can select half-day (AM/PM) for SL, VL, and WFH leave types
- [ ] **LEAV-06**: Leave balance decreases on approval and refunds on rejection or cancellation
- [ ] **LEAV-07**: System blocks leave application when balance is insufficient
- [ ] **LEAV-08**: WFH enforces monthly cap of 8.0 per user
- [ ] **LEAV-09**: WFH enforces daily global cap of 12 slots
- [ ] **LEAV-10**: System blocks leave application on weekends and company holidays
- [ ] **LEAV-11**: System prevents overlapping leave dates for the same user
- [ ] **LEAV-12**: User can cancel their own pending or approved leave request
- [ ] **LEAV-13**: Each leave type displays a distinct, consistent color across all UI
- [ ] **LEAV-14**: HR has unlimited leave balance displayed as infinity

### Calendar

- [ ] **CALR-01**: User can view My Calendar with full month grid
- [ ] **CALR-02**: Calendar displays leave markers color-coded by leave type
- [ ] **CALR-03**: Calendar displays company holiday markers
- [ ] **CALR-04**: User can open leave application modal from calendar

### My Leaves

- [ ] **MLVS-01**: User can view list of all their leave requests
- [ ] **MLVS-02**: User can filter leaves by status (pending, approved, rejected, cancelled)
- [ ] **MLVS-03**: User can filter leaves by leave type
- [ ] **MLVS-04**: User can filter leaves by date range

### Approvals

- [ ] **APRV-01**: Leader/HR can view list of pending leave requests
- [ ] **APRV-02**: Leader/HR can approve a pending leave request
- [ ] **APRV-03**: Leader/HR can reject a pending leave request
- [ ] **APRV-04**: Approvals page updates in realtime via Supabase Realtime

### Office Attendance

- [ ] **ATTN-01**: User can view daily office attendance showing per-user status cards
- [ ] **ATTN-02**: Attendance page shows summary counters (in office, WFH, on leave)

### Dashboard

- [ ] **DASH-01**: User sees stat cards with leave balance and key metrics on dashboard
- [ ] **DASH-02**: Dashboard displays leave breakdown chart by type
- [ ] **DASH-03**: Dashboard shows recent activity feed
- [ ] **DASH-04**: Dashboard displays company announcements
- [ ] **DASH-05**: Dashboard provides quick action buttons for common tasks

### Navigation & Theming

- [ ] **NAVT-01**: Application has collapsible sidebar navigation
- [ ] **NAVT-02**: Sidebar items filtered by user role
- [ ] **NAVT-03**: Sidebar shows pending approval count badge for leader/hr
- [ ] **NAVT-04**: Application supports dark mode (default) and light mode
- [ ] **NAVT-05**: Theme uses CSS variables on html element; components never hardcode colors

### Team Members

- [ ] **TEAM-01**: User can view team members with search and filter functionality
- [ ] **TEAM-02**: User can view member details in a modal
- [ ] **TEAM-03**: HR can register new members with email, role, and department
- [ ] **TEAM-04**: If profile creation fails after auth account creation, system deletes the auth account (rollback)

### Departments

- [ ] **DEPT-01**: HR can manage a fixed list of departments
- [ ] **DEPT-02**: Users are assigned to exactly one department

### Projects

- [ ] **PROJ-01**: Leader can create and manage projects
- [ ] **PROJ-02**: Leader can assign members to projects
- [ ] **PROJ-03**: System validates project member assignments

### Holidays

- [ ] **HOLI-01**: HR can create, edit, and delete company holidays
- [ ] **HOLI-02**: Holidays are displayed on calendar and block leave applications

### Announcements

- [ ] **ANNC-01**: HR can create, edit, and delete announcements on dedicated page
- [ ] **ANNC-02**: Announcements display on dashboard for all users

### Suggestions

- [ ] **SUGG-01**: User can post anonymous suggestions
- [ ] **SUGG-02**: User can upvote suggestions with optimistic UI updates

### Reports

- [ ] **REPT-01**: HR can view aggregate leave statistics by department
- [ ] **REPT-02**: HR can view leave trend data over time

### User Profile

- [ ] **PROF-01**: User can view their profile information
- [ ] **PROF-02**: User can change their password

### Seed Data

- [ ] **SEED-01**: System includes sample users for each role (member, leader, hr)
- [ ] **SEED-02**: System includes sample holidays, leave entries, and projects

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: User receives email notifications for leave status changes
- **NOTF-02**: User receives in-app notifications via notification center
- **NOTF-03**: User can configure notification preferences

### Advanced Auth

- **AAUTH-01**: User can log in via OAuth (Google, GitHub)
- **AAUTH-02**: SSO support for enterprise identity providers

### Advanced Leave

- **ALVS-01**: Automated leave accrual based on tenure
- **ALVS-02**: Leave carry-forward rules
- **ALVS-03**: Audit log for all leave modifications

### Export

- **EXPT-01**: HR can export leave reports as CSV

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Email/push notifications | Ops overhead disproportionate to value at <50 users; visual status sufficient for v1 |
| In-app notification system | Deferred to v2; bell icon is visual placeholder |
| Mobile native app | Web-first, responsive design sufficient for small team |
| OAuth/SSO login | Email/password sufficient for <50 users; adds external dependency |
| Payroll integration | Separate product domain with compliance requirements |
| File attachments on leave | Storage infrastructure complexity; verbal confirmation suffices |
| Multi-company/tenant support | Architectural decision that requires day-0 design; single company system |
| Biometric/GPS attendance | Privacy concerns; trust-based self-reporting preferred |
| Complex leave accrual rules | Manual HR balance setting is simpler and more flexible for small team |
| Comp-off / overtime tracking | Scope creep into time-tracking territory |
| Real-time on all pages | Connection overhead and state complexity; only needed on Approvals page |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| — | — | Pending |

**Coverage:**
- v1 requirements: 50 total
- Mapped to phases: 0
- Unmapped: 50

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after initial definition*
