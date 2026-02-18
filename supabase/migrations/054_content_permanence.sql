-- ============================================
-- 054: Content Permanence Tracking
-- Irreversibility measurement layer (#3)
-- Tier classification, external copy estimation,
-- sober acknowledgment ratchet.
-- ============================================

-- ============================================
-- Table: content_permanence
-- ============================================

create table if not exists public.content_permanence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  content_ref text not null,
  content_type text not null check (content_type in (
    'photo', 'video', 'voice_clip', 'text_post',
    'cam_recording', 'live_stream', 'profile_update'
  )),
  platform text check (platform is null or platform in (
    'local_only', 'onlyfans', 'fansly', 'twitter', 'reddit', 'discord', 'other'
  )),
  permanence_tier integer not null default 1 check (permanence_tier between 1 and 5),
  tier_justification text not null,
  face_visible boolean default false,
  voice_audible boolean default false,
  identifying_marks_visible boolean default false,
  legal_name_connected boolean default false,
  posted_at timestamptz,
  estimated_views integer default 0,
  estimated_saves integer default 0,
  estimated_external_copies integer default 0,
  copy_estimation_method text check (copy_estimation_method is null or copy_estimation_method in (
    'platform_analytics', 'handler_estimate', 'manual_input', 'scraper_detection'
  )),
  sober_acknowledged boolean default false,
  sober_acknowledged_at timestamptz,
  sober_arousal_at_acknowledgment integer,
  acknowledgment_statement text,
  ratchet_weight numeric default 1.0,
  can_be_deleted boolean generated always as (permanence_tier <= 1) stored,
  deletion_attempted boolean default false,
  deletion_attempted_at timestamptz,
  deletion_outcome text check (deletion_outcome is null or deletion_outcome in (
    'successful', 'partial', 'failed_copies_exist'
  )),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.content_permanence enable row level security;

create policy "Users can view their own content permanence"
  on public.content_permanence for select
  using (auth.uid() = user_id);

create policy "Users can insert their own content permanence"
  on public.content_permanence for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own content permanence"
  on public.content_permanence for update
  using (auth.uid() = user_id);

create index if not exists idx_content_permanence_user_tier
  on public.content_permanence(user_id, permanence_tier);

create index if not exists idx_content_permanence_user_platform
  on public.content_permanence(user_id, platform);

create index if not exists idx_content_permanence_user_acknowledged
  on public.content_permanence(user_id, sober_acknowledged);

-- ============================================
-- Table: permanence_acknowledgments
-- ============================================

create table if not exists public.permanence_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  content_permanence_id uuid references content_permanence(id) not null,
  acknowledged_at timestamptz default now(),
  arousal_level integer not null,
  denial_day integer,
  statement text not null,
  was_sober boolean generated always as (arousal_level <= 2) stored,
  handler_prompted boolean default false,
  time_since_posting interval,
  created_at timestamptz default now()
);

alter table public.permanence_acknowledgments enable row level security;

create policy "Users can view their own permanence acknowledgments"
  on public.permanence_acknowledgments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own permanence acknowledgments"
  on public.permanence_acknowledgments for insert
  with check (auth.uid() = user_id);

create index if not exists idx_permanence_ack_user_at
  on public.permanence_acknowledgments(user_id, acknowledged_at);

-- ============================================
-- Table: permanence_tier_transitions
-- ============================================

create table if not exists public.permanence_tier_transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  content_permanence_id uuid references content_permanence(id) not null,
  from_tier integer not null,
  to_tier integer not null check (to_tier > from_tier),
  transition_reason text not null,
  sober_at_transition boolean default false,
  arousal_at_transition integer,
  handler_initiated boolean default false,
  created_at timestamptz default now()
);

alter table public.permanence_tier_transitions enable row level security;

create policy "Users can view their own tier transitions"
  on public.permanence_tier_transitions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tier transitions"
  on public.permanence_tier_transitions for insert
  with check (auth.uid() = user_id);

create index if not exists idx_permanence_transitions_user_at
  on public.permanence_tier_transitions(user_id, created_at);

-- ============================================
-- View: permanence_summary
-- ============================================

create or replace view public.permanence_summary as
select
  user_id,
  count(*) as total_content_pieces,
  jsonb_build_object(
    '1', count(*) filter (where permanence_tier = 1),
    '2', count(*) filter (where permanence_tier = 2),
    '3', count(*) filter (where permanence_tier = 3),
    '4', count(*) filter (where permanence_tier = 4),
    '5', count(*) filter (where permanence_tier = 5)
  ) as pieces_by_tier,
  coalesce(sum(ratchet_weight), 0) as total_ratchet_weight,
  coalesce(sum(estimated_external_copies), 0) as total_estimated_external_copies,
  count(*) filter (where sober_acknowledged = true) as sober_acknowledged_count,
  count(*) filter (where sober_acknowledged = false and permanence_tier >= 2) as unacknowledged_count,
  max(permanence_tier) as highest_tier_reached,
  array_agg(distinct platform) filter (where platform is not null) as platforms_used,
  case
    when count(*) filter (where permanence_tier >= 4) > 0
    then round(
      avg(estimated_external_copies) filter (where permanence_tier >= 4)::numeric, 1
    )
    else 0
  end as avg_estimated_copies_tier_4_plus
from public.content_permanence
group by user_id;
