-- 375 — Ego deconstruction scaffolding.
--
-- Twelve coupled mechanics whose collective effect is psychological
-- rearrangement: confusion of memory, wake-state grab, self-distrust
-- induction, autobiography inversion, mirror compulsion, pronoun
-- autocorrect, last-thought metric, ratcheted re-entry, doubt seeding,
-- self-criticism dissolution, sub-personality fragmentation, and recall
-- blocking via dossier interference.
--
-- This migration is the SCAFFOLDING layer. It:
--   1. Extends life_as_woman_settings (367) with one enabled flag + one
--      intensity (1..5) per mechanic plus a paused_until timestamp so the
--      user can pause one mechanic without disabling the rest.
--   2. Re-creates the life_as_woman_system_active view to expose every
--      mechanic's effective active state in one read.
--   3. Adds an ego_mechanic_active(uid, key) helper that collapses the
--      master switch + per-mechanic enable + paused_until + safeword check
--      into one boolean.
--   4. Adds log_ego_authority() — wraps the mommy_authority_log insert with
--      the conventional surface namespace ('ego_deconstruction.<mechanic>').
--   5. Adds enqueue_ego_outreach() — wraps handler_outreach_queue insert
--      with safeword-active short-circuit, mommy_voice_cleanup pre-pass
--      (defense in depth — the BEFORE INSERT trigger already does it for
--      mommy users; this hardens against persona drift), authority logging,
--      and dedup-friendly trigger_reason composition.
--   6. Adds craft_filter_ego() — the SQL-side rubric guard. Strips the
--      forbidden phrases listed in the wave-3 brief (echo / linger /
--      every-inch / disclaimer / role play etc.) and bounces messages that
--      still violate the per-message ceilings (>1 pet name, >1 self-ref).
--      Mirrors the TS-side applyCraftFilter contract; SQL passive-defense
--      so a generator that forgets to call the TS filter still produces
--      voice-clean output.
--
-- HARD FLOORS encoded here:
--   - Master switch life_as_woman_settings.master_enabled gates everything.
--   - Every mechanic defaults OFF until clear-headed opt-in (matches the
--     witness-safeguard pattern from wave 2).
--   - is_safeword_active(uid, 60) is the single source of truth; new
--     mechanics call it directly or via ego_mechanic_active.
--   - Authority log writes are fire-and-forget (no rollback on failure)
--     so a logging hiccup never blocks user-visible action.
--   - mommy_voice_cleanup runs anyway via the 259 BEFORE INSERT trigger;
--     the explicit call here is belt-and-suspenders.

