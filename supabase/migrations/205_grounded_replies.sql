-- Grounded Replies — prevent the auto-poster from fabricating personal facts.
--
-- Two pieces:
--
-- 1. maxy_facts — the single source of truth for what the bot is allowed to
--    claim about Maxy in outbound replies (availability summary, stateable
--    facts like "6'2, late 30s presenting fem, Midwest-ish"). The auto-poster
--    injects this into every reply prompt with a hard instruction: only state
--    facts from this list, deflect otherwise.
--
-- 2. pending_outbound — user-authored replies queued by the Handler. When the
--    auto-poster encounters a question it cannot answer from facts (e.g.
--    "are you free tonight?"), it queues a handler_attention item instead of
--    replying. The user answers in the Handler chat; the Handler writes the
--    user's exact words to pending_outbound; the auto-poster sends it
--    verbatim on the next tick. No Claude rewrite — Maxy's words pass through.

create table if not exists maxy_facts (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Free-form bullet list of stateable facts. Keep under ~20 items.
  -- Example: ["late 30s presenting femme", "Midwest US", "HRT 18+ months",
  --          "into denial, chastity, breeding kink", "prefers AM meets"]
  stateable_facts jsonb not null default '[]'::jsonb,

  -- Plain-English availability summary. Example: "usually free weekday
  -- evenings after 7pm. weekends flexible but book ahead. never Sunday AM."
  availability_summary text,

  -- Hard nos in conversation — won't claim these even if asked directly.
  -- Example: ["real name", "home address", "day job details"]
  hard_nos jsonb not null default '["real name","home address","workplace","phone number"]'::jsonb,

  updated_at timestamptz not null default now()
);

alter table maxy_facts enable row level security;
drop policy if exists "maxy_facts own" on maxy_facts;
create policy "maxy_facts own" on maxy_facts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Pending user-authored replies. Auto-poster sends these verbatim on next tick.
create table if not exists pending_outbound (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  platform text not null,           -- sniffies | fetlife | fansly | onlyfans | twitter
  target_handle text not null,      -- lowercased, no leading @
  body text not null,               -- exact text to send; NOT rewritten
  status text not null default 'pending'
    check (status in ('pending','sent','cancelled','failed')),
  reason text,                      -- why it was queued (e.g. "resolved needs_maxy_input")
  attention_id uuid,                -- link back to the handler_attention row that triggered it
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);

create index if not exists pending_outbound_user_status on pending_outbound(user_id, status, created_at);
create index if not exists pending_outbound_platform_target on pending_outbound(user_id, platform, target_handle)
  where status = 'pending';

alter table pending_outbound enable row level security;
drop policy if exists "pending_outbound own" on pending_outbound;
create policy "pending_outbound own" on pending_outbound for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
