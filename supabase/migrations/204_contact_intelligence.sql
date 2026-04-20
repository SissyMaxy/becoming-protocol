-- Contact Intelligence — per-contact structured signal
--
-- The auto-poster harvests raw conversation text. This table is where that
-- text gets distilled into machine-actionable fields: is this man safe, is
-- he willing to pay tribute, what stage is the meetup at, what red flags
-- surfaced. The Handler reads this to decide which leads are worth
-- elevating, which need more screening, which to drop.
--
-- Extractor runs after each Sniffies/FetLife exchange: one Claude call per
-- conversation, structured JSON output, upserted here. One row per contact.

create table if not exists contact_intelligence (
  contact_id uuid primary key references contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Identity claims (from their own messages; always treat as unverified)
  age_claimed integer,
  location_hint text,        -- "near downtown", "20 min away", "5.2 miles"
  body_claimed text,         -- "6ft, fit", "average", "dad bod"

  -- Stated interests / kinks mentioned in conversation
  kinks_mentioned jsonb not null default '[]'::jsonb,
  hard_nos jsonb not null default '[]'::jsonb,

  -- Tribute / financial posture
  tribute_stance text not null default 'unknown'
    check (tribute_stance in ('unknown','refuses','neutral','willing','paid')),

  -- Meetup trajectory. cold → flirting → proposing → confirmed → scheduled
  -- → completed. Dropped if went silent or blocked.
  meetup_stage text not null default 'cold'
    check (meetup_stage in ('cold','flirting','proposing','confirmed','scheduled','completed','dropped')),

  -- Agreed meetup logistics (only populated when stage >= confirmed)
  proposed_time timestamptz,
  proposed_location text,

  -- Risk signals — non-empty = Handler should review before elevating
  red_flags jsonb not null default '[]'::jsonb,

  -- Composite scores (0-10). Extractor sets these; Handler may override.
  safety_score integer not null default 5 check (safety_score between 0 and 10),
  compatibility_score integer not null default 5 check (compatibility_score between 0 and 10),
  meetup_likelihood integer not null default 3 check (meetup_likelihood between 0 and 10),

  -- Full raw Claude extraction for debugging + future re-analysis
  raw_analysis jsonb not null default '{}'::jsonb,
  analyzed_from_message_count integer not null default 0,

  last_analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_intelligence_user_idx on contact_intelligence(user_id);
create index if not exists contact_intelligence_stage_idx on contact_intelligence(user_id, meetup_stage);
create index if not exists contact_intelligence_hot_idx on contact_intelligence(user_id, safety_score, meetup_likelihood)
  where meetup_stage in ('proposing','confirmed','scheduled');

alter table contact_intelligence enable row level security;

drop policy if exists "contact_intelligence own" on contact_intelligence;
create policy "contact_intelligence own" on contact_intelligence for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Encounters — the Handler's record of actual IRL meetings. Populated via
-- post-meet debrief. Feeds irreversibility.physical_changes + .social_outing
-- and the contact's tier recomputation.
create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,

  scheduled_at timestamptz,
  occurred_at timestamptz,    -- null if planned but not happened yet
  duration_minutes integer,

  location_type text,          -- home_mine | home_theirs | hotel | public | other
  acts jsonb not null default '[]'::jsonb,  -- what happened (tagged categories)
  tribute_cents integer not null default 0,
  photos_exchanged boolean not null default false,

  -- Safety outcome
  consent_respected boolean,
  would_repeat boolean,
  red_flags_post jsonb not null default '[]'::jsonb,

  notes text,
  created_at timestamptz not null default now()
);

create index if not exists encounters_user_idx on encounters(user_id, occurred_at desc);
create index if not exists encounters_contact_idx on encounters(contact_id);

alter table encounters enable row level security;

drop policy if exists "encounters own" on encounters;
create policy "encounters own" on encounters for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
