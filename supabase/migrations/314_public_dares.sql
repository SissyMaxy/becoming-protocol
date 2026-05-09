-- 314 — Public dares engine (Mommy's reach into the everyday).
--
-- Phase + intensity-gated micro-tasks the user performs in public — wear
-- something specific to the grocery store, recite a mantra in a public
-- bathroom mirror, kneel briefly at a private moment in the parking lot.
-- Reinforces the persona's reach into the user's everyday world WITHOUT
-- putting her at risk: discreet/internal framings only, no public lewdness,
-- no nudity, no attention-from-strangers.
--
-- Design notes:
--   - DEFAULT OFF. Settings row gates the cron picker. Opt-in only.
--   - No location data is stored. The "I'm at the place" check-in is a
--     boolean ack on the assignment row — never coordinates, never a
--     place identifier.
--   - Phase-gated heavily. Phase 1 users cannot draw cruel-tier dares
--     no matter what the difficulty dial says.
--   - Skipping is never penalized. status='skipped' is a graceful out
--     and the picker tracks recency to avoid hammering the user with
--     the same dare.
--   - Coexists with sibling branches; FKs use soft pointers where the
--     other side is on a parallel branch (verification_photos id and
--     mommy_audio_files id).

-- ─── 1. public_dare_templates ─────────────────────────────────────────────
-- Catalog of dare templates. Service-role writes; users only read.
CREATE TABLE IF NOT EXISTS public_dare_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  kind TEXT NOT NULL CHECK (kind IN (
    'wardrobe', 'mantra', 'posture', 'position', 'micro_ritual', 'errand_specific'
  )),

  description TEXT NOT NULL,
  -- Phase gates (1..7, inclusive). A template fires only when the
  -- user's transformation_phase falls inside the window.
  phase_min SMALLINT NOT NULL DEFAULT 1 CHECK (phase_min BETWEEN 1 AND 7),
  phase_max SMALLINT NOT NULL DEFAULT 7 CHECK (phase_max BETWEEN 1 AND 7),

  -- Intensity tier the dare requires. Selector compares against
  -- profile_foundation.difficulty_level via INTENSITY_RANK ordering;
  -- a tier-'firm' dare fires for users at firm or relentless.
  intensity_tier TEXT NOT NULL DEFAULT 'gentle' CHECK (intensity_tier IN (
    'gentle', 'moderate', 'firm', 'relentless'
  )),

  -- When true, the picker only assigns the template after the user
  -- signals "I'm out" (a context ack on a prior assignment) so the
  -- dare lands in the right place. Errand-specific dares set this.
  requires_location_context BOOLEAN NOT NULL DEFAULT FALSE,

  -- Verification CTA the Today card renders.
  --   photo    — opens PhotoVerificationUpload tagged 'public_dare'
  --   text_ack — single-tap "done" button
  --   voice    — record-audio button (links into the existing
  --              voice-corpus capture flow; soft id linkage)
  --   none     — assignment closes silently when status flips
  verification_kind TEXT NOT NULL DEFAULT 'text_ack' CHECK (verification_kind IN (
    'photo', 'text_ack', 'voice', 'none'
  )),

  -- Affect bias hints — selector preference when Mommy's mood matches.
  -- Free-form text, NOT an enum, so seeds can mirror dommy-mommy.ts
  -- Affect labels without a hard FK lock.
  affect_bias TEXT[] NOT NULL DEFAULT '{}',

  -- Cooldown window (days) the same template stays out of rotation
  -- after assignment. Lets seeds tune their own recency.
  cooldown_days SMALLINT NOT NULL DEFAULT 14 CHECK (cooldown_days >= 0),

  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT public_dare_phase_window CHECK (phase_min <= phase_max)
);

CREATE INDEX IF NOT EXISTS idx_public_dare_tpl_active_kind
  ON public_dare_templates(active, kind);
CREATE INDEX IF NOT EXISTS idx_public_dare_tpl_phase_window
  ON public_dare_templates(phase_min, phase_max);

-- Templates are catalog data. Authenticated users read; only service_role
-- writes via migration / ops scripts.
ALTER TABLE public_dare_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_dare_tpl_read ON public_dare_templates;
CREATE POLICY public_dare_tpl_read ON public_dare_templates
  FOR SELECT USING (true);
