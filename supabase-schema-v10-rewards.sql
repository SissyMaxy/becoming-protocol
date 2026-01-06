-- Becoming Protocol Schema v10: Neurochemistry Reward System
-- Run this in Supabase SQL Editor after v9 schema

-- ============================================
-- USER REWARD STATE
-- Central points/level tracking per user
-- ============================================

create table if not exists user_reward_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,

  -- Points & Levels
  total_points int default 0,
  current_level int default 1 check (current_level between 1 and 10),
  level_title text default 'Curious',
  xp_in_current_level int default 0,

  -- Streak tracking (enhanced)
  current_streak int default 0,
  current_streak_multiplier decimal(3,2) default 1.0,

  -- Narration correction tracking
  daily_narration_count int default 0,
  lifetime_narration_count int default 0,
  narration_streak int default 0, -- Days hitting 10+ corrections
  last_narration_date date,

  -- Session gating
  anchoring_sessions_this_week int default 0,
  reward_sessions_this_week int default 0,
  last_session_date date,
  week_start_date date default (current_date - extract(dow from current_date)::int),

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_reward_state_user on user_reward_state(user_id);

-- ============================================
-- POINT TRANSACTIONS
-- Audit log of all point awards
-- ============================================

create table if not exists point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  points int not null,
  multiplier decimal(3,2) default 1.0,
  final_points int not null, -- points * multiplier

  source text not null check (source in (
    'task_complete', 'streak_day', 'achievement',
    'skip_resistance', 'session_complete', 'narration_milestone',
    'notification_response', 'jackpot', 'bonus'
  )),
  source_id uuid, -- Reference to task/achievement/session/etc
  source_details jsonb,

  created_at timestamptz default now()
);

create index if not exists idx_point_transactions_user on point_transactions(user_id);
create index if not exists idx_point_transactions_date on point_transactions(user_id, created_at desc);

-- ============================================
-- ACHIEVEMENTS
-- Master list of all available achievements
-- ============================================

create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text not null,
  icon text not null,

  rarity text not null check (rarity in (
    'common', 'uncommon', 'rare', 'epic', 'legendary'
  )),
  category text not null check (category in (
    'streak', 'level', 'sessions', 'engagement',
    'narration', 'anchors', 'investment', 'special'
  )),

  points int not null,

  -- Unlock conditions (evaluated by client or Edge Function)
  unlock_condition jsonb not null,
  -- e.g., { "type": "streak", "value": 7 }
  -- or { "type": "level", "value": 5 }

  is_hidden boolean default false, -- Don't show until unlocked

  created_at timestamptz default now()
);

-- ============================================
-- USER ACHIEVEMENTS
-- Junction table: which users have which achievements
-- ============================================

