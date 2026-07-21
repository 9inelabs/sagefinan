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
  (`DRAFT`/`COMPLETED`/`LOCKED`), created_at, locked_at, unique on
  (department_id, as_at_date)
- `count_lines` — id, count_session_id, product_id, expected_qty,
  physical_qty (nullable), ledger_qty (nullable), variance (generated column
  = physical_qty − expected_qty, **not** vs. ledger_qty — see below), reason_code
  (nullable), note
- `adjustments` — id, count_line_id, previous_qty, new_qty, reason,
  created_by, created_at — the audit trail for any correction made after a
  session locks; figures are never overwritten in place once locked

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

Enums: `user_role`, `movement_type`, `session_status`, `reason_code`
(`BREAKAGE`, `SPILLAGE`, `UNRECORDED_SALE`, `TRANSFER_NOT_POSTED`,
`POSTING_ERROR`, `UNDER_INVESTIGATION` — matches the prototype's reconcile
chips).

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
| Dashboard, Take stock, Compare stock, Reconcile, History | ADMIN, AUDITOR |
| Stock ledger | ADMIN, AUDITOR, STOREKEEPER, DEPARTMENT_USER |
| Requisitions | ADMIN, STOREKEEPER |
| Sales entry | ADMIN, DEPARTMENT_USER |
| Products | ADMIN |

Storekeeper/department_user's home page ("/") is a minimal placeholder
shortcutting to their one relevant action page, since the full audit
dashboard doesn't apply to them — decided in phase 1 as a reasonable reading
of "placeholder home page" given the dashboard build-out below.

## Phase 1 scope decisions (asked and answered before building)

- **Currency valuation**: computed now in `get_department_balance`, not
  deferred.
- **Home page**: the prototype's full dashboard (stats, today's counts, stock
  ledger summary, repeat variances, movements feed) is rebuilt with the same
  hardcoded sample figures as the prototype — not yet wired to real
  counts/movements (that's phases 5–7). Storekeeper/department_user get a
  simpler placeholder home instead of this dashboard.
- **Nav scaffolding**: every sidebar item from the prototype exists as a real
  route from phase 1, role-filtered per the table above; unbuilt ones show a
  "Coming in phase N" placeholder card.
- **Seed data scale**: literal to the brief — central store + Bar + Kitchen,
  10 products, not the prototype's full 5-department/674-product numbers.

## The eight phases

1. **Foundation** — schema, auth, PWA shell, design system *(this phase)*
2. Admin — departments, products, CSV import, users
3. Central store — purchases and requisitions
4. Sales entry as a searchable batch, posted in one action
5. Stock count and variance comparison
6. Reconciliation, reason codes and session locking
7. Stock ledger, history, reports, exports
8. Mobile polish and Vercel deployment
