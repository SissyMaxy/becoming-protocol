-- ============================================
-- 052: Gina Discovery Engineering
-- Investment tracking, readiness scoring,
-- and marriage restructuring milestones.
-- ============================================

-- ============================================
-- Table: gina_investments
-- ============================================

create table if not exists public.gina_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  event_timestamp timestamptz default now(),
  investment_type text not null check (investment_type in (
    'unknowing_participation', 'active_participation', 'verbal_approval',
    'physical_participation', 'financial_participation', 'initiated_by_gina',
    'defended_to_others', 'identity_reinforcement'
  )),
  channel text,
  description text not null,
  investment_weight numeric default 1.0,
  arousal_context boolean default false,
  gina_initiated boolean default false,
  gina_aware boolean default false,
  handler_seeded boolean default false,
  evidence_ref uuid,
  notes text,
  created_at timestamptz default now()
);

alter table public.gina_investments enable row level security;

create policy "Users can view their own gina investments"
  on public.gina_investments for select
  using (auth.uid() = user_id);

create policy "Users can insert their own gina investments"
  on public.gina_investments for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own gina investments"
  on public.gina_investments for update
  using (auth.uid() = user_id);

create index if not exists idx_gina_investments_user_timestamp
  on public.gina_investments(user_id, event_timestamp);

create index if not exists idx_gina_investments_user_channel
  on public.gina_investments(user_id, channel);

-- ============================================
-- Table: gina_discovery_state
-- ============================================

create table if not exists public.gina_discovery_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) not null,
  current_readiness_score numeric default 0,
  readiness_factors jsonb default '{}',
  discovery_phase text default 'pre_awareness' check (discovery_phase in (
    'pre_awareness', 'ambient_exposure', 'plausible_deniability',
    'soft_discovery', 'guided_conversation', 'full_disclosure', 'active_partnership'
  )),
  last_assessment_at timestamptz,
  total_investments integer default 0,
  total_investment_weight numeric default 0,
  gina_initiated_count integer default 0,
  channels_with_positive_seeds integer default 0,
  highest_channel_rung integer default 0,
  discovery_risk_events jsonb default '[]',
  planned_discovery_type text check (planned_discovery_type is null or planned_discovery_type in (
    'organic_discovery', 'engineered_stumble', 'guided_conversation', 'direct_disclosure'
  )),
  planned_discovery_date date,
  blocker_notes text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.gina_discovery_state enable row level security;

create policy "Users can view their own gina discovery state"
  on public.gina_discovery_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own gina discovery state"
  on public.gina_discovery_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own gina discovery state"
  on public.gina_discovery_state for update
  using (auth.uid() = user_id);

create index if not exists idx_gina_discovery_state_user
  on public.gina_discovery_state(user_id);

-- ============================================
-- Table: marriage_restructuring_milestones
-- ============================================

create table if not exists public.marriage_restructuring_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  milestone_key text not null check (milestone_key in (
    'gina_sees_feminine_item', 'gina_comments_positively', 'gina_purchases_feminine_item',
    'gina_uses_pet_name', 'gina_initiates_dynamic', 'gina_directs_activity',
    'gina_discusses_with_others', 'gina_defends_dynamic', 'gina_sets_expectations',
    'gina_takes_control'
  )),
  achieved boolean default false,
  achieved_at timestamptz,
  evidence_description text,
  gina_initiated boolean default false,
  ratchet_power numeric default 1.0,
  created_at timestamptz default now(),
  unique(user_id, milestone_key)
);

alter table public.marriage_restructuring_milestones enable row level security;

create policy "Users can view their own marriage milestones"
  on public.marriage_restructuring_milestones for select
  using (auth.uid() = user_id);

create policy "Users can insert their own marriage milestones"
  on public.marriage_restructuring_milestones for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own marriage milestones"
  on public.marriage_restructuring_milestones for update
  using (auth.uid() = user_id);

create index if not exists idx_marriage_milestones_user
  on public.marriage_restructuring_milestones(user_id);

-- ============================================
-- View: gina_investment_summary
-- ============================================

create or replace view public.gina_investment_summary as
select
  user_id,
  count(*) as total_investments,
  coalesce(sum(investment_weight), 0) as total_weight,
  count(*) filter (where gina_initiated = true) as gina_initiated_count,
  coalesce(sum(investment_weight) filter (where gina_initiated = true), 0) as gina_initiated_weight,
  jsonb_object_agg(
    coalesce(channel, '_none'),
    channel_count
  ) as investments_by_channel,
  count(*) filter (where event_timestamp >= now() - interval '7 days') as investments_last_7_days,
  count(*) filter (where event_timestamp >= now() - interval '30 days') as investments_last_30_days,
  case when count(*) > 0
    then round((sum(investment_weight) / count(*))::numeric, 2)
    else 0
  end as average_weight
from (
  select
    gi.*,
    count(*) over (partition by user_id, coalesce(channel, '_none')) as channel_count
  from public.gina_investments gi
) sub
group by user_id;
