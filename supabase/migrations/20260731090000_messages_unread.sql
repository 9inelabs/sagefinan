-- Unread badge for the shared Messages room (20260729090000_messages.sql).
-- One timestamp per user, not a per-message read-receipt table: this is a
-- single shared room, not per-thread messaging, so "everything before this
-- moment is read" is all any screen needs.
--
-- `default now()` (a STABLE function, evaluated once per statement) backfills
-- every existing profile's marker to the moment this migration runs, so
-- nobody sees months of already-seen history suddenly flagged unread the
-- first time this ships; a newly created profile gets the same "nothing
-- before I existed" baseline for the same reason.
alter table profiles add column messages_last_read_at timestamptz not null default now();

comment on column profiles.messages_last_read_at is
  'Last time this user opened /messages — everything in messages.created_at after this, from someone else, is unread. Written by markMessagesRead() (lib/messages/actions.ts) via the service-role client, since profiles_update RLS is ADMIN-only.';
