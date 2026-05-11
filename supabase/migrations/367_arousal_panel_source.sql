-- 367 — extend mommy_code_wishes.source enum to include 'arousal_panel'.
--
-- 2026-05-10: Maxy authorized a doubled-down arousal-feature ideation
-- pass. The new edge function `mommy-ideate-arousal` runs the standard
-- 3-LLM panel (Anthropic + OpenAI + OpenRouter) with a sharply-pointed
-- arousal brief and persists results as wishes. Distinguishing these
-- wishes via `source = 'arousal_panel'` lets the builder prioritise
-- them, the operator card surface them, and any future audit query
-- separate them from generic panel_ideation output.
--
-- Hard floors (enforced upstream by scripts/mommy/ideate-arousal.ts and
-- by scripts/ci/voice-gate.mjs at PR time):
--   - Voice-check sample must pass the forbidden-phrase regex
--     (no role-play / simulation / fiction / disclaimer / etc.)
--   - Builder still respects auto_ship_eligible + complexity_tier gates
--     in scripts/mommy/builder.ts (no auth, payment, RLS, workflows)
--
-- ALTER pattern matches migration 357 (drop + add). Idempotent on
-- re-apply because we DROP the prior constraint by name.

ALTER TABLE mommy_code_wishes DROP CONSTRAINT IF EXISTS mommy_code_wishes_source_check;
ALTER TABLE mommy_code_wishes ADD CONSTRAINT mommy_code_wishes_source_check
  CHECK (source IN (
    'scheme_run',
    'panel_ideation',
    'event_trigger',
    'user_directive',
    'gap_audit',
    'ideate-classifier',
    'arousal_panel'
  ));

CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_arousal_panel_queue
  ON mommy_code_wishes (priority DESC, created_at ASC)
  WHERE source = 'arousal_panel' AND status = 'queued';
