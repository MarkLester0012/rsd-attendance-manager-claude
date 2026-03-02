# Feature Research

**Domain:** Attendance & Leave Management System (Internal/Company Tool)
**Researched:** 2026-03-02
**Confidence:** MEDIUM (based on training data domain knowledge of BambooHR, Zoho People, Keka, greytHR, Calamari, LeaveBoard, and similar products -- no live web verification available)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Leave application with type selection** | Core purpose of the system. Every employee needs to request time off. | MEDIUM | RSD plans 9 leave types with different approval rules -- this is above average and good. Most products have 4-6 types. |
| **Leave balance tracking** | Employees must know how many days they have left. No balance = no trust in system. | MEDIUM | Credit-based deduction on approval, refund on rejection/cancel is the standard pattern. RSD's approach matches industry standard. |
| **Approval workflow** | Leaders/HR must approve or reject requests. Without this, system is just a calendar. | MEDIUM | Two-tier (leader + HR) is standard. RSD's single-tier (leader OR HR depending on type) is simpler and appropriate for <50 people. |
| **Calendar view of leaves** | Visual representation is how people think about time off. A list alone is insufficient. | MEDIUM | Full month grid with color-coded leave markers. Holiday markers on the same calendar are expected. |
| **Holiday calendar** | Employees need to know company holidays. Every competitor has this. | LOW | HR-managed static list. Straightforward CRUD. |
| **Role-based access control** | Different users need different permissions. HR sees everything, employees see their own data. | MEDIUM | Three roles (member, leader, hr) is the right granularity for a small company. More roles = unnecessary complexity. |
| **Authentication with secure sessions** | Users expect login to work reliably and securely. | MEDIUM | Email/password is fine for <50 users. Cookie-based sessions with middleware refresh is the standard Supabase pattern. |
| **Dashboard with summary stats** | Users expect a home page showing what matters: balances, pending requests, recent activity. | MEDIUM | Stat cards + charts + recent activity is the standard pattern across all competitors. |
| **Leave history / My Leaves view** | Employees need to see their past and pending requests. Filtering by status/type/date is expected. | LOW | List view with filters. Straightforward. |
| **Half-day leave support** | Very common in Asian markets especially. Users will ask for it immediately if missing. | LOW | AM/PM distinction for select leave types. RSD scopes this to SL, VL, WFH -- reasonable. |
| **Dark/light theme** | Modern web apps are expected to support theme preference. Not having dark mode feels dated. | LOW | CSS variable approach is the correct pattern. RSD has this planned. |
| **User profile with password change** | Basic self-service. Users expect to manage their own credentials. | LOW | Minimal scope is correct for v1. |
| **WFH tracking** | Post-COVID standard. Every attendance system now tracks work-from-home. This is no longer a differentiator -- it is expected. | MEDIUM | RSD's WFH with monthly cap (8.0/user) and daily global cap (12 slots) is a well-designed constraint system. |
| **Weekend/holiday blocking** | System should prevent leave applications on non-working days. Users expect this validation. | LOW | Prevents data quality issues. Simple date validation. |
| **Responsive web design** | Users will check leave status on mobile browsers. Not native app, but responsive layout is expected. | MEDIUM | Not explicitly called out in PROJECT.md but implied by "web-first, responsive design sufficient." Must be delivered. |

### Differentiators (Competitive Advantage)

