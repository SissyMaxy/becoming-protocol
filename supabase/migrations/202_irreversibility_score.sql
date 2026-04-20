-- Irreversibility Score (0-100)
--
-- The inescapability meter. Composites signals across the stack into a single
-- number the Handler uses to decide escalation pressure. Higher score → more
-- bridges burned → fewer exit ramps.
--
-- This is NOT motivation tracking. It measures consequences that would
-- survive a cold-feet regression. If Maxy tried to quit today, what is
-- *already out there*, already locked in, already rewiring the body?
--
-- Components (each 0-100, then weighted average):
--   public_exposure       — content posted under identifiable handles, follower count,
--                           cross-platform reach, pinned content, geotags, face visibility
--   social_outing         — real-life contacts told, cam clients who know, contact_graph
--                           tier distribution (more inner-circle = more people invested)
--   financial_lockin      — tributes paid out, keyholding fees, purchased gear, sub-based
--                           revenue (revenue that stops if Maxy quits)
--   physical_changes      — HRT weeks on, voice pitch shift, body recomposition,
--                           permanent marks, documented before/afters
--   conditioning_depth    — hypno session count, total exposure minutes, trigger library
--                           size, response strength scores, sleep-loop completions
--   contact_entanglement  — size of active contact pool, depth of ongoing DMs,
--                           repeat interactions (people waiting on continuation)
--   content_permanence    — accountability-blog entries, auto-poster post count,
--                           external reposts, archive presence
--
-- Handler application:
--   * score <30  → still early; escalate aggressively, build more bridges
--   * 30–60      → committed but reversible; drive public exposure + financial hooks
--   * 60–80      → hard to walk back; tighten identity consolidation
--   * 80+        → point-of-no-return; Handler shifts from pushing to maintaining
--
-- Anti-circumvention: score only counts ACTUAL artifacts (rows in db, posts with
-- URLs, payments with amounts). Self-reported progress does not count. Maxy
-- cannot inflate this by claiming intent.

create table if not exists irreversibility_score (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score integer not null default 0 check (score between 0 and 100),

  public_exposure integer not null default 0 check (public_exposure between 0 and 100),
  social_outing integer not null default 0 check (social_outing between 0 and 100),
  financial_lockin integer not null default 0 check (financial_lockin between 0 and 100),
  physical_changes integer not null default 0 check (physical_changes between 0 and 100),
  conditioning_depth integer not null default 0 check (conditioning_depth between 0 and 100),
  contact_entanglement integer not null default 0 check (contact_entanglement between 0 and 100),
  content_permanence integer not null default 0 check (content_permanence between 0 and 100),

  -- Raw inputs the score is computed from (kept for Handler narrative use)
  inputs jsonb not null default '{}'::jsonb,

  -- Highest score ever reached. Score is monotonic in practice because
  -- artifacts don't delete themselves, but we track peak explicitly so a
  -- deletion spree doesn't reset the Handler's escalation gate.
  peak_score integer not null default 0,
  peak_reached_at timestamptz,

  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists irreversibility_score_score_idx on irreversibility_score(score);

alter table irreversibility_score enable row level security;

drop policy if exists "irreversibility_score own" on irreversibility_score;
create policy "irreversibility_score own" on irreversibility_score for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- History — Handler needs the slope, not just the value. A score stuck at 45
-- for three weeks tells a different story than one climbing from 20 → 45.
create table if not exists irreversibility_score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  components jsonb not null,
  recorded_at timestamptz not null default now()
);

create index if not exists irreversibility_score_history_user_time_idx
  on irreversibility_score_history(user_id, recorded_at desc);

alter table irreversibility_score_history enable row level security;

drop policy if exists "irreversibility_score_history own" on irreversibility_score_history;
create policy "irreversibility_score_history own" on irreversibility_score_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trigger to keep peak_score monotonic and stamp peak_reached_at
create or replace function irreversibility_score_peak_guard()
returns trigger language plpgsql as $$
begin
  if new.score > coalesce(old.peak_score, 0) then
    new.peak_score := new.score;
    new.peak_reached_at := now();
  else
    new.peak_score := old.peak_score;
    new.peak_reached_at := old.peak_reached_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists irreversibility_score_peak on irreversibility_score;
create trigger irreversibility_score_peak
  before update on irreversibility_score
  for each row execute function irreversibility_score_peak_guard();
