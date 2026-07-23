-- Opening balances: add the new movement_type value first, in its own
-- migration/transaction. Postgres forbids using a freshly-added enum value
-- in the same transaction that added it, so the constraint/function changes
-- that reference 'OPENING' live in the next migration file.
alter type movement_type add value 'OPENING';