Features that set the product apart from generic attendance tools. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Real-time approval updates** | Leaders see new requests instantly without refreshing. Reduces approval lag. Most internal tools require manual refresh. | MEDIUM | RSD plans Supabase Realtime on Approvals page only -- this is smart scoping. Real-time everywhere is anti-pattern (see Anti-Features). |
| **Anonymous suggestions board** | Gives employees a voice without fear of reprisal. Rare in attendance tools -- most competitors don't have this. | MEDIUM | Upvoting with optimistic updates adds engagement. This is a genuine differentiator for an internal tool. |
| **Office attendance daily overview** | Knowing who is in office today at a glance. Many leave systems only show leave, not presence. | MEDIUM | Per-user status cards with summary counters. Very useful for small teams coordinating in-office days. |
| **Company announcements integrated in dashboard** | Centralizes communication. Most leave tools are single-purpose; embedding announcements makes this the daily go-to app. | LOW | HR-managed with dedicated CRUD page. Low complexity, high daily usage value. |
| **WFH daily global cap enforcement** | Ensures minimum office presence. Most tools track WFH as just another leave type without caps. | LOW | 12 slots daily cap is a thoughtful business rule. Technical implementation is just a count query + validation. |
| **Color-coded leave type system** | Consistent visual language across calendar, badges, charts. Most internal tools have inconsistent coloring. | LOW | 9 distinct colors mapped to CSS variables. Makes the UI scannable. |
| **Auto-approved leave types** | Some leave types (SL, NW, RGA, AB, WFH) skip approval queue. Reduces friction for routine entries. | LOW | Smart UX -- not all leave actions need manager involvement. Reduces approval fatigue. |
| **Department-based reporting** | HR can see aggregate leave stats by department and spot trends. Most small-company tools lack analytics. | MEDIUM | Requires proper department data model and aggregation queries. Valuable for HR decision-making. |
| **Seed data for immediate demo** | Out-of-box experience with sample data. Most tools require manual setup before you can evaluate them. | LOW | Sample users per role, holidays, leave entries, projects. Great for onboarding and testing. |
| **Project assignments** | Linking team members to projects adds workforce planning context. Leave tools rarely connect to project management. | MEDIUM | Leader-managed with member assignments and validation. Bridges attendance and project planning. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Email/push notifications** | "I want to know when my leave is approved." | For <50 users, notification infrastructure (email service, push tokens, delivery tracking, preference management) adds enormous complexity relative to value. Email deliverability is a separate ops burden. | Visual status on My Leaves page + pending approval badge on sidebar. Users check the app daily anyway. Defer to v2 when usage patterns are understood. |
| **In-app notification bell with history** | "I want a notification center like Slack." | Requires notification data model, read/unread state, aggregation, real-time delivery, and preference settings. The bell icon becomes tech debt if the notification system is shallow. | A simple "recent activity" feed on the dashboard. The bell icon can be a visual placeholder pointing to the activity feed. |
| **OAuth/SSO login** | "We use Google Workspace, let me sign in with Google." | For <50 users, OAuth adds complexity (provider configuration, token refresh, account linking) without proportional value. SSO becomes valuable at 200+ users or when IT policy mandates it. | Email/password with Supabase Auth. Simple, reliable, no external dependencies. |
| **Real-time everything** | "Make the whole app live-updating." | Supabase Realtime subscriptions on every page create connection overhead, state management complexity, and race conditions. For <50 users, stale data for 30 seconds is not a business problem. | Real-time on Approvals page only (where timeliness matters). Other pages refresh on navigation/focus. This is the correct architectural decision. |
| **Payroll integration** | "Connect leave data to payroll processing." | Payroll systems vary wildly, have strict compliance requirements, and integration errors have legal consequences. This is a separate product domain. | Export leave data as CSV/report for manual payroll input. Clean boundary. |
| **File attachments on leave requests** | "Let me upload a medical certificate." | File storage, virus scanning, size limits, and UI for previewing add complexity. For a small trusted team, verbal confirmation suffices. | Text field for notes on leave request. If medical proof is needed, handle via email to HR. |
| **Multi-tenant / multi-company support** | "What if we want to use this for our subsidiary?" | Multi-tenancy changes every query, every permission check, every data model. It is an architectural decision that must be made at day 0 or it becomes a rewrite. | Build for single company. If multi-tenant is ever needed, it warrants a separate project or major version. |
| **Complex leave accrual rules** | "Leaves should accrue monthly based on tenure." | Accrual engines are surprisingly complex: proration, carry-forward limits, anniversary vs calendar year, tenure tiers. For a small company, manual balance setting by HR is simpler and more flexible. | HR sets initial balances. Deduction on approval, refund on rejection. Simple credit-based system. |
| **Biometric/GPS attendance** | "Track when people badge in/out or check GPS location." | Privacy concerns, hardware dependencies, location spoofing, and the ethical implications of surveillance. For a small team with trust-based culture, this is counterproductive. | Self-reported attendance status (in office, WFH, on leave). Trust the team. |
| **Comp-off / overtime tracking** | "Track overtime hours and convert to compensatory leave." | Overtime rules vary by jurisdiction, require time tracking infrastructure, and create complex balance calculations. This is scope creep into time-tracking territory. | If needed, HR can manually adjust leave balances. Keep the system focused on leave management. |

## Feature Dependencies