create table if not exists user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  achievement_id uuid references achievements(id) on delete cascade,

  unlocked_at timestamptz default now(),
  points_awarded int not null,

  unique(user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on user_achievements(user_id);

-- ============================================
-- USER ANCHORS
-- Sensory anchors for conditioning
-- ============================================

create table if not exists user_anchors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  anchor_type text not null check (anchor_type in (
    'scent', 'underwear', 'tucking', 'jewelry',
    'nail_polish', 'makeup', 'clothing', 'custom'
  )),
  name text not null, -- e.g., "Flowerbomb perfume"

  is_active boolean default true,
  effectiveness_rating int check (effectiveness_rating between 1 and 5),
  times_used int default 0,
  last_used_at timestamptz,

  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_anchors_user on user_anchors(user_id);
create index if not exists idx_user_anchors_active on user_anchors(user_id, is_active) where is_active = true;

-- ============================================
-- REWARD CONTENT
-- Library of audio/text/video content
-- ============================================

create table if not exists reward_content (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text,
  content_type text not null check (content_type in (
    'audio', 'text', 'video', 'image', 'hypno'
  )),

  tier text not null check (tier in (
    'daily', 'earned', 'premium', 'vault'
  )),

  -- Content source
  content_url text,
  thumbnail_url text,
  duration_seconds int,

  -- Unlock requirements
  unlock_requirement jsonb,
  -- e.g., { "type": "sessions", "value": 5 }
  -- or { "type": "achievement", "id": "xxx" }

  -- Metadata
  tags text[],
  intensity_level int check (intensity_level between 1 and 5),

  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_reward_content_tier on reward_content(tier) where is_active = true;

-- ============================================
-- AROUSAL SESSIONS
-- Track conditioning and reward sessions
-- ============================================

create table if not exists arousal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  session_type text not null check (session_type in ('anchoring', 'reward')),

  -- Pre-session survey
  pre_arousal_level int check (pre_arousal_level between 1 and 10),
  active_anchors uuid[], -- References to user_anchors
  pre_notes text,

  -- Content played
  content_id uuid references reward_content(id),
  content_started_at timestamptz,
  content_duration_seconds int,

  -- Post-session survey
  post_arousal_level int check (post_arousal_level between 1 and 10),
  experience_quality int check (experience_quality between 1 and 5),
  anchor_effectiveness int check (anchor_effectiveness between 1 and 5),
  post_notes text,

  -- Session metadata
  started_at timestamptz default now(),
  completed_at timestamptz,
  points_awarded int default 0,

  -- Status
  status text default 'in_progress' check (status in (
    'in_progress', 'completed', 'abandoned'
  ))
);

create index if not exists idx_arousal_sessions_user on arousal_sessions(user_id);
create index if not exists idx_arousal_sessions_week on arousal_sessions(user_id, started_at);
create index if not exists idx_arousal_sessions_status on arousal_sessions(user_id, status) where status = 'in_progress';

-- ============================================
-- USER CONTENT UNLOCKS
-- Track which content user has access to
-- ============================================

create table if not exists user_content_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content_id uuid references reward_content(id) on delete cascade,

  unlocked_at timestamptz default now(),
  unlock_source text, -- 'session', 'achievement', 'purchase', 'level', etc

  times_played int default 0,
  last_played_at timestamptz,

  unique(user_id, content_id)
);

create index if not exists idx_user_content_unlocks_user on user_content_unlocks(user_id);

-- ============================================
-- SCHEDULED NOTIFICATIONS
-- Random notification scheduling
-- ============================================

create table if not exists scheduled_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  notification_type text not null check (notification_type in (
    'micro_task', 'affirmation', 'content_unlock',
    'challenge', 'jackpot', 'anchor_reminder'
  )),

  scheduled_for timestamptz not null,
  expires_at timestamptz, -- Urgency window

  payload jsonb not null, -- { title, body, action, data }
  points_potential int default 0, -- Points if responded to
  bonus_multiplier decimal(3,2) default 1.0, -- Time-limited bonus

  -- Status tracking
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  response_data jsonb,

  status text default 'pending' check (status in (
    'pending', 'sent', 'opened', 'responded', 'expired', 'dismissed'
  )),

  created_at timestamptz default now()
);

create index if not exists idx_scheduled_notifications_pending on scheduled_notifications(user_id, scheduled_for)
  where status = 'pending';
create index if not exists idx_scheduled_notifications_user on scheduled_notifications(user_id, created_at desc);

-- ============================================
-- NOTIFICATION TEMPLATES
-- Reusable notification content
-- ============================================

create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),

  notification_type text not null,
  title text not null,
  body text not null,
  action_text text,

  points int default 0,

  -- Conditions for when to use
  conditions jsonb, -- { "min_level": 3, "has_anchor": true, etc }

  weight int default 1, -- For weighted random selection

  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_notification_templates_type on notification_templates(notification_type) where is_active = true;

-- ============================================
-- USER NOTIFICATION SETTINGS
-- Per-user notification preferences
-- ============================================

