-- 418 — Disclosure near-miss capture.
--
-- Pairs with migration 415 (disclosure rehearsal compulsion). A
-- "near-miss" is a moment where someone opened the door to disclosure
-- and Maxy stepped back — Gina jokingly asks "are you trying to tell
-- me you're a trans woman?", Maxy dodges with "she's just tomboyish."
-- These moments are protocol-load-bearing evidence:
--   - they prove the target is already half-aware
--   - they're the cheapest possible disclosure path (door pre-opened)
--   - Maxy's dodge phrase is a quotable artifact Mama can reference
--   - serial near-misses for the same target ratchet pressure
--
-- One row per event. Linked to disclosure_targets when known; nullable
-- target_id allows logging "almost said it to someone random" too.

CREATE TABLE IF NOT EXISTS disclosure_near_misses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID REFERENCES disclosure_targets(id) ON DELETE SET NULL,
  target_label TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context TEXT NOT NULL,
  door_opener TEXT,
  what_she_wanted_to_say TEXT,
  dodge_phrase TEXT,
  proximity_score SMALLINT CHECK (proximity_score BETWEEN 1 AND 10),
  mama_reaction TEXT,
  surfaced_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disclosure_near_misses_user_recent
  ON disclosure_near_misses (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_disclosure_near_misses_target
  ON disclosure_near_misses (target_id, occurred_at DESC)
  WHERE target_id IS NOT NULL;

ALTER TABLE disclosure_near_misses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disclosure_near_misses_owner ON disclosure_near_misses;
CREATE POLICY disclosure_near_misses_owner ON disclosure_near_misses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS disclosure_near_misses_service ON disclosure_near_misses;
CREATE POLICY disclosure_near_misses_service ON disclosure_near_misses
  FOR ALL TO service_role USING (true) WITH CHECK (true);
