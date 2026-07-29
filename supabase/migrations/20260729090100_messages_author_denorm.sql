-- Denormalize the author's name/role directly onto messages. Realtime
-- broadcasts the raw table row only — no join — and profiles_select's RLS
-- (id = auth.uid() or admin) means a browser session can't resolve another
-- user's name/role for a live-arriving message the normal way. The poster
-- always has full read access to their own profile, so postMessage()
-- (lib/messages/actions.ts) writes both alongside the message itself.
-- Table has no rows yet, so these can be added NOT NULL with no backfill.
alter table messages add column author_name text not null;
alter table messages add column author_role text not null;
