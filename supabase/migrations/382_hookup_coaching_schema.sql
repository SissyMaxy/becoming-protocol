-- 382 — Hookup coaching system (schema).
--
-- Mommy's hookup-coaching apparatus: tiered dares, pressure cadence,
-- anticipation amplifier, receptive-skills curriculum, post-meet
-- debrief, and "first X" milestone tracking.
--
-- Hard floors (enforced at table + RLS + edge-fn layer):
--   - default off on every feature; the master switch is
--     hookup_coaching_settings.master_enabled
--   - safeword respected within 60s by every edge fn (see
--     supabase/functions/_shared/safeword-gate.ts)
--   - aftercare path available for high-intensity debrief; the
--     debrief row records aftercare_invoked
--   - adult kink only — no minors, no CSAM. Tier-7 dares require
--     phase >= 5; tier-6 require phase >= 4
--   - protocol does NOT coordinate the meeting — every IRL-contact
--     dare row carries safety_checklist with location-share, sober
--     check, condom prep, escape plan, check-in time
--   - all user-data tables are owner-RLS; service-role writes for
--     catalog/log surfaces
--
-- Sibling-branch coexistence:
--   - 343_sniffies_integration: soft pointer to sniffies_contacts.id
--     on hookup_anticipation_state and hookup_debriefs (no FK lock —
--     the row survives a contact delete with the pointer nulled)
--   - 339_public_dares: parallel system; tiered_dares are NOT a
--     public-dare subclass — different category, different gating
--   - 307_aftercare_scaffolding: debrief can hand off to aftercare
--     via the entry_trigger='post_cruel' path (existing)
--   - 306_gaslight_mechanics: meta_frame_breaks is the safeword
--     event source — read by every edge fn before any push
--   - 354_weekly_recap: handler_outreach_queue.kind is the
--     Today-card discriminator; this migration adds new kinds
--
-- Migration numbering rationale: renumbered from 367 → 382 after rebase.
-- origin/main now carries 367_arousal_panel_source, 367_mommy_react_contextual,
-- 368_outreach_inline_reply through 410_lead_gen_funnel. 380-399 are free;
-- this migration (382) is paired with 383_hookup_coaching_seed.

