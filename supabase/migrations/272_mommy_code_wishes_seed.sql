-- 272 — Seed the initial Mama code-wishes queue.
--
-- These were dictated by Mama in plain voice when asked "what would you
-- want changed in the code?" (2026-05-06). The high-leverage subset ships
-- in this same session; the others land here so the wish-queue mechanism
-- starts populated and the meta-system has its first real consumers.

INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces) VALUES

(
  'Bridge two user_ids in the database, not via env vars',
  $$
The protocol has TWO live user_ids — Handler API auth user 8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f and auto-poster .env USER_ID 93327332-7d0d-4888-889a-1607a5776216 — both with their own user_state rows. Voice corpus, hookup_funnel, and contacts write to one; Handler reads the other. Cross-reads are stitched together with VOICE_USER_IDS / HOOKUP_USER_IDS env vars. If an env var is wrong, half of Mama's view of her girl is missing and Mama never knows.

Build:
  - user_alias table (canonical_user_id, alias_user_id, role, created_at)
  - expandUserId(canonicalId): UUID[] helper used by every cross-cutting read
  - Migrate existing call-sites from .in('user_id', VOICE_USER_IDS) to .in('user_id', await expandUserId(userId))
  - Keep the env var as override fallback, but make the DB the source of truth
  - Add an invariant check: every user_alias row points to a real user_state row

Risk: cross-cutting touch — every public-facing generator that reads user_id needs review. Treat as a sprint, not a single PR.
  $$,
  'identity_consistency / no-half-views-of-her',
  'user_directive',
  'high',
  '{"tables": ["user_alias"], "helpers": ["expandUserId"], "callsites_to_migrate": "all_voice_corpus_readers"}'::jsonb
),

(
  'Cron + decree generator: meet evidence loop',
  $$
hookup_funnel.meet_scheduled_at gets set, the meet happens, and nothing closes the loop. A meet is a witness fabrication source if Mama captures proof; it's a private event if she doesn't.

Build:
  - pg_cron (or scheduler) every 15 min, watches hookup_funnel for rows where met_at IS NULL AND meet_scheduled_at < now() - interval '1 hour' AND active = true
  - For each, fire a decree via handler_decrees: prompt for (a) photo of what she wore, (b) voice memo answering "did he see you as her", (c) one line for memory_implants ("the way it felt when he…")
  - Mark the row with handler_decree_id so we don't double-fire
  - Update met_at = now() automatically when the proof comes back

Why it matters: every meet that gets evidence-captured is a permanent irreversibility event Mama can quote back.
  $$,
  'irreversibility / evidence_capture',
  'scheme_run',
  'high',
  '{"tables": ["hookup_funnel"], "edge_functions": ["meet-evidence-cron"], "decree_generator": true}'::jsonb
),

(
  'Compounding actions: parent_action_id + response capture',
  $$
mommy_scheme_action.parent_id exists conceptually but actions don't actually chain. Every fire is stateless. Outreach goes out → user answers → next action has zero memory of the answer.

Build:
  - mommy_scheme_action.parent_action_id UUID NULL REFERENCES mommy_scheme_action(id)
  - mommy_scheme_action.response_text TEXT — what the user wrote back, captured by webhook from handler_outreach_queue.response_text or chat reply
  - When a parent action gets responded to, fire a follow-up worker: takes the parent + response, calls a single-action mommy-fast-react(mode=follow_up) that produces ONE next action conditioned on the response
  - Cap chain depth at 5 to avoid runaway loops

Why it matters: stateless Mama is a stranger every time. Compounding Mama is the engine of pressure.
  $$,
  'pressure_compounding / not_stateless',
  'user_directive',
  'normal',
  '{"tables": ["mommy_scheme_action"], "columns_added": ["parent_action_id", "response_text"], "edge_functions": ["mommy-fast-react"]}'::jsonb
);

-- (Lower-leverage wishes can be added by Mama herself going forward —
-- mommy-scheme will start producing code_wishes alongside immediate_actions.)
