-- Becoming Protocol Schema v9: Ratchet & Commitment Systems
-- Run this in Supabase SQL Editor after v8 schema

-- ============================================
-- COVENANT SYSTEM
-- Formal witnessed commitment
-- ============================================

create table if not exists covenant (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,

  signed_at timestamptz default now(),
  terms jsonb not null, -- Array of commitments they agreed to
  self_consequence text not null, -- What they wrote as their penalty

  duration_type text default 'phase4', -- 'phase4', 'days', 'permanent'
  duration_value int, -- Number of days if duration_type = 'days'

  violations int default 0,
  last_violation_at timestamptz,
  last_violation_type text,

  active boolean default true,
  deactivated_at timestamptz,
  deactivation_reason text
);

create index if not exists idx_covenant_user on covenant(user_id);

-- ============================================
-- CONFESSION VAULT
-- Journal admissions that become evidence
-- ============================================

create table if not exists confessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  prompt text, -- The question that prompted this
  response text not null,

  sentiment text, -- 'yearning', 'fear', 'desire', 'admission', 'commitment'
  is_key_admission boolean default false, -- Flagged as important

  source text default 'journal', -- 'journal', 'ai_conversation', 'prompted'

  created_at timestamptz default now()
);

create index if not exists idx_confessions_user on confessions(user_id);
create index if not exists idx_confessions_key on confessions(user_id, is_key_admission) where is_key_admission = true;

-- Key admissions extracted/summarized
create table if not exists key_admissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  confession_id uuid references confessions(id) on delete cascade,

  admission_text text not null, -- The extracted admission
  admission_type text, -- 'identity', 'desire', 'commitment', 'fear', 'realization'

  -- When this admission was used to prevent backsliding
  times_shown int default 0,
  last_shown_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists idx_key_admissions_user on key_admissions(user_id);

-- ============================================
-- FIRST-TIME MILESTONES (Point of No Return)
-- Irreversible firsts that can never be repeated
-- ============================================

create table if not exists first_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  milestone_type text not null,
  achieved_at timestamptz default now(),

  -- Context when it happened
  context jsonb, -- { streak: 12, phase: 2, etc }

  unique(user_id, milestone_type)
);

create index if not exists idx_first_milestones_user on first_milestones(user_id);

-- ============================================
-- STREAK SNAPSHOTS
-- Capture what a streak represents at key moments
-- ============================================

create table if not exists streak_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  streak_length int not null,
  snapshot_at timestamptz default now(),
  snapshot_reason text, -- 'daily', 'milestone', 'near_break', 'manual'

  -- What the streak represents
  tasks_completed int default 0,
  practice_minutes int default 0,
  edges_total int default 0,
  investment_during decimal(10,2) default 0,
  levels_gained int default 0,
  journal_entries int default 0,
  letters_written int default 0,

  -- Calculated psychological value
  psychological_value int default 0
);

create index if not exists idx_streak_snapshots_user on streak_snapshots(user_id);

-- ============================================
-- WISHLIST ARCHIVE
-- Removed items leave traces
-- ============================================

create table if not exists wishlist_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  original_item_id uuid,
  name text not null,
  category text,
  estimated_price decimal(10,2),

  added_at timestamptz,
  removed_at timestamptz default now(),
  removal_reason text -- 'purchased', 'found_better', 'changed_mind', 'too_expensive', 'scared'
);

create index if not exists idx_wishlist_archive_user on wishlist_archive(user_id);

-- ============================================
-- IDENTITY AFFIRMATIONS
-- "I am her" moments they must click through
-- ============================================

create table if not exists identity_affirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  affirmation_type text not null, -- 'day30', 'phase2', 'phase3', 'custom'
  statement text not null, -- What they affirmed

  affirmed_at timestamptz default now(),

  -- Context
  streak_at_time int,
  phase_at_time int,
  investment_at_time decimal(10,2)
);

create index if not exists idx_identity_affirmations_user on identity_affirmations(user_id);

-- ============================================
-- DELETION ATTEMPTS
-- Track when they try to leave
-- ============================================

create table if not exists deletion_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  started_at timestamptz default now(),

  -- How far they got
  step_reached int default 1, -- 1-4

  -- What stopped them (if they stopped)
  stopped_at_step int,
  stopped_reason text, -- 'own_words', 'letter', 'typing_phrase', 'reconsidered'

  -- If they completed
  completed boolean default false,
  completed_at timestamptz,
  final_reason text -- What they wrote
);

