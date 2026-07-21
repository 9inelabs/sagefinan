# CLAUDE.md

Read [`SPEC.md`](SPEC.md) and [`design/ui-draft.html`](design/ui-draft.html)
before doing anything else in this repo. `design/ui-draft.html` is the
authoritative design reference — when a screen you're building doesn't match
it, the prototype wins, not your judgement.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS v4. Supabase for Postgres,
Auth, Storage — plain SQL migrations in `supabase/migrations/`, no ORM. Types
generated with `supabase gen types typescript --linked > lib/supabase/database.types.ts`
after every schema change. Deployed to Vercel (from phase 8).

## Conventions

- **Data access**: privileged reads/writes happen in Server Actions using
  `lib/supabase/admin.ts` (service role key, bypasses RLS) — every such
  action must check the caller's role/permission in application code first.
  `lib/supabase/server.ts` (anon key + cookies) is for reading the signed-in
  user's own session/profile, respecting RLS. `lib/supabase/client.ts` (anon
  key) is the only Supabase client ever sent to the browser.
- **Auth/authorization**: `middleware.ts` handles authentication only
  (redirects signed-out users to `/login`, signed-in users away from
  `/login`). Authorization (role checks) happens per-page via
  `getCurrentProfile()` + `requireRole()` in `lib/auth/profile.ts` — see any
  file under `app/(app)/*/page.tsx` for the pattern.
- **Nav**: `lib/nav.ts` is the single source of truth for sidebar items and
  which roles see them. Add a route there, not just in `app/(app)/`.
- **Design tokens**: defined once in `app/globals.css` (`:root` CSS vars +
  Tailwind `@theme inline`). Never hardcode a hex colour, radius, or font
  size in a component — use the theme tokens (`bg-ink`, `text-teal`,
  `border-n200`, `rounded`, `text-xs`/`sm`/`base`/`xl`/`2xl`, `tabular-nums`).
  Never use `font-semibold`/`font-bold` classes — weights are 400/500 only,
  by convention (not build-enforced).
- **Movements are immutable**: no code should ever UPDATE or DELETE a
  `movements` row — RLS has no such policy for anyone, by design. Corrections
  go through `adjustments`.
- **Balance queries**: always go through `get_department_balance(department_id,
  as_at_date)` — never hand-roll a movement sum elsewhere.
- **Business day vs. created_at**: every write that touches `movements` /
  `count_sessions` must take an explicit `business_day` / `as_at_date` field
  from the caller (defaulting to today in the UI), never derive it from
  `now()`.

## Phase log

**Phase 1 — Foundation, schema, auth, PWA shell, design system.** Scaffolded
Next.js 15.5.20 (pinned, not 16) + Tailwind v4 + TypeScript. Wrote the full
initial migration (`20260721121600_initial_schema.sql`): all 8 tables, 4
enums, the requisition two-sided check constraint + `validate_movement`
trigger (enforces which side must be central store — a plain CHECK can't do
cross-table lookups), RLS on every table with role-scoped policies, and two
helper functions `app_current_role()`/`app_current_department_id()` (named
with an `app_` prefix because `current_role` collides with a built-in
Postgres SQL construct — this cost one failed `db push` to discover). Wrote
`get_department_balance()` (`20260721121900_balance_function.sql`) — computes
opening/received/issued/closing qty + value per product from movements,
generic across department types via the to/from-department-id convention (see
SPEC.md). Both migrations applied to the linked remote project via
`supabase db push`; types generated via `supabase gen types`.

Set up `@supabase/ssr`-based auth: browser/server/admin clients, session-
refresh middleware, login page + sign-in/sign-out Server Actions. Built the
app shell (`components/app-shell/`): desktop sidebar + `<900px` slide-out
drawer (the prototype itself doesn't implement the drawer — it just hides the
sidebar with no replacement — so the drawer UI is a phase-1 addition, not a
faithful reproduction of anything in the HTML file), header with hamburger +
title/subtitle, nav filtered by role. Dashboard (`/`) reproduces the
prototype's sample figures verbatim for ADMIN/AUDITOR; STOREKEEPER/
DEPARTMENT_USER get a minimal placeholder home instead. All 8 other nav
routes exist with role guards and "Coming in phase N" placeholder content.

PWA: manifest (`public/manifest.webmanifest`), hand-rolled placeholder icons
(192/512/maskable/apple-touch, solid ink background + teal mark — generated
via a raw PNG writer since no image library was available; replace with the
real logo before shipping), service worker (`public/sw.js`) caching static
assets only (style/script/image/font destinations) — navigation and data
requests always hit the network, no offline data path, per spec.

Seed data: `supabase/seed.sql` (departments, products, product_assignments —
fixed UUIDs, pure SQL, run via `supabase db query --linked -f supabase/seed.sql`)
plus `scripts/seed-admin.mjs` (admin auth user + sample movements — this part
can't be plain SQL because creating a Supabase Auth user correctly requires
the Admin API, not a hand-written `auth.users` insert; run via `node
scripts/seed-admin.mjs`, idempotent). Balance function verified against hand-
computed expected values for Bar as at 2026-07-20 — see the README/handoff
message for the exact query.

Added `server-only` as a small dependency (guards `lib/supabase/admin.ts`
against ever being imported into a Client Component — build-time failure
instead of a leaked service-role key).
