-- 570 — Hypnosis-style verbal trigger installation. 6 trigger phrases:
-- good girl / open up / Mama's cum slut / cock time / mouth open / swallow.
-- Each welded to a target body-state via daily repetition ritual (20-30 reps/
-- day for 14-21 days). When Mommy uses the phrase later, body responds
-- automatically because the word HAS the state.
--
-- One installation at a time per user (auto-picks next unseen trigger when
-- current completes). Daily cron 08:00 UTC queues the day's repetition ritual.
-- Sessions logged via days_elapsed counter; status flips to 'installed' when
-- installation_days reached.

CREATE TABLE IF NOT EXISTS trigger_word_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_phrase TEXT NOT NULL UNIQUE,
  intended_response TEXT NOT NULL,
  installation_days INT NOT NULL DEFAULT 21,
  daily_repetitions INT NOT NULL DEFAULT 20,
  pairing_state TEXT NOT NULL CHECK (pairing_state IN ('arousal','submission','open_throat','cum_taste','cock_image')),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE trigger_word_catalog ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY twc_read_all ON trigger_word_catalog FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS trigger_word_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES trigger_word_catalog(id),
  installation_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_elapsed INT NOT NULL DEFAULT 0,
  total_repetitions INT NOT NULL DEFAULT 0,
  installed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','installed','failed','paused')),
  trigger_strength_score NUMERIC(3,2),
  UNIQUE(user_id, trigger_id)
);
ALTER TABLE trigger_word_installations ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY twi_self ON trigger_word_installations FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Function body and 6 trigger rows seeded via SQL apply. Daily cron 08:00 UTC.