create table if not exists user_notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,

  notifications_enabled boolean default true,

  -- Time windows
  earliest_hour int default 9 check (earliest_hour between 0 and 23),
  latest_hour int default 21 check (latest_hour between 0 and 23),

  -- Frequency
  min_notifications_per_day int default 4,
  max_notifications_per_day int default 8,

  -- Type preferences (weights)
  type_weights jsonb default '{
    "micro_task": 40,
    "affirmation": 25,
    "content_unlock": 20,
    "challenge": 10,
    "jackpot": 5
  }',

  -- Push token
  push_token text,
  push_provider text, -- 'expo', 'fcm', 'apns'

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_notification_settings_user on user_notification_settings(user_id);

-- ============================================
-- ANCHOR EFFECTIVENESS LOG
-- Track anchor usage over time
-- ============================================

create table if not exists anchor_effectiveness_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anchor_id uuid references user_anchors(id) on delete cascade,
  session_id uuid references arousal_sessions(id) on delete cascade,

  effectiveness_rating int check (effectiveness_rating between 1 and 5),
  arousal_change int, -- post - pre arousal level

  recorded_at timestamptz default now()
);

create index if not exists idx_anchor_effectiveness_log_anchor on anchor_effectiveness_log(anchor_id);
create index if not exists idx_anchor_effectiveness_log_user on anchor_effectiveness_log(user_id);

-- ============================================
-- HELPER FUNCTION: INCREMENT SESSION COUNT
-- ============================================

create or replace function increment_session_count(
  p_user_id uuid,
  p_field text
)
returns void as $$
begin
  if p_field = 'anchoring_sessions_this_week' then
    update user_reward_state
    set anchoring_sessions_this_week = anchoring_sessions_this_week + 1,
        last_session_date = current_date,
        updated_at = now()
    where user_id = p_user_id;
  elsif p_field = 'reward_sessions_this_week' then
    update user_reward_state
    set reward_sessions_this_week = reward_sessions_this_week + 1,
        last_session_date = current_date,
        updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$ language plpgsql security definer;

-- ============================================
-- HELPER FUNCTION: RESET WEEKLY SESSIONS
-- Call this via cron or on user load when week changes
-- ============================================

create or replace function reset_weekly_sessions(p_user_id uuid)
returns void as $$
declare
  v_current_week_start date;
begin
  -- Calculate current week start (Monday)
  v_current_week_start := current_date - extract(dow from current_date)::int;

  update user_reward_state
  set anchoring_sessions_this_week = 0,
      reward_sessions_this_week = 0,
      week_start_date = v_current_week_start,
      updated_at = now()
  where user_id = p_user_id
    and week_start_date < v_current_week_start;
end;
$$ language plpgsql security definer;

-- ============================================
-- RLS POLICIES
-- ============================================

alter table user_reward_state enable row level security;
alter table point_transactions enable row level security;
alter table achievements enable row level security;
alter table user_achievements enable row level security;
alter table user_anchors enable row level security;
alter table reward_content enable row level security;
alter table arousal_sessions enable row level security;
alter table user_content_unlocks enable row level security;
alter table scheduled_notifications enable row level security;
alter table notification_templates enable row level security;
alter table user_notification_settings enable row level security;
alter table anchor_effectiveness_log enable row level security;

-- User tables: users can only access their own data
create policy "Users can manage own reward_state" on user_reward_state for all using (auth.uid() = user_id);
create policy "Users can manage own point_transactions" on point_transactions for all using (auth.uid() = user_id);
create policy "Users can manage own user_achievements" on user_achievements for all using (auth.uid() = user_id);
create policy "Users can manage own user_anchors" on user_anchors for all using (auth.uid() = user_id);
create policy "Users can manage own arousal_sessions" on arousal_sessions for all using (auth.uid() = user_id);
create policy "Users can manage own content_unlocks" on user_content_unlocks for all using (auth.uid() = user_id);
create policy "Users can manage own scheduled_notifications" on scheduled_notifications for all using (auth.uid() = user_id);
create policy "Users can manage own notification_settings" on user_notification_settings for all using (auth.uid() = user_id);
create policy "Users can manage own anchor_effectiveness_log" on anchor_effectiveness_log for all using (auth.uid() = user_id);

