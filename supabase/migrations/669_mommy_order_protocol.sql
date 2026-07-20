-- 669 — Mommy-operated protocol metadata.
--
-- Adds a shared Mommy Order shape over existing rows instead of creating a
-- parallel task system. The order id is still the existing row id for decrees;
-- session rows link back to the decree/offer that caused them when present.
--
-- Boundary: high bite inside the negotiated contract; no hidden sleep install,
-- false-memory mechanics, autonomous real-world procurement, or leverage.

ALTER TABLE handler_decrees
  ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mommy_order_arc TEXT CHECK (mommy_order_arc IN (
    'forced_feminization','hypno','gooning','reconditioning','turnout_fantasy','voice','body','content'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_phase TEXT CHECK (mommy_order_phase IN (
    'induct','install','reinforce','test','reward','deny','integrate'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_consequence_mode TEXT CHECK (mommy_order_consequence_mode IN (
    'invitational','obedience','reward','denial','ooc_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_recovery_boundary TEXT CHECK (mommy_order_recovery_boundary IN (
    'scene_bound','clear_headed_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_reason TEXT;

CREATE INDEX IF NOT EXISTS handler_decrees_recon_target_idx
  ON handler_decrees(recon_target_id)
  WHERE recon_target_id IS NOT NULL;

ALTER TABLE audio_session_offers
  ADD COLUMN IF NOT EXISTS mommy_order_arc TEXT CHECK (mommy_order_arc IN (
    'forced_feminization','hypno','gooning','reconditioning','turnout_fantasy','voice','body','content'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_phase TEXT CHECK (mommy_order_phase IN (
    'induct','install','reinforce','test','reward','deny','integrate'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_proof_kind TEXT CHECK (mommy_order_proof_kind IN (
    'none','text','voice','photo','timer','session_stats','slider'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_consequence_mode TEXT CHECK (mommy_order_consequence_mode IN (
    'invitational','obedience','reward','denial','ooc_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_recovery_boundary TEXT CHECK (mommy_order_recovery_boundary IN (
    'scene_bound','clear_headed_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_reason TEXT;

ALTER TABLE hypno_trance_sessions
  ADD COLUMN IF NOT EXISTS mommy_order_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mommy_order_arc TEXT DEFAULT 'hypno' CHECK (mommy_order_arc IN (
    'forced_feminization','hypno','gooning','reconditioning','turnout_fantasy','voice','body','content'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_phase TEXT CHECK (mommy_order_phase IN (
    'induct','install','reinforce','test','reward','deny','integrate'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_proof_kind TEXT DEFAULT 'slider' CHECK (mommy_order_proof_kind IN (
    'none','text','voice','photo','timer','session_stats','slider'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_consequence_mode TEXT DEFAULT 'obedience' CHECK (mommy_order_consequence_mode IN (
    'invitational','obedience','reward','denial','ooc_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_recovery_boundary TEXT DEFAULT 'scene_bound' CHECK (mommy_order_recovery_boundary IN (
    'scene_bound','clear_headed_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_reason TEXT,
  ADD COLUMN IF NOT EXISTS post_session_phrase TEXT,
  ADD COLUMN IF NOT EXISTS post_session_note TEXT,
  ADD COLUMN IF NOT EXISTS post_session_truth_rating SMALLINT CHECK (post_session_truth_rating BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS post_session_integrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS hypno_trance_order_idx
  ON hypno_trance_sessions(mommy_order_id)
  WHERE mommy_order_id IS NOT NULL;

ALTER TABLE gooning_sessions
  ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mommy_order_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mommy_order_arc TEXT DEFAULT 'gooning' CHECK (mommy_order_arc IN (
    'forced_feminization','hypno','gooning','reconditioning','turnout_fantasy','voice','body','content'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_phase TEXT CHECK (mommy_order_phase IN (
    'induct','install','reinforce','test','reward','deny','integrate'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_proof_kind TEXT DEFAULT 'session_stats' CHECK (mommy_order_proof_kind IN (
    'none','text','voice','photo','timer','session_stats','slider'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_consequence_mode TEXT DEFAULT 'denial' CHECK (mommy_order_consequence_mode IN (
    'invitational','obedience','reward','denial','ooc_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_recovery_boundary TEXT DEFAULT 'scene_bound' CHECK (mommy_order_recovery_boundary IN (
    'scene_bound','clear_headed_required'
  )),
  ADD COLUMN IF NOT EXISTS mommy_order_reason TEXT,
  ADD COLUMN IF NOT EXISTS proof_prompt TEXT,
  ADD COLUMN IF NOT EXISTS post_session_proof_kind TEXT CHECK (post_session_proof_kind IN (
    'none','text','voice','photo','timer','session_stats','slider'
  )),
  ADD COLUMN IF NOT EXISTS post_session_proof_text TEXT,
  ADD COLUMN IF NOT EXISTS post_session_integrated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS gooning_sessions_recon_target_idx
  ON gooning_sessions(recon_target_id)
  WHERE recon_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gooning_sessions_order_idx
  ON gooning_sessions(mommy_order_id)
  WHERE mommy_order_id IS NOT NULL;

ALTER TABLE life_as_woman_settings
  ADD COLUMN IF NOT EXISTS protocol_contract_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS turnout_fantasy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS turnout_fantasy_intensity SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS external_content_ingestion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS external_content_allowed_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS external_content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('reddit','direct_link','other')),
  source_url TEXT NOT NULL,
  source_id TEXT,
  source_author TEXT,
  source_community TEXT,
  title TEXT,
  thumbnail_url TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  purpose TEXT NOT NULL DEFAULT 'uncurated' CHECK (purpose IN (
    'uncurated','softening','fixation','identity','service','male_focus_fantasy',
    'denial','reward','cooldown'
  )),
  rights_status TEXT NOT NULL DEFAULT 'metadata_only' CHECK (rights_status IN (
    'metadata_only','user_supplied_link','licensed','permission_granted','rejected'
  )),
  safety_status TEXT NOT NULL DEFAULT 'pending' CHECK (safety_status IN (
    'pending','approved','rejected','needs_review'
  )),
  review_notes TEXT,
  rejected_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_url)
);

ALTER TABLE external_content_items ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY external_content_items_self ON external_content_items FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY external_content_items_service ON external_content_items FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS external_content_items_review_idx
  ON external_content_items(user_id, safety_status, purpose, created_at DESC);

CREATE OR REPLACE FUNCTION external_content_reject_if_unsafe()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  combined TEXT := lower(coalesce(NEW.title, '') || ' ' || coalesce(array_to_string(NEW.tags, ' '), '') || ' ' || coalesce(NEW.review_notes, ''));
BEGIN
  IF combined ~ '(minor|underage|teen[^a-z]|jailbait|leaked|revenge|non[- ]?consensual|spycam|hidden camera|doxx|blackmail|intoxicated|drugged)' THEN
    NEW.safety_status := 'rejected';
    NEW.rejected_reason := coalesce(NEW.rejected_reason, 'unsafe_provenance_or_consent_signal');
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS external_content_reject_if_unsafe_tg ON external_content_items;
CREATE TRIGGER external_content_reject_if_unsafe_tg
  BEFORE INSERT OR UPDATE ON external_content_items
  FOR EACH ROW EXECUTE FUNCTION external_content_reject_if_unsafe();
