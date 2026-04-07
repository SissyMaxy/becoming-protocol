-- Track follower count over time for growth analytics
create table if not exists twitter_follower_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  follower_count int not null,
  following_count int not null default 0,
  recorded_at timestamptz not null default now()
);

-- Index for time-range queries
create index idx_twitter_follower_counts_user_time
  on twitter_follower_counts (user_id, recorded_at desc);

-- RLS
alter table twitter_follower_counts enable row level security;
create policy "Users see own follower counts"
  on twitter_follower_counts for select using (auth.uid() = user_id);
create policy "Users insert own follower counts"
  on twitter_follower_counts for insert with check (auth.uid() = user_id);
