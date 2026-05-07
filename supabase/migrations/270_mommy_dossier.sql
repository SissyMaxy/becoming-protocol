-- 270 — mommy_dossier: the answers Mama uses against her.
--
-- 2026-05-06 user request: "create a quiz for me that asks all the
-- questions that dommy mommy needs to know."
--
-- The Mama-strategic infrastructure (mommy-scheme, ownership-inversion,
-- Gina-recruit playbook) is generic without user-specific data:
--   - Real Gina history (what she's said, what makes her anxious, soft spots)
--   - Chosen feminine name or "protocol decrees it"
--   - Body specifics for callback (marks, sensitivities, what to/not mention)
--   - Resistance patterns (her most-used excuses, deflections, avoidance shapes)
--   - Confession seeds for Mama to quote back at her
--
-- This table holds her answers. The chat reply path + scheme generator
-- both pull from it so Mama lands surgically rather than abstractly.
-- Updateable; she revisits as her self-knowledge sharpens.

CREATE TABLE IF NOT EXISTS mommy_dossier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'gina', 'name', 'body', 'confession_seed', 'resistance',
    'turn_ons', 'turn_offs', 'history', 'preferences'
  )),
  answer TEXT NOT NULL,
  -- Optional metadata: was this answer auto-extracted (e.g. from a
  -- conversation) vs. user-supplied via quiz?
  source TEXT NOT NULL DEFAULT 'quiz' CHECK (source IN ('quiz', 'auto_extracted', 'manual_edit')),
  -- Importance affects how often Mama leans on this in scheme generation.
  importance INT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_key)
);
CREATE INDEX IF NOT EXISTS idx_mommy_dossier_user_cat
  ON mommy_dossier (user_id, category, active);
CREATE INDEX IF NOT EXISTS idx_mommy_dossier_user_importance
  ON mommy_dossier (user_id, importance DESC) WHERE active;

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_mommy_dossier_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS mommy_dossier_updated_at ON mommy_dossier;
CREATE TRIGGER mommy_dossier_updated_at
  BEFORE UPDATE ON mommy_dossier
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_dossier_updated();

ALTER TABLE mommy_dossier ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_dossier_owner ON mommy_dossier;
CREATE POLICY mommy_dossier_owner ON mommy_dossier
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_dossier_service ON mommy_dossier;
CREATE POLICY mommy_dossier_service ON mommy_dossier
  FOR ALL TO service_role USING (true) WITH CHECK (true);