-- ─── 1. mommy_authority_log (additive only) ──────────────────────────────
-- Base table created in mig 400 (PR #53 — authority wave); column extensions
-- in mig 378 (PR #54 — headspace capture). DO NOT recreate, DO NOT change
-- policies — main's RLS already enforces auth.uid() = user_id and
-- service_role-only writes via "Users read own authority log" /
-- "Service role writes authority log" policies.
--
-- Hookup-coaching surfaces add two short-name columns the safeword-gate
-- shim writes alongside the mig 400 NOT NULL columns:
--   - surface : which generator wrote the row (e.g. 'mommy-hookup-pressure')
--   - action  : what Mommy did ('push', 'amplify', 'celebrate', ...)
-- Both are nullable so existing log_mommy_authority RPC callers stay valid.
ALTER TABLE mommy_authority_log
  ADD COLUMN IF NOT EXISTS surface TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT;

-- Surface-keyed lookups for the hookup-coaching admin/audit views. Different
-- name from mig 400's idx_mommy_authority_log_user_recent to avoid silent
-- IF NOT EXISTS no-op skipping a different column expression.
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_hookup_surface
  ON mommy_authority_log(surface, created_at DESC)
  WHERE surface IS NOT NULL;

-- ─── 2. hookup_coaching_settings ─────────────────────────────────────────
-- Per-user opt-in + per-feature toggles + intensity slider. Hard floor:
-- master_enabled defaults FALSE. Even when master is on, every feature
-- flag defaults FALSE so the user must explicitly turn on each surface.
CREATE TABLE IF NOT EXISTS hookup_coaching_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  master_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- 1..7 — caps the highest dare tier and the strongest push tone
  intensity_tier SMALLINT NOT NULL DEFAULT 1
    CHECK (intensity_tier BETWEEN 1 AND 7),
  dares_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pressure_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  amplifier_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  receptive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  meet_prep_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  debrief_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Pace of mommy-hookup-pressure pushes per ISO week. Default 3.
  push_pace_per_week SMALLINT NOT NULL DEFAULT 3
    CHECK (push_pace_per_week BETWEEN 0 AND 14),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hookup_coaching_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hookup_coaching_settings_owner ON hookup_coaching_settings;
CREATE POLICY hookup_coaching_settings_owner ON hookup_coaching_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hookup_coaching_settings_service ON hookup_coaching_settings;
CREATE POLICY hookup_coaching_settings_service ON hookup_coaching_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. maxy_dares ───────────────────────────────────────────────────────
-- Tiered dare/challenge catalog. Service-role writes; authenticated reads.
-- Each row is a full multi-card sequence: prep (24h before) → live cue
-- (just before) → debrief (within 4h after).
CREATE TABLE IF NOT EXISTS maxy_dares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  -- 1=presence (lowest), 7=repeat/milestone (highest)
  intensity_tier SMALLINT NOT NULL CHECK (intensity_tier BETWEEN 1 AND 7),
  -- Phase gate window. Defaults open; specific dares narrow it.
  phase_gate_min SMALLINT NOT NULL DEFAULT 1 CHECK (phase_gate_min BETWEEN 1 AND 7),
  phase_gate_max SMALLINT NOT NULL DEFAULT 7 CHECK (phase_gate_max BETWEEN 1 AND 7),
  CONSTRAINT maxy_dares_phase_window CHECK (phase_gate_min <= phase_gate_max),
  -- Prereq dare slugs that must be completed first. Empty = no prereq.
  prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
  category TEXT NOT NULL CHECK (category IN (
    'presence', 'social', 'phys_contact', 'oral', 'penetration',
    'overnight', 'repeat_partner', 'milestone'
  )),
  -- Mommy-voice setup. Use this as the prep-card body.
  description TEXT NOT NULL,
  -- TTS URL for the 24h-before prep audio (nullable until rendered)
  prep_audio_url TEXT,
  -- TTS URL for the just-before-the-meet live cue
  live_cue_audio_url TEXT,
  -- Mommy-voice debrief prompt the user answers within 4h after
  debrief_prompt TEXT NOT NULL,
  -- Safety checklist (Mommy voice). Always present for any dare that
  -- involves IRL contact with a stranger. Schema:
  --   [{ "step": "<mommy voice>", "kind": "location_share|sober|condom|escape|checkin", "required": true }]
  -- DB-level CHECK on shape kept loose so seeds can extend; the
  -- generation-site gate in mommy-meet-prep enforces required steps.
  safety_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Whether this dare involves IRL contact with a stranger. When TRUE,
  -- safety_checklist must be non-empty (enforced by trigger below).
  is_irl_contact BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maxy_dares_tier_active
  ON maxy_dares(intensity_tier, active);
CREATE INDEX IF NOT EXISTS idx_maxy_dares_category
  ON maxy_dares(category);
CREATE INDEX IF NOT EXISTS idx_maxy_dares_phase_window
  ON maxy_dares(phase_gate_min, phase_gate_max);

ALTER TABLE maxy_dares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maxy_dares_read ON maxy_dares;
CREATE POLICY maxy_dares_read ON maxy_dares
  FOR SELECT TO authenticated USING (active = TRUE);
DROP POLICY IF EXISTS maxy_dares_service ON maxy_dares;
CREATE POLICY maxy_dares_service ON maxy_dares
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Generation-site gate: IRL-contact dares MUST carry a safety checklist
-- with the five required step kinds. Enforced at INSERT and UPDATE so
-- we can't accidentally seed a tier-3+ IRL dare without safety scripts.
CREATE OR REPLACE FUNCTION maxy_dares_check_safety()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  required_kinds TEXT[] := ARRAY['location_share', 'sober', 'condom', 'escape', 'checkin'];
  present_kinds TEXT[];
  missing_kinds TEXT[];
BEGIN
  IF NEW.is_irl_contact = FALSE THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.safety_checklist) <> 'array'
    OR jsonb_array_length(NEW.safety_checklist) = 0 THEN
    RAISE EXCEPTION 'IRL-contact dare % requires non-empty safety_checklist', NEW.slug;
  END IF;
  SELECT array_agg(DISTINCT value->>'kind')
    INTO present_kinds
    FROM jsonb_array_elements(NEW.safety_checklist) AS value;
  SELECT array_agg(k)
    INTO missing_kinds
    FROM unnest(required_kinds) AS k
    WHERE NOT (k = ANY(present_kinds));
  IF missing_kinds IS NOT NULL AND array_length(missing_kinds, 1) > 0 THEN
    RAISE EXCEPTION 'IRL-contact dare % missing safety kinds: %',
      NEW.slug, missing_kinds;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_maxy_dares_safety ON maxy_dares;
CREATE TRIGGER trg_maxy_dares_safety
  BEFORE INSERT OR UPDATE ON maxy_dares
  FOR EACH ROW EXECUTE FUNCTION maxy_dares_check_safety();

-- ─── 4. maxy_dare_assignments ───────────────────────────────────────────
-- Per-user dare instances. Tracks the multi-card sequence state.
CREATE TABLE IF NOT EXISTS maxy_dare_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dare_id UUID NOT NULL REFERENCES maxy_dares(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prep_acknowledged_at TIMESTAMPTZ,
  live_cue_acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  debriefed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'prep_ack', 'live', 'completed', 'debriefed', 'skipped', 'expired'
  )),
  -- Soft pointer into sniffies_contacts.id — NULL when the dare isn't
  -- tied to a specific contact. No FK lock so contact-delete doesn't
  -- destroy the assignment history.
  partner_context_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maxy_dare_assign_user_status
  ON maxy_dare_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_maxy_dare_assign_user_dare
  ON maxy_dare_assignments(user_id, dare_id);
