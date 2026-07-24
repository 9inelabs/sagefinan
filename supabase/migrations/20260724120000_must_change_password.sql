-- Forces a password change on next login — set true whenever an account is
-- created with a temp password an admin chose (the existing random-generated
-- temp password shown once in the Users admin UI, or a one-off operator
-- script), so the temp password is only ever usable to get in and set a real
-- one. Defaults false, so every existing account (including the real admin/
-- auditor accounts already in use) is unaffected by this migration.
alter table profiles add column must_change_password boolean not null default false;

comment on column profiles.must_change_password is
  'Forces the signed-in user through /change-password before reaching the rest of the app (app/(app)/layout.tsx). Cleared by the self-service password-change action once a new password is set.';
