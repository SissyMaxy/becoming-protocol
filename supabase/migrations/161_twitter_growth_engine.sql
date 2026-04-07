-- Twitter Growth Engine — follow tracking and follower snapshots

-- Twitter follow tracking
create table if not exists twitter_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_handle text not null,
  source text not null,  -- 'followback', 'engage_follow', 'strategic', 'manual'
  source_detail text,
  status text not null default 'followed' check (status in ('followed', 'followed_back', 'unfollowed_stale', 'unfollowed_manual')),
  followed_at timestamptz not null default now(),
  followed_back_at timestamptz,
  unfollowed_at timestamptz,
  follower_count int,
  bio_snippet text,
  unique(user_id, target_handle)
);

create index idx_twitter_follows_status on twitter_follows(user_id, status);
create index idx_twitter_follows_stale on twitter_follows(user_id, status, followed_at) where status = 'followed' and followed_back_at is null;

alter table twitter_follows enable row level security;
create policy "Users see own follows" on twitter_follows for all using (auth.uid() = user_id);

-- Follower snapshot for detecting new followers
create table if not exists twitter_followers_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  processed boolean not null default false,
  unique(user_id, handle)
);

create index idx_followers_unprocessed on twitter_followers_snapshot(user_id, processed) where processed = false;

alter table twitter_followers_snapshot enable row level security;
create policy "Users see own followers" on twitter_followers_snapshot for all using (auth.uid() = user_id);

-- Add quote_tweet to content type constraint
alter table ai_generated_content drop constraint if exists ai_generated_content_content_type_check;
alter table ai_generated_content add constraint ai_generated_content_content_type_check
  check (content_type in (
    'tweet', 'reply', 'quote_tweet',
    'reddit_post', 'reddit_comment',
    'fetlife_post', 'fetlife_comment',
    'dm_response', 'gfe_message', 'sexting_message',
    'erotica', 'caption', 'journal_entry',
    'product_review', 'bio_update', 'engagement_bait'
  ));
