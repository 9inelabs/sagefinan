-- Stock adjustments (admin write-offs / write-ons) are their own movement
-- type. Own migration: Postgres forbids using a freshly added enum value in
-- the same transaction that added it (same reason as the OPENING enum).
alter type movement_type add value if not exists 'ADJUSTMENT';