DROP POLICY IF EXISTS public_dare_tpl_service ON public_dare_templates;
CREATE POLICY public_dare_tpl_service ON public_dare_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. public_dare_assignments ───────────────────────────────────────────
-- Per-user dare instances. Each assignment links back to its template.
-- The verification artifact column is a soft pointer — the photo lives
-- in verification_photos with task_type='public_dare', the audio lives
-- wherever the voice-corpus pipeline drops it. We keep a single nullable
-- UUID rather than a polymorphic FK pair to keep the row narrow.
CREATE TABLE IF NOT EXISTS public_dare_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public_dare_templates(id) ON DELETE RESTRICT,

  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_by TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'skipped', 'expired'
  )),

  -- Set when the user taps "I'm at the place" (context-gated dares only).
  -- Boolean ack — never coordinates, never a place identifier.
  location_context_acknowledged_at TIMESTAMPTZ,

  completed_at TIMESTAMPTZ,
  -- Soft FK to verification_photos.id or to a voice file id, depending
  -- on the template's verification_kind. NULL when verification_kind='none'
  -- or the user used text_ack.
  verification_artifact_id UUID,

  -- Snapshots at assignment time, for after-the-fact tuning.
  intensity_at_assignment TEXT,
  phase_at_assignment SMALLINT,
  affect_at_assignment TEXT,

  -- The outreach row that announced this dare (the Today surface
  -- relies on the announcement; this back-link makes the trace easy).
  assigned_via_outreach_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_dare_assn_user_status
  ON public_dare_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_public_dare_assn_user_assigned
  ON public_dare_assignments(user_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_dare_assn_template_recent
  ON public_dare_assignments(template_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_dare_assn_due
  ON public_dare_assignments(due_by)
  WHERE status IN ('pending', 'in_progress');

ALTER TABLE public_dare_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_dare_assn_owner ON public_dare_assignments;
CREATE POLICY public_dare_assn_owner ON public_dare_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS public_dare_assn_service ON public_dare_assignments;
CREATE POLICY public_dare_assn_service ON public_dare_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. public_dare_settings (per-user opt-in) ────────────────────────────
-- One row per user. CRITICAL: enabled defaults to FALSE. The dare
-- picker reads this row first and bails when it doesn't exist or is
-- disabled. This is the privacy floor.
CREATE TABLE IF NOT EXISTS public_dare_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_dare_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Same vocabulary as wardrobe_prescription_settings.cadence so the
  -- two systems read consistently to a stranger.
  cadence TEXT NOT NULL DEFAULT 'occasional' CHECK (cadence IN ('occasional', 'weekly', 'off')),
  -- Floor on selector intensity_tier, evaluated against
  -- profile_foundation.difficulty_level. Defaults to 'gentle' so
  -- enabling the feature lets gentle dares fire immediately; bumping
  -- the dial pulls in moderate/firm/relentless tiers.
  min_intensity TEXT NOT NULL DEFAULT 'gentle' CHECK (min_intensity IN (
    'gentle', 'moderate', 'firm', 'relentless'
  )),
  -- Optional kind allow-list. NULL = all kinds permitted; non-NULL
  -- restricts the picker (e.g. user wants only mantra+wardrobe dares).
  allowed_kinds TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public_dare_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_dare_settings_owner ON public_dare_settings;
CREATE POLICY public_dare_settings_owner ON public_dare_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS public_dare_settings_service ON public_dare_settings;
CREATE POLICY public_dare_settings_service ON public_dare_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. updated_at triggers (idempotent) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_public_dare_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_public_dare_tpl ON public_dare_templates;
CREATE TRIGGER trg_touch_public_dare_tpl
  BEFORE UPDATE ON public_dare_templates
  FOR EACH ROW EXECUTE FUNCTION touch_public_dare_updated_at();

DROP TRIGGER IF EXISTS trg_touch_public_dare_assn ON public_dare_assignments;
CREATE TRIGGER trg_touch_public_dare_assn
  BEFORE UPDATE ON public_dare_assignments
  FOR EACH ROW EXECUTE FUNCTION touch_public_dare_updated_at();

DROP TRIGGER IF EXISTS trg_touch_public_dare_settings ON public_dare_settings;
CREATE TRIGGER trg_touch_public_dare_settings
  BEFORE UPDATE ON public_dare_settings
  FOR EACH ROW EXECUTE FUNCTION touch_public_dare_updated_at();

-- ─── 5. Extend verification_photos.task_type to include 'public_dare' ─────
-- Photo-verifying dares (photo verification_kind) need their own task_type
-- so analyze-photo can route through a dare-aware approval prompt and
-- the fulfillment hook can find the assignment.
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_task_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_task_type_check
  CHECK (task_type IN (
    'outfit', 'mirror_check', 'pose', 'makeup', 'nails', 'general',
    'progress_photo', 'gina_text', 'wardrobe', 'public_dare'
  ));
