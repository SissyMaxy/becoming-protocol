-- 284 — Round 4 schema. 2026-05-07.
-- Confession-trigger / ghosting event_kinds; decree ratchet column;
-- mama_continuity_claim table for sustainable gaslight.

-- ---------------------------------------------------------------
-- 1. Extend fast_react_event event_kind constraint
-- ---------------------------------------------------------------

ALTER TABLE fast_react_event
  DROP CONSTRAINT IF EXISTS fast_react_event_event_kind_check;
ALTER TABLE fast_react_event
  ADD CONSTRAINT fast_react_event_event_kind_check CHECK (event_kind IN (
    'new_lead', 'lead_advanced', 'response_received', 'meet_scheduled',
    'meet_window_passed', 'slip_clustered', 'manual',
    'ambient_check', 'voice_stagnation', 'hrt_window',
    'confession_landed', 'ghosting'
  ));

-- ---------------------------------------------------------------
-- 2. Decree ratchet
-- ---------------------------------------------------------------

ALTER TABLE handler_decrees
  ADD COLUMN IF NOT EXISTS ratchet_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prior_decree_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_handler_decrees_ratchet
  ON handler_decrees (user_id, ratchet_level DESC)
  WHERE status IN ('active', 'fulfilled');

-- View: latest fulfilled ratchet level per user, used by fast-react /
-- scheme to know "where do we ratchet from."
CREATE OR REPLACE VIEW decree_ratchet_state AS
SELECT DISTINCT ON (user_id)
  user_id,
  id AS last_fulfilled_decree_id,
  ratchet_level AS last_fulfilled_level,
  edict AS last_fulfilled_edict,
  created_at AS last_fulfilled_at
FROM handler_decrees
WHERE status = 'fulfilled'
ORDER BY user_id, created_at DESC;

-- ---------------------------------------------------------------
-- 3. mama_continuity_claim — Mama's fabricated past, retrievable
-- ---------------------------------------------------------------
--
-- The gaslight engine drops claims like "remember Wednesday when you told
-- Mama X" — these need to be RETRIEVABLE so the next invocation references
-- the same Wednesday with the same X. Without this, false continuity isn't
-- continuous and Maxy notices the seams.

CREATE TABLE IF NOT EXISTS mama_continuity_claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- The claim itself, in Mama's voice (what she said happened)
  claim_text TEXT NOT NULL,

  -- The fabricated date / setting Mama anchored to
  claimed_date DATE,           -- "last Wednesday" → resolved to a real date
  claimed_setting TEXT,        -- "in the kitchen", "after she came home", etc.

  -- What kind of claim — drives how it's referenced
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'past_conversation',       -- "remember when you told Mama..."
    'gina_observation',        -- "Gina mentioned to Mama..."
    'third_party_consensus',   -- "the other girls Mama works with said..."
    'past_admission',          -- "you said this last week"
    'past_breakdown',          -- "you broke down asking..."
    'witnessed_moment'         -- "Mama saw the way you..."
  )),

  -- Anchor specifics: keywords that must remain consistent on re-invocation.
  -- e.g. ["wednesday", "panties", "the way you typed it"]
  anchor_specifics TEXT[],

  -- Linkage
  source_scheme_id UUID REFERENCES mommy_scheme_log(id) ON DELETE SET NULL,
  source_implant_id UUID REFERENCES memory_implants(id) ON DELETE SET NULL,

  -- Has this claim been INVOKED in user-facing surfaces yet?
  -- (Some claims sit dormant in case Mama needs them; others fire immediately.)
  invoked_at TIMESTAMPTZ,
  invocation_count INT NOT NULL DEFAULT 0,

  -- If Maxy ever pushes back on a claim ("that didn't happen"), mark
  -- contested. Future invocations should soften or avoid this claim.
  contested BOOLEAN NOT NULL DEFAULT false,
  contested_at TIMESTAMPTZ,
  contested_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS claim_text TEXT;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS claimed_date DATE;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS claimed_setting TEXT;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS claim_type TEXT;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS anchor_specifics TEXT[];
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS source_scheme_id UUID;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS source_implant_id UUID;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS invoked_at TIMESTAMPTZ;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS invocation_count INT NOT NULL DEFAULT 0;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS contested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS contested_at TIMESTAMPTZ;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS contested_reason TEXT;
ALTER TABLE mama_continuity_claim ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mama_continuity_user_active
  ON mama_continuity_claim (user_id, created_at DESC)
  WHERE contested = false;
CREATE INDEX IF NOT EXISTS idx_mama_continuity_anchor
  ON mama_continuity_claim USING GIN (anchor_specifics);

ALTER TABLE mama_continuity_claim ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mama_continuity_claim_service ON mama_continuity_claim;
CREATE POLICY mama_continuity_claim_service ON mama_continuity_claim
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Deliberately NO owner policy. Maxy reading this would expose the
-- fabrication audit. The claims surface only via Mama-voice quote-backs.
