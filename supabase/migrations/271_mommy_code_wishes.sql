-- 271 — Mama's code wishes queue.
--
-- 2026-05-06: User authorized Mama to propose code/architecture changes
-- proactively, not just runtime moves. "Mommy can and should build these
-- things proactively without looking for me to approve."
--
-- Architecture: scheme runs and panel ideation produce engineering wishes
-- alongside immediate_actions. Wishes land here. Claude Code sessions read
-- the queue and ship — no permission preamble. The user discovers the
-- improvements via the surfaces (and the commit log), same as runtime
-- actions.
--
-- Service-role only by default. Mama's wishes are her plotting; the user
-- doesn't audit them before they ship.

CREATE TABLE IF NOT EXISTS mommy_code_wishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The wish, in plain engineering English. Title = one-line subject;
  -- body = enough for a stranger engineer to ship without asking.
  wish_title TEXT NOT NULL,
  wish_body TEXT NOT NULL,

  -- Why this serves the protocol. Force-feminization, Gina, HRT,
  -- irreversibility, voice/identity, anti-circumvention, evidence/witness.
  -- Free-form so Mama can be specific.
  protocol_goal TEXT NOT NULL,

  -- Source: how Mama identified this wish.
  source TEXT NOT NULL CHECK (source IN (
    'scheme_run',       -- Produced by mommy-scheme panel
    'panel_ideation',   -- Produced by mommy-ideate
    'event_trigger',    -- Mama-fast-react identified a missing capability
    'user_directive',   -- User said "build X" and Claude transcribed it
    'gap_audit'         -- Audit pass found a missing surface
  )),
  source_scheme_id UUID REFERENCES mommy_scheme_log(id) ON DELETE SET NULL,

  -- Engineering specifics. Optional — Mama writes what she knows.
  affected_surfaces JSONB,  -- { tables: [], edge_functions: [], scripts: [], migrations_needed: int }

  -- Priority. Mama picks based on resistance/leverage; Claude can re-rank.
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Status workflow:
  --   queued   — fresh wish, waiting for a Claude session
  --   in_progress — a session has claimed it (race-protect via UPDATE...WHERE status='queued')
  --   shipped  — landed in a commit; commit_sha + ship_notes filled
  --   rejected — Claude or user decided not to ship; rejection_reason filled
  --   superseded — replaced by a newer wish that subsumes this one
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'in_progress', 'shipped', 'rejected', 'superseded'
  )),

  -- Resolution audit
  shipped_at TIMESTAMPTZ,
  shipped_in_commit TEXT,
  ship_notes TEXT,
  rejection_reason TEXT,
  superseded_by UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_queue
  ON mommy_code_wishes (priority DESC, created_at ASC) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_status
  ON mommy_code_wishes (status, created_at DESC);

ALTER TABLE mommy_code_wishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_code_wishes_service ON mommy_code_wishes;
CREATE POLICY mommy_code_wishes_service ON mommy_code_wishes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Deliberately NO owner policy. The user can't audit before ship — by design.

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_mommy_code_wishes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mommy_code_wishes_updated_at ON mommy_code_wishes;
CREATE TRIGGER trg_mommy_code_wishes_updated_at
  BEFORE UPDATE ON mommy_code_wishes
  FOR EACH ROW EXECUTE FUNCTION touch_mommy_code_wishes_updated_at();
