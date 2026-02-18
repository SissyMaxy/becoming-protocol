-- ============================================
-- 053: Bambi State Tracking
-- Bambi-Maxy Fusion (#2)
-- Trance depth, trigger conditioning, content audit.
-- Bambi as a depth of Maxy, not a separate identity.
-- ============================================

-- ============================================
-- Table: bambi_states
-- ============================================

create table if not exists public.bambi_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  session_start timestamptz default now(),
  session_end timestamptz,
  session_type text not null check (session_type in (
    'hypno_listen', 'guided_trance', 'handler_invoked',
    'spontaneous', 'trigger_test', 'conditioning_session'
  )),
  entry_method text check (entry_method is null or entry_method in (
    'audio_file', 'handler_text', 'self_induced', 'trigger_phrase', 'environmental_cue'
  )),
  content_ref text,
  depth_estimate integer default 0 check (depth_estimate >= 0 and depth_estimate <= 10),
  maxy_alignment_score integer default 5 check (maxy_alignment_score >= 1 and maxy_alignment_score <= 10),
  triggers_used text[] default '{}',
  triggers_responded_to text[] default '{}',
  new_triggers_installed text[] default '{}',
  arousal_at_start integer,
  arousal_at_end integer,
  denial_day integer,
  post_session_state text check (post_session_state is null or post_session_state in (
    'energized', 'compliant', 'foggy', 'aroused', 'peaceful', 'disoriented', 'resistant'
  )),
  handler_invoked boolean default false,
  handler_goal text,
  handler_goal_achieved boolean,
  notes text,
  created_at timestamptz default now()
);

alter table public.bambi_states enable row level security;

create policy "Users can view their own bambi states"
  on public.bambi_states for select
  using (auth.uid() = user_id);

create policy "Users can insert their own bambi states"
  on public.bambi_states for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own bambi states"
  on public.bambi_states for update
  using (auth.uid() = user_id);

create index if not exists idx_bambi_states_user_start
  on public.bambi_states(user_id, session_start);

create index if not exists idx_bambi_states_user_type
  on public.bambi_states(user_id, session_type);

-- ============================================
-- Table: conditioning_triggers
-- ============================================

create table if not exists public.conditioning_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  trigger_phrase text not null,
  trigger_category text not null check (trigger_category in (
    'identity', 'compliance', 'arousal', 'cognitive',
    'behavioral', 'emotional', 'dissociative', 'maxy_specific'
  )),
  source text check (source is null or source in (
    'bambi_sleep', 'custom_handler', 'self_created', 'partner_installed', 'other_hypno'
  )),
  installation_depth integer default 0 check (installation_depth >= 0 and installation_depth <= 10),
  first_exposure_at timestamptz,
  last_tested_at timestamptz,
  total_exposures integer default 0,
  successful_responses integer default 0,
  response_rate numeric generated always as (
    case when total_exposures > 0
      then successful_responses::numeric / total_exposures
      else 0
    end
  ) stored,
  serves_maxy boolean default true,
  conflict_notes text,
  handler_can_invoke boolean default false,
  last_handler_invocation_at timestamptz,
  handler_invocation_count integer default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, trigger_phrase)
);

alter table public.conditioning_triggers enable row level security;

create policy "Users can view their own conditioning triggers"
  on public.conditioning_triggers for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conditioning triggers"
  on public.conditioning_triggers for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conditioning triggers"
  on public.conditioning_triggers for update
  using (auth.uid() = user_id);

create index if not exists idx_conditioning_triggers_user_category
  on public.conditioning_triggers(user_id, trigger_category);

create index if not exists idx_conditioning_triggers_user_handler
  on public.conditioning_triggers(user_id, handler_can_invoke);

-- ============================================
-- Table: content_library_audit
-- ============================================

create table if not exists public.content_library_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  content_identifier text not null,
  content_source text check (content_source is null or content_source in (
    'bambi_sleep', 'bambi_platinum', 'custom', 'shibbysays', 'vive_hypnosis', 'other'
  )),
  maxy_alignment integer not null check (maxy_alignment >= 1 and maxy_alignment <= 10),
  useful_elements text[] default '{}',
  conflicting_elements text[] default '{}',
  triggers_present text[] default '{}',
  recommended_usage text check (recommended_usage is null or recommended_usage in (
    'unrestricted', 'with_handler_framing', 'selected_segments_only', 'avoid', 'replace_with_custom'
  )),
  handler_pre_frame text,
  handler_post_frame text,
  times_used integer default 0,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, content_identifier)
);

alter table public.content_library_audit enable row level security;

create policy "Users can view their own content audits"
  on public.content_library_audit for select
  using (auth.uid() = user_id);

create policy "Users can insert their own content audits"
  on public.content_library_audit for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own content audits"
  on public.content_library_audit for update
  using (auth.uid() = user_id);

create index if not exists idx_content_library_audit_user_alignment
  on public.content_library_audit(user_id, maxy_alignment);

-- ============================================
-- View: trigger_effectiveness
-- ============================================

create or replace view public.trigger_effectiveness as
select
  user_id,
  trigger_phrase,
  trigger_category,
  installation_depth,
  response_rate,
  total_exposures,
  serves_maxy,
  handler_can_invoke
from public.conditioning_triggers
where active = true
order by response_rate desc;

-- ============================================
-- View: bambi_session_summary
-- ============================================

create or replace view public.bambi_session_summary as
select
  user_id,
  count(*) as total_sessions,
  round(avg(depth_estimate)::numeric, 1) as avg_depth,
  count(*) filter (where session_start >= now() - interval '7 days') as sessions_last_7_days,
  count(*) filter (where session_start >= now() - interval '30 days') as sessions_last_30_days,
  round(avg(maxy_alignment_score)::numeric, 1) as avg_maxy_alignment,
  count(*) filter (where handler_invoked = true) as handler_invoked_count,
  case
    when count(*) filter (where handler_invoked = true) > 0
    then round(
      count(*) filter (where handler_invoked = true and handler_goal_achieved = true)::numeric
      / count(*) filter (where handler_invoked = true),
      3
    )
    else 0
  end as handler_goal_achievement_rate,
  mode() within group (order by post_session_state) as most_common_post_state
from public.bambi_states
group by user_id;