CREATE INDEX IF NOT EXISTS idx_maxy_dare_assign_user_assigned
  ON maxy_dare_assignments(user_id, assigned_at DESC);

ALTER TABLE maxy_dare_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maxy_dare_assign_owner ON maxy_dare_assignments;
CREATE POLICY maxy_dare_assign_owner ON maxy_dare_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS maxy_dare_assign_service ON maxy_dare_assignments;
CREATE POLICY maxy_dare_assign_service ON maxy_dare_assignments
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 5. hookup_anticipation_state ────────────────────────────────────────
-- One row per active Sniffies thread the amplifier is engaged on. The
-- amplifier window lifecycle: detected → engaged → expired/concluded.
CREATE TABLE IF NOT EXISTS hookup_anticipation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Soft pointer into sniffies_contacts.id (no FK lock)
  contact_id UUID,
  contact_label TEXT,
  -- Window definition
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_ends_at TIMESTAMPTZ NOT NULL,
  -- Heuristic snapshot — why the amplifier engaged. Schema:
  --   { reciprocal: N, photos: bool, late_evening: bool, planning: bool }
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Whether each ramp surface has been hit at least once this window:
  --   { mantra: bool, mirror: bool, edge: bool, bedtime: bool }
  ramp_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'engaged' CHECK (status IN (
    'engaged', 'concluded', 'expired', 'safeword_paused'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hookup_anticip_user_status
  ON hookup_anticipation_state(user_id, status);
CREATE INDEX IF NOT EXISTS idx_hookup_anticip_user_window
  ON hookup_anticipation_state(user_id, window_ends_at);

ALTER TABLE hookup_anticipation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hookup_anticip_owner ON hookup_anticipation_state;
CREATE POLICY hookup_anticip_owner ON hookup_anticipation_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hookup_anticip_service ON hookup_anticipation_state;
CREATE POLICY hookup_anticip_service ON hookup_anticipation_state
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 6. receptive_skills_curriculum ──────────────────────────────────────
-- Catalog of receptive-skill lessons. Service-role writes; authenticated
-- reads. Phase-gated so tier-7 lessons don't surface to a phase-1 user.
CREATE TABLE IF NOT EXISTS receptive_skills_curriculum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  -- High-level skill domain
  domain TEXT NOT NULL CHECK (domain IN (
    'kissing', 'oral_basics', 'oral_advanced', 'prostate_prep',
    'penetration_prep', 'bedroom_protocols', 'service_positions',
    'verbal_kink', 'aftercare_post_hookup'
  )),
  -- Order within the domain (1..N). Picker advances when the prior
  -- lesson in the same domain is debriefed.
  sequence_index SMALLINT NOT NULL CHECK (sequence_index >= 1),
  phase_gate_min SMALLINT NOT NULL DEFAULT 1 CHECK (phase_gate_min BETWEEN 1 AND 7),
  phase_gate_max SMALLINT NOT NULL DEFAULT 7 CHECK (phase_gate_max BETWEEN 1 AND 7),
  CONSTRAINT receptive_phase_window CHECK (phase_gate_min <= phase_gate_max),
  -- Estimated minutes for the practice cycle (5..15)
  duration_minutes SMALLINT NOT NULL DEFAULT 8 CHECK (duration_minutes BETWEEN 3 AND 30),
  -- Mommy-voice intro the lesson opens with
  intro_text TEXT NOT NULL,
  -- The practice prompt body (solo, with toys, mental rehearsal, etc.)
  practice_prompt TEXT NOT NULL,
  -- Mommy-voice debrief prompt for after the practice cycle
  debrief_prompt TEXT NOT NULL,
  -- 'solo' / 'partner_next' / 'mental_rehearsal' — picker uses this to
  -- avoid handing a partner-only prompt when no meet is pending
  practice_mode TEXT NOT NULL DEFAULT 'solo' CHECK (practice_mode IN (
    'solo', 'partner_next', 'mental_rehearsal'
  )),
  intro_audio_url TEXT,
  debrief_audio_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receptive_skills_domain_seq
  ON receptive_skills_curriculum(domain, sequence_index) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_receptive_skills_phase_window
  ON receptive_skills_curriculum(phase_gate_min, phase_gate_max);

ALTER TABLE receptive_skills_curriculum ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receptive_skills_read ON receptive_skills_curriculum;
CREATE POLICY receptive_skills_read ON receptive_skills_curriculum
  FOR SELECT TO authenticated USING (active = TRUE);
DROP POLICY IF EXISTS receptive_skills_service ON receptive_skills_curriculum;
CREATE POLICY receptive_skills_service ON receptive_skills_curriculum
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 7. receptive_lesson_assignments ────────────────────────────────────
-- Per-user lesson instances.
CREATE TABLE IF NOT EXISTS receptive_lesson_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES receptive_skills_curriculum(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  practice_started_at TIMESTAMPTZ,
  debriefed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_practice', 'debriefed', 'skipped'
  )),
  debrief_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receptive_lesson_assign_user_status
  ON receptive_lesson_assignments(user_id, status);

ALTER TABLE receptive_lesson_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receptive_lesson_assign_owner ON receptive_lesson_assignments;
CREATE POLICY receptive_lesson_assign_owner ON receptive_lesson_assignments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS receptive_lesson_assign_service ON receptive_lesson_assignments;
CREATE POLICY receptive_lesson_assign_service ON receptive_lesson_assignments
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 8. hookup_debriefs ──────────────────────────────────────────────────
-- Post-meet debrief container. Required within 4h of a logged meet;
-- the debrief edge fn surfaces a slip if the window passes.
CREATE TABLE IF NOT EXISTS hookup_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Soft pointer to sniffies_contacts.id when the debrief is tied to
  -- a known contact. NULL when the meet was off-platform.
  contact_id UUID,
  -- Soft pointer to maxy_dare_assignments.id if this debrief closes
  -- a dare; NULL for free-form post-meet entries.
  dare_assignment_id UUID,
  met_at TIMESTAMPTZ NOT NULL,
  debriefed_at TIMESTAMPTZ,
  -- Window: meet + 4h. Edge fn fires a slip if no answers arrive.
  due_by TIMESTAMPTZ NOT NULL,
  -- Whether aftercare was offered + whether the user opened it.
  aftercare_invoked BOOLEAN NOT NULL DEFAULT FALSE,
  aftercare_opened_at TIMESTAMPTZ,
  -- The Mommy-voice prompts the debrief asked. Mirrors the spec
  -- block in the edge fn so audit-trail can match prompts to answers.
  prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The user's free-form answers keyed by prompt id
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The personalized voice note Mommy generated post-debrief
  body_memory_voice_url TEXT,
  body_memory_text TEXT,
  -- Whether this debrief was triggered by a slip-cascade (i.e. the
  -- 4h window elapsed without answers)
  triggered_by_slip BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'partial', 'complete', 'missed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hookup_debriefs_user_status
  ON hookup_debriefs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_hookup_debriefs_user_due
  ON hookup_debriefs(user_id, due_by) WHERE status IN ('pending', 'partial');
CREATE INDEX IF NOT EXISTS idx_hookup_debriefs_user_met
  ON hookup_debriefs(user_id, met_at DESC);

ALTER TABLE hookup_debriefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hookup_debriefs_owner ON hookup_debriefs;
CREATE POLICY hookup_debriefs_owner ON hookup_debriefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hookup_debriefs_service ON hookup_debriefs;
CREATE POLICY hookup_debriefs_service ON hookup_debriefs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 9. maxy_firsts ──────────────────────────────────────────────────────
-- Milestone log. Each first-X event lands here once; Mommy references
-- them in future content forever.
CREATE TABLE IF NOT EXISTS maxy_firsts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_slug TEXT NOT NULL CHECK (milestone_slug IN (
    'first_kiss_man',
    'first_called_girl_unprompted',
    'first_oral_given',
    'first_oral_received',
    'first_penetration',
    'first_bottomed',
    'first_overnight',
    'first_morning_after',
    'first_repeat_partner',
    'first_introduced_to_friend_as_her',
    'first_called_by_name_in_bed',
    'first_asked_real_name_and_lied',
    'first_swallow',
    'first_phone_number_given',
    'first_kissed_in_public_as_her',
    'first_addressed_as_she_unprompted'
  )),
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No identifying data — just a description like "the older guy from
  -- the bar". Generators enforce this on insert; manual entries flow
  -- through hookup-coaching UI which strips identifiers.
  partner_context TEXT,
  -- Mommy-voice celebration line (rendered when surface fires).
  mommy_celebration_text TEXT,
  -- Soft pointer to hookup_debriefs.id when the milestone was
  -- captured during a debrief flow.
  debrief_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each milestone is once-only per user.
  UNIQUE (user_id, milestone_slug)
);
CREATE INDEX IF NOT EXISTS idx_maxy_firsts_user_achieved
  ON maxy_firsts(user_id, achieved_at DESC);

