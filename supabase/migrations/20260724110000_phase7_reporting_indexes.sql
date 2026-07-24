-- Phase 7 — reporting/reading layer. No new tables, views or RPC functions:
-- every report (stock ledger, count history, repeat variances, variance by
-- reason, period summary) is computed straight from get_department_balance
-- and direct reads of movements/count_lines/adjustments in application code,
-- same "no new stored totals" principle SPEC.md asks for and the same
-- single-consumer-aggregation-in-app-code precedent phase 6's reports set.
--
-- The one thing this phase's new query shapes actually need: several new
-- reads filter movements by ONE department column (to_department_id for
-- inbound, from_department_id for outbound) *and* a business_day range at
-- the same time — lib/reconcile/actions.ts's getPeriodSummary (a whole
-- month's movements for one department) and lib/ledger/actions.ts's
-- getLedgerProductHistory (every movement behind one product's figures, up
-- to an as-at date). Phase 3 already had this exact shape on /movements'
-- own department+date-range filter, just never indexed for it.
--
-- Measured before changing anything (per CLAUDE.md's quality bar): real
-- production data today is 12 movements total, so EXPLAIN on this query
-- shape correctly picks a Seq Scan regardless of what's indexed — there is
-- nothing to measure a win against yet. These composite indexes are
-- preventive, sized for SPEC.md's target scale (~1,000 products across ~8
-- departments, months of movements) rather than today's dataset — same
-- reasoning as the pg_trgm index added in 20260724100000_search_performance
-- .sql before the product catalogue was actually large enough to need it.
--
-- Replacing rather than adding alongside: a composite (department_id,
-- business_day) index serves every query the old single-column
-- department-id index served (leftmost-prefix equality lookups with no date
-- filter) *and* the new department+range shape, so the old indexes are
-- strictly subsumed — kept as one index per column instead of two.

drop index if exists movements_from_department_id_idx;
drop index if exists movements_to_department_id_idx;

create index movements_from_department_business_day_idx on movements (from_department_id, business_day);
create index movements_to_department_business_day_idx on movements (to_department_id, business_day);
