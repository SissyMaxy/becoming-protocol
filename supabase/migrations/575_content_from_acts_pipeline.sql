-- 575 — Content-from-acts pipeline. Routes ladder fulfillments +
-- hookup attestations into publishable_content_queue with a privacy
-- review heuristic. mommy-content-drafter edge fn picks up approved
-- rows and authors platform-specific captions via the multi-LLM router.

CREATE TABLE IF NOT EXISTS publishable_content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'ladder_fulfillment_voice','ladder_fulfillment_photo','solo_orgasm_session',
    'hookup_attestation','milestone_hit','cumslut_drill_session','voice_recording'
  )),
  source_table TEXT NOT NULL, source_id UUID NOT NULL,
  raw_material_text TEXT, raw_material_url TEXT,
  privacy_review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (privacy_review_status IN (
    'pending_review','approved_publishable','rejected_contains_pii','rejected_too_personal','approved_with_redactions'
  )),
  privacy_review_notes TEXT, redactions_needed TEXT[],
  target_platforms TEXT[],
  draft_status TEXT NOT NULL DEFAULT 'queued' CHECK (draft_status IN (
    'queued','drafting','drafted','published','expired','rejected'
  )),
  related_draft_id UUID REFERENCES mommy_drafts(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pcq_user_status ON publishable_content_queue(user_id, draft_status, created_at DESC);
ALTER TABLE publishable_content_queue ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY pcq_self ON publishable_content_queue FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- privacy_review_content + 2 routing triggers applied via SQL.