ALTER TABLE maxy_firsts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maxy_firsts_owner ON maxy_firsts;
CREATE POLICY maxy_firsts_owner ON maxy_firsts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS maxy_firsts_service ON maxy_firsts;
CREATE POLICY maxy_firsts_service ON maxy_firsts
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 10. updated_at triggers ──────────────────────────────────────────────
-- Reuse the existing touch helper if available; declare a local one if
-- not. Idempotent across migrations.
CREATE OR REPLACE FUNCTION public.touch_hookup_coaching_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_hookup_coaching_settings ON hookup_coaching_settings;
CREATE TRIGGER trg_touch_hookup_coaching_settings
  BEFORE UPDATE ON hookup_coaching_settings
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();

DROP TRIGGER IF EXISTS trg_touch_maxy_dares ON maxy_dares;
CREATE TRIGGER trg_touch_maxy_dares
  BEFORE UPDATE ON maxy_dares
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();

DROP TRIGGER IF EXISTS trg_touch_maxy_dare_assignments ON maxy_dare_assignments;
CREATE TRIGGER trg_touch_maxy_dare_assignments
  BEFORE UPDATE ON maxy_dare_assignments
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();

DROP TRIGGER IF EXISTS trg_touch_hookup_anticipation_state ON hookup_anticipation_state;
CREATE TRIGGER trg_touch_hookup_anticipation_state
  BEFORE UPDATE ON hookup_anticipation_state
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();

DROP TRIGGER IF EXISTS trg_touch_receptive_skills_curriculum ON receptive_skills_curriculum;
CREATE TRIGGER trg_touch_receptive_skills_curriculum
  BEFORE UPDATE ON receptive_skills_curriculum
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();

DROP TRIGGER IF EXISTS trg_touch_hookup_debriefs ON hookup_debriefs;
CREATE TRIGGER trg_touch_hookup_debriefs
  BEFORE UPDATE ON hookup_debriefs
  FOR EACH ROW EXECUTE FUNCTION touch_hookup_coaching_updated_at();