```
[Authentication & RBAC]
    |
    |--requires--> [User Profile]
    |
    |--requires--> [Dashboard] --enhances--> [Announcements]
    |                                         (announcements display on dashboard)
    |
    |--requires--> [Leave Types & Balance Model]
    |                   |
    |                   |--requires--> [Leave Application (My Calendar)]
    |                   |                   |
    |                   |                   |--requires--> [Approval Workflow]
    |                   |                   |                   |
    |                   |                   |                   |--enhances--> [Realtime on Approvals]
    |                   |                   |
    |                   |                   |--requires--> [My Leaves (History)]
    |                   |
    |                   |--requires--> [Office Attendance View]
    |                   |
    |                   |--requires--> [Reports & Analytics]
    |
    |--requires--> [Department Management]
    |                   |
    |                   |--enhances--> [Reports by Department]
    |                   |
    |                   |--enhances--> [Team Members Management]
    |
    |--requires--> [Holiday Management]
    |                   |
    |                   |--enhances--> [Calendar View] (holiday markers)
    |                   |
    |                   |--enhances--> [Leave Application] (weekend/holiday blocking)
    |
    |--requires--> [Team Members Management (HR)]
    |                   |
    |                   |--requires--> [Projects & Assignments]
    |
    |--independent--> [Suggestions Board] (only needs auth)
    |
    |--independent--> [Theme Toggle] (only needs UI shell)
```

### Dependency Notes

- **Authentication is the root dependency:** Everything requires users and roles. Must be built first with proper RBAC.
- **Leave Types & Balance Model is the data foundation:** The leave application, approval workflow, attendance view, and reports all depend on this data model being correct. Getting this wrong means reworking multiple features.
- **Holiday Management enables leave blocking:** The calendar and leave application both need holiday data to function correctly. Must be seeded or manageable before leave applications work properly.
- **Department Management enables reporting:** Reports by department require departments to exist and users to be assigned. Should be established early.
- **Suggestions Board is independent:** Only needs authentication. Can be built in any phase without blocking or being blocked by other features.
- **Team Members Management enables Projects:** Projects assign members, so the member management and registration flow must exist first.
- **Announcements enhance Dashboard:** The dashboard displays announcements, but the dashboard can ship without them (just empty state). Announcements CRUD can come in a later phase.

## MVP Definition

### Launch With (v1.0)

Minimum viable product -- what's needed to replace manual leave tracking.

- [x] **Authentication with role-based access** -- Without login and roles, nothing works
- [x] **Leave types and balance model** -- The core data model that everything depends on
- [x] **Leave application via calendar** -- The primary user action
- [x] **Approval workflow** -- Leaders/HR must approve; auto-approval for select types
- [x] **My Leaves history with filters** -- Users need to see their own requests
- [x] **Holiday management** -- Required for leave blocking validation
- [x] **Department management** -- Required for user organization and later reporting
- [x] **Team members management (HR registration)** -- HR must be able to add employees
- [x] **Dashboard with stat cards and leave breakdown** -- The landing page everyone sees daily
- [x] **Collapsible sidebar with role-filtered navigation** -- Core navigation shell
- [x] **Dark/light theme** -- Ship with it from day 1; retrofitting theming is painful
- [x] **Office attendance daily view** -- "Who is in today?" is a daily question
- [x] **Seed data** -- Enables immediate testing and stakeholder demos

### Add After Core Validation (v1.x)

Features to add once the core leave flow is working and used daily.

- [ ] **Approvals page with realtime updates** -- Add Supabase Realtime after basic approval works via page refresh
- [ ] **Reports page with aggregate stats** -- Once enough leave data exists to make reports meaningful (after 1+ month of usage)
- [ ] **Projects page with assignments** -- Enhances workforce visibility but not required for basic leave management
- [ ] **Announcements page and dashboard integration** -- Good for HR communication but not core leave management
- [ ] **Suggestions board with anonymous posting** -- Nice engagement feature, completely independent of core
- [ ] **User profile with password change** -- Important but lower urgency than leave management flows
- [ ] **Half-day leave refinements** -- Can start with full-day only, add AM/PM once core flow is solid

### Future Consideration (v2+)

Features to defer until v1 is stable and adopted.