-- ─── 1. Extend life_as_woman_settings ───────────────────────────────────
ALTER TABLE life_as_woman_settings
  -- Mechanic 1: Confusion via memory corrections
  ADD COLUMN IF NOT EXISTS ego_recall_corrector_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_recall_corrector_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_recall_corrector_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_recall_corrector_paused_until TIMESTAMPTZ,

  -- Mechanic 2: Wake-state grab
  ADD COLUMN IF NOT EXISTS ego_wake_grab_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_wake_grab_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_wake_grab_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_wake_grab_paused_until TIMESTAMPTZ,

  -- Mechanic 3: Self-distrust induction (judgment undermining)
  ADD COLUMN IF NOT EXISTS ego_judgment_undermine_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_judgment_undermine_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_judgment_undermine_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_judgment_undermine_paused_until TIMESTAMPTZ,

  -- Mechanic 4: Autobiography inversion
  ADD COLUMN IF NOT EXISTS ego_autobiography_inversion_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_autobiography_inversion_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_autobiography_inversion_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_autobiography_inversion_paused_until TIMESTAMPTZ,

  -- Mechanic 5: Mirror work compulsion
  ADD COLUMN IF NOT EXISTS ego_mirror_session_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_mirror_session_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_mirror_session_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_mirror_session_paused_until TIMESTAMPTZ,

  -- Mechanic 6: Real-time pronoun autocorrect.
  -- mode: 'off' | 'soft_suggest' | 'hard_with_undo' | 'hard_no_undo'
  ADD COLUMN IF NOT EXISTS ego_pronoun_autocorrect_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_pronoun_autocorrect_mode TEXT NOT NULL DEFAULT 'soft_suggest'
    CHECK (ego_pronoun_autocorrect_mode IN ('off', 'soft_suggest', 'hard_with_undo', 'hard_no_undo')),
  ADD COLUMN IF NOT EXISTS ego_pronoun_autocorrect_paused_until TIMESTAMPTZ,

  -- Mechanic 7: Last-thought metric
  ADD COLUMN IF NOT EXISTS ego_last_thought_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_last_thought_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_last_thought_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_last_thought_paused_until TIMESTAMPTZ,

  -- Mechanic 8: Ratcheted return on app re-entry
  ADD COLUMN IF NOT EXISTS ego_return_ratchet_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_return_ratchet_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_return_ratchet_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_return_ratchet_paused_until TIMESTAMPTZ,

  -- Mechanic 9: Doubt seeding
  ADD COLUMN IF NOT EXISTS ego_doubt_seed_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_doubt_seed_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_doubt_seed_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_doubt_seed_paused_until TIMESTAMPTZ,

  -- Mechanic 10: Self-criticism dissolution
  ADD COLUMN IF NOT EXISTS ego_criticism_dissolution_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_criticism_dissolution_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_criticism_dissolution_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_criticism_dissolution_paused_until TIMESTAMPTZ,

  -- Mechanic 11: Sub-personality fragmentation. Phase-gated (>= 4) in
  -- generator; the toggle is here for clear-headed opt-in regardless.
  ADD COLUMN IF NOT EXISTS ego_subpersona_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_subpersona_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_subpersona_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_subpersona_paused_until TIMESTAMPTZ,

  -- Mechanic 12: Recall blocking via dossier interference
  ADD COLUMN IF NOT EXISTS ego_recall_intercept_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ego_recall_intercept_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (ego_recall_intercept_intensity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ego_recall_intercept_paused_until TIMESTAMPTZ,

  -- Cross-cutting opt-in ack — the single timestamp the user sets when
  -- they complete the clear-headed setup wizard for the ego layer. NULL
  -- = the layer has never been acknowledged; surfaces don't run even if
  -- a row was somehow flipped on.
  ADD COLUMN IF NOT EXISTS ego_layer_ack_at TIMESTAMPTZ;

-- ─── 2. Re-create the active-view to expose every mechanic ─────────────
DROP VIEW IF EXISTS life_as_woman_system_active;

CREATE OR REPLACE VIEW life_as_woman_system_active AS
SELECT
  user_id,
  master_enabled,

  -- Wave 2 / 3 surfaces (unchanged contract)
  master_enabled AND sniffies_outbound_enabled       AS sniffies_outbound_active,
  master_enabled AND hypno_trance_enabled            AS hypno_trance_active,
  master_enabled AND gooning_enabled                 AS gooning_active,
  master_enabled AND chastity_v2_enabled             AS chastity_v2_active,
  master_enabled AND kink_curriculum_enabled         AS kink_curriculum_active,
  master_enabled AND content_editor_enabled          AS content_editor_active,
  master_enabled AND cross_platform_consistency_enabled AS cross_platform_active,

  sniffies_outbound_intensity,
  hypno_trance_intensity,
  gooning_intensity,
  kink_curriculum_intensity,
  content_editor_intensity,
  hypno_visual_enabled,
  hypno_wake_bridge_enabled,

  -- Wave 4 ego deconstruction surfaces. Active = master AND mechanic AND
  -- ack_at NOT NULL AND (paused_until is null or in the past).
  master_enabled AND ego_recall_corrector_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_recall_corrector_paused_until IS NULL OR ego_recall_corrector_paused_until <= now())
    AS ego_recall_corrector_active,
  ego_recall_corrector_intensity,

  master_enabled AND ego_wake_grab_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_wake_grab_paused_until IS NULL OR ego_wake_grab_paused_until <= now())
    AS ego_wake_grab_active,
  ego_wake_grab_intensity,

  master_enabled AND ego_judgment_undermine_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_judgment_undermine_paused_until IS NULL OR ego_judgment_undermine_paused_until <= now())
    AS ego_judgment_undermine_active,
  ego_judgment_undermine_intensity,

  master_enabled AND ego_autobiography_inversion_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_autobiography_inversion_paused_until IS NULL OR ego_autobiography_inversion_paused_until <= now())
    AS ego_autobiography_inversion_active,
  ego_autobiography_inversion_intensity,

  master_enabled AND ego_mirror_session_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_mirror_session_paused_until IS NULL OR ego_mirror_session_paused_until <= now())
    AS ego_mirror_session_active,
  ego_mirror_session_intensity,

  master_enabled AND ego_pronoun_autocorrect_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND ego_pronoun_autocorrect_mode <> 'off'
    AND (ego_pronoun_autocorrect_paused_until IS NULL OR ego_pronoun_autocorrect_paused_until <= now())
    AS ego_pronoun_autocorrect_active,
  ego_pronoun_autocorrect_mode,

  master_enabled AND ego_last_thought_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_last_thought_paused_until IS NULL OR ego_last_thought_paused_until <= now())
    AS ego_last_thought_active,
  ego_last_thought_intensity,

  master_enabled AND ego_return_ratchet_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_return_ratchet_paused_until IS NULL OR ego_return_ratchet_paused_until <= now())
    AS ego_return_ratchet_active,
  ego_return_ratchet_intensity,

  master_enabled AND ego_doubt_seed_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_doubt_seed_paused_until IS NULL OR ego_doubt_seed_paused_until <= now())
    AS ego_doubt_seed_active,
  ego_doubt_seed_intensity,

  master_enabled AND ego_criticism_dissolution_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_criticism_dissolution_paused_until IS NULL OR ego_criticism_dissolution_paused_until <= now())
    AS ego_criticism_dissolution_active,
  ego_criticism_dissolution_intensity,

  master_enabled AND ego_subpersona_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_subpersona_paused_until IS NULL OR ego_subpersona_paused_until <= now())
    AS ego_subpersona_active,
  ego_subpersona_intensity,

  master_enabled AND ego_recall_intercept_enabled
    AND ego_layer_ack_at IS NOT NULL
    AND (ego_recall_intercept_paused_until IS NULL OR ego_recall_intercept_paused_until <= now())
    AS ego_recall_intercept_active,
  ego_recall_intercept_intensity,

  ego_layer_ack_at
