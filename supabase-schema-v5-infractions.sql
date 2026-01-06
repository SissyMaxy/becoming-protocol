-- Infractions table for accountability tracking
-- Run this in Supabase SQL Editor

create table if not exists infractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  -- Infraction type and severity
  type text not null, -- 'task_skip' | 'day_incomplete' | 'journal_skip' | 'streak_break' | 'pattern_skip' | 'gaming_detected'
  severity text not null, -- 'low' | 'medium' | 'high'

  -- Context
  date date not null,
  domain text, -- which domain if applicable
  task_id text, -- which task if applicable
  task_title text, -- task title for display
  reason text, -- user's stated reason for skip

  -- Black box context (user doesn't see directly)
  ai_notes text, -- AI's interpretation
  pattern_context jsonb, -- related patterns detected

  -- Partner visibility (for Gina's view)
  visible_to_partner boolean default true,
  partner_viewed_at timestamptz,

  created_at timestamptz default now()
);

-- Indexes for efficient queries
create index if not exists idx_infractions_user_date on infractions(user_id, date desc);
create index if not exists idx_infractions_partner_view on infractions(user_id, visible_to_partner, partner_viewed_at);
create index if not exists idx_infractions_type on infractions(user_id, type);

-- Enable RLS
alter table infractions enable row level security;

-- RLS Policies
drop policy if exists "Users can view own infractions" on infractions;
create policy "Users can view own infractions"
  on infractions for select using (auth.uid() = user_id);

drop policy if exists "Users can create own infractions" on infractions;
create policy "Users can create own infractions"
  on infractions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own infractions" on infractions;
create policy "Users can update own infractions"
  on infractions for update using (auth.uid() = user_id);