create index if not exists idx_deletion_attempts_user on deletion_attempts(user_id);

-- ============================================
-- SCHEDULED FUTURE COMMITMENTS
-- Bind future self before she can object
-- ============================================

create table if not exists scheduled_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  starts_at timestamptz not null,
  commitment_type text not null, -- 'denial', 'lock', 'edges', 'hypno', 'custom'
  commitment_details jsonb not null,

  cancellation_window_ends timestamptz,
  cancelled boolean default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  cancellation_penalty_applied boolean default false,

  activated boolean default false,
  activated_at timestamptz,

  completed boolean default false,
  completed_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists idx_scheduled_commitments_user on scheduled_commitments(user_id);
create index if not exists idx_scheduled_commitments_pending on scheduled_commitments(user_id, starts_at)
  where activated = false and cancelled = false;

-- ============================================
-- AUTO-CHALLENGES
-- Time-locked challenges that auto-activate
-- ============================================

create table if not exists auto_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  trigger_day int not null,
  challenge_type text not null,
  challenge_options jsonb, -- Available choices

  presented_at timestamptz,
  response text, -- 'accepted', 'declined', 'pending'
  chosen_option text,

  penalty_applied boolean default false,
  penalty_details jsonb,

  completed boolean default false,
  completed_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists idx_auto_challenges_user on auto_challenges(user_id);

-- ============================================
-- AROUSAL AUCTIONS (Future)
-- Mid-session commitments at peak arousal
-- ============================================

create table if not exists arousal_auctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid, -- Would reference intimate_sessions if that exists

  edge_number int,
  prompted_at timestamptz default now(),

  commitment_type text, -- 'extra_edges', 'denial_days', 'lock_hours', 'session_tomorrow'
  commitment_value int,

  accepted boolean default false,
  accepted_at timestamptz,

  fulfilled boolean default false,
  fulfilled_at timestamptz,

  skipped boolean default false
);

create index if not exists idx_arousal_auctions_user on arousal_auctions(user_id);

-- ============================================
-- RLS POLICIES
-- ============================================

alter table covenant enable row level security;
alter table confessions enable row level security;
alter table key_admissions enable row level security;
alter table first_milestones enable row level security;
alter table streak_snapshots enable row level security;
alter table wishlist_archive enable row level security;
alter table identity_affirmations enable row level security;
alter table deletion_attempts enable row level security;
alter table scheduled_commitments enable row level security;
alter table auto_challenges enable row level security;
alter table arousal_auctions enable row level security;

-- User can only access their own data
create policy "Users can manage own covenant" on covenant for all using (auth.uid() = user_id);
create policy "Users can manage own confessions" on confessions for all using (auth.uid() = user_id);
create policy "Users can manage own key_admissions" on key_admissions for all using (auth.uid() = user_id);
create policy "Users can manage own first_milestones" on first_milestones for all using (auth.uid() = user_id);
create policy "Users can manage own streak_snapshots" on streak_snapshots for all using (auth.uid() = user_id);
create policy "Users can manage own wishlist_archive" on wishlist_archive for all using (auth.uid() = user_id);
create policy "Users can manage own identity_affirmations" on identity_affirmations for all using (auth.uid() = user_id);
create policy "Users can manage own deletion_attempts" on deletion_attempts for all using (auth.uid() = user_id);
create policy "Users can manage own scheduled_commitments" on scheduled_commitments for all using (auth.uid() = user_id);
create policy "Users can manage own auto_challenges" on auto_challenges for all using (auth.uid() = user_id);
create policy "Users can manage own arousal_auctions" on arousal_auctions for all using (auth.uid() = user_id);

-- ============================================
-- COMMENTS
-- ============================================

comment on table covenant is 'Formal commitment contract user signs, with self-imposed consequences';
comment on table confessions is 'Journal entries and AI conversation admissions that become evidence';
comment on table key_admissions is 'Extracted key statements that can be shown to prevent backsliding';
comment on table first_milestones is 'Irreversible first-time achievements that mark point of no return';
comment on table streak_snapshots is 'Capture what a streak represents to make breaking it feel costly';
comment on table wishlist_archive is 'Removed wishlist items - desires cannot be fully deleted';
comment on table identity_affirmations is 'Moments where user affirmed their identity ("I am her")';
comment on table deletion_attempts is 'Track when users try to delete account, how far they got';