- [ ] **Email/push notifications** -- Only after usage patterns show where notification gaps cause real problems
- [ ] **In-app notification system** -- Only if the "check the app" pattern proves insufficient
- [ ] **OAuth/SSO** -- Only if company adopts identity provider or grows beyond 50 users
- [ ] **Leave accrual automation** -- Only if HR finds manual balance management burdensome
- [ ] **Export/download reports as CSV** -- Only if HR requests it for payroll or compliance
- [ ] **Audit log for leave modifications** -- Only if disputes about leave changes become a problem
- [ ] **Mobile native app** -- Only if responsive web proves insufficient for mobile usage

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Authentication & RBAC | HIGH | MEDIUM | P1 |
| Leave types & balance model | HIGH | MEDIUM | P1 |
| Leave application (My Calendar) | HIGH | HIGH | P1 |
| Approval workflow | HIGH | MEDIUM | P1 |
| My Leaves history | HIGH | LOW | P1 |
| Holiday management | HIGH | LOW | P1 |
| Department management | MEDIUM | LOW | P1 |
| Team members management | HIGH | MEDIUM | P1 |
| Dashboard with stats | HIGH | MEDIUM | P1 |
| Sidebar navigation | HIGH | LOW | P1 |
| Dark/light theme | MEDIUM | LOW | P1 |
| Office attendance view | HIGH | MEDIUM | P1 |
| Seed data | MEDIUM | LOW | P1 |
| WFH cap enforcement | MEDIUM | LOW | P1 |
| Half-day leave | MEDIUM | LOW | P1 |
| Realtime approvals | MEDIUM | MEDIUM | P2 |
| Reports & analytics | MEDIUM | MEDIUM | P2 |
| Projects & assignments | MEDIUM | MEDIUM | P2 |
| Announcements | MEDIUM | LOW | P2 |
| Suggestions board | LOW | MEDIUM | P2 |
| User profile & password | MEDIUM | LOW | P2 |
| Email notifications | MEDIUM | HIGH | P3 |
| In-app notifications | LOW | HIGH | P3 |
| OAuth/SSO | LOW | MEDIUM | P3 |
| CSV export | LOW | LOW | P3 |
| Audit log | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- the system is broken without these
- P2: Should have, add in v1.x -- enhances value but core works without them
- P3: Nice to have, future consideration -- defer until real user demand

## Competitor Feature Analysis

**Note:** Based on training data knowledge of competitor products. Confidence: MEDIUM. Unable to verify current feature sets via web search.

| Feature | BambooHR | Zoho People | Keka HR | Our Approach |
|---------|----------|-------------|---------|--------------|
| Leave types | 5-10 configurable | Unlimited custom | 10+ predefined | 9 fixed types -- right for small company, avoids config complexity |
| Approval workflow | Multi-level configurable | Multi-level with conditions | Multi-level + auto | Single-level with auto-approve for select types -- appropriate for <50 |
| Calendar view | Full calendar with team view | Gregorian + holiday | Full calendar | Full month grid with leave + holiday markers |
| WFH tracking | Basic tracking | WFH as leave type | Dedicated WFH module | WFH with monthly + daily caps -- more structured than most |
| Mobile | Native iOS/Android | Native apps | Native apps | Responsive web only -- correct for small team, avoids app store overhead |
| Notifications | Email + in-app | Email + SMS + in-app | Email + push + in-app | None in v1 -- deliberate simplicity |
| Reports | Pre-built + custom | Pre-built + custom builder | Advanced analytics | Basic departmental aggregates -- sufficient for <50 |
| SSO | SAML, Google, Okta | SAML, Google | Google, Azure AD | Email/password only -- correct for <50 |
| Payroll integration | Deep integration | Zoho Payroll native | Built-in payroll | Out of scope -- correct boundary |
| Suggestions/feedback | Employee satisfaction surveys | Polls, surveys | eNPS surveys | Anonymous suggestions with upvotes -- lightweight alternative |
| Announcements | Company updates feed | Announcements module | Announcements | HR-managed with dashboard integration |
| Time tracking | Clock in/out | Timesheet + GPS | Attendance + geo | Not included -- leave-focused, not time-tracking |
| Self-service portal | Full employee portal | Comprehensive ESS | ESS portal | Limited to leave, profile, suggestions -- focused scope |

### Key Insight from Competitor Analysis

The big players (BambooHR, Zoho People, Keka) are full HRIS platforms. RSD's tool is deliberately NOT an HRIS -- it is a focused attendance/leave management tool for a specific small company. This is the correct positioning because:

1. **Small team does not need HRIS complexity.** Configuration fatigue kills adoption for <50 users.
2. **Custom-built means exactly right.** No paying for 80% of features you don't use.
3. **The differentiators are in the details:** WFH caps, anonymous suggestions, and the daily attendance overview solve RSD-specific problems that generic tools handle poorly.

## Sources

- Competitor analysis based on training data knowledge of BambooHR, Zoho People, Keka HR, greytHR, Calamari, and LeaveBoard feature sets (MEDIUM confidence -- unable to verify current features via web)
- Domain patterns from training data covering HR tech and internal tools category (MEDIUM confidence)
- Feature categorization informed by PROJECT.md requirements and constraints

---
*Feature research for: Attendance & Leave Management System*
*Researched: 2026-03-02*