-- Global tables: authenticated users can read
create policy "Authenticated users can read achievements" on achievements for select using (auth.role() = 'authenticated');
create policy "Authenticated users can read reward_content" on reward_content for select using (auth.role() = 'authenticated' and is_active = true);
create policy "Authenticated users can read notification_templates" on notification_templates for select using (auth.role() = 'authenticated' and is_active = true);

-- ============================================
-- SEED DATA: ACHIEVEMENTS
-- ============================================

insert into achievements (name, description, icon, rarity, category, points, unlock_condition) values
-- Streak achievements
('First Week', '7-day streak achieved', 'flame', 'common', 'streak', 25, '{"type": "streak", "value": 7}'),
('Fortnight Strong', '14-day streak achieved', 'flame', 'uncommon', 'streak', 50, '{"type": "streak", "value": 14}'),
('Monthly Momentum', '30-day streak achieved', 'flame', 'rare', 'streak', 100, '{"type": "streak", "value": 30}'),
('Unstoppable', '60-day streak achieved', 'flame', 'epic', 'streak', 250, '{"type": "streak", "value": 60}'),
('Century Club', '100-day streak achieved', 'flame', 'legendary', 'streak', 500, '{"type": "streak", "value": 100}'),

-- Level achievements
('Awakening', 'Reached level 3', 'star', 'common', 'level', 25, '{"type": "level", "value": 3}'),
('Transforming', 'Reached level 5', 'star', 'uncommon', 'level', 50, '{"type": "level", "value": 5}'),
('Flourishing', 'Reached level 7', 'star', 'rare', 'level', 100, '{"type": "level", "value": 7}'),
('Complete', 'Reached level 10 - maximum transformation', 'star', 'legendary', 'level', 500, '{"type": "level", "value": 10}'),

-- Session achievements
('First Session', 'Completed first arousal session', 'heart', 'common', 'sessions', 25, '{"type": "sessions", "value": 1}'),
('Conditioning', '10 anchoring sessions completed', 'heart', 'uncommon', 'sessions', 50, '{"type": "sessions", "value": 10}'),
('Deeply Anchored', '50 sessions completed', 'heart', 'epic', 'sessions', 250, '{"type": "sessions", "value": 50}'),
('Session Master', '100 sessions completed', 'heart', 'legendary', 'sessions', 500, '{"type": "sessions", "value": 100}'),

-- Narration achievements
('Inner Voice', 'First narration correction', 'message-circle', 'common', 'narration', 25, '{"type": "narration_count", "value": 1}'),
('Mindful Observer', '100 lifetime corrections', 'message-circle', 'uncommon', 'narration', 50, '{"type": "narration_count", "value": 100}'),
('Thought Catcher', '500 lifetime corrections', 'message-circle', 'rare', 'narration', 100, '{"type": "narration_count", "value": 500}'),
('Master of Thoughts', '1000 lifetime corrections', 'message-circle', 'epic', 'narration', 250, '{"type": "narration_count", "value": 1000}'),

-- Anchor achievements
('First Anchor', 'Created first sensory anchor', 'anchor', 'common', 'anchors', 25, '{"type": "anchors", "value": 1}'),
('Sensory Collection', '5 anchors configured', 'anchor', 'uncommon', 'anchors', 50, '{"type": "anchors", "value": 5}'),
('Fully Anchored', '10 anchors configured', 'anchor', 'rare', 'anchors', 100, '{"type": "anchors", "value": 10}'),

