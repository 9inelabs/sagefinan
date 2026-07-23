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

**Phase 5 — Stock count and variance comparison.** Added
`20260723090000_phase5_counts.sql`: no new tables (`count_sessions`/
`count_lines`/`adjustments` already existed from phase 1), one new column
(`count_sessions.updated_at`, bumped by autosave and by finishing — a
reload-proof "draft saved HH:MM" badge) and three RPCs, each a multi-row
atomic write per the Conventions above:

- `start_or_open_count_session(department_id, as_at_date, counted_by)` —
  creates the session row and snapshots every active assigned product as a
  `count_line` (in one transaction, so a session can never end up with a
  partial product snapshot), or returns the existing session untouched if
  one already exists for that (department, date) pair, per the unique
  constraint. Products assigned after this call never retroactively appear.
- `finish_count_session(session_id, zero_fill_blanks)` — optionally
  zero-fills remaining blanks (re-checked server-side, never trusting that
  the client's blank-list prompt actually happened), then computes and
  freezes `expected_qty` for every line from `get_department_balance`, then
  flips status to `COMPLETED`. `expected_qty = closing_qty` — no branching
  on `is_central_store` needed, since that function's inbound/outbound
  convention already generalizes both department shapes into one closing
  figure (see SPEC.md).
- `record_count_adjustment(count_line_id, new_qty, reason, created_by)` — the
  "correcting a miscount" path: inserts an `adjustments` row and updates
  `count_lines.physical_qty` together (an adjustment recorded with no
  matching change, or vice versa, breaks the "demonstrable, not asserted"
  guarantee this exists for). Blocked once a session is `LOCKED`; blocked
  before a session is `COMPLETED` (nothing to correct yet). `expected_qty` is
  never touched by this function.

Also added a read-model view, `count_sessions_summary` (joins
department/counted-by names, aggregates product/counted/variance counts and
variance value), with `variance_count`/`variance_value` forced to `null`
while a session is `DRAFT` — before `finish_count_session` runs,
`expected_qty` is still every line's `0` placeholder default, so a
"variance" computed against it would be meaningless noise, not a real
figure, even off the counting screen itself.

**Blind counting** (SPEC.md) is enforced structurally, not by convention: the
take-stock screen's server actions
(`getCountLinesForCounting`/`saveCountEntries` in `lib/counts/actions.ts`)
select an explicit column list that omits `expected_qty` entirely — it is
never fetched by that code path, so there's nothing to accidentally render
or leak into the page source, a network response, or client-side state.
`getCompareData` is the *only* function in the codebase that ever selects
`expected_qty`, and it refuses to run until a session is `COMPLETED`/
`LOCKED`. Verified with a temporary Playwright script that captured every
network response body during an active DRAFT count and asserted neither
`expected_qty` nor `expectedQty` ever appeared in any of them.

Three routes, one nav addition (`lib/nav.ts` — new "Sessions" item, ADMIN/
AUDITOR, confirmed before building rather than folding this into the
existing phase-7-reserved `/history` placeholder):

- **Take stock** (`/count` picker → `/count/[id]`): the picker chooses a
  department (every active department, **including the central store** —
  unlike Purchases/Requisitions/Sales, the central store is itself counted,
  per SPEC.md's central-store expected-quantity formula) and an as-at date
  (defaulting to yesterday, `lib/dates.ts`'s shared `yesterdayIso()`, now
  also used by Sales entry), then calls `start_or_open_count_session` and
  routes into the session — to `/count/[id]` if `DRAFT`, straight to
  `/compare/[id]` if already finished. `/count/[id]` is a phone-first,
  shelf-ordered list (`CountRow` — 48px `inputmode="numeric"` inputs, filled
  vs. empty visually distinct, blank strictly `null` not `0`) with a search
  box, a live "N of M counted" progress bar, and debounced autosave
  (`useLineEntries` hook, shared with Ledger record below) that tracks only
  the products dirtied since the last successful save, so a slow response
  never drops a keystroke and a save-in-flight never blocks further typing.
  Finishing checks for blanks client-side first (the same data already held
  for autosave) and, if any remain, opens a dialog listing them with a
  choice — go back and count them, or record them all as zero — never
  assuming either way; the server-side RPC re-checks regardless.
- **Ledger record**: built as a second tab on the same take-stock screen
  (confirmed before building, rather than a link off the Compare screen),
  gated disabled until the session is `COMPLETED` and read-only once
  `LOCKED`. Same shelf-ordered list and input pattern, recording
  `ledger_qty` instead of `physical_qty` via the same autosave hook. Both
  tabs stay mounted once visited (hidden via CSS, not unmounted) specifically
  so switching tabs never discards an in-progress edit or forces a re-fetch
  that could show a stale figure.
- **Compare stock** (`/compare` landing → `/compare/[id]`): the landing page
  lists sessions with status `COMPLETED`/`LOCKED` (query on
  `count_sessions_summary`); a `DRAFT` session visited directly redirects to
  `/count/[id]` instead, since there's nothing to compare yet. The variance
  table hides fully-tallying rows by default (toggle to show all), sortable
  by shelf order/value/quantity, and computes two **independent** flags per
  line rather than one collapsed "variance" concept, per SPEC.md's
  three-figure case: a primary flag (`short`/`excess`/none) from counted vs.
  expected, and a separate `bookDiffers` flag whenever a recorded ledger
  figure disagrees with expected — shown *alongside* a primary flag on the
  rarer three-way mismatch, not merged into it. Correcting a count from this
  screen (`correctCountEntry` → `record_count_adjustment`) recalculates the
  variance immediately client-side and never touches the frozen
  `expected_qty`. CSV export (`/compare/[id]/export`, same Route Handler
  pattern as every other export in the app) respects the same show-all
  toggle via a query param.
- **Sessions** (`/sessions`, new nav item): the full filterable index
  (department, as-at date range, status) over `count_sessions_summary` that
  phase 5's brief calls for — confirmed before building as its own new route
  rather than pulled forward into the existing `/history` placeholder, which
  stays reserved for phase 7's richer reports/exports. Each row's date links
  to `/count/[id]` (`DRAFT`) or `/compare/[id]` (otherwise).

**Frozen expected** (SPEC.md): `expected_qty` is written exactly once, inside
`finish_count_session`, and nothing else in the codebase ever updates it —
verified end-to-end with a script that posted a new requisition on a count's
already-counted business day *after* finishing, confirmed
`get_department_balance` recomputed to reflect it (a real, live change), and
confirmed both the session's stored `expected_qty` and the Compare screen
(after a reload) still showed the old, frozen figure.

No virtualisation library was added for the 150-item count list (a
phase-2-style decision, confirmed by measurement rather than assumed): each
`CountRow` is `React.memo`'d and receives only primitive props plus one
`onChange` reference that never changes (`useCallback` with an empty
dependency array, functional `setState` inside), so a keystroke on one row
only re-renders that row regardless of list length.

Verified with two temporary Playwright scripts (installed, used, removed,
same pattern as prior phases) against the seeded Bar and Kitchen departments,
plus direct RPC/table checks: blind counting (no `expected_qty` in any
network response during an active count); autosave surviving a full page
reload; the blank-entries dialog appearing and correctly blocking finish on
Cancel, then zero-filling and finishing on confirm; a deliberate one-bottle
undercount showing a `Short` tag and a deliberate ledger mismatch showing a
`Book differs` tag on the Compare screen; the frozen-expected guarantee
above; a correction writing an `adjustments` row with the right previous/new
quantities and reason while leaving `expected_qty` untouched; and the new
session appearing correctly in `/sessions`. All test movements were
**reversed** and all test count sessions **deleted outright** (unlike
movements, count sessions carry no immutability requirement, so hard-deleting
throwaway test sessions was the correct cleanup rather than leaving audit
clutter in a real department's session history), confirmed back to
pre-test balances via `get_department_balance` before and after.

**Phase 6 — Reconciliation, reason codes and session locking.** Added
`20260723150000_phase6_reconcile.sql`. The phase-1 `reason_code` enum is
retired: "add a code, retire a code, never delete a used code" (SPEC.md)
can't be built on a Postgres enum — values can be added but never removed,
and there's no per-value active flag — so it's replaced by a managed lookup
table, `reason_codes` (code, label, `applies_to` — `VARIANCE`/`BOOK_DIFF`/
`BOTH` — `requires_note`, `is_active`), seeded with the eight codes SPEC.md
lists. `count_lines.reason_code` becomes `reason_code_id` (FK), plus a fully
parallel set of columns — `book_diff_reason_code_id`/`book_diff_note` — for
the **independent** "book differs" case: a line can need both a physical-
variance reason and a book-difference reason at once (the three-way-mismatch
case from phase 5), and they're never conflated. `reason_set_by`/
`reason_set_at` (and the book-diff equivalents) exist purely so the audit
trail below can show "reason attached, by whom, when" as a real event rather
than inferring it from nothing — count_lines had no such timestamp before.
`count_sessions` gains `finished_at`/`finished_by` (same reasoning —
`updated_at` is bumped by autosave too, so it can't stand in for "finished")
and `locked_by` (`locked_at` already existed from phase 1).

**Locking preconditions**, re-validated entirely inside `lock_count_session()`
— never trusting that the client's own progress check actually ran (CLAUDE.md's
quality bar): every count line whose `variance <> 0` needs a `reason_code_id`,
and every line whose `ledger_qty` disagrees with `expected_qty` needs a
`book_diff_reason_code_id` — both independently — and if the chosen code has
`requires_note` (true only for `OTHER`, seeded that way, but any future
admin-added code can opt in), a blank note fails the same check. `select ...
for update` takes a row lock on the session for the transaction's duration,
so two concurrent lock attempts on the same session serialise instead of
double-locking — confirmed by script (second call sees `status = 'LOCKED'`
and is rejected cleanly, not racily).

**Freezing on lock** is enforced at the trigger level, not just by the app
never calling update: `count_lines_lock_guard` (before update on
`count_lines`) raises if the parent session's status is `LOCKED`, so figures,
reasons and notes are all frozen the instant a session locks, regardless of
what calls the table afterwards — same reasoning as phase 3's
`check_business_day_lock`. Business-day locking itself needed **no new
code** this phase: that trigger already fires on every `movements` insert
whenever a `LOCKED` session's `as_at_date` covers the movement's
`business_day`, so the moment `lock_count_session` flips a session to
`LOCKED`, phase 3's existing enforcement applies to it automatically —
confirmed by script (a `SALE` insert dated on the locked day is rejected with
the same message phase 3 introduced).

**Post-lock adjustments** are genuinely append-only, not "an update that's
labelled a correction": `record_post_lock_adjustment()` only ever inserts
into `adjustments` — it never writes to `count_lines` (which the lock guard
trigger would reject anyway, defence in depth). `previous_qty` on a new
adjustment is the most recent *effective* figure — the certified
`physical_qty` if this is the line's first adjustment since locking,
otherwise the prior adjustment's own `new_qty` — so a chain of adjustments
reads as one coherent chronological ledger sitting *alongside* the untouched
original, never replacing it. Confirmed by script: two successive post-lock
adjustments on the same line chain `5 → 6` then `6 → 7`, and `count_lines
.physical_qty` reads `5` throughout, before and after both.

**Access** (SPEC.md): `count_lines_select` RLS is tightened from phase 1's
"admin/auditor see everything, everyone else sees their own department's
rows" down to admin/auditor only — DEPARTMENT_USER/STOREKEEPER may not see
reconciliation, reasons or variance values *at all*, not even as a
defence-in-depth RLS branch nobody's UI actually exercises. `count_sessions`
keeps its phase-1 "own department" branch (session existence/status alone
isn't the sensitive part). Reason-code add/retire is ADMIN-only
(`lib/reason-codes/actions.ts`); reconcile/lock/post-lock-adjustment is
ADMIN/AUDITOR (`lib/reconcile/actions.ts`), both via `requireRole` in every
server action, never inferred from a hidden button.

*Reason codes admin*: folded into the existing Products page
(`/products/reason-codes`, linked from its toolbar) rather than a new
top-level nav item — confirmed before building. Retiring sets `is_active =
false`; there's no delete action anywhere in the codebase for this table, so
"never delete a used code" holds by construction, not by a runtime check.

*Reconcile screen* (`/reconcile` landing → `/reconcile/[id]`, mirroring the
Compare/Sessions landing-then-detail pattern): lists every non-tallying line
(physical variance or book-differs, independently) with single-select reason
chips (44px minimum touch target — `components/ui/Chip.tsx`, a new component
since the prototype's own chip is a ~30px pill) and an optional note beneath,
a live "N of M reconciled" progress count, and a persistent "what locking
does" side card matching the prototype's copy. Book-differs lines are
visually and structurally separate from physical-variance lines on the same
row — their own heading ("a posting discrepancy, not a physical loss"), their
own narrower chip set (`applies_to` excludes `BREAKAGE`/`SPILLAGE`/
`UNRECORDED_SALE`/`EXPIRED_DAMAGED`, which make no sense as a bookkeeping
explanation), their own note field. Correcting a miscount reuses phase 5's
`correctCountEntry`/`record_count_adjustment` unchanged (a pre-lock line that
now tallies drops out of the list, per SPEC.md); once `LOCKED`, the same
button is replaced by "Raise adjustment", and each line shows its certified
figure plus every adjustment since, in order. The lock button is disabled
client-side whenever any line is unreasoned, with the outstanding products
named inline — the server-side re-validation is the actual guarantee, this
is just the friendly early warning. Locking pops a `ConfirmDialog` stating
the three consequences from SPEC.md verbatim (permanent, business-day lock,
adjustments append) before calling `lockCountSession`.

*Audit trail*: a second tab on the same `/reconcile/[id]` screen (folded in
rather than a new route, same reasoning as phase 5's ledger-record tab) —
`getSessionAuditTrail()` synthesizes one chronological event list from
`count_sessions` (created/finished/locked), each `count_lines` reason
attachment, and every `adjustments` row (tagged pre-lock vs. post-lock by
comparing its timestamp to `locked_at`, since there's no separate column for
that distinction — see the append-only model above). Session/reason-attach/
lock mutations call `router.refresh()` after their local state update so this
tab's otherwise-static server-fetched prop picks up the new event without a
manual reload; `lines`/`status`/etc. stay on locally-tracked `useState` and
are unaffected by the refresh (a client component's state isn't reset by a
parent server re-render with new props) — caught by the first UI verification
pass, where the audit tab showed a stale pre-lock snapshot until this was
added.

*Reporting* (folded into `/reconcile` rather than new top-level nav items,
confirmed before building): `/reconcile/reports` (variance-by-reason and
book-diff-by-reason, both filterable by department/date-range, both
CSV-exportable) and `/reconcile/investigation` (every line anywhere still
carrying the `UNDER_INVESTIGATION` code, locked or not, department-
filterable, CSV-exportable). Both are plain aggregation queries in
`lib/reconcile/actions.ts`, not new database views — single-consumer, no
other screen needs them, matching the phase-2/5 precedent of not reaching for
a new abstraction without a second caller. The variance-by-reason report
sums signed variance/value per code (so a net loss reads as negative,
matching the sign convention already used on Compare/Sessions); book-diff
rows report a line count and quantity only, value left as `null`/"—" — the
same "no fabricated currency figure for a posting discrepancy" rule phase 5
established for the Compare screen's own Book differs case.

Verified with a direct RPC/table script (installed nothing — plain
`@supabase/supabase-js` already a dependency — run, then its test session/
lines/adjustments deleted): lock blocked while unreasoned, succeeds once
reasoned, double-lock rejected, a direct `count_lines` update rejected once
locked, a `SALE` on the locked business day rejected, a post-lock adjustment
chain (`5→6→7`) recorded while `physical_qty` stayed `5` throughout. Plus a
temporary Playwright script (installed, used, removed, same pattern as prior
phases) against the dev server: reason-codes admin page lists the 8 seeded
codes; the Reconcile screen's lock button disables/enables correctly, the
lock confirm dialog states its consequences, a post-lock adjustment renders
alongside the untouched certified figure, the audit trail lists every event
in order, both report pages render, and 380px shows zero horizontal overflow.

**Dashboard wired to live data (follow-up, no phase number).** The phase-1
dashboard (`app/(app)/page.tsx`) was, by design at the time (see its own
now-removed header comment), a verbatim reproduction of
`design/ui-draft.html`'s sample figures — Heineken/Chivas/Bar/Kitchen numbers,
a hardcoded "Tuesday, 21 July 2026" subtitle, a non-functional "Start count"
button — deferred to phases 5-7 per the phase-1 scope decision. With phases
5/6 now built and real accounts/departments going in, every one of those was
replaced with a live query in a new `lib/dashboard/actions.ts`
(`getDashboardData()`): the five header stats, the per-department "Today's
counts" table, the "Stock ledger" summary (`get_department_balance` summed
per active department for the business day — the same function every other
balance figure in the app goes through), "Repeat variances" (products/
departments with more than one variance in the last 30 days of finished
sessions — a single occurrence isn't a "repeat"), and "Movements today" (the
`movements_detail` view, most recent 8). Blind counting's structural
guarantee extends here too: for a `DRAFT` session the dashboard's own query
selects `physical_qty` only and never touches `expected_qty`, matching
`lib/counts/actions.ts`'s existing convention — a session mid-count shows
counted-so-far but "—" for variance/value until it's finished. Empty
tables/lists render a proper `EmptyState` ("No departments yet", "No repeat
variances", "No movements yet") rather than a blank gap; the per-department
table always renders one row per active department regardless (with "—" for
whatever hasn't happened yet), which is what makes an empty database look
intentionally clean rather than broken. `lib/dates.ts` gained
`formatLongDate`/`formatWeekdayDate`/`todayIso` for the header's two dates
(today vs. the business day being reported as-at).

A repo-wide grep for the same class of problem (prototype names, ₦ amounts,
"Musa I."/"Grace O." etc.) turned up nothing else — every other screen
already queries live data; `/ledger` and `/history` are still honest
`PlaceholderNotice` phase-7 placeholders, not fake data.

Separately: the sidebar's name/role/department (`components/app-shell/
Sidebar.tsx`) was already reading live from the signed-in profile — it was
never hardcoded. The "Daniel A." previously seen was the seed script's own
`full_name` value for the admin account, correctly rendered; fixing it was a
data change (`profiles.full_name`), not a code change.

Verified with a temporary Playwright script (installed, used, removed, same
pattern as every prior phase): logged in as both real accounts against the
now-populated-with-real-departments, zero-products/zero-movements database
and asserted none of ~10 known prototype strings/figures appear anywhere on
the dashboard, every list/table shows its correct empty state or real
(zero) figures, the sidebar shows "Franklyn Raymond" for both accounts, and
380px renders with no horizontal overflow.

**Opening balances (brought forward from the phase 8 plan, no phase
number).** Two migrations — `20260724090000_opening_balance_enum.sql` (just
`alter type movement_type add value 'OPENING'`, its own migration since
Postgres forbids using a freshly-added enum value inside the transaction
that added it) and `20260724090100_opening_balances.sql` (everything else).

**Decision** (documented in SPEC.md): opening stock is a distinct movement
type, `OPENING`, not a flagged `PURCHASE` or a side column. Reusing
`PURCHASE` would be wrong twice over — `validate_movement` restricts it to
the central store, and a real purchase has a supplier, which an opening
snapshot doesn't have. `OPENING` is one-sided like `PURCHASE`
(`from_department_id` null, `to_department_id` = the department) but,
unlike `PURCHASE`, valid for **any** department including the central
store — `validate_movement` has no restriction for it at all. This keeps
opening stock identifiable/reportable on its own terms (filterable on
`/movements`, its own row in every CSV export) while reusing every bit of
existing movement machinery — immutability, reversal, business-day locking
— for free.

**Balance function.** `get_department_balance()` folds `OPENING` movements
into `opening_qty` for every date **on or after** their own `business_day`
(`<=`), never into `received_qty` — every other inbound type keeps the
existing rule (strictly-earlier dates count toward opening, the exact day
counts toward received). This is what makes "opening and closing both read
exactly what I entered, as at the date I chose" literally true on the
opening date itself: without the `<=` split, an opening balance dated today
would show as a receipt today and 0 opening. A reversal of an `OPENING`
movement shares its type, so it automatically gets the same treatment and
nets out correctly for every date at/after the reversal's own business day.
Verified with a throwaway RPC script before building any UI: opening_qty
and closing_qty both read exactly the entered figure on the opening date,
0 before it, carried forward correctly after it, and the same mechanism
worked identically for the central store (no branching needed — the
function's existing to/from-department-id convention already generalizes
it, exactly as SPEC.md's core accounting rule promises).

**Duplicates.** At most one *live* `OPENING` movement per (department,
product) at a time — "live" meaning neither itself a reversal nor yet
reversed. Replacing one reuses `post_movement_reversal()` (already generic
across every movement type) to cancel the old entry, then inserts the new
one, both in the same `post_opening_balances()` transaction — never two
live entries stacked. A quantity of 0 follows phase 4's zero-sales
convention exactly: `movements.quantity` can't store a 0 row anyway, so no
movement is written for it; a replace-with-0 reverses the old entry and
writes no replacement, leaving the product reading 0 — indistinguishable
afterwards from "never set," an accepted consequence, same as zero-sales.

**Two entry points**, both admin-only, both funnelling into
`post_opening_balances()` for the one-transaction guarantee:

- **On-screen form** (`/opening-balances`): pick a department (every active
  one, including the central store — same reasoning as phase 5's Take
  Stock picker), pick an as-at date, then a shelf-ordered product list
  (`OpeningBalanceRow` — a close cousin of phase 5's `CountRow`) prefilled
  with each product's current live opening quantity. A stat tile shows how
  many products still have none. Only *changed* rows are submitted — a
  save that re-submits an unchanged prefilled value is correctly treated
  as a no-op, not a replace. If any changed row has an existing value, a
  single `ConfirmDialog` names the count before saving ("make me choose:
  skip or replace" is satisfied by the prefill itself: leaving a value
  untouched **is** skip, changing it **is** replace — no per-row prompt
  needed for a form the admin can see in full before submitting).
- **CSV import** (`/opening-balances/import`, format `department, code,
  name, opening_qty, as_at_date`): same dry-run-then-confirm shape as
  phase 2's product importer. Validates department exists, product exists
  and is assigned to that department (unassigned is a row error naming the
  fix, same as CLAUDE.md's existing "restricted search" reasoning), a
  non-negative integer quantity, a valid date, and — a friendlier
  preview-time echo of what `check_business_day_lock` would reject anyway
  — that the department has no `LOCKED` session covering that date.
  Duplicate department+code pairs *within* the file are rejected (first
  wins), matching the product importer's convention. Rows whose
  department+product already has a live opening balance are flagged
  "already set"; whether to replace them is one checkbox for the whole
  file (impractical to prompt per-row on a file that can carry hundreds of
  rows), not a per-row choice — confirmed as the pragmatic reading of
  "make me choose" for a bulk path. Template at
  `public/templates/opening-balance-import-template.csv`; export
  (`/opening-balances/export`) lists every current live opening balance.

**Movements UI**: `/movements`' type filter, list, CSV export, and detail
page all gained "Opening balance" alongside Purchase/Requisition/Sale — no
export-route changes needed (the CSV `type` column is already the raw enum
value), just label maps. Reversing an `OPENING` entry from a movement's
detail page is restricted to ADMIN (STOREKEEPER can still reverse
PURCHASE/REQUISITION there, unchanged) — consistent with opening balances
being an admin-only concern everywhere else. The dashboard's "Movements
today" feed and its live Stock ledger summary (both built the session
before this one) needed one label/branch each and otherwise picked up
`OPENING` automatically, since both already go through
`get_department_balance`/`movements_detail`.

Verified end-to-end: a throwaway RPC script (create → check on/before/after
the opening date → replace → replace-with-zero → confirm exactly one live
row throughout), then a temporary Playwright script (installed, used,
removed) against VIP Bar with real data — entered two products' opening
balances via the actual form, confirmed `get_department_balance` reads
back exactly what was entered as both opening and closing on that date, an
untouched product still reads exactly 0, the movements are identifiable as
`OPENING` and one-sided, "Opening balance" appears as a real filter option
on `/movements`, the import wizard describes its CSV columns correctly,
and 380px renders with no horizontal overflow. All test movements were
**reversed**, never deleted (the one exception: the very first throwaway
check, on a fabricated 2026-01-01 date no real session will ever touch,
was hard-deleted rather than reversed, since reversing would have left six
permanent noise rows for a date that was never real business activity in
the first place — every subsequent check, including the VIP Bar one, was
reversed per the established convention).

Note: SPEC.md's phase-8 plan mentioned a full "Stock ledger" screen
(per-product opening/received/issued/closing with search/pagination/CSV
export) as part of phase 7, still unbuilt (`/ledger` is still an honest
`PlaceholderNotice`). This work verified the underlying figures directly
(`get_department_balance`) and via the dashboard's live per-department
ledger summary rather than that not-yet-built screen — building the full
`/ledger` screen itself was out of scope for "bring the opening-balance
piece forward" and wasn't attempted.
