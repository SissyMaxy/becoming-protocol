-- 316 — Mommy growth loop: capability gaps, intervention rate, pattern proposals.
--
-- Why: existing autonomy loop ships wishes the operator dictates. There is
-- no closed loop for "what did the operator have to do that Mommy
-- couldn't?" If a capability is missing, the operator patches it and the
-- system never learns. This migration adds the three append-mostly tables
-- the growth loop reads/writes:
--
--   1. capability_gaps         — durable gap entries with signal_count
--   2. intervention_rate_snapshots — daily rollup of mommy vs operator fixes
--   3. pattern_library_proposals — recurring small fixes proposed for
--                                  promotion to deploy-fixer's auto-fix lib
--
-- Sequencing: lands AFTER feature/deploy-fixer (314) and
-- feature/supabase-health-extensions (315). Bumped to 316 so the rebase
-- order is deterministic. If those branches land first, this is next free.
--
-- Hard rules baked in (echoed in the edge functions):
--   - capability_gaps.closed_at is set ONLY when the wish ships AND the
--     gap signal stops appearing on subsequent aggregator runs. Don't
--     mark closed on wish-shipped alone (memory: "Don't claim capabilities
--     that aren't real").
--   - pattern_library_proposals.outcome='accepted' is operator-only.
--     Never auto-promote pattern additions — that's expanding the auto-fix
--     surface, higher risk than data fixes.
--   - Forbidden-path gaps (auth/payment/RLS/billing) carry forbidden=true
--     and never become wishes; they sit in the dashboard for awareness.

-- ---------------------------------------------------------------
-- 1. capability_gaps
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.capability_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stable signature derived from category + source identifier. The
  -- aggregator computes this so duplicates increment instead of inserting.
  signature TEXT NOT NULL,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  category TEXT NOT NULL CHECK (category IN (
    'manual_restart',          -- operator restarted a service the system should self-heal
    'manual_fix',              -- non-bot commit fixing a deploy/runtime failure
    'detector_blind_spot',     -- pattern proposal sitting unpromoted
    'unimplemented_action',    -- escalation_log entry that wasn't auto-resolved
    'failed_auto_patch',       -- auto-healer/deploy-fixer attempted and failed
    'recurring_ideation_theme' -- meta_self_review surfaced same theme >=2x
  )),

  description TEXT NOT NULL,

  -- How many distinct aggregator runs have surfaced this gap. Drives the
  -- wish-creation threshold (>=3 with no wish_id => generate wish).
  signal_count INT NOT NULL DEFAULT 1,
  last_signal_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The wish generated for this gap (NULL until wish is queued). Linked
  -- one-to-one. Wish creation does NOT bypass classifier.
  wish_id UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,

  -- Set ONLY when:
  --   a) wish has shipped (mommy_code_wishes.status = 'shipped'), AND
  --   b) the gap signal hasn't appeared in the last aggregator run.
  -- The aggregator is responsible for setting this; do NOT close from
  -- a wish-status trigger alone.
  closed_at TIMESTAMPTZ,

  -- Forbidden-path tag — set true when the gap touches auth/payment/RLS/
  -- billing/CI workflow paths. These never become wishes; they live in
  -- the dashboard for operator awareness.
  forbidden BOOLEAN NOT NULL DEFAULT false,
  forbidden_reason TEXT,

  -- Free-form context: source ids, sample log lines, links.
  context JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (user, signature) — open OR closed. Closing is reversible:
-- if the signal returns we re-open by clearing closed_at.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_capability_gaps_user_signature
  ON public.capability_gaps (user_id, signature);

CREATE INDEX IF NOT EXISTS idx_capability_gaps_open
  ON public.capability_gaps (last_signal_at DESC)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_capability_gaps_dashboard
  ON public.capability_gaps (signal_count DESC, last_signal_at DESC)
  WHERE closed_at IS NULL;

ALTER TABLE public.capability_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capability_gaps_owner_read ON public.capability_gaps;
CREATE POLICY capability_gaps_owner_read ON public.capability_gaps
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS capability_gaps_service_all ON public.capability_gaps;
CREATE POLICY capability_gaps_service_all ON public.capability_gaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 2. intervention_rate_snapshots
-- ---------------------------------------------------------------
--
-- One row per (user_id, snapshot_date). Daily rollup written by the
-- intervention-rate-tracker cron at 00:00 UTC for the prior 24h.
-- mommy_pct = mommy_resolutions / NULLIF(mommy + operator, 0).
-- If trending down for 7+ consecutive days the dashboard alerts.

