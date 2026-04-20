-- Handler → Auto-Poster Briefing Bridge
--
-- The Handler (Becoming app) has rich context — irreversibility score,
-- narrative arc, conditioning state, pressure directives, learned resistance
-- patterns. The auto-poster's Claude calls currently don't see any of it.
-- Result: replies that sound right but have no strategic alignment with what
-- the Handler is pushing this week.
--
-- This table is a single-row-per-user briefing the Handler writes, and the
-- auto-poster reads before every outbound. One living strategy document.
--
-- The Handler updates this whenever escalation band shifts, a new directive
-- issues, or the narrative arc advances. Auto-poster injects `prompt_snippet`
-- directly into the Claude system prompt for each reply.

create table if not exists handler_briefing (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- The compact text injected into auto-poster system prompts. Keep under
  -- ~800 tokens. Format: plain prose directives ("This week: drive meetup
  -- proposals toward confirmation. Deflect without tribute. Reference
  -- chastity day when flirting.")
  prompt_snippet text not null default '',

  -- Structured strategy the Handler can reason over without re-parsing text.
  -- Keys are suggested but not enforced:
  --   band: early|committed|hard-to-reverse|point-of-no-return
  --   push_axes: [public_exposure, financial_lockin, ...]  — weakest axes to attack
  --   meetup_stance: encourage|tribute_gate|screen_first|decline
  --   current_theme: e.g. "objectification week", "service mindset", "public humiliation"
  --   denial_day, hrt_day, streak_day: numeric state
  --   avoid_topics: list — topics Handler flagged to NOT mention in DMs
  strategy jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  generated_by text not null default 'manual'  -- 'manual' | 'handler_cron' | 'handler_chat'
);

alter table handler_briefing enable row level security;

drop policy if exists "handler_briefing own" on handler_briefing;
create policy "handler_briefing own" on handler_briefing for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
