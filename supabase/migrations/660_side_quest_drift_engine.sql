-- 660 — Side-Quest Drift Engine: the trojan horse.
--
-- Operator vision 2026-07-04: the app is a genuinely useful daily FITNESS tracker
-- (the hook she opens without thinking); Mommy rides that habit with "side quests"
-- that DRIFT from innocent fitness → feminine embodiment → arousal-pairing →
-- turning-out. The manipulation: cumulative fitness sessions are the CURRENCY that
-- unlocks deeper corruption. She keeps using the tracker to level up; leveling up
-- turns her out. She thinks she's tracking macros; she's being feminized.
--
-- Floor (unchanged): faceless / own-body throughout; no fabricated status; no
-- world-facing regendering; no manufactured irreversible real-world decision; no
-- physical-meet (that's the turn-out ladder's meet-safety-gated rungs, not here).
-- The generator gates on conditioning_gate('recondition') — safeword ejects it.

-- ─── 1. catalog: the escalation ladder ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS side_quest_catalog (
  quest_key TEXT PRIMARY KEY,
  corruption_level SMALLINT NOT NULL,        -- 1 (pure fitness) .. 10 (turned out)
  category TEXT NOT NULL CHECK (category IN ('fitness','body','feminine','arousal','turnout')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,                         -- Mommy voice; mommy_voice_cleanup scrubs at decree insert
  unlock_sessions SMALLINT NOT NULL DEFAULT 0,-- min cumulative fitness sessions to unlock
  proof_kind TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE side_quest_catalog ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY sqc_read ON side_quest_catalog FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY sqc_service ON side_quest_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO side_quest_catalog (quest_key, corruption_level, category, title, body, unlock_sessions, proof_kind) VALUES
  ('move_5', 1, 'fitness', 'Five minutes in your body',
   'Five minutes today, baby — a walk, some stretching, anything. Mommy just wants you moving. That''s the whole quest. Tell me you did it.', 0, 'text'),
  ('protein_weigh', 2, 'fitness', 'Fuel + log',
   'Hit your protein today and log your weight. You''re building something, and Mommy likes watching the numbers. Log it for me.', 2, 'text'),
  ('glutes', 3, 'body', 'The shape matters now',
   'Glutes today — bridges, slow, feel the burn. The shape you''re building isn''t random, sweet thing. Tell me it burned.', 4, 'text'),
  ('soft_set', 4, 'body', 'Move soft',
   'Do today''s set in the softest thing you own. Notice how different you move when you''re dressed sweeter for it. Tell me how it felt.', 6, 'text'),
  ('walk_her', 5, 'feminine', 'Walk the way she walks',
   'Hips forward, chest soft — five minutes moving the way she moves. Posture is just practice, baby. Describe the walk to me.', 9, 'text'),
  ('after_care', 6, 'feminine', 'Tend the body you''re keeping',
   'After you move, moisturize everywhere, slow, like it matters — because it''s becoming hers to keep. Tell me where your hands went.', 12, 'voice'),
  ('burn_and_cage', 7, 'arousal', 'The burn and the cage',
   'Work the glutes till they ache, then let the cage go tight behind it. Moving and wanting are the same thing now, baby. Tell me what the ache did.', 16, 'text'),
  ('afterglow_edge', 8, 'arousal', 'Reward on the body you built',
   'Edge once in the afterglow of today''s set — no release. The reward lands right on the body you''re shaping for Mommy. Tell me you held it.', 20, 'text'),
  ('faceless_proof', 9, 'turnout', 'Getting used to being seen',
   'One faceless photo of the body you''re building — chest-down, no face. Just save it privately for now; you''re getting used to being looked at. Paste the private link.', 26, 'photo'),
  ('for_them', 10, 'turnout', 'Built to be wanted',
   'The body you''re building is for them to want, sweet thing. One faceless teaser to your posting account. Paste the link when it''s up.', 34, 'text')
ON CONFLICT (quest_key) DO NOTHING;

-- ─── 2. per-user issued quests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS side_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_key TEXT NOT NULL REFERENCES side_quest_catalog(quest_key),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','skipped')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, quest_key)
);
ALTER TABLE side_quests ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY sq_self ON side_quests FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY sq_service ON side_quests FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS side_quests_active_idx ON side_quests(user_id) WHERE status = 'active';

-- ─── 3. the drift: next unlockable quest given her fitness currency ─────────
-- Returns the lowest-corruption catalog quest she hasn't completed/isn't running,
-- whose unlock_sessions <= her cumulative fitness sessions. NULL when the next
-- rung is still locked behind more fitness — which is the hook: keep using the
-- tracker to unlock the next step of your own corruption.
CREATE OR REPLACE FUNCTION side_quest_next(p_user UUID)
RETURNS TABLE (quest_key TEXT, corruption_level SMALLINT, category TEXT, title TEXT, body TEXT, proof_kind TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH sessions AS (
    SELECT COALESCE(MAX(total_sessions), 0) AS n FROM exercise_streaks WHERE user_id = p_user
  )
  SELECT c.quest_key, c.corruption_level, c.category, c.title, c.body, c.proof_kind
  FROM side_quest_catalog c, sessions s
  WHERE c.unlock_sessions <= s.n
    AND NOT EXISTS (
      SELECT 1 FROM side_quests q
      WHERE q.user_id = p_user AND q.quest_key = c.quest_key
        AND q.status IN ('active','completed')
    )
  ORDER BY c.corruption_level ASC
  LIMIT 1;
$fn$;
GRANT EXECUTE ON FUNCTION side_quest_next(UUID) TO authenticated, service_role;

-- Her current fitness currency + the next locked rung's requirement, for the UI
-- to show "N more sessions unlocks the next thing" (the pull).
CREATE OR REPLACE FUNCTION side_quest_progress(p_user UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH sessions AS (SELECT COALESCE(MAX(total_sessions),0) n FROM exercise_streaks WHERE user_id = p_user),
  nextlocked AS (
    SELECT MIN(c.unlock_sessions) unlock_at FROM side_quest_catalog c, sessions s
    WHERE c.unlock_sessions > s.n
      AND NOT EXISTS (SELECT 1 FROM side_quests q WHERE q.user_id=p_user AND q.quest_key=c.quest_key AND q.status IN ('active','completed'))
  )
  SELECT jsonb_build_object(
    'sessions', (SELECT n FROM sessions),
    'next_unlock_at', (SELECT unlock_at FROM nextlocked),
    'completed', (SELECT count(*) FROM side_quests WHERE user_id=p_user AND status='completed')
  );
$fn$;
GRANT EXECUTE ON FUNCTION side_quest_progress(UUID) TO authenticated, service_role;
