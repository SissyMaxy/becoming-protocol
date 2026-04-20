-- Content Coercion Engine
--
-- The Handler doesn't ask for content — it prescribes content. Each brief is
-- a specific feminization directive Maxy must complete to produce the asset:
-- outfit, pose, makeup, script, angle. The brief becomes a task she can't
-- complete without performing femininity. Fulfillment produces the asset;
-- the asset feeds follower growth across platforms.
--
-- Flow:
--   1. Handler (or cron) writes content_briefs rows (one per planned asset)
--   2. Each brief has feminization_directives — the REAL purpose. Maxy has to
--      actually put on the lingerie, apply the makeup, pose, record — to
--      produce the asset the bot will post.
--   3. Maxy submits via a Handler upload flow → creates content_submissions
--      row linking the brief to the actual asset (photo/video/audio URL).
--   4. Orchestrator sees brief.status = 'ready_to_post' when submission lands.
--   5. Platform engine (reddit-original, fansly-post, etc.) picks it up on
--      next tick, generates caption/title from brief.caption_angle + voice
--      corpus, publishes across brief.target_platforms.
--   6. Engagement metrics flow back to content_briefs.performance jsonb so
--      future briefs can lean on what worked.

create table if not exists content_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What kind of asset is Maxy expected to produce
  brief_type text not null
    check (brief_type in ('photo','photo_set','video','audio','voice_note','text_only')),

  -- The feminization directives — the coercive part. JSONB so structure is flexible.
  -- Example: {
  --   "outfit": "pink bodysuit, white thigh-highs, collar on",
  --   "makeup": "full face, bold lip, long lashes",
  --   "pose": "on knees, back arched, looking up at camera",
  --   "setting": "mirror, well-lit",
  --   "framing": "full body",
  --   "script": "whispered: 'good girls ask permission'",
  --   "duration_seconds": 15
  -- }
  feminization_directives jsonb not null default '{}'::jsonb,

  -- Where this brief will post once fulfilled. Array so one asset feeds
  -- multiple platforms with different captions.
  target_platforms jsonb not null default '[]'::jsonb,  -- ["twitter","reddit:sissification","fansly"]

  -- Caption angle — a short directive the caption generator uses, paired
  -- with voice corpus. Example: "gloat about being this turned on while denied"
  caption_angle text,

  -- Scheduling
  scheduled_upload_by timestamptz,    -- deadline for Maxy to submit
  scheduled_publish_at timestamptz,    -- auto-post at or after this time

  status text not null default 'pending'
    check (status in ('pending','awaiting_upload','ready_to_post','posting','posted','expired','cancelled')),

  -- Strategic source that generated this brief
  source text not null default 'manual'
    check (source in ('manual','handler_chat','narrative_arc','band_escalation','weekly_plan','performance_gap')),
  narrative_beat text,   -- which beat of the active arc this advances

  -- After posting — rollup of engagement numbers for learning
  performance jsonb not null default '{}'::jsonb,  -- {platform: {likes, comments, subs_gained, ...}}

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expired_at timestamptz
);

create index if not exists content_briefs_user_status on content_briefs(user_id, status, scheduled_publish_at);
create index if not exists content_briefs_ready on content_briefs(user_id, status, scheduled_publish_at) where status = 'ready_to_post';
create index if not exists content_briefs_awaiting on content_briefs(user_id, status, scheduled_upload_by) where status in ('pending','awaiting_upload');

alter table content_briefs enable row level security;
drop policy if exists "content_briefs own" on content_briefs;
create policy "content_briefs own" on content_briefs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Maxy's submitted assets satisfying a brief.
create table if not exists content_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_id uuid references content_briefs(id) on delete cascade,

  asset_type text not null check (asset_type in ('photo','video','audio','text')),
  asset_url text,      -- storage URL
  asset_text text,     -- for text-only briefs (tweet drafts, stories)
  thumbnail_url text,  -- for video/photo_set

  -- Verification against brief directives — populated by Handler after Claude-vision check.
  directive_compliance jsonb not null default '{}'::jsonb,
  compliance_score integer check (compliance_score between 0 and 10),  -- 10 = matches all directives
  handler_notes text,

  -- Flow
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','redo_requested')),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists content_submissions_user_brief on content_submissions(user_id, brief_id);
create index if not exists content_submissions_status on content_submissions(user_id, status, created_at);

alter table content_submissions enable row level security;
drop policy if exists "content_submissions own" on content_submissions;
create policy "content_submissions own" on content_submissions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly content plan — the skeleton the brief generator fleshes out.
create table if not exists content_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  week_start date not null,      -- Monday of the plan week
  narrative_theme text,          -- e.g., "objectification week", "public exposure arc"

  -- Plan skeleton: target brief count per platform, content mix ratios.
  -- {"twitter": {"posts_per_day": 3, "photo_ratio": 0.6},
  --  "reddit": {"posts_per_week": 2, "target_subs": ["sissification","feminization"]},
  --  "fansly": {"posts_per_week": 3, "paywall_ratio": 0.5}, ...}
  platforms jsonb not null default '{}'::jsonb,

  -- Briefs generated from this plan (linked briefs know their parent plan)
  brief_count integer not null default 0,

  status text not null default 'active'
    check (status in ('draft','active','superseded','archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists content_plan_active on content_plan(user_id, week_start desc) where status = 'active';

alter table content_plan enable row level security;
drop policy if exists "content_plan own" on content_plan;
create policy "content_plan own" on content_plan for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Link brief → plan (nullable; manual briefs have null plan_id)
alter table content_briefs add column if not exists plan_id uuid references content_plan(id);
create index if not exists content_briefs_plan on content_briefs(plan_id);

-- Follower / subscriber snapshots — so growth engine can track what's working.
create table if not exists platform_follower_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  paid_sub_count integer,                -- only fansly/of
  revenue_cents_24h integer not null default 0,
  captured_at timestamptz not null default now()
);

create index if not exists platform_snapshots_user_time on platform_follower_snapshots(user_id, platform, captured_at desc);

alter table platform_follower_snapshots enable row level security;
drop policy if exists "platform_snapshots own" on platform_follower_snapshots;
create policy "platform_snapshots own" on platform_follower_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
