-- 631 — Funnel identity ledger + heat decay + Anonymous Cruiser quarantine.
-- DESIGN_TURNING_OUT_2026-07-01.md §3 (identity-gated funnel escalation).
--
-- The chimera bug is an identity bug: heat from five anonymous men pooled
-- into one "Anonymous Cruiser" row, then the safety checklist "cleared" a
-- person who doesn't exist. This migration:
--
--   1. Identity ledger columns on hookup_funnel:
--        identity_tier      0 anon · 1 persona · 2 named · 3 verified
--        identity_evidence  quoted evidence per element (reframings-quote-facts
--                           applied to men — a tier claim without his own words
--                           on file is fabrication)
--        thread_key         platform-native thread/session id — heat never
--                           pools across bodies
--        quarantined        anonymous-thread lane; hard-capped at sexting
--        heat_updated_at    last heat write (decay anchor fallback)
--   2. UNIQUE (user_id, contact_platform, thread_key) — existing NULL
--      thread_keys are backfilled with synthetic per-row keys first.
--   3. hookup_funnel_live VIEW — effective_heat = heat_score ×
--      0.5^(days_since_last_interaction/7), computed at read time. The decay
--      is IN the view; no nightly cron needed. All funnel readers switch to
--      this view.
--   4. Quarantine backfill: legacy "Anonymous Cruiser" chimera rows →
--      active=false, heat zeroed, quarantined, note appended; the matching
--      contact_intelligence rows get a red_flag + raw_analysis note.
--      (contact_events cannot be re-keyed retroactively — no per-thread
--      signal survives in the legacy rows; new threads are keyed at import.)
--
-- Tier promotion happens ONLY via the log_contact_identity Handler directive
-- (api/handler/_lib/handler-force-fem.ts) — the LLM proposes, the server
-- validates a non-empty quote and derives the tier from accumulated evidence
-- elements. Per-step tier minimums are enforced in advance_hookup_step, not
-- in the prompt.

-- ─── 1. Identity columns ────────────────────────────────────────────────
ALTER TABLE hookup_funnel
  ADD COLUMN IF NOT EXISTS identity_tier SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thread_key TEXT,
  ADD COLUMN IF NOT EXISTS quarantined BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS heat_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'hookup_funnel_identity_tier_check'
  ) THEN
    ALTER TABLE hookup_funnel
      ADD CONSTRAINT hookup_funnel_identity_tier_check
      CHECK (identity_tier BETWEEN 0 AND 3);
  END IF;
END $$;

COMMENT ON COLUMN hookup_funnel.identity_tier IS
  '0 anon · 1 persona (stable handle + ≥3 conversation days) · 2 named (first name stated BY HIM, quoted + face pic on file) · 3 verified (live video/voice or answered phone). Promotion only via log_contact_identity directive — server validates a non-empty quote.';
COMMENT ON COLUMN hookup_funnel.thread_key IS
  'Platform-native thread/session id. One thread = one row — heat never pools across bodies. Anonymous threads get a synthetic per-thread key at import.';
COMMENT ON COLUMN hookup_funnel.quarantined IS
  'Anonymous-thread lane (no stable per-person handle). Hard-capped at sexting; contributes nothing to top-heat picks. Exit = tier ≥1 with quoted evidence.';

-- ─── 2. thread_key backfill + uniqueness ────────────────────────────────
-- Existing rows predate thread keys. Synthetic per-row keys keep the unique
-- index valid without merging anything: 'legacy-' + row id prefix is unique
-- per row by construction.
UPDATE hookup_funnel
SET thread_key = 'legacy-' || LEFT(id::text, 13)
WHERE thread_key IS NULL;

-- UNIQUE across (user, platform, thread) — NULLs (future unkeyed inserts)
-- are permitted multiple times by Postgres semantics, but writers must key
-- every thread (synthetic key when the platform exposes none).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hookup_funnel_user_platform_thread
  ON hookup_funnel (user_id, contact_platform, thread_key);

-- ─── 3. hookup_funnel_live — effective heat view ────────────────────────
-- effective_heat = heat_score × 0.5^(days_since_last_interaction / 7).
-- Decay anchor: last_interaction_at, falling back to heat_updated_at.
-- security_invoker so caller RLS applies (service-role readers bypass).
DROP VIEW IF EXISTS hookup_funnel_live;
CREATE VIEW hookup_funnel_live
WITH (security_invoker = true) AS
SELECT
  hf.*,
  ROUND(
    (COALESCE(hf.heat_score, 0)
      * pow(0.5,
            GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(hf.last_interaction_at, hf.heat_updated_at)))
            ) / 86400.0 / 7.0
      )
    )::numeric, 2
  ) AS effective_heat
FROM hookup_funnel hf;

COMMENT ON VIEW hookup_funnel_live IS
  'hookup_funnel + effective_heat (half-life 7 days since last interaction). All funnel readers use this view; nightly decay is computed here, no cron.';

-- ─── 4. Anonymous Cruiser chimera quarantine backfill ───────────────────
-- Legacy rows whose "identity" is the Sniffies anon label are chimeras —
-- N different men behind one row. Deactivate, zero the heat, quarantine.
DO $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT id FROM hookup_funnel
    WHERE (contact_username ILIKE 'anonymous%' OR contact_display_name ILIKE 'anonymous cruiser%')
      AND quarantined = false
  LOOP
    UPDATE hookup_funnel SET
      quarantined = true,
      active = false,
      heat_score = 0,
      identity_tier = 0,
      heat_updated_at = now(),
      contact_notes = COALESCE(contact_notes, '') ||
        E'\n[631 quarantine ' || now()::date || '] Chimera row: multiple anonymous threads pooled under one label. Heat zeroed, row retired. New anonymous threads get their own per-thread rows.'
    WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '631: quarantined % chimera hookup_funnel rows', v_count;
END $$;

-- Matching contact-graph intelligence rows: flag so the Handler never treats
-- the pooled dossier as one man's screening record again.
UPDATE contact_intelligence ci SET
  red_flags = CASE
    WHEN ci.red_flags ? 'chimera_quarantined' THEN ci.red_flags
    ELSE ci.red_flags || '["chimera_quarantined"]'::jsonb
  END,
  raw_analysis = jsonb_set(
    ci.raw_analysis, '{quarantine_note}',
    to_jsonb('Quarantined 631: this row pooled multiple anonymous Sniffies threads. Kinks/flags/scores here belong to different men — do not screen or escalate from this dossier.'::text),
    true
  )
WHERE ci.contact_id IN (
  SELECT ch.contact_id FROM contact_handles ch
  WHERE ch.platform = 'sniffies' AND ch.handle ILIKE 'anonymous%'
);

NOTIFY pgrst, 'reload schema';
