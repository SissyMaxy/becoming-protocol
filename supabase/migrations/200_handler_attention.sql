-- Handler attention inbox
--
-- Single queue for things the Handler decided the human operator (Maxy) should
-- see. Surfaces: suppressed outbound messages, inbound logistics asks, likely
-- same-person merge candidates, new high-LTV contacts, screening requests,
-- payment anomalies, anything that needs a judgment call.
--
-- Every entry has a `kind` (category), `severity`, and JSONB payload. The CLI
-- filters + lets you mark entries reviewed with an action ('handled' / 'ignored' /
-- 'escalated'). The Handler re-queues an item if the situation repeats.
--
-- Why: the contact graph has the data; this surfaces the decisions. Without
-- this, "Handler blocked a meetup ask 9 times" is invisible to you.

create table if not exists handler_attention (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  kind text not null,
    -- outbound_suppressed | logistics_ask | merge_candidate | new_paying_contact
    -- | ghosted_paying | catfish_suspected | screening_request | tribute_paid
    -- | tribute_overdue | live_announce_triggered | custom
  severity text not null default 'medium',  -- low | medium | high
  platform text,
  payload jsonb not null default '{}'::jsonb,
  summary text,  -- human-readable one-liner
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_action text  -- handled | ignored | escalated | merged | deflected
);

create index if not exists handler_attention_user_unread_idx
  on handler_attention(user_id, created_at desc)
  where reviewed_at is null;
create index if not exists handler_attention_contact_idx on handler_attention(contact_id);
create index if not exists handler_attention_kind_idx on handler_attention(user_id, kind);

alter table handler_attention enable row level security;

drop policy if exists "handler_attention own" on handler_attention;
create policy "handler_attention own" on handler_attention for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
