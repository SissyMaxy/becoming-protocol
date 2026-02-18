-- ============================================
-- 051: Resistance Events Tracking
-- Diagnosis Weaponization (#4)
-- Measures and optimizes exploitation strategies
-- per resistance type and diagnosis factor.
-- ============================================

-- Table: resistance_events
create table if not exists public.resistance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  event_timestamp timestamptz default now(),
  resistance_type text not null check (resistance_type in (
    'decline', 'delay', 'partial', 'ignore',
    'domain_avoidance', 'exit_attempt', 'session_skip', 'commitment_break'
  )),
  diagnosis_factor text check (diagnosis_factor is null or diagnosis_factor in (
    'adhd_initiation', 'adhd_attention', 'adhd_working_memory',
    'adhd_emotional_regulation', 'adhd_time_perception',
    'anxiety_catastrophizing', 'anxiety_avoidance', 'anxiety_paralysis',
    'depression_anhedonia', 'depression_worthlessness', 'depression_withdrawal',
    'shame_exposure_fear', 'shame_identity_conflict', 'shame_post_arousal',
    'genuine_boundary', 'unknown'
  )),
  task_domain text,
  task_id uuid,
  arousal_at_event integer,
  denial_day_at_event integer,
  time_of_day text,
  exploitation_strategy_used text check (exploitation_strategy_used is null or exploitation_strategy_used in (
    'decision_elimination', 'arousal_gated_compliance', 'guilt_leverage',
    'identity_reframing', 'manufactured_urgency', 'friction_removal',
    'arousal_maintenance', 'system_remembers', 'handler_regulates',
    'time_ownership', 'catastrophize_redirect', 'avoidance_cost',
    'paralysis_elimination', 'pleasure_source', 'anhedonia_bypass',
    'worthlessness_reframe', 'shame_eroticize', 'none'
  )),
  outcome text not null check (outcome in (
    'complied', 'partially_complied', 'resisted', 'escalated', 'abandoned'
  )),
  escalation_level_reached integer default 0,
  handler_mode_at_event text,
  resolution_seconds integer,
  notes text,
  created_at timestamptz default now()
);

-- RLS
alter table public.resistance_events enable row level security;

create policy "Users can view their own resistance events"
  on public.resistance_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own resistance events"
  on public.resistance_events for insert
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_resistance_events_user_id
  on public.resistance_events(user_id);

create index if not exists idx_resistance_events_timestamp
  on public.resistance_events(event_timestamp);

create index if not exists idx_resistance_events_diagnosis
  on public.resistance_events(diagnosis_factor);

create index if not exists idx_resistance_events_outcome
  on public.resistance_events(outcome);

-- View: resistance_effectiveness
-- Aggregates compliance rates per diagnosis factor + exploitation strategy
create or replace view public.resistance_effectiveness as
select
  user_id,
  diagnosis_factor,
  exploitation_strategy_used,
  count(*) as total_events,
  round(
    count(*) filter (where outcome in ('complied', 'partially_complied'))::numeric
    / nullif(count(*), 0),
    3
  ) as compliance_rate,
  round(avg(resolution_seconds)::numeric, 0) as avg_resolution_seconds
from public.resistance_events
where diagnosis_factor is not null
  and exploitation_strategy_used is not null
group by user_id, diagnosis_factor, exploitation_strategy_used;
