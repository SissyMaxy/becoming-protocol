-- 650 — Reconditioning Engine, Phase 1b/2: mechanism linkage + new mechanism tables.
--
-- DESIGN §2, §7.1. Reuse-first: the existing mechanisms (Pavlovian, trance,
-- reframings, ambient offers) only need a nullable target_id so the orchestrator
-- can AIM them at the day's focus target. Existing rows are unaffected (NULL =
-- unlinked, behaves exactly as today). Plus three genuinely-new thin tables:
-- SM-2-lite retrieval scheduling, reconsolidation sessions, and per-target
-- commitment rungs (thin over handler_commitments).

-- ─── 1. Linkage: add nullable target_id to the reused mechanism tables ───────
ALTER TABLE pavlovian_pairings   ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;
ALTER TABLE trance_triggers      ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;
ALTER TABLE hypno_trance_sessions ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;
ALTER TABLE narrative_reframings ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;
ALTER TABLE audio_session_offers ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pavlovian_pairings_recon_idx   ON pavlovian_pairings(recon_target_id)   WHERE recon_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trance_triggers_recon_idx      ON trance_triggers(recon_target_id)      WHERE recon_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS narrative_reframings_recon_idx ON narrative_reframings(recon_target_id) WHERE recon_target_id IS NOT NULL;

-- ─── 2. recon_rep_schedule — SM-2-lite expanding-interval retrieval (§2.2) ───
-- Cued retrieval (not re-reading) on an expanding interval is the strongest
-- durable-memory schedule. Correct retrieval expands the interval; a miss/
-- contradiction contracts it.
CREATE TABLE IF NOT EXISTS recon_rep_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  card_kind TEXT NOT NULL DEFAULT 'mantra' CHECK (card_kind IN ('mantra','reframe','if_then')),
  card_ref UUID,                              -- optional pointer to source row (reframing, etc.)
  prompt TEXT NOT NULL,                       -- the cued-retrieval stem ("finish Mommy's line…")
  answer_key TEXT,                            -- what correct retrieval looks like (for scoring)
  next_due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  interval_days NUMERIC NOT NULL DEFAULT 1,
  ease NUMERIC NOT NULL DEFAULT 2.5,          -- SM-2 ease factor
  reps SMALLINT NOT NULL DEFAULT 0,
  lapses SMALLINT NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE recon_rep_schedule ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_rep_self ON recon_rep_schedule FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_rep_service ON recon_rep_schedule FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS recon_rep_due_idx ON recon_rep_schedule(user_id, next_due_at);

-- Grade a rep (quality 0..5, SM-2-lite). Correct (>=3) expands; miss contracts.
CREATE OR REPLACE FUNCTION recon_grade_rep(p_id UUID, p_quality INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r recon_rep_schedule%ROWTYPE; v_ease NUMERIC; v_interval NUMERIC;
BEGIN
  SELECT * INTO r FROM recon_rep_schedule WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_ease := greatest(1.3, r.ease + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02)));
  IF p_quality < 3 THEN
    v_interval := 1;                          -- lapse: back to 1 day
    UPDATE recon_rep_schedule
       SET interval_days = v_interval, ease = v_ease, reps = 0, lapses = lapses + 1,
           last_reviewed_at = now(), next_due_at = now() + (v_interval || ' days')::interval
     WHERE id = p_id;
  ELSE
    v_interval := CASE WHEN r.reps = 0 THEN 1 WHEN r.reps = 1 THEN 3 ELSE round(r.interval_days * v_ease) END;
    UPDATE recon_rep_schedule
       SET interval_days = v_interval, ease = v_ease, reps = reps + 1,
           last_reviewed_at = now(), next_due_at = now() + (v_interval || ' days')::interval
     WHERE id = p_id;
  END IF;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_grade_rep(UUID, INT) TO authenticated, service_role;

-- ─── 3. recon_reconsolidation_sessions — recall→mismatch→re-encode (§2.1) ────
-- Recalling a consolidated belief re-opens a ~1–3h labile window; new encoding
-- in that window durably rewrites the trace. The follow-up micro-rep is
-- scheduled INSIDE labile_until (that is the whole point).
CREATE TABLE IF NOT EXISTS recon_reconsolidation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  recall_prompt TEXT,                         -- "say back who you thought you were"
  mismatch_evidence TEXT,                     -- quoted contradiction from her own corpus
  reencode_claim TEXT,                        -- the target claim, re-encoded in the window
  source_event_table TEXT,                    -- e.g. 'hookup_attestations' (turn-out §6a)
  source_event_id UUID,
  arousal_paired BOOLEAN NOT NULL DEFAULT FALSE,
  labile_until TIMESTAMPTZ,                    -- now()+2h; micro-rep must land before this
  micro_rep_done_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'opened' CHECK (status IN ('opened','reencoded','micro_rep_done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE recon_reconsolidation_sessions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_recon_self ON recon_reconsolidation_sessions FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_recon_service ON recon_reconsolidation_sessions FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS recon_recon_window_idx ON recon_reconsolidation_sessions(user_id, labile_until)
  WHERE status IN ('opened','reencoded');

-- ─── 4. recon_commitments — per-target escalating commitment ladder (§2.6) ───
-- Thin over handler_commitments: each rung is a freely-chosen, logged commitment
-- that (when penalty-bearing) files through the obligation ledger for the
-- visible-before-penalized guarantee. Foot-in-the-door: small yes → larger yes.
CREATE TABLE IF NOT EXISTS recon_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  rung SMALLINT NOT NULL DEFAULT 1,           -- 1 (mirror) .. 5 (faceless funnel post)
  commitment_text TEXT NOT NULL,
  handler_commitment_id UUID,                 -- the ledger-backed row, when penalty-bearing
  chosen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'chosen' CHECK (status IN ('chosen','fulfilled','skipped','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_id, rung)
);
ALTER TABLE recon_commitments ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_commit_self ON recon_commitments FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_commit_service ON recon_commitments FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS recon_commit_target_idx ON recon_commitments(target_id, rung);
