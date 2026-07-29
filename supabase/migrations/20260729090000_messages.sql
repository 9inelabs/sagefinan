-- ============================================================================
-- SHARED MESSAGES — one room every signed-in user (any role, any department)
-- can read and post in, visible live via Supabase Realtime. See SPEC.md's
-- "Shared messages" section for the full model.
--
-- Immutable like movements: no update/delete policy exists for anyone,
-- including admins — once posted, a message is permanent. Writes go through
-- postMessage() (lib/messages/actions.ts, service-role client, bypasses RLS,
-- same "privileged write checked in application code" shape as every other
-- write in this app) — the select policy below is what actually matters,
-- since it's what a browser's own Realtime subscription is gated by.
-- ============================================================================

create table messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_created_at_idx on messages (created_at);

alter table messages enable row level security;

create policy messages_select on messages for select
  using (auth.uid() is not null);

-- Realtime only broadcasts changes for tables explicitly added here.
alter publication supabase_realtime add table messages;