-- Engagement achievements
('First Points', 'Earned first reward points', 'zap', 'common', 'engagement', 25, '{"type": "total_points", "value": 1}'),
('Rising Star', 'Earned 500 total points', 'zap', 'uncommon', 'engagement', 50, '{"type": "total_points", "value": 500}'),
('Point Collector', 'Earned 2500 total points', 'zap', 'rare', 'engagement', 100, '{"type": "total_points", "value": 2500}'),
('Point Master', 'Earned 10000 total points', 'zap', 'legendary', 'engagement', 500, '{"type": "total_points", "value": 10000}')
on conflict do nothing;

-- ============================================
-- SEED DATA: NOTIFICATION TEMPLATES
-- ============================================

insert into notification_templates (notification_type, title, body, action_text, points, weight) values
-- Micro tasks (40% weight)
('micro_task', 'Quick Practice', 'Take 30 seconds to practice your voice pitch', 'Practice Now', 5, 3),
('micro_task', 'Posture Check', 'Roll your shoulders back and lengthen your spine', 'Done', 5, 3),
('micro_task', 'Affirmation Moment', 'Say "I am becoming who I was meant to be"', 'Said It', 5, 3),
('micro_task', 'Feminine Walk', 'Take 10 steps with intention and grace', 'Completed', 5, 2),
('micro_task', 'Mirror Check', 'Look in the mirror and smile at her', 'Done', 5, 2),
('micro_task', 'Breathe Softly', 'Take 5 soft, feminine breaths', 'Breathed', 5, 2),

-- Affirmations (25% weight)
('affirmation', 'Remember', 'You are making incredible progress. Every day counts.', null, 0, 2),
('affirmation', 'Truth', 'She was always there, waiting to emerge.', null, 0, 2),
('affirmation', 'Becoming', 'Each small step is part of your beautiful transformation.', null, 0, 2),
('affirmation', 'Identity', 'The woman you are becoming is already inside you.', null, 0, 1),
('affirmation', 'Strength', 'Your commitment to yourself is inspiring.', null, 0, 1),

-- Content unlocks (20% weight)
('content_unlock', 'New Content Available', 'A new piece of content has been unlocked for you', 'View Now', 10, 2),
('content_unlock', 'Reward Ready', 'You have earned access to new material', 'Claim', 10, 1),

-- Challenges (10% weight)
('challenge', 'Mini Challenge', 'Use your feminine voice for the next 5 minutes', 'Accept', 25, 1),
('challenge', 'Style Challenge', 'Add one feminine touch to your current outfit', 'Accept', 25, 1),
('challenge', 'Posture Challenge', 'Maintain perfect feminine posture for 10 minutes', 'Accept', 25, 1),

-- Jackpot (5% weight)
('jackpot', 'Bonus Round!', 'Respond in 5 minutes for 5x points!', 'Claim', 50, 1)
on conflict do nothing;

-- ============================================
-- COMMENTS
-- ============================================

comment on table user_reward_state is 'Central tracking for user points, level, streak multiplier, and session gating';
comment on table point_transactions is 'Audit log of all point awards with source tracking';
comment on table achievements is 'Master list of available achievements with unlock conditions';
comment on table user_achievements is 'Junction table tracking which achievements users have unlocked';
comment on table user_anchors is 'Sensory anchors configured by user for conditioning sessions';
comment on table reward_content is 'Library of content (audio, video, text, hypno) with tier-based access';
comment on table arousal_sessions is 'Tracked conditioning and reward sessions with pre/post surveys';
comment on table user_content_unlocks is 'Tracks which content each user has unlocked access to';
comment on table scheduled_notifications is 'Random notifications scheduled for users at variable intervals';
comment on table notification_templates is 'Reusable templates for generating notifications';
comment on table user_notification_settings is 'Per-user notification preferences and push tokens';
comment on table anchor_effectiveness_log is 'Historical tracking of anchor effectiveness across sessions';
