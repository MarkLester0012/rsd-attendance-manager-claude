# Stack Research

**Domain:** Attendance and Leave Management System
**Researched:** 2026-03-02
**Confidence:** MEDIUM (versions based on training data through May 2025; verify with `npm view <package> version` before installing)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | ^15.1 | Full-stack React framework (App Router) | User-specified. App Router is the stable default since v13.4. Server Components reduce client bundle, Server Actions simplify form handling. Vercel deployment is zero-config. |
| React | ^19.0 | UI library | Next.js 15 ships with React 19 support. React 19 brings useActionState, useOptimistic, improved Suspense -- all useful for this app's forms and approval workflows. |
| Supabase (supabase-js) | ^2.47 | Auth, Postgres DB, Realtime subscriptions | User-specified. Single platform for auth + database + realtime. The JS client is mature and well-documented. Row Level Security (RLS) provides server-enforced authorization. |
| @supabase/ssr | ^0.5 | Server-side Supabase auth for Next.js | Required for App Router cookie-based auth. Replaces deprecated @supabase/auth-helpers-nextjs. Handles middleware token refresh. |
| TypeScript | ^5.6 | Type safety | Non-negotiable for a project with role-based access, 9 leave types, and complex business rules. Catches type errors at build time. |

### UI Framework

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| shadcn/ui | latest (CLI-installed) | Component library foundation | Not a dependency but a copy-paste component system built on Radix UI + Tailwind CSS. Full control over components, no version lock-in. Provides Dialog, Sheet, Select, Table, Badge, Calendar, Card -- all needed for this app. |
| Tailwind CSS | ^3.4 | Utility-first CSS | Ships with Next.js. Perfect for CSS variable theming (dark/light mode via class strategy). shadcn/ui requires it. |
| @radix-ui/* | varies | Accessible headless primitives | Installed automatically by shadcn/ui. WAI-ARIA compliant Dialog, Popover, DropdownMenu, Tooltip, etc. |
| lucide-react | ^0.460 | Icon library | Default icon set for shadcn/ui. Tree-shakeable, consistent design language, 1500+ icons. |
| class-variance-authority | ^0.7 | Component variant management | Used by shadcn/ui for defining component variants (size, color, etc.). |
| clsx + tailwind-merge | ^2.1 / ^2.5 | Class name merging | Used by shadcn/ui's `cn()` utility. clsx handles conditional classes, tailwind-merge resolves Tailwind conflicts. |

### Date Handling

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| date-fns | ^4.1 | Date manipulation and formatting | Tree-shakeable (only import what you use), immutable API, locale support. Best modern choice for date logic (leave calculations, calendar rendering, holiday checking). |
| react-day-picker | ^9.4 | Calendar component | shadcn/ui's Calendar component wraps react-day-picker. Handles month navigation, date range selection, disabled dates (weekends, holidays). Tight integration with date-fns. |

### Charts and Data Visualization

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Recharts | ^2.13 | Dashboard charts (leave breakdown pie/bar, trends) | Built specifically for React. Declarative API with composable components (PieChart, BarChart, LineChart). Good for the dashboard stat charts and HR reports page. shadcn/ui has built-in chart components wrapping Recharts. |

### Forms and Validation

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| React Hook Form | ^7.54 | Form state management | Minimal re-renders, excellent TypeScript support, works well with Server Actions. Handles the leave application form, registration form, project assignment form, etc. |
| Zod | ^3.23 | Schema validation | TypeScript-first validation. Define schemas once, use for both client-side form validation and server-side action validation. Integrates with React Hook Form via @hookform/resolvers. |
| @hookform/resolvers | ^3.9 | RHF + Zod bridge | Connects Zod schemas to React Hook Form. One import, zero boilerplate. |

### State Management

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Zustand | ^5.0 | Client-side global state (sidebar, theme, auth session) | Lightweight (1KB), no boilerplate, works with React 19. Use for sidebar collapse state, theme preference, and cached auth user. NOT for server data -- that stays in Supabase. |

### Tables and Data Display

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| @tanstack/react-table | ^8.20 | Headless table logic | Provides sorting, filtering, pagination logic without opinionated UI. shadcn/ui has a DataTable component wrapping it. Perfect for My Leaves list, Team Members table, Approvals queue. |

### Notifications and Toasts

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| sonner | ^1.7 | Toast notifications | shadcn/ui's recommended toast library. Beautiful default styling, stackable, promise-based toasts for async actions (leave submitted, approved, etc.). |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| ESLint | ^9.0 | Linting | Next.js ships with eslint-config-next. Use flat config format (eslint.config.mjs). |
| Prettier | ^3.4 | Code formatting | Pair with prettier-plugin-tailwindcss to auto-sort Tailwind classes. |
| prettier-plugin-tailwindcss | ^0.6 | Tailwind class sorting | Automatically orders Tailwind utility classes in a consistent canonical order. |
| Supabase CLI | latest | Local development, migrations, type generation | `supabase init`, `supabase start` for local Postgres + Auth. `supabase gen types typescript` generates DB types from schema. Critical for type-safe database queries. |

### Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel | N/A | Hosting and deployment | User-specified. Zero-config Next.js deployment. Preview deployments per PR. Edge middleware for auth token refresh. |
| Supabase (hosted) | N/A | Managed Postgres + Auth + Realtime | User-specified. Free tier supports <50 users easily. Managed backups, connection pooling (Supavisor), dashboard for debugging. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Moment.js | Deprecated by its own maintainers, massive bundle size (300KB+), mutable API | date-fns (tree-shakeable, immutable, modern) |
| @supabase/auth-helpers-nextjs | Deprecated in favor of @supabase/ssr. No longer maintained. | @supabase/ssr |
| Material UI (MUI) | Heavy bundle, opinionated styling conflicts with Tailwind, complex theming system | shadcn/ui + Tailwind (lighter, full control, CSS variable theming) |
| Ant Design | Same issues as MUI -- large bundle, own design system that fights Tailwind | shadcn/ui + Tailwind |
| Chart.js / react-chartjs-2 | Canvas-based (not SSR-friendly), worse React integration than Recharts | Recharts (SVG-based, composable React components) |
| Redux / Redux Toolkit | Massive overkill for this app. Most state lives in Supabase (server), not client. | Zustand for the small amount of client state needed |
| next-auth (Auth.js) | Unnecessary -- Supabase Auth already handles authentication. Adding next-auth creates two auth systems fighting each other. | @supabase/ssr (use Supabase's built-in auth) |
| Formik | Larger bundle, more re-renders, worse TypeScript support compared to React Hook Form | React Hook Form + Zod |
| Day.js | Smaller than Moment but worse tree-shaking than date-fns, plugin-based API is clunky | date-fns (better tree-shaking, cleaner API) |
| next-themes | Adds an unnecessary dependency for theme toggling that can be done with a few lines of code and CSS variables | Custom theme toggle with Zustand + CSS variable class strategy on `<html>` |
| Prisma | Adds an ORM layer on top of Supabase's already excellent PostgREST API. Double abstraction. Migrations conflict with Supabase migrations. | Supabase client (supabase-js) directly, with generated TypeScript types |
| Drizzle ORM | Same issue as Prisma -- unnecessary when using Supabase's client. Use Supabase's query builder or raw SQL via RPC for complex queries. | Supabase client + RPC functions for complex queries |

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| UI Components | shadcn/ui | Headless UI (Tailwind Labs) | If you want even fewer components and plan to build most from scratch. shadcn/ui is better because it provides more components out of the box. |
| Charts | Recharts | Nivo | If you need more chart types (heatmaps, treemaps). Recharts is simpler for the pie/bar/line charts this app needs. |
| Date Library | date-fns | Temporal API (Stage 3) | When Temporal ships in browsers and Node.js. Not production-ready as of early 2026. Stick with date-fns. |
| State Management | Zustand | Jotai | If you prefer atomic state model. Both are lightweight. Zustand is simpler for this app's few global stores. |
| Table | @tanstack/react-table | Manual implementation | If you only have simple lists with no sorting/filtering. This app has enough table features to justify TanStack Table. |
| Toast | sonner | react-hot-toast | If you want even simpler API. sonner is better because shadcn/ui integrates it out of the box. |
| Forms | React Hook Form | Conform | If you want a form library designed specifically for Server Actions. React Hook Form is more mature and has better ecosystem support. |

## Stack Patterns for This Project

**For server-side data fetching (most pages):**
- Use Server Components with `createServerClient` from @supabase/ssr
- Fetch data directly in the component, no client-side state needed
- Because: Dashboard, My Calendar, Office Attendance, Team Members -- all read-heavy pages benefit from server rendering

**For the Approvals page (realtime):**
- Use a Client Component with `createBrowserClient` from @supabase/ssr
- Subscribe to Supabase Realtime channels for the `leave_requests` table
- Use `useOptimistic` from React 19 for instant UI updates on approve/reject
- Because: This is the only page requiring live updates per project requirements

**For forms (leave application, registration, etc.):**
- Use Server Actions for form submission
- Validate with Zod on both client (React Hook Form resolver) and server (in the action)
- Because: Server Actions keep sensitive logic server-side, Zod schemas are reusable

**For theme toggling:**
- Store preference in localStorage via Zustand persist middleware
- Apply `dark` or `light` class on `<html>` element
- All colors as CSS variables (matching project constraint)
- Because: No flash of wrong theme on load, works without JS hydration if class is set in middleware

## Version Compatibility Notes

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js ^15.1 | React ^19.0, react-dom ^19.0 | Next.js 15 requires React 19. Do not use React 18. |
| @supabase/ssr ^0.5 | @supabase/supabase-js ^2.47 | @supabase/ssr is a companion to supabase-js, not a replacement. Both are needed. |
| shadcn/ui (latest CLI) | Tailwind CSS ^3.4, React ^19.0 | shadcn/ui generates components. Check if shadcn/ui has Tailwind v4 support when installing -- if so, use Tailwind v4 instead. |
| react-day-picker ^9.x | date-fns ^4.x | react-day-picker v9 uses date-fns v4 internally. Do not install date-fns v3. |
| @tanstack/react-table ^8.x | React ^18 or ^19 | Works with both React versions. |
| React Hook Form ^7.54 | React ^19.0, @hookform/resolvers ^3.9 | RHF v7 supports React 19. |
| Recharts ^2.13 | React ^18 or ^19 | Verify React 19 compatibility -- if issues, pin to Recharts 2.12.x. |
| Zustand ^5.0 | React ^19.0 | Zustand v5 was designed for React 19 concurrent features. |

**IMPORTANT VERSION NOTE:** All version numbers above are based on training data through May 2025. Before running `npm install`, verify current latest versions with `npm view <package> version`. Versions may have incremented. The compatibility relationships (which packages work together) are more stable than specific version numbers.

## Installation

```bash
# Create Next.js project (includes React 19, TypeScript, Tailwind, ESLint)
npx create-next-app@latest rsd-attendance-manager --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Forms and validation
npm install react-hook-form zod @hookform/resolvers

# Date handling
npm install date-fns

# Charts
npm install recharts

# State management
npm install zustand

# Tables
npm install @tanstack/react-table

# Toast notifications
npm install sonner

# Initialize shadcn/ui (installs Radix primitives, lucide-react, clsx, tailwind-merge, cva)
npx shadcn@latest init

# Add shadcn/ui components as needed
npx shadcn@latest add button card dialog sheet select table badge calendar chart toast dropdown-menu popover separator input label textarea tabs avatar command

# Dev dependencies
npm install -D prettier prettier-plugin-tailwindcss

# Supabase CLI (for local dev and type generation)
npm install -D supabase
```

## Confidence Assessment

| Recommendation | Confidence | Reasoning |
|----------------|------------|-----------|
| Next.js + App Router | HIGH | User-specified, industry standard, stable since 2023 |
| Supabase + @supabase/ssr | HIGH | User-specified, @supabase/ssr is the official Next.js integration |
| shadcn/ui + Tailwind | HIGH | Dominant React UI approach in 2024-2025, perfect for CSS variable theming requirement |
| React Hook Form + Zod | HIGH | Industry standard pairing, widely adopted, excellent TypeScript support |
| date-fns + react-day-picker | HIGH | Standard choices, react-day-picker is what shadcn/ui Calendar uses |
| Recharts | HIGH | shadcn/ui chart components wrap Recharts, widely adopted |
| @tanstack/react-table | HIGH | De facto standard for React tables, shadcn/ui DataTable wraps it |
| Zustand | HIGH | Lightweight, well-maintained, React 19 compatible |
| sonner | HIGH | shadcn/ui's recommended toast solution |
| Specific version numbers | MEDIUM | Based on training data (May 2025). Verify before installing. Core compatibility relationships are reliable. |
| Tailwind CSS v3 vs v4 | LOW | Tailwind v4 was in beta/RC during training period. shadcn/ui may or may not fully support v4 by now. Check `npx shadcn@latest init` -- it will use the correct version. |

## Sources

- Training data through May 2025 (Next.js docs, Supabase docs, shadcn/ui docs, npm registry)
- WebSearch, WebFetch, and Bash tools were unavailable for live verification
- All library choices are based on well-established ecosystem patterns with HIGH adoption
- Version numbers should be verified via `npm view <package> version` before installation

---
*Stack research for: RSD Attendance Manager*
*Researched: 2026-03-02*
*Limitation: No live version verification possible -- WebSearch, WebFetch, and Bash denied. Versions are from training data (May 2025).*