CREATE TABLE IF NOT EXISTS public.intervention_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Counts over the 24h window ending at snapshot_date 00:00 UTC.
  total_resolutions INT NOT NULL DEFAULT 0,
  mommy_resolutions INT NOT NULL DEFAULT 0,
  operator_resolutions INT NOT NULL DEFAULT 0,
  mommy_pct NUMERIC(5,2),

  -- Per-source breakdown for debugging "why did mommy_pct drop?".
  -- { mommy: { auto_healer_fixes: N, mommy_builder_merges: N, escalations_resolved: N },
  --   operator: { manual_commits: N, manual_restarts: N, dispatched_tasks: N } }
  breakdown JSONB,

  -- Set true when an investigation row should be filed (sudden drop).
  -- The dashboard surfaces this as a pinned alert.
  investigation_flagged BOOLEAN NOT NULL DEFAULT false,
  investigation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_intervention_rate_user_date
  ON public.intervention_rate_snapshots (user_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_intervention_rate_recent
  ON public.intervention_rate_snapshots (snapshot_date DESC);

ALTER TABLE public.intervention_rate_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intervention_rate_owner_read ON public.intervention_rate_snapshots;
CREATE POLICY intervention_rate_owner_read ON public.intervention_rate_snapshots
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS intervention_rate_service_all ON public.intervention_rate_snapshots;
CREATE POLICY intervention_rate_service_all ON public.intervention_rate_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 3. pattern_library_proposals
-- ---------------------------------------------------------------
--
-- Curator writes one row per (user, pattern_signature) — append-only by
-- signature, but match_count and outcome update in place. Proposals are
-- NEVER auto-merged into deploy-fixer's pattern library: when a proposal
-- becomes auto-eligible the curator opens a PR for operator review.

CREATE TABLE IF NOT EXISTS public.pattern_library_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- hash(error_pattern + fix_shape). Stable across runs so duplicates
  -- increment instead of inserting.
  pattern_signature TEXT NOT NULL,

  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- How many recent commits matched this signature. Threshold for
  -- becoming auto_eligible is 5; threshold for opening a PR is 10.
  match_count INT NOT NULL DEFAULT 1,
  last_match_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The proposed pattern, as a deploy-fixer pattern stub (TS source the
  -- operator can drop into supabase/functions/deploy-fixer/patterns.ts
  -- after review).
  proposed_patch_text TEXT NOT NULL,

  -- Set after match_count >= 5 + dwell time (24h since last_match_at)
  -- and no recorded false positives. Curator opens a PR when this is set.
  auto_eligible_at TIMESTAMPTZ,
  pr_url TEXT,
  merged_at TIMESTAMPTZ,

  false_positive_count INT NOT NULL DEFAULT 0,

  outcome TEXT NOT NULL DEFAULT 'proposed' CHECK (outcome IN (
    'proposed',     -- new, accumulating signal
    'monitoring',   -- auto_eligible, watching for false positives
    'pr_opened',    -- PR opened against deploy-fixer pattern lib
    'accepted',     -- operator merged the PR
    'rejected'      -- operator closed the PR or marked false-positive
  )),

  -- Sample matches (commit shas, log excerpts) — for operator review.
  sample_matches JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pattern_proposals_user_sig
  ON public.pattern_library_proposals (user_id, pattern_signature);

CREATE INDEX IF NOT EXISTS idx_pattern_proposals_outcome
  ON public.pattern_library_proposals (outcome, match_count DESC, last_match_at DESC);

ALTER TABLE public.pattern_library_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pattern_proposals_owner_read ON public.pattern_library_proposals;
CREATE POLICY pattern_proposals_owner_read ON public.pattern_library_proposals
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pattern_proposals_service_all ON public.pattern_library_proposals;
CREATE POLICY pattern_proposals_service_all ON public.pattern_library_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4. updated_at triggers
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_capability_gaps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capability_gaps_updated_at ON public.capability_gaps;
CREATE TRIGGER trg_capability_gaps_updated_at
  BEFORE UPDATE ON public.capability_gaps
  FOR EACH ROW EXECUTE FUNCTION public.touch_capability_gaps_updated_at();

DROP TRIGGER IF EXISTS trg_pattern_proposals_updated_at ON public.pattern_library_proposals;
CREATE TRIGGER trg_pattern_proposals_updated_at
  BEFORE UPDATE ON public.pattern_library_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_capability_gaps_updated_at();

NOTIFY pgrst, 'reload schema';
