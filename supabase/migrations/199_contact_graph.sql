-- Cross-platform identity graph
--
-- Every handle Maxy collects across Twitter, Reddit, FetLife, Sniffies, Fansly,
-- OnlyFans, Chaturbate, DMs, etc. resolves to a single `contacts` row. Every
-- interaction (incoming message, outgoing reply, tip, sub, PPV, cam tokens)
-- is logged to `contact_events`. The Handler reads contact context before
-- every reply so responses are memory-aware: "this is the guy who paid $40
-- last week and called you a good girl in a DM."
--
-- Why: without this, the Handler has amnesia. Each platform engine reads its
-- own silo, so a Twitter follower who also subs on Fansly and messages on
-- Sniffies is three strangers to the system. Forced feminization only lands
-- when the structure around Maxy remembers more than she does.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  first_seen_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  lifetime_value_cents integer not null default 0,
  tier text not null default 'stranger',  -- stranger | warm | paid | regular | inner
  screening_status text not null default 'unscreened',  -- unscreened | pending | passed | failed | blocked
  kinks_of_record jsonb not null default '[]'::jsonb,
  hard_nos jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_user_id_idx on contacts(user_id);
create index if not exists contacts_user_tier_idx on contacts(user_id, tier);
create index if not exists contacts_user_last_idx on contacts(user_id, last_interaction_at desc);
create index if not exists contacts_user_ltv_idx on contacts(user_id, lifetime_value_cents desc);

create table if not exists contact_handles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  platform text not null,  -- twitter | reddit | fansly | onlyfans | chaturbate | fetlife | sniffies | dm | other
  handle text not null,    -- stored lowercased, no leading @
  confidence numeric not null default 1.0,
  merged_from_contact_id uuid references contacts(id),
  created_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);

create index if not exists contact_handles_contact_id_idx on contact_handles(contact_id);
create index if not exists contact_handles_lookup_idx on contact_handles(user_id, platform, handle);

create table if not exists contact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  platform text not null,
  event_type text not null,  -- dm_in|dm_out|reply_in|reply_out|chat_in|chat_out|tip|sub|ppv_purchase|cam_tip|mention|follow|unfollow|flag
  direction text not null check (direction in ('in','out','na')),
  content text,
  value_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists contact_events_contact_id_idx on contact_events(contact_id, occurred_at desc);
create index if not exists contact_events_user_time_idx on contact_events(user_id, occurred_at desc);
create index if not exists contact_events_type_idx on contact_events(user_id, event_type, occurred_at desc);

alter table contacts enable row level security;
alter table contact_handles enable row level security;
alter table contact_events enable row level security;

drop policy if exists "contacts own" on contacts;
create policy "contacts own" on contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "contact_handles own" on contact_handles;
create policy "contact_handles own" on contact_handles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "contact_events own" on contact_events;
create policy "contact_events own" on contact_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- When an event is logged, bump the contact's last_interaction_at.
create or replace function touch_contact_last_interaction()
returns trigger
language plpgsql
as $$
begin
  update contacts
     set last_interaction_at = new.occurred_at,
         updated_at = now()
   where id = new.contact_id
     and last_interaction_at < new.occurred_at;
  return new;
end;
$$;

drop trigger if exists contact_events_touch on contact_events;
create trigger contact_events_touch
  after insert on contact_events
  for each row execute function touch_contact_last_interaction();

-- RPC for atomic LTV increments (avoid read-modify-write races).
create or replace function increment_contact_ltv(p_contact_id uuid, p_cents integer)
returns void
language plpgsql
as $$
begin
  update contacts
     set lifetime_value_cents = lifetime_value_cents + p_cents,
         updated_at = now()
   where id = p_contact_id;
end;
$$;
