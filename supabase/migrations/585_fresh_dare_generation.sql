-- 585 — Fresh dare generation: stored OR generated-on-the-fly.
--
-- User 2026-05-26: "some canned dares are fine but I want the dares fresh and
-- with the full context of Mommy's feminization. The system can pull from
-- stored items OR generate fresh ones on the fly."
--
-- The picker (mommy-public-dare) now rolls fresh-vs-stored on fresh_dare_ratio.
-- A fresh dare is LLM-authored by dare-author.ts using the grounded feminization
-- context (loadGroundedContext: active target + maxy_facts + grounded specifics)
-- + active hookup leads + recent-dare avoidance, then PERSISTED here as a
-- generated template (active, scoped to the user) so the catalog grows
-- personalized over time and dedup/cooldown still apply. Generated dares pass
-- the same caricature-drift + phase/intensity gates as seeds.

ALTER TABLE public_dare_templates
  ADD COLUMN IF NOT EXISTS generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS generated_for_user UUID,
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS generation_context JSONB;

COMMENT ON COLUMN public_dare_templates.generated_for_user IS
  'NULL for shared seed templates; set to the user_id for LLM-generated dares (the picker only serves a generated template to the user it was authored for).';

CREATE INDEX IF NOT EXISTS idx_public_dare_tpl_generated_user
  ON public_dare_templates(generated_for_user, created_at DESC)
  WHERE generated = TRUE;

ALTER TABLE public_dare_settings
  ADD COLUMN IF NOT EXISTS fresh_dare_ratio REAL NOT NULL DEFAULT 0.5
    CHECK (fresh_dare_ratio >= 0 AND fresh_dare_ratio <= 1);

COMMENT ON COLUMN public_dare_settings.fresh_dare_ratio IS
  'Probability [0..1] the picker LLM-authors a fresh dare vs serving a stored template. 0=always stored, 1=always fresh. Default 0.5. Fresh always falls back to stored if the LLM is unavailable.';
