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
- **Multi-row atomic writes**: a Server Action calling `admin.from(...)` twice
  is two separate statements, not one transaction. When several rows must
  change together or not at all (reassigning the central store, committing a
  CSV import), write a plpgsql function and call it via `.rpc()` — a single
  function call is one implicit transaction, so an unhandled exception partway
  through rolls back everything the function already did. See
  `admin_set_central_store()` / `admin_import_products()`
  (`20260721140000_admin_phase2.sql`).
- **Admin-only pages**: use `if (profile.role !== "ADMIN") return <AccessDenied />;`,
  not `requireRole()` (which redirects to `/`) — a non-admin hitting the URL
  directly must see an explicit "you don't have access" screen, not a silent
  bounce. `requireRole()` (redirect-based) is still correct inside Server
  Actions, since there's no page to render there.

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

**Login screen redesign + real logo (still phase 1, follow-up).** Rebuilt
`/login` with its own distinct visual treatment per explicit request — see
SPEC.md's "Login route visual treatment" section for the exact colours/radii
and why they must not leak into the rest of the app. Replaced the hand-rolled
placeholder PWA icons with real ones generated from the user-supplied
`public/logo.svg`/`logo.png`: extracted just the mark from the SVG's embedded
raster (see SPEC.md's "Logo asset pipeline"), producing `public/logo-mark.png`
(used in the sidebar — with a CSS `invert` filter, since the mark is solid
black and the sidebar is dark — and on the login page) and regenerated
`public/icons/*` + `app/favicon.ico`. Added `sharp` as a devDependency for
this (image decode/resize/composite — not worth hand-rolling); the pure-PNG-
writer approach from the original phase-1 placeholder icons is gone. Verified
both the login page (desktop 1440×900, mobile 380×800, focus state, no
console errors) and the sidebar (logo renders white on Ink via invert, both
desktop and mobile drawer) with a one-off Playwright screenshot script —
Playwright was installed, used, and then **removed** again since it's not
part of this project's stack, only how this change was verified.

**Login screen "broken" — root cause was the service worker, not the CSS
(still phase 1, follow-up).** User reported the login page rendering totally
unstyled (huge logo, full-width inputs, visible labels) despite the source
matching the previous redesign exactly, and despite a fresh Playwright
context rendering it perfectly. Root cause: `components/RegisterServiceWorker.tsx`
registered `public/sw.js` unconditionally, including in `next dev` — and
`sw.js` caches `style`/`script`/`image`/`font` requests cache-first. In dev,
where assets change on every save and aren't content-hashed the way a
production build's are, that means the browser can get stuck serving whatever
it cached on a session's first load indefinitely, regardless of what the dev
server recompiles afterward — exactly the "looks broken, code looks right"
symptom reported. **Fix**: `RegisterServiceWorker` now only calls `.register()`
when `NODE_ENV === "production"`; in every other environment it actively
unregisters any existing registration and clears all caches instead, so a
browser that already had the old unconditional version installed self-heals
on its next load rather than staying stuck. Confirmed via Playwright: 0 SW
registrations after a fresh dev-mode load, and a simulated pre-existing
registration (1) drops to 0 after one reload with the fixed component.

Separately, verified the diagnostics the user asked for: no `tailwind.config.*`
exists anywhere in the repo (Tailwind v4 is CSS-first — `@import "tailwindcss"`
in `app/globals.css`, no content array to misconfigure), `.gitignore` excludes
nothing under `app/`, and every class used in the login files is a real
Tailwind utility or a valid arbitrary-value class. That pipeline was never the
problem. While rebuilding to the user's exact pixel spec, also caught and
fixed two real (independent) bugs in the previous version: the subtitle used
named scale classes (`text-xl`/`text-2xl`) that resolve through this app's
`@theme` override to the *app-wide* 20/24px scale rather than the 18/22px this
route actually needs, and `leading-tight` (1.25) doesn't equal the requested
`line-height: 1.1`. The rebuilt version uses arbitrary bracket values
everywhere on this route (`text-[22px]`, `leading-[1.1]`, etc.) specifically
to avoid a repeat of that class of mismatch. Verified every requested value
via `getComputedStyle` in Playwright (exact px/color/weight matches at both
1440px and 380px, zero horizontal overflow at 380px) — not just visually.

**Phase 2 — Admin: departments, products, CSV import, users.** Added
`20260721140000_admin_phase2.sql`: no new tables (phase 1's schema already
covered this phase), just a `validate_profile_department` trigger enforcing
"STOREKEEPER must be assigned to the central store" (mirrors the phase-1
`validate_movement` pattern — a plain CHECK can't look up another department's
`is_central_store` flag), plus the two RPC functions described above. Sidebar
gained a new "Administration" group (`lib/nav.ts`) — Departments, Products,
Users, ADMIN-only — and Products moved out of "Stock control" into it.

*Departments* (`/departments`, `/departments/new`, `/departments/[id]`):
list with product/active-user counts, include-inactive toggle, create/edit
form. Reassigning the central store flag shows an inline explanation rather
than a confirm dialog (SPEC.md only asked for an explanation here); deactivate
does require a confirm dialog with live reference counts (products, active
users, movements, count sessions) since SPEC.md asks for that explicitly — the
one place in this phase with a `ConfirmDialog`. Deactivating the department
currently flagged central store is blocked (not in SPEC.md verbatim, but
letting purchases/requisitions lose their destination department seemed worth
guarding against explicitly, matching the phase's "make mistakes visible
before they're saved" brief).

*Products* (`/products`, `/products/new`, `/products/[id]`): server-side
search/filter/pagination (50/page) over the admin client directly in the page
component — chose plain page-based pagination over virtualised scrolling
(SPEC.md offered either); no virtualisation library was already in the
project and 1,000 rows / 50 per page is a non-issue for a normal query.
Duplicate-code rejection looks up the conflicting product first so the error
can name it, rather than parsing a raw unique-constraint error. Bulk "assign
selected to department" lives in the products list's row-selection toolbar.
Product/department assignment (`lib/product-assignments/actions.ts`) is
shared code: the product edit screen ticks departments, the department screen
manages shelf order — same `product_assignments` rows, sliced by a different
foreign key. Shelf-order reordering uses the native HTML5 drag-and-drop API
(desktop only, no new dependency) plus a plain number input that works on any
device — SPEC.md asks for both, and dragging 100 rows on a phone was
explicitly called out as miserable, so touch was never a target for the drag
path.

*CSV import* (`/products/import`, `lib/products/import.ts`): `papaparse`
added as a dependency (RFC4180 edge cases — quoted commas, embedded
newlines — aren't worth hand-rolling, same reasoning as adding `sharp` in
phase 1). Dry run is pure validation, no writes; the commit step calls
`admin_import_products()` via `.rpc()` so the whole import is one transaction.
Only rows that pass validation are written — invalid rows are skipped and
listed with their row number and reason, rather than blocking the entire
file over one bad row. Duplicate codes *within* the file: first occurrence
wins, later ones are flagged as errors. Department names are matched
case-insensitively against departments that already exist; an unrecognised
name is always a row error, never a department created on the fly. CSV export
(`/products/export`, a Route Handler) always leaves `shelf_order` blank on
purpose: a product can sit at a different shelf position in every department
it's assigned to, so one CSV column can't represent all of them, and the
import RPC only overwrites `shelf_order` when a row supplies one — so
export-edit-reimport round-trips without disturbing shelf order. Template
CSV is a static file at `public/templates/product-import-template.csv`.

*Users* (`/users`, `/users/new`, `/users/[id]`): new accounts get a
**temporary password**, generated server-side and shown exactly once in the
UI, rather than an invite email — `supabase/config.toml`'s
`[auth.email.smtp]` block is commented out, so no SMTP provider exists yet in
this project; revisit this decision if/when one is configured. Creating the
auth user and inserting the `profiles` row are two separate calls (Admin API,
then a table insert), so a failed profile insert deletes the just-created auth
user rather than leaving an orphaned login with no profile. Role/department
pairing (ADMIN/AUDITOR: no department; DEPARTMENT_USER: any non-central
department; STOREKEEPER: central store only, fixed in the UI) is validated in
`lib/users/actions.ts` and backed by the new trigger. "Last active admin
cannot be deactivated or demoted" and "an admin cannot change their own role"
are both enforced in `updateUser`/`setUserActive`. Deactivation is enforced by
`getCurrentProfile()` itself: it now signs out and redirects to `/login` with
an error if the signed-in profile's `is_active` is false, which is what
actually cuts off a session created before deactivation (RLS/`is_active`
alone don't stop an already-issued Supabase Auth session from working).

Non-admins hitting any of these routes directly see a dedicated "you don't
have access" screen (`components/AccessDenied.tsx`) instead of a redirect —
see the new Conventions entry above.

Verified end-to-end with a one-off Playwright script (installed, used,
removed — same pattern as phase 1): login, Administration nav placement,
department create + product/shelf-order manager + add-product search,
product search/filter/edit with pre-ticked departments, CSV dry-run preview
(correct create/update counts, correct unknown-department error), CSV commit,
user creation with one-time temp password, and 380px card-reflow layout for
Products/Departments/department-detail all confirmed working; all synthetic
test data (departments/products/users) was deleted afterward.

**Phase 3 — Central store: purchases, requisitions, reversals, business-day
locking.** Added `20260722090000_phase3_movements.sql`: no new tables. New
`movements` columns — `supplier_name`/`invoice_reference` (PURCHASE context),
`is_override`/`override_reason` (insufficient-stock override, flagged for
auditor attention), `reversal_of_movement_id`. Three RPC functions so each
batch/reversal is one transaction: `post_purchase_batch()`,
`post_requisition_batch()` (re-checks every line's availability against
`get_department_balance()` server-side — the client-side check in
`lib/movements/actions.ts` is only there for a fast, friendly error; the RPC
is the actual guarantee against a silent negative balance), and
`post_movement_reversal()`.

**Reversal model** (see SPEC.md for the full writeup): a reversal is an
ordinary movement row with the *same* type/product/from/to as the movement it
reverses — never a flipped direction — tagged `reversal_of_movement_id`. It
deliberately doesn't flip `from_department_id`/`to_department_id`, which would
fight `validate_movement`'s "requisitions only ever run central → non-central"
rule for no benefit. Instead, `get_department_balance()` (redefined in this
migration) nets a reversal's quantity as **negative** in whichever
inbound/outbound branch its original counted in, so it exactly cancels the
original at the original's `business_day` — verified end-to-end with a script
that posted a purchase, a normal requisition, and an over-issued/overridden
requisition, then reversed all three: the central store's Heineken balance
returned to exactly its pre-test value. There is **no** `reversed_by_movement_id`
column — movements are immutable (no UPDATE policy for anyone, still true
after this migration), so the original row is never touched when it's
reversed. Whether a movement has been reversed, and by what, is derived by
looking for a row whose `reversal_of_movement_id` points back at it — the
`movements_detail` view (below) computes this as `reversed_by_movement_id` so
callers never have to. A reversal can't itself be reversed (reverse the
original instead), and a movement already reversed can't be reversed again —
both enforced inside `post_movement_reversal()`, both confirmed by script.

**Business-day locking** is one trigger, `check_business_day_lock()`, on
`movements` — applies to every insert (purchases, requisitions, reversals,
and sales once phase 4 adds that type) rather than being re-implemented per
posting action. Confirmed by script: a requisition against a department with
a `LOCKED` session on or after the chosen `business_day` is rejected naming
the department and the locked date; the identical call one business day later
succeeds.

*Purchases* (`/purchases`): supplier name, optional invoice/delivery-note
reference, business day. Product search is restricted to active products
**assigned to the central store** — not stated verbatim in SPEC.md, but a
direct consequence of the hard "balance queries always go through
`get_department_balance`, never hand-roll a movement sum" rule: that function
only returns rows for assigned products, so an unassigned product would have
no "current quantity" context to show. In practice the central store should
be assigned to everything it can stock, so this is rarely a real restriction.

*Requisitions* (`/requisitions`, replacing the phase-1 placeholder): business
day, destination department (central store excluded from the list), received
by (a required `Select` of active `DEPARTMENT_USER` profiles at the chosen
department — the schema's `received_by uuid references profiles(id)` means
this has to be an actual account, not free text; if a department has no user
yet the form says so and the post button stays disabled). Product search
restricted to products assigned to the destination; searching an unassigned
product shows a plain explanation and a link to that product's assignment
screen instead of a quantity field. An over-issue is blocked by default with
the exact shortfall shown; entering a reason reveals an "Add anyway" path
that posts the line with `is_override = true` and flags it.

*Both entry screens* use a Sales-style staged batch (search → add → repeat →
one post), not the prototype's literal one-line-at-a-time "Record
requisition" button — asked and confirmed: the phase brief explicitly
describes the batch/add/remove/post-once pattern, which is also what makes
"all lines or none" a real transactional guarantee via the RPCs above. Adding
a product already in the batch increases its quantity rather than creating a
duplicate line, so there's never more than one row per product and no
cross-line balance bookkeeping is needed.

*Movements* (`/movements`, new nav item — `lib/nav.ts`, visible to all four
roles): filter by type/department/business-day range/product, search by
code or name, override-only toggle, 50-row server-side pagination, CSV
export of the current filter (Route Handler, capped at 20,000 rows), and a
detail page per movement (`/movements/[id]`) showing the full record plus
either "reverses ↔" or "reversed by ↔" links when applicable. Backed by a
new `movements_detail` view joining products/departments/profiles and
deriving `reversed_by_movement_id` — carries no RLS of its own since, like
every other list in this app, it's only ever queried through the service-role
admin client. STOREKEEPER/DEPARTMENT_USER are scoped to movements touching
their own department (mirrors the existing `movements_select` RLS policy);
ADMIN/AUDITOR see everything. The department filter, the "flagged for
review" override-count stat, and CSV export's row cap are all hidden/absent
for the scoped roles rather than shown-but-empty. Reversal can only be
triggered by ADMIN/STOREKEEPER, and only on a movement that is itself neither
a reversal nor already reversed — the button doesn't render otherwise.

The dashboard's "flagged for review" stat (ADMIN/AUDITOR only) is the one
live figure on that otherwise-still-hardcoded phase-1 dashboard — a deliberate,
narrow exception, confirmed rather than assumed, since SPEC.md explicitly asks
for the auditor to see this count somewhere and the movements list this phase
builds is the only real data this phase produces.

Verified with a one-off Playwright + direct-RPC script (installed, used,
removed): purchase batch posted and central store balance increased by
exactly the batch total; a normal requisition line and an over-issued,
overridden line both posted, with the override visible and filterable on
`/movements`; a movement reversed from its detail page, redirecting to the
new reversal's own detail page; business-day locking blocking a locked-date
post and allowing the identical post one day later; double-reversal and
reverse-a-reversal both rejected with clear messages; 380px layouts on
Purchases/Requisitions/Movements confirmed with no horizontal overflow. All
test movements were **reversed** (never deleted — see the reversal model
above) and the one synthetic test user was deleted, restoring the seed data's
balances to their original values, confirmed by re-reading
`get_department_balance` before and after.

**Phase 4 — Sales entry: searchable batch, zero-sales handling, draft
batches, corrections, sales history.** Added
`20260722150000_phase4_sales.sql`: one new table, `sale_drafts` (department_id,
business_day, created_by, a `lines` jsonb array shaped exactly like the batch
UI's in-memory state, unique on the three key columns) — deliberately not a
`movements`-style immutable row, since a draft has no accounting effect and
must be freely updatable/deletable. One new RPC, `post_sales_batch()`, the
same "one call, one transaction" pattern as phase 3's batch functions: loops
every line, and for a **correction** line (one carrying a
`correction_of_movement_id`) reverses the existing sale first — inline,
same shape as `post_movement_reversal` — then, only if the corrected quantity
is greater than zero, inserts the new `SALE`. A line with no correction
re-checks server-side that nothing's already been posted for that product/
department/business-day (the client-side check at add-to-batch time is just
the friendly early warning, same relationship as the requisition over-issue
check in phase 3). See SPEC.md's new "Zero-sales convention" section for why
a quantity-zero line — explicit or by omission — never becomes a movement
row, and its "Draft batch behaviour" section for the persistence model.

Confirmed before building, since they either touched existing project
decisions or weren't specified in the prototype (SPEC.md's new "Phase 4 scope
decisions" section has the full reasoning): granting STOREKEEPER access to
Sales entry (phase 3's nav table had scoped it to ADMIN/DEPARTMENT_USER
only); a new `/sales/history` route and nav item rather than a tab on
`/sales` or folding into the existing `/movements` list; and making
`post_sales_batch` handle a correction's reversal-and-replace as one atomic
step per line, all inside the same transaction as the rest of the batch,
rather than firing the reversal immediately when "Reverse & correct" is
chosen.

*Sales entry* (`/sales`, replacing the phase-1 placeholder): business day
defaulting to **yesterday** (SPEC.md is explicit that defaulting to today
invites off-by-one phantom variances the next morning), department fixed for
DEPARTMENT_USER and a `Select` of active non-central departments for ADMIN/
STOREKEEPER, product search restricted to the selected department's
assignments (same restricted-search pattern as Purchases/Requisitions —
`get_department_balance` only has context for assigned products). Add-sale
shows opening/received for the business day; quantity accepts zero
(`inputMode="numeric"`, integer, `>= 0`); a product already staged in the
current batch can't be re-added (shown "already in this batch, remove it
below" instead) since — unlike Purchases/Requisitions, where re-searching a
product in the batch increases its quantity — a sale is one closing figure
per product per day, not an additive movement. Picking a product with a
live (non-reversed) sale already posted for that business day surfaces it
immediately with **Skip** / **Reverse & correct**; the latter reveals a
mandatory reason field alongside the quantity input, and the resulting line
is flagged `Correction` in the batch table. Oversell (quantity greater than
opening + received) is blocked with the exact maximum stated, same
override-with-reason-required pattern as the phase-3 requisition over-issue,
flagging the line `Override`. Before posting, a summary line states how many
of the department's assigned products are in the batch versus how many will
be posted as zero sales for the day, with the zero count clickable to expand
the full list of untouched products (code + name) — never a silently
assumed number.

*Draft batches*: persisted via `getSalesDraft`/`saveSalesDraft`/
`clearSalesDraft` in `lib/sales/actions.ts`, saved after every add/remove
once the initial restore attempt for the current (department, business day)
pair has resolved — guarded by a `draftLoaded` flag so the persist effect
never fires with an empty array before the restore fetch completes, which
would otherwise silently wipe a real draft on mount. Restoring shows "An
unposted draft for X on Y was restored below"; "Clear batch" deletes the
draft row outright, not just the in-memory lines; posting clears the draft
as `postSalesBatch`'s last step.

*Sales history* (`/sales/history`): a filtered read of the same
`movements_detail` view phase 3 built (`type = 'SALE'`), not a new view —
business day range, department (ADMIN/AUDITOR/STOREKEEPER only; DEPARTMENT_USER
is scoped to their own department via `from_department_id`, same mechanism as
`/movements`'s existing scoping, since a `SALE` only ever has a `from` side),
product search, 50-row server-side pagination, CSV export (Route Handler,
same 20,000-row cap as `/movements`'s export), override/reversal/reversed
visually distinguished with the same `Tag` variants as `/movements`. AUDITOR
can reach this page and see every department but has no posting action
anywhere in `lib/sales/actions.ts` — auditors record counts, not stock
movements, per SPEC.md's role table.

Verified with a one-off Playwright script (installed, used, removed, same
pattern as prior phases) plus direct RPC/table checks: a batch with a normal
line, an explicit zero line, and the zero-sales summary/expand-list all
behaved correctly; picking an already-posted product surfaced the Skip/
Reverse & correct choice, and a correction posted as one reversal + one new
`SALE` in a single transaction; an oversell was blocked with the stated
maximum and posted successfully once overridden with a reason, flagged
`Override` on `/sales/history`; a draft survived a full page reload once the
department was reselected (draft restore is keyed on department + business
day, neither of which persists across a reload for ADMIN/STOREKEEPER, by
design — reselecting the same pair restores it); 380px and 768px layouts on
both Sales entry and Sales history confirmed with no horizontal overflow,
stacked-card reflow on mobile. All test movements were **reversed** (the
Heineken correction's reversal was itself un-reversible per the phase-3
model, so restoring its exact original figure took one further plain
re-insert of the same quantity — documented inline in the cleanup script,
not a new pattern) and all test drafts deleted, confirmed back to the
pre-test balances via `get_department_balance` before and after.
