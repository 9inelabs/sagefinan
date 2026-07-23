# Sagefinan — Specification

A daily stock audit app for a hotel, replacing a paper process. An auditor
physically counts stock in each department every morning and compares it
against what the records say it should be. Responsive web app (Android,
iPhone, Windows desktop) from one codebase, installable as a PWA, requires an
internet connection (no offline data strategy).

The authoritative design reference is [`design/ui-draft.html`](design/ui-draft.html) —
a clickable static prototype. When in doubt about layout, spacing, colour, or
copy, match that file, not this document's prose.

## Core accounting rule

Every department has a running balance per product, always in **bottles** as
the single unit throughout the system (even for products that aren't
literally bottles — bottles is the system's unit of account).

- **Central store**: closing = opening + purchases − requisitions out
- **All other departments**: closing = opening + requisitions in − sales

## Movements are the single source of truth

There is no stored "current quantity" column anywhere. Stock levels are always
computed by summing movement records up to a business day. Three types:

- `PURCHASE` — supplier into central store (`to_department_id` = central store, `from_department_id` = null)
- `REQUISITION` — central store to another department, **one record carrying
  both sides** (`from_department_id` and `to_department_id` both set) — never
  two separate records, so the two sides cannot drift apart
- `SALE` — out of a department (`from_department_id` set, `to_department_id` = null)

The generic rule that makes one balance function correct for every department
without branching on `is_central_store`: `to_department_id` is only ever set
for the side that *receives* stock, `from_department_id` only for the side
that *gives up* stock. So "inbound" = sum where `to_department_id` = this
department, "outbound" = sum where `from_department_id` = this department —
for the central store that's purchases/requisitions-out, for everyone else
it's requisitions-in/sales, automatically.

## Business day

Every movement carries a `business_day` date, separate from its creation
timestamp (`created_at`). Counts are always computed "as at close of business
on date X", never "as of right now". A requisition entered at 7:50am today
must not affect a count that is as-at yesterday's close. `business_day`
defaults to today but is an explicit, user-set field.

## Roles

One role per user (`profiles.role`):

- `ADMIN` — users, departments, products
- `STOREKEEPER` — purchases and requisitions (scoped to their department, in
  practice the central store)
- `DEPARTMENT_USER` — sales for their assigned department
- `AUDITOR` — counts, variances, reconciliation

Auditor and admin see all departments; storekeeper and department_user see
only their own — enforced by a `department_id` on their profile that's
required for those two roles (`profiles_department_required_for_scoped_roles`
check constraint) and null for admin/auditor.

## Scale

~1,000 products across ~8 departments, each stocking 50–150 products. Central
store is a department flagged `is_central_store` (at most one such department,
enforced by a partial unique index).

## Stack

- Next.js 15 (App Router), TypeScript, Tailwind CSS v4
- Supabase: Postgres, Auth, Storage
- Plain SQL migrations in `supabase/migrations/` — no ORM (Prisma etc.)
- Types generated with `supabase gen types typescript --linked`
- Deploy target: Vercel (later phase)

## Data access pattern

All real database access happens server-side in Next.js Server Actions using
the **service role key** (`lib/supabase/admin.ts`), with explicit role and
permission checks written in application code before every privileged
operation. RLS is enabled on every table with restrictive policies as defence
in depth, in case the anon/authenticated key is ever used directly. The
browser only ever receives the anon key (via `lib/supabase/client.ts`), used
for auth/session only.

## Schema (supabase/migrations/20260721121600_initial_schema.sql)

- `profiles` — id (= auth.users id), full_name, role, department_id (nullable
  for admin/auditor, required for storekeeper/department_user), is_active
- `departments` — id, name (unique), is_central_store (at most one true),
  is_active
- `products` — id, code (unique), name, unit_cost, is_active
- `product_assignments` — department_id, product_id, shelf_order (unique on
  the pair) — shelf_order is what makes counting fast: the list appears in
  the order you physically walk the store
- `movements` — id, business_day, type, product_id, from_department_id
  (nullable), to_department_id (nullable), quantity (> 0), note, created_by,
  received_by (nullable), created_at. Immutable: no UPDATE/DELETE RLS policy
  exists for anyone. `movement_department_shape` check constraint enforces
  the requisition two-sided null-ness rule; the `validate_movement` trigger
  additionally enforces which side must be the central store (a CHECK
  constraint can't look up another table's `is_central_store` flag).
- `count_sessions` — id, department_id, as_at_date, counted_by, status
  (`DRAFT`/`COMPLETED`/`LOCKED`), created_at, updated_at (phase 5 — bumped by
  autosave and by finishing, a reload-proof "draft saved" timestamp),
  locked_at, finished_at/finished_by (phase 6), locked_by (phase 6), unique
  on (department_id, as_at_date)
- `count_lines` — id, count_session_id, product_id, expected_qty,
  physical_qty (nullable), ledger_qty (nullable), variance (generated column
  = physical_qty − expected_qty, **not** vs. ledger_qty — see below),
  reason_code_id (nullable FK → reason_codes, phase 6), note, reason_set_by/
  reason_set_at (phase 6), plus an independent set for the "book differs"
  case: book_diff_reason_code_id, book_diff_note, book_diff_reason_set_by/at
  (phase 6 — see "Reason codes" and "Locking" below)
- `reason_codes` (phase 6) — id, code, label, applies_to
  (`VARIANCE`/`BOOK_DIFF`/`BOTH`), requires_note, is_active, created_at — a
  managed lookup, not free text; see "Reason codes" below
- `adjustments` — id, count_line_id, previous_qty, new_qty, reason,
  created_by, created_at — records every correction to a count line, both
  before a session locks (phase 5, overwrites `physical_qty` alongside the
  insert) and after (phase 6, append-only — see "Post-lock adjustments"
  below); figures are never overwritten in place once locked

**Why variance is physical vs. expected, not physical vs. ledger:** `expected_qty`
is the book figure captured at count time and deliberately hidden from the
auditor while they count (see the prototype's count screen note) — that's
what stops the book figure nudging the physical count. `ledger_qty` may be
recomputed later and can differ from `expected_qty` purely because a
movement posted late (a posting-timing issue, not a physical loss) — the
prototype's Eva Water example: count matches `expected_qty` exactly, but
`ledger_qty` differs, meaning zero variance even though the book was wrong.

Indexes: `movements(business_day)`, `movements(product_id, business_day)`,
`movements(from_department_id)`, `movements(to_department_id)`, plus FK
indexes on `profiles.department_id`, `product_assignments.product_id`,
`count_sessions.department_id`, `count_lines.count_session_id`,
`count_lines.product_id`, `adjustments.count_line_id`.

Enums: `user_role`, `movement_type`, `session_status`. `reason_code` (phase 1)
was retired in phase 6 — see "Reason codes" below.

## Balance function (supabase/migrations/20260721121900_balance_function.sql)

`get_department_balance(p_department_id uuid, p_as_at_date date)` returns one
row per product assigned to the department: `opening_qty`, `received_qty`,
`issued_qty`, `closing_qty`, and the same four as `_value` (× `unit_cost`).
This is the single function that powers the stock ledger, the sales screen,
and the count comparison — nowhere else recomputes a balance. It includes
products with zero movements (left-joined from `product_assignments`).
Decision: currency valuation is computed now (phase 1), not deferred, since
the prototype's dashboard/ledger screens display it.

## Design tokens (extracted from design/ui-draft.html, wired into app/globals.css)

- Two primary colours only: Ink `#111827` (text, headers, primary buttons,
  sidebar), Teal `#0F766E` (single accent — active states, links, key actions,
  selected rows)
- Neutrals: `#F9FAFB` `#F3F4F6` `#E5E7EB` `#9CA3AF` `#4B5563`
- Semantic colours — **used only on variances** within the authenticated app,
  never for general UI state (e.g. form errors on authenticated screens use a
  neutral note box, not red): red `#B42318` (short), green `#067647`
  (excess), amber `#B54708` (warning). The login route is the one documented
  exception — see "Login route visual treatment" below — where red is used
  for a plain auth error message.
- Font: Inter, weights 400 and 500 only — **never 600/700**. This is a review
  convention, not build-enforced (Tailwind's font-semibold/font-bold classes
  still exist; don't use them).
- Type scale 12/14/16/20/24 — maps directly onto Tailwind's existing
  text-xs/sm/base/xl/2xl, overridden in `@theme` to the exact pixel values
- Tabular numerals (`tabular-nums`) on every quantity and currency figure
- Border radius 6px uniformly (`--radius-*` theme keys all point at one
  `--radius: 6px` var) — 1px hairline borders, no drop shadows, no gradients

## Login route visual treatment (deliberate exception to the design system above)

`/login` (`app/login/page.tsx`) does **not** use the ink/teal/6px-radius/
hairline-border system described above. This was an explicit, one-off request
to give the login screen a softer, more welcoming look; every authenticated
screen keeps the dense system exactly as documented. Do not let any of the
following leak past login — it's implemented entirely with inline Tailwind
arbitrary values scoped to `app/login/page.tsx` and `app/login/SubmitButton.tsx`,
with nothing added to `app/globals.css`'s shared theme tokens, specifically so
it can't leak.

- Plain white page (`bg-white`), no card, no border, no shadow — the form
  floats centred both axes (`min-h-screen flex items-center justify-center`)
- Form column: `max-w-[480px]`, `w-full`, `px-6` (24px) — this is the single
  width constraint everything else sits inside; nothing in this tree has its
  own competing max-width
- Logo mark (`public/logo-mark.png`, cropped from the provided `logo.svg` —
  see below): fixed `64px`×`64px` below 480px, `72px`×`72px` from 480px up
  (`object-contain`, `shrink-0` — explicit pixel sizes at both breakpoints,
  never viewport-relative), `mb-6` (24px) below it
- Wordmark "sagefinan": `32px`/`40px` (mobile/≥480px), weight 700, `#111827`,
  `leading-[1.1]`, `mb-2` (8px) below it — the only place in the app that
  uses weight 700; the 400/500-only rule is for the authenticated app
- Subtitle "Stock Database for De-Moon Hotel": `18px`/`22px`, weight 600,
  colour `#5C7A5E` (sage green, used **only** on this route — **visually
  estimated from the reference screenshot, not pixel-sampled**, since the
  image arrived inline in chat with no accessible file path to sample
  programmatically; if you have the original mockup/Figma file, give Claude
  an exact hex and it'll swap this one constant), `mb-10` (40px) below it —
  this route now uses both 600 and 700, the two weights the rest of the app
  never touches
- Inputs: `bg-[#F2F2F2]`, `border-0`, `h-[64px]`, `rounded-[32px]` (exactly
  half the height — a true stadium shape), `px-[28px]` (symmetric), text
  `17px`, placeholder `#9CA3AF`, 16px gap between the two (`mb-4` on the
  first), placeholder-only with visually-hidden real `<label>`s (`sr-only` —
  clipped, not `display:none`, so screen readers still get them), focus
  `ring-2 ring-[#5C7A5E]` with `outline-none` (box-shadow–based ring, so
  focus causes no layout shift)
- Primary button: same `h-[64px]`/`rounded-[32px]`, `bg-[#2B2B2B]`, white
  text at `18px` weight 700, `mt-6` (24px) above it, label "Continue" →
  "Signing in…" while pending (`useFormStatus` in `SubmitButton.tsx`)
- Auth error: `text-[#B42318]`, plain wording ("Incorrect email or
  password."), shown between the inputs and the button — the one place red
  appears outside a variance, by explicit request
- Footer line "This area is monitored by the Auditor.": `12px`, `#111827`,
  `mt-3` (12px) above it
- Responsive: only the two breakpoint jumps above (logo/wordmark/subtitle)
  change size; the column's own width is the only viewport-relative thing —
  test 380/768/1440px, no horizontal overflow at any of them

**Logo asset pipeline**: the user supplied `public/logo.png` (flat, wordmark
baked in) and `public/logo.svg` (vector lockup, mark + wordmark as separate
paths, with the mark itself embedded as a raster inside a `<pattern>`). The
mark was extracted from that embedded raster (highest-resolution source
available), cropped to its true ink bounding box, and re-exported as
`public/logo-mark.png` (mark only, transparent background, ~400px wide,
optimized) — this is what's used everywhere in the app (login, sidebar, PWA
icons), not the flat lockup files, which are left untouched as the user's
originals. The mark itself renders as solid black on transparent — on the
Ink (`#111827`) sidebar it's shown with a CSS `invert` filter (`className="invert"`
in `components/app-shell/Sidebar.tsx`) rather than a dedicated dark-mode
export, since the mark is a flat single colour and inverts to clean white
with no artifacts. If a dedicated reversed/white logo export becomes
available, swap it in directly and drop the filter.

**PWA icons** (`public/icons/`) were regenerated from the same mark: white
background, mark centred at ~62% of canvas width (56% for maskable, to sit
safely inside the ~80% safe zone) — `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png` (180×180), plus
`app/favicon.ico` (16/32/48 multi-size, PNG-in-ICO). Generated via a one-off
script using `sharp` (added as a devDependency for this — image decode/resize
isn't something worth hand-rolling, see CLAUDE.md).

## Responsive rules

- Mobile-first; sidebar collapses to a slide-out drawer behind a menu button
  under 900px (`min-[900px]:` Tailwind breakpoint used throughout, not a
  default Tailwind breakpoint name)
- Dense data tables reflow into stacked cards on mobile, except the stock
  ledger which may scroll horizontally with the product column pinned
  (phase 7)
- Table rows 36px on desktop; any control used while counting has a minimum
  48px touch target
- Quantity inputs use `inputmode="numeric"`
- Test at 380px, 768px, 1440px

## Roles → navigation (lib/nav.ts)

| Nav item | Roles |
|---|---|
| Dashboard, Take stock, Compare stock, Sessions (phase 5), Reconcile, History | ADMIN, AUDITOR |
| Stock ledger, Movements (phase 3) | ADMIN, AUDITOR, STOREKEEPER, DEPARTMENT_USER |
| Purchases (phase 3), Requisitions | ADMIN, STOREKEEPER |
| Sales entry (phase 4) | ADMIN, STOREKEEPER, DEPARTMENT_USER |
| Sales history (phase 4) | ADMIN, AUDITOR, STOREKEEPER, DEPARTMENT_USER |
| Departments, Products, Users ("Administration" group, phase 2) | ADMIN |

STOREKEEPER/DEPARTMENT_USER's view of Movements is scoped to movements
touching their own `department_id` (mirrors the `movements_select` RLS
policy); ADMIN/AUDITOR see every movement.

## Reversal model (phase 3)

Movements are never updated or deleted once posted (see "Movements are the
single source of truth" above and CLAUDE.md's Conventions). To correct one,
post a **reversal**: a new movement row with the same `type`, `product_id`,
`from_department_id` and `to_department_id` as the movement it reverses —
deliberately *not* a flipped direction, since that would fight
`validate_movement`'s "requisitions only ever run central → non-central"
rule — tagged `reversal_of_movement_id`, carrying a mandatory reason (stored
in `note`) and the **original movement's `business_day`**, not today's, so
historical balances stay correct.

`get_department_balance()` nets a reversal's quantity as **negative** in
whichever inbound/outbound branch its original counted in, so a reversal
exactly cancels its original at the original's business day, on both sides
at once for a REQUISITION. There is no `reversed_by_movement_id` column —
storing one would mean updating the original row, which movements never do.
Instead, "was this movement reversed, and by what" is derived by looking for
a row whose `reversal_of_movement_id` points back at it (the
`movements_detail` view computes this as `reversed_by_movement_id`). A
movement that is itself a reversal cannot be reversed (reverse the original
instead); a movement that has already been reversed cannot be reversed
again — both enforced in `post_movement_reversal()`.

## Business-day locking (phase 3)

If a department has a count session with status `LOCKED` whose `as_at_date`
is on or after a movement's `business_day`, no new movement — purchase,
requisition, reversal, or (from phase 4) sale — may be posted touching that
department on that business day. Enforced by a single trigger,
`check_business_day_lock()`, on every insert to `movements`, so the rule
lives in one place rather than being re-implemented per posting action. The
error names the department and the locked date and says to post on a later
business day instead.

Non-admins hitting an Administration route directly (not through the sidebar,
which already hides these) see an explicit "you don't have access to this
page" screen (`components/AccessDenied.tsx`), never a crash or a silent
redirect — see CLAUDE.md's Conventions section.

Storekeeper/department_user's home page ("/") is a minimal placeholder
shortcutting to their one relevant action page, since the full audit
dashboard doesn't apply to them — decided in phase 1 as a reasonable reading
of "placeholder home page" given the dashboard build-out below.

## Blind counting (phase 5)

While a count session is `DRAFT`, the expected quantity must not be visible
anywhere — not on screen, not in the page source, not in any network
response, not in client-side state. This is a hard requirement, not a
preference: a counter who can see the expected figure will unconsciously
drift towards it, and counting blind is the entire reason the physical
figure is worth anything.

Enforced structurally, not by convention: `getCountLinesForCounting` and
`saveCountEntries` (`lib/counts/actions.ts`) — the only two functions the
take-stock screen ever calls — select an explicit column list that omits
`expected_qty` entirely, so it is never fetched by that code path in the
first place. `expected_qty` is computed and frozen only inside
`finish_count_session` (see below), and the only function anywhere in the
codebase that ever reads it back out is `getCompareData`, which refuses to
run until a session is `COMPLETED` or `LOCKED`. There is no "hide it in the
UI" step to forget, because the value is structurally absent from the
DRAFT-time response.

## Frozen expected quantity (phase 5)

`expected_qty` is computed once, at the moment a count is finished
(`finish_count_session`), from `get_department_balance(department_id,
as_at_date)` — `expected_qty = closing_qty`, with no branching on
`is_central_store` needed, since that function's inbound/outbound convention
already generalizes "opening + purchases − requisitions out" (central store)
and "opening + requisitions in − sales" (everyone else) into one closing
figure. It is written exactly once and never recomputed: if a movement is
posted later against that department on that business day (a late purchase,
a backdated requisition), the balance function's *live* answer for that date
changes, but the count session's stored `expected_qty` — and therefore its
variance report — does not. A count taken this morning must keep meaning
what it meant this morning, even if the books catch up later in the day.

## Three-figure comparison (phase 5)

A count line can carry up to three independent figures: `expected_qty`
(frozen at finish), `physical_qty` (what was counted), and `ledger_qty`
(optional, what the department's own stock book says — recorded
independently, and may be left unrecorded entirely). Variance is always
**physical vs. expected**, never physical vs. ledger — the ledger figure is
informational, not authoritative, and comparing physical against it instead
would let a wrong book figure quietly mask (or manufacture) a real physical
loss.

The comparison computes two flags per line, kept deliberately separate
rather than collapsed into one "variance" concept:

- **Primary** (`short` / `excess` / none): from `physical_qty − expected_qty`.
  Negative is short (red), positive is excess (green).
- **`bookDiffers`** (independent, secondary): true whenever a `ledger_qty`
  was recorded and it disagrees with `expected_qty` — regardless of what the
  primary flag says.

A line is hidden (fully tallies) only when neither fact holds. This
produces exactly the three cases SPEC.md's phase-5 brief describes:

- Physical differs from expected, ledger not recorded or matches expected →
  a real physical variance. Primary flag only.
- Physical matches expected, but a recorded ledger figure disagrees →
  **Book differs** only, amber, not a shortage — the prototype's Eva Water
  case. The department's book is wrong; the stock is fine. Value is shown as
  "—", not a fabricated ₦0.
- All three figures differ → both flags render together (a primary
  short/excess tag *and* a Book differs tag on the same row), so the two
  separate problems — a real loss, and a wrong book — stay visible as two
  separate facts rather than merging into a single ambiguous label.

Editing a physical count from the Compare screen (`correctCountEntry` →
`record_count_adjustment`) recalculates the variance immediately and always
writes an `adjustments` row (previous value, new value, who, when) — even
before a session locks — but never touches the frozen `expected_qty`.

## Reason codes (phase 6)

A fixed, managed set (`reason_codes` table — not a Postgres enum, since
enum values can never be removed and carry no per-value active flag, which
"add a code, retire a code, never delete a used code" requires), seeded with:

| Code | Label | Applies to | Requires a note |
|---|---|---|---|
| `BREAKAGE` | Breakage | Physical variance | No |
| `SPILLAGE` | Spillage | Physical variance | No |
| `UNRECORDED_SALE` | Unrecorded sale | Physical variance | No |
| `TRANSFER_NOT_POSTED` | Transfer not posted | Either | No |
| `POSTING_ERROR` | Posting error | Either | No |
| `EXPIRED_DAMAGED` | Expired or damaged | Physical variance | No |
| `UNDER_INVESTIGATION` | Under investigation | Either | No |
| `OTHER` | Other | Either | **Yes** |

A count line carries up to two *independent* reasons, never one collapsed
concept: `reason_code_id`/`note` explain a physical variance (counted ≠
expected); `book_diff_reason_code_id`/`book_diff_note` explain a book/ledger
discrepancy (counted = expected, but `ledger_qty` disagrees) — a bookkeeping
problem, not a physical loss, per phase 5's Three-figure comparison. Each
reason's chip list is filtered by `applies_to`: `BREAKAGE`/`SPILLAGE`/
`UNRECORDED_SALE`/`EXPIRED_DAMAGED` only make sense as a physical explanation
and never appear on a Book differs line; `TRANSFER_NOT_POSTED`/
`POSTING_ERROR`/`UNDER_INVESTIGATION`/`OTHER` can explain either. `OTHER`
requires a non-blank note — enforced both in the UI and, authoritatively,
inside `lock_count_session()` (see Locking below), via `requires_note` on the
row rather than a hardcoded check, so an admin-added code can opt into the
same rule.

Admin-manageable (`/products/reason-codes`, ADMIN-only): adding a code
inserts a row; retiring one sets `is_active = false`. A retired code keeps
showing on every historical line that used it (the Reconcile screen renders
a line's already-assigned code even when it's no longer in the active chip
list) — it simply stops being offered for new selections. There is no delete
action anywhere in the codebase for this table, so "never delete a code
that's been used" holds structurally, not by a runtime guard someone could
forget.

## Locking (phase 6)

**Locking is only permitted when every non-tallying line has a reason** —
re-validated entirely server-side, inside `lock_count_session()`, from the
database's own current state, never from what the client last rendered
(CLAUDE.md's "never rely on the button being hidden" quality bar). Two
independent checks, matching the two independent reason concepts above:
every line with `variance <> 0` needs `reason_code_id` set (and a note if
that code's `requires_note`); every line with `ledger_qty` disagreeing with
`expected_qty` needs `book_diff_reason_code_id` set (same note rule). Either
check failing blocks the lock and reports how many lines of each kind are
still outstanding.

On lock: `select ... for update` takes a row lock on the session for the
transaction's duration (so a second, concurrent lock attempt on the same
session serialises behind the first and then correctly sees `status =
'LOCKED'`, rather than a race letting both through), then status flips to
`LOCKED`, `locked_at`/`locked_by` are stamped, and every `count_lines` row
belonging to the session becomes structurally frozen: a `before update`
trigger (`count_lines_lock_guard`) rejects *any* update to a locked session's
count lines — figures, reasons, notes, all of it — regardless of what code
path attempts it, the same defence-in-depth pattern as phase 3's
`check_business_day_lock`.

**No stock movement dated on or before the locked `as_at_date` may be posted
for that department afterwards** — this needed no new code this phase:
`check_business_day_lock` (phase 3) already fires on every `movements`
insert and already checks for a `LOCKED` session covering the movement's
department and business day. The instant `lock_count_session` sets a
session's status to `LOCKED`, that existing trigger enforces the rule
against it automatically.

## Post-lock adjustments (phase 6)

A locked session's figures are read-only, but `record_post_lock_adjustment()`
lets a later correction be **appended**, never applied in place: it only
ever inserts a new row into `adjustments` (mandatory reason, who, when) — it
never writes to `count_lines` (which the lock guard trigger would reject
regardless). `previous_qty` on a new adjustment is the most recent
*effective* figure: the certified `physical_qty` if this is the line's first
adjustment since locking, otherwise the prior adjustment's own `new_qty` —
so a chain of adjustments (e.g. `5 → 6`, later `6 → 7`) reads as one coherent
chronological ledger, while `count_lines.physical_qty` itself keeps reading
`5` — the original certified figure — forever. A line's display always shows
both: the certified figure exactly as locked, and the full adjustment
history underneath it, in order. This is the structural difference between
"I edited it later" (indefensible) and "here is the original, and here is
the logged correction on top of it" (defensible) — SPEC.md's phase 6 brief,
implemented literally rather than as a UI convention.

The full session audit trail (one view per session — `/reconcile/[id]`'s
"Audit trail" tab, `getSessionAuditTrail()`) is synthesized, not stored: it
merges `count_sessions` (created/finished/locked, each with who/when),
every reason attachment on `count_lines` (`reason_set_at`/`book_diff_reason
_set_at`), and every `adjustments` row — tagging each adjustment pre-lock or
post-lock by comparing its `created_at` to the session's `locked_at`, since
there's no separate column for that distinction — into one chronological
list. This is the one view an auditor shows if a figure is ever challenged.

## Phase 1 scope decisions (asked and answered before building)

- **Currency valuation**: computed now in `get_department_balance`, not
  deferred.
- **Home page**: the prototype's full dashboard (stats, today's counts, stock
  ledger summary, repeat variances, movements feed) was initially rebuilt
  with the same hardcoded sample figures as the prototype, deferring the
  live wiring to phases 5–7 — since replaced by real queries (see
  `lib/dashboard/actions.ts` and CLAUDE.md's "Dashboard wired to live data"
  follow-up) now that phases 5/6 exist to query. Storekeeper/department_user
  get a simpler placeholder home instead of this dashboard.
- **Nav scaffolding**: every sidebar item from the prototype exists as a real
  route from phase 1, role-filtered per the table above; unbuilt ones show a
  "Coming in phase N" placeholder card.
- **Seed data scale**: literal to the brief — central store + Bar + Kitchen,
  10 products, not the prototype's full 5-department/674-product numbers.

## Phase 2 scope decisions (asked and answered before building)

- **New user credentials**: a one-time temporary password shown in the UI,
  not an invite email — no SMTP provider is configured for this project yet
  (`supabase/config.toml`'s `[auth.email.smtp]` is commented out).
- **Products list pagination**: plain page-based (50/page) over virtualised
  scrolling — SPEC.md offered either; no virtualisation library was already a
  dependency, and 1,000 rows at 50/page is not a performance problem for a
  normal paginated query.
- **Shelf-order drag-and-drop**: native HTML5 drag-and-drop, desktop only, no
  new dependency — mobile always uses the plain number input instead, so
  native DnD's touch-device weaknesses never matter here.
- **CSV import**: `papaparse` added as a dependency (quoted commas/embedded
  newlines aren't worth hand-rolling). Only valid rows are written; invalid
  rows are skipped and reported with their row number and reason rather than
  blocking the whole file. A row's `shelf_order` applies to every department
  listed on that row — the format has no way to give the same product a
  different shelf position per department in one row; use the per-department
  screen for that instead. Export always leaves `shelf_order` blank so that
  export → edit → re-import round-trips without disturbing existing shelf
  positions (the import RPC only overwrites `shelf_order` when a row supplies
  one).
- **Departments needing confirmation**: SPEC.md asks for a confirmation
  dialog with reference counts specifically for department deactivation; user
  and product deactivation are single-click actions with no dialog, since
  SPEC.md doesn't ask for one there and their consequences are already
  reversible (reactivate) and low-blast-radius.

## Zero-sales convention (phase 4)

Sales entry is search-driven: a product never searched-and-added to a batch,
and a product explicitly entered with a sale of zero, both mean "zero sales"
to the balance function — but they must not be conflated in the UI, since
which one happened determines whether anyone actually checked that product
today.

- **Absence** (never added to the batch): no movement is written. This is
  the normal case for the majority of a department's products on any given
  day — `get_department_balance` already treats a missing movement as zero,
  so nothing needs to change there. Before posting, the batch screen states
  plainly how many of the department's assigned products fall into this
  bucket, and that count is clickable to reveal exactly which products.
- **Explicit zero** (added to the batch with a typed `0`): also writes no
  movement — a zero-quantity `SALE` would be indistinguishable in effect from
  no row at all, and `movements.quantity`'s `check (quantity > 0)` constraint
  (unchanged since phase 1) would reject it outright. The line is still
  tracked as "touched" for the batch's own zero-sales summary, so explicitly
  confirming "checked, nothing sold" correctly removes that product from the
  "will be posted as zero" count — that bookkeeping lives entirely in the
  batch/draft, not in the movements table. There is no way to later
  distinguish "explicitly checked zero" from "never touched" once posted,
  since neither leaves a row — an accepted consequence of "never write empty
  movement rows for either case."
- A correction line (see below) may also resolve to zero: reversing an
  existing sale and entering `0` as the corrected figure reverses the old
  movement and simply writes no replacement.

`post_sales_batch` enforces this: it loops every line, and only inserts a
`SALE` row when the line's quantity is greater than zero (see
`20260722150000_phase4_sales.sql`).

## Draft batch behaviour (phase 4)

Sales batches are built incrementally and can run to 80+ products in one
sitting, so the in-progress batch is persisted server-side (`sale_drafts`
table) as each line is added or removed — not just held in browser state —
tied to **(created_by, department, business_day)**. Two people building a
batch for the same department/day get independent drafts; the same person
switching between two different business days (or departments) for the same
department automatically saves and restores each day's own draft, since
changing either field is a real context switch to a different day's opening/
received figures, not a continuation of the same batch.

- A draft is not a movement — it has no accounting effect until
  `post_sales_batch` runs, and unlike `movements` it is fully mutable: it can
  be updated in place and deleted outright, since `sale_drafts` carries no
  audit/immutability requirement.
- Returning to the Sales entry screen with an unposted draft for the
  currently-selected department and business day restores it automatically
  and says so ("An unposted draft for X on Y was restored below").
- "Clear batch" deletes the draft outright (`clearSalesDraft`), not just the
  in-memory lines.
- Posting a batch clears its draft as the final step of `postSalesBatch` —
  a posted batch has no further use for its staging row.

## Phase 3 scope decisions (asked and answered before building)

- **Batch UI pattern**: the prototype's Requisitions screen posts one line
  immediately ("Record requisition"), with no staged batch table — but the
  phase brief explicitly describes add/remove/post-once, matching the
  Sales screen mock instead. Built as a staged batch (Sales-style) on both
  Purchases and Requisitions, confirmed before building.
- **Movements list route**: a new `/movements` route and nav item rather than
  building into the existing `/history` route, which is reserved for phase
  7's count-session history — confirmed before building.
- **"Flagged for review" override count**: a stat on the new `/movements`
  page (always) plus one live tile on the otherwise-still-hardcoded
  dashboard (ADMIN/AUDITOR only) — confirmed before building, since
  SPEC.md explicitly asks for the auditor to see this count somewhere.
- **Reversal shape**: same from/to/type as the original, not a flipped
  direction — see "Reversal model" above for why, and why there is no
  `reversed_by_movement_id` column.
- **Purchases product search scope**: restricted to products assigned to the
  central store, not stated verbatim in this phase's brief but a direct
  consequence of "balance queries always go through `get_department_balance`,
  never hand-roll a movement sum" — that function only returns assigned
  products, so an unassigned one would have no "current quantity" context.
- **Received by**: a required `Select` of active `DEPARTMENT_USER` profiles
  at the destination department, not a free-text field — `received_by`
  references `profiles(id)` in the phase-1 schema, so it has to be an actual
  account.

## Phase 4 scope decisions (asked and answered before building)

- **STOREKEEPER on Sales entry**: phase 3's nav table (and `lib/nav.ts`)
  originally scoped Sales entry to ADMIN + DEPARTMENT_USER only. Confirmed
  before building that phase 4's brief granting STOREKEEPER posting access
  too (for any non-central department) was intentional, not a slip — both
  `lib/nav.ts` and the nav table above now list STOREKEEPER.
- **Sales history location**: not in `design/ui-draft.html` at all (the
  prototype's own "History" nav item is reserved for phase 7's count
  sessions) — confirmed before building as a new `/sales/history` route and
  nav item, rather than a tab bolted onto `/sales` or folded into the
  existing `/movements` list (which already surfaces `SALE` movements, but
  without sales-specific column framing or a dedicated place for
  DEPARTMENT_USER/STOREKEEPER to land).
- **Correction atomicity**: confirmed before building that a correction line
  (reverse the existing sale, post the corrected figure) is staged in the
  batch like any other line — nothing touches the database until "Post
  sales" — and `post_sales_batch` performs the reversal and the new insert
  together inside its own loop iteration, in the same transaction as every
  other line in the batch. The alternative (reversing immediately when
  "Reverse & correct" is chosen, batching only the corrected figure) was
  rejected: it would leave a reversed-but-not-yet-replaced line as a real
  possibility if the rest of the post failed, which the "all lines or none"
  quality bar is specifically meant to prevent.
- **Re-adding a product already in the current batch**: unlike Purchases/
  Requisitions (where re-searching a product already in the batch increases
  its quantity, since those are additive movements), Sales is a single
  closing figure per product per day — re-picking a product already staged
  shows "already in this batch, remove it below to change the figure"
  instead of merging quantities.

## Phase 5 scope decisions (asked and answered before building)

- **Session list location**: the phase brief's "Session list" section (find
  an in-progress or past session, filter, open it) needs a home, but
  `design/ui-draft.html`'s own "History" nav item is reserved for phase 7's
  richer reports/exports. Confirmed before building: a brand-new nav item
  and route, `/sessions`, rather than pulling `/history` forward or folding
  the list into `/count`'s own landing page.
- **Ledger record entry point**: the optional ledger-figure second pass has
  no nav slot of its own (and would collide in name with the existing phase-
  3 "Stock ledger" balance-view nav item, an unrelated concept). Confirmed
  before building: a second tab on the take-stock screen itself
  (`/count/[id]`), enabled once the count is finished, rather than a link off
  the Compare screen.
- **Department picker for Take stock**: includes the central store, unlike
  every other department picker in the app (Purchases/Requisitions/Sales all
  exclude it) — a direct consequence of the central store having its own
  expected-quantity formula in this phase's brief, meaning it's counted too.
- **Virtualisation**: not added for the 150-item count list — measured
  before deciding, following the phase-2 precedent of not reaching for a new
  dependency until a real dependency exists. `React.memo` per row plus a
  single stable `onChange` reference keeps a keystroke's re-render scoped to
  one row regardless of list length.

## Phase 6 scope decisions (asked and answered before building)

- **Reason codes: enum vs. lookup table**: the phase brief's "add a code,
  retire a code, never delete a used code" can't be built on the phase-1
  `reason_code` enum (Postgres enum values can be added but never removed,
  and there's no per-value active flag) — moved to a managed `reason_codes`
  table. Not really an open question so much as a technical constraint, but
  worth recording since it retires a phase-1 type.
- **Reports navigation**: `/reconcile/reports` (variance-by-reason) and
  `/reconcile/investigation` (open "under investigation" items) — confirmed
  before building as sub-routes reachable only from the `/reconcile` landing
  page, not new top-level nav items, leaving "reports/exports" as phase 7's
  broader umbrella per the phase list below.
- **Reason-codes admin location**: confirmed before building to fold into
  the existing Products page (`/products/reason-codes`, linked from its
  toolbar) rather than a new Administration nav item — both are admin-managed
  lookup-style lists.
- **Book-differs' narrower reason set**: rather than a second, wholly
  separate code list, `reason_codes.applies_to` tags each code `VARIANCE`/
  `BOOK_DIFF`/`BOTH` — `TRANSFER_NOT_POSTED`/`POSTING_ERROR`/
  `UNDER_INVESTIGATION`/`OTHER` can explain either kind of line, the four
  physical-only codes (breakage, spillage, unrecorded sale, expired/damaged)
  never appear on a Book differs line. Chosen over a fully separate code set
  so the two concerns share infrastructure without letting a physical-only
  explanation get attached to a bookkeeping problem.

## The eight phases

1. **Foundation** — schema, auth, PWA shell, design system *(done)*
2. **Admin** — departments, products, CSV import, users *(done)*
3. **Central store** — purchases and requisitions *(done)*
4. **Sales entry** as a searchable batch, posted in one action *(done)*
5. **Stock count and variance comparison** *(done)*
6. **Reconciliation, reason codes and session locking** *(done)*
7. Stock ledger, history, reports, exports
8. Mobile polish and Vercel deployment