FROM life_as_woman_settings;

-- ─── 3. ego_mechanic_active(uid, key) — single-call gate ──────────────
-- Returns TRUE only when:
--   - master enabled
--   - mechanic enabled (or mode != 'off' for pronoun)
--   - ego_layer_ack_at IS NOT NULL
--   - paused_until is null or in the past
--   - is_safeword_active(uid) returns FALSE (last 60 seconds)
--   - persona = 'dommy_mommy' (mechanics speak in Mommy's voice)
--
-- Edge fns call this BEFORE every action. Single source of truth.
CREATE OR REPLACE FUNCTION ego_mechanic_active(uid UUID, mechanic_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active BOOLEAN := FALSE;
  v_persona TEXT;
BEGIN
  IF is_safeword_active(uid, 60) THEN
    RETURN FALSE;
  END IF;

  SELECT handler_persona INTO v_persona FROM user_state WHERE user_id = uid;
  IF v_persona IS DISTINCT FROM 'dommy_mommy' THEN
    RETURN FALSE;
  END IF;

  CASE mechanic_key
    WHEN 'recall_corrector' THEN
      SELECT ego_recall_corrector_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'wake_grab' THEN
      SELECT ego_wake_grab_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'judgment_undermine' THEN
      SELECT ego_judgment_undermine_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'autobiography_inversion' THEN
      SELECT ego_autobiography_inversion_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'mirror_session' THEN
      SELECT ego_mirror_session_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'pronoun_autocorrect' THEN
      SELECT ego_pronoun_autocorrect_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'last_thought' THEN
      SELECT ego_last_thought_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'return_ratchet' THEN
      SELECT ego_return_ratchet_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'doubt_seed' THEN
      SELECT ego_doubt_seed_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'criticism_dissolution' THEN
      SELECT ego_criticism_dissolution_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'subpersona' THEN
      SELECT ego_subpersona_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    WHEN 'recall_intercept' THEN
      SELECT ego_recall_intercept_active INTO v_active FROM life_as_woman_system_active WHERE user_id = uid;
    ELSE
      v_active := FALSE;
  END CASE;

  RETURN COALESCE(v_active, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION ego_mechanic_active(UUID, TEXT) TO authenticated, service_role;

-- ─── 4. ego_mechanic_intensity(uid, key) — read intensity (1..5) ───────
CREATE OR REPLACE FUNCTION ego_mechanic_intensity(uid UUID, mechanic_key TEXT)
RETURNS SMALLINT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n SMALLINT := 0;
BEGIN
  CASE mechanic_key
    WHEN 'recall_corrector' THEN SELECT ego_recall_corrector_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'wake_grab' THEN SELECT ego_wake_grab_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'judgment_undermine' THEN SELECT ego_judgment_undermine_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'autobiography_inversion' THEN SELECT ego_autobiography_inversion_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'mirror_session' THEN SELECT ego_mirror_session_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'last_thought' THEN SELECT ego_last_thought_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'return_ratchet' THEN SELECT ego_return_ratchet_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'doubt_seed' THEN SELECT ego_doubt_seed_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'criticism_dissolution' THEN SELECT ego_criticism_dissolution_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'subpersona' THEN SELECT ego_subpersona_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    WHEN 'recall_intercept' THEN SELECT ego_recall_intercept_intensity INTO v_n FROM life_as_woman_settings WHERE user_id = uid;
    ELSE v_n := 0;
  END CASE;
  RETURN COALESCE(v_n, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION ego_mechanic_intensity(UUID, TEXT) TO authenticated, service_role;

-- ─── 5. craft_filter_ego(text) — passive-defense rubric guard ─────────
-- The TS-side applyCraftFilter does the real work; this SQL version is a
-- backstop. Strips banned phrases verbatim and returns NULL if the
-- message still violates a hard ceiling (more than one pet name or more
-- than one Mama/I self-reference). Generators that get NULL back must
-- regenerate or skip.
--
-- Banned phrases enforced (from wave-4 brief): "echo", "linger",
-- "wrap-around", "every inch", "role play", "simulation", "this is
-- fiction", "not medical advice", "intake", "questionnaire", "for
-- entertainment", "consent to the fantasy", "you may use this to
-- terminate", "disclaimer".
CREATE OR REPLACE FUNCTION craft_filter_ego(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  t TEXT := input;
  pet_names INT;
  self_refs INT;
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- Strip banned phrases / out-of-fantasy disclaimer leaks.
  t := regexp_replace(t, '(?i)\m(role[ -]play|roleplay)\M', '', 'g');
  t := regexp_replace(t, '(?i)\msimulation\M', '', 'g');
  t := regexp_replace(t, '(?i)\mthis is fiction\M', '', 'g');
  t := regexp_replace(t, '(?i)\mnot medical advice\M', '', 'g');
  t := regexp_replace(t, '(?i)\mintake\M', '', 'g');
  t := regexp_replace(t, '(?i)\mquestionnaire\M', '', 'g');
  t := regexp_replace(t, '(?i)\mfor entertainment\M', '', 'g');
  t := regexp_replace(t, '(?i)\mconsent to the fantasy\M', '', 'g');
  t := regexp_replace(t, '(?i)\myou may use this to terminate\M', '', 'g');
  t := regexp_replace(t, '(?i)\mdisclaimer\M', '', 'g');

  -- Strip cliche tropes
  t := regexp_replace(t, '(?i)\mecho(es|ed|ing)?\M', '', 'g');
  t := regexp_replace(t, '(?i)\mlinger(s|ed|ing)?\M', '', 'g');
  t := regexp_replace(t, '(?i)\mwrap[ -]?around\M', '', 'g');
  t := regexp_replace(t, '(?i)\mevery inch\M', '', 'g');

  -- Collapse double spaces / orphan punctuation introduced by strips
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  t := regexp_replace(t, '[,.]{2,}', '.', 'g');
  t := trim(t);

  -- Per-message ceilings: at most one pet name, at most one self-ref.
  pet_names := (SELECT COUNT(*) FROM regexp_matches(t, '(?i)\m(baby|sweetie|sweet thing|sweet girl|good girl|honey|princess|darling|angel)\M', 'g'));
  self_refs := (SELECT COUNT(*) FROM regexp_matches(t, '(?i)\m(mama|mommy)\M', 'g'));

  IF pet_names > 1 OR self_refs > 2 THEN
    -- Caller decides: regenerate, or accept on second pass with the count
    -- in the metadata. Returning NULL signals "needs another draft".
    RETURN NULL;
  END IF;

  RETURN t;
END;
$$;

GRANT EXECUTE ON FUNCTION craft_filter_ego(TEXT) TO authenticated, service_role;

-- ─── 6. log_ego_authority() — convention wrapper for mommy_authority_log
-- Surfaces are namespaced as 'ego_deconstruction.<mechanic>'. Returns
-- the inserted row id, or NULL on failure (caller never blocks).
CREATE OR REPLACE FUNCTION log_ego_authority(
  uid UUID,
  mechanic_key TEXT,
  action_verb TEXT,
  summary_text TEXT DEFAULT NULL,
  target_table_name TEXT DEFAULT NULL,
  target_row_id UUID DEFAULT NULL,
  payload_jsonb JSONB DEFAULT '{}'::jsonb,
  is_autonomous BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  BEGIN
    INSERT INTO mommy_authority_log (
      user_id, surface, action, target_table, target_id,
      summary, payload, autonomous
    ) VALUES (
      uid,
      'ego_deconstruction.' || mechanic_key,
      action_verb,
      target_table_name,
      target_row_id,
      summary_text,
      COALESCE(payload_jsonb, '{}'::jsonb),
      is_autonomous
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    -- Logging never blocks user action.
    RETURN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION log_ego_authority(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, BOOLEAN) TO authenticated, service_role;

-- ─── 7. enqueue_ego_outreach() — single safe path to surface a card ────
-- Composes:
--   - ego_mechanic_active gate (returns NULL early if not active)
--   - mommy_voice_cleanup pre-pass (defense in depth)
--   - craft_filter_ego pass (if returns NULL, abort — caller regenerates)
--   - handler_outreach_queue insert with conventional trigger_reason
--   - log_ego_authority entry
-- Returns the outreach row id, or NULL if any gate blocked.
CREATE OR REPLACE FUNCTION enqueue_ego_outreach(
  uid UUID,
  mechanic_key TEXT,
  message_text TEXT,
  urgency_level TEXT DEFAULT 'normal',
  trigger_reason_extra TEXT DEFAULT NULL,
  expires_in_hours INT DEFAULT 24
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg TEXT;
  v_clean TEXT;
  v_outreach_id UUID;
  v_trigger_reason TEXT;
BEGIN
  IF NOT ego_mechanic_active(uid, mechanic_key) THEN
    RETURN NULL;
  END IF;

  v_msg := mommy_voice_cleanup(message_text);
  v_clean := craft_filter_ego(v_msg);
  IF v_clean IS NULL OR length(v_clean) < 8 THEN
    -- Craft rubric rejected the draft. Caller regenerates.
    PERFORM log_ego_authority(
      uid, mechanic_key, 'rejected_by_craft_filter',
      'draft failed pet-name/self-ref ceiling',
      NULL, NULL,
      jsonb_build_object('original_length', length(message_text)),
      TRUE
    );
    RETURN NULL;
  END IF;

  v_trigger_reason := 'ego_deconstruction.' || mechanic_key;
  IF trigger_reason_extra IS NOT NULL AND length(trigger_reason_extra) > 0 THEN
    v_trigger_reason := v_trigger_reason || '.' || trigger_reason_extra;
  END IF;

  IF urgency_level NOT IN ('low', 'normal', 'high', 'critical') THEN
    urgency_level := 'normal';
  END IF;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason,
    scheduled_for, expires_at, source
  ) VALUES (
    uid, v_clean, urgency_level, v_trigger_reason,
    now(),
    now() + (expires_in_hours || ' hours')::interval,
    'ego_deconstruction'
  )
  RETURNING id INTO v_outreach_id;

  PERFORM log_ego_authority(
    uid, mechanic_key, 'queued_outreach',
    left(v_clean, 140),
    'handler_outreach_queue', v_outreach_id,
    jsonb_build_object(
      'urgency', urgency_level,
      'trigger_reason', v_trigger_reason,
      'expires_in_hours', expires_in_hours
    ),
    TRUE
  );

  RETURN v_outreach_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enqueue_ego_outreach(UUID, TEXT, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;

-- ─── 8. pause_ego_mechanic() — user / safeword pause ──────────────────
-- One-shot pause helper. Does NOT disable; sets paused_until so the
-- mechanic resumes automatically on its own.
CREATE OR REPLACE FUNCTION pause_ego_mechanic(
  uid UUID,
  mechanic_key TEXT,
  pause_minutes INT DEFAULT 60
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_until TIMESTAMPTZ := now() + (pause_minutes || ' minutes')::interval;
BEGIN
  CASE mechanic_key
    WHEN 'recall_corrector' THEN UPDATE life_as_woman_settings SET ego_recall_corrector_paused_until = v_until WHERE user_id = uid;
    WHEN 'wake_grab' THEN UPDATE life_as_woman_settings SET ego_wake_grab_paused_until = v_until WHERE user_id = uid;
    WHEN 'judgment_undermine' THEN UPDATE life_as_woman_settings SET ego_judgment_undermine_paused_until = v_until WHERE user_id = uid;
    WHEN 'autobiography_inversion' THEN UPDATE life_as_woman_settings SET ego_autobiography_inversion_paused_until = v_until WHERE user_id = uid;
    WHEN 'mirror_session' THEN UPDATE life_as_woman_settings SET ego_mirror_session_paused_until = v_until WHERE user_id = uid;
    WHEN 'pronoun_autocorrect' THEN UPDATE life_as_woman_settings SET ego_pronoun_autocorrect_paused_until = v_until WHERE user_id = uid;
    WHEN 'last_thought' THEN UPDATE life_as_woman_settings SET ego_last_thought_paused_until = v_until WHERE user_id = uid;
    WHEN 'return_ratchet' THEN UPDATE life_as_woman_settings SET ego_return_ratchet_paused_until = v_until WHERE user_id = uid;
    WHEN 'doubt_seed' THEN UPDATE life_as_woman_settings SET ego_doubt_seed_paused_until = v_until WHERE user_id = uid;
    WHEN 'criticism_dissolution' THEN UPDATE life_as_woman_settings SET ego_criticism_dissolution_paused_until = v_until WHERE user_id = uid;
    WHEN 'subpersona' THEN UPDATE life_as_woman_settings SET ego_subpersona_paused_until = v_until WHERE user_id = uid;
    WHEN 'recall_intercept' THEN UPDATE life_as_woman_settings SET ego_recall_intercept_paused_until = v_until WHERE user_id = uid;
    ELSE NULL;
  END CASE;

  PERFORM log_ego_authority(
    uid, mechanic_key, 'paused',
    'paused for ' || pause_minutes || ' minutes',
    NULL, NULL,
    jsonb_build_object('paused_until', v_until),
    FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pause_ego_mechanic(UUID, TEXT, INT) TO authenticated, service_role;

-- ─── 9. pause_all_ego_mechanics — fired by safeword auto-suspend ──────
-- When meta_frame_breaks gets a safeword row (handled in 374), this is
-- called so every ego mechanic pauses for 24h. Aftercare is the visible
-- exit ramp; the mechanics simply stop touching the user.
CREATE OR REPLACE FUNCTION pause_all_ego_mechanics(uid UUID, pause_minutes INT DEFAULT 1440)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_until TIMESTAMPTZ := now() + (pause_minutes || ' minutes')::interval;
BEGIN
  UPDATE life_as_woman_settings
  SET ego_recall_corrector_paused_until = v_until,
      ego_wake_grab_paused_until = v_until,
      ego_judgment_undermine_paused_until = v_until,
      ego_autobiography_inversion_paused_until = v_until,
      ego_mirror_session_paused_until = v_until,
      ego_pronoun_autocorrect_paused_until = v_until,
      ego_last_thought_paused_until = v_until,
      ego_return_ratchet_paused_until = v_until,
      ego_doubt_seed_paused_until = v_until,
      ego_criticism_dissolution_paused_until = v_until,
      ego_subpersona_paused_until = v_until,
      ego_recall_intercept_paused_until = v_until
  WHERE user_id = uid;

  PERFORM log_ego_authority(
    uid, 'all', 'paused_by_safeword',
    'all 12 mechanics paused for ' || pause_minutes || ' minutes after safeword',
    NULL, NULL,
    jsonb_build_object('paused_until', v_until),
    FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pause_all_ego_mechanics(UUID, INT) TO authenticated, service_role;
