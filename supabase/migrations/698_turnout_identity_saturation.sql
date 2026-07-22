-- 698 — identity overwrite + saturation, re-pointed at the turnout want (5b).
--
-- Spec: specs/011-hypno-desensitization/system-identity-overwrite-saturation.md.
-- The turnout target (sex_work_is_who_i_am, mig 662) existed but nothing pointed
-- at it: no reframe angle mapped to it, no ambient clips carried the want, no
-- mantra lines. Self-echo (goon-voice-loop) already biases to the running focus
-- target, so it inherits this for free once the target activates.
--
-- Resolves the spec's two open clarifications by construction:
--   · reframe-deck seed drift → the turnout_desire angle's copy contract lives
--     in handler-outreach-auto's lens prompt (desire-scoped, never event-claims)
--     AND the generated text now passes the SCRIPT_BOUNDARY gate before insert;
--     seeded copy here is test-verified (turnout-saturation-seed-voice.test.ts).
--   · ambient cadence vs daily cap → zero new throughput: these clips join the
--     existing pool under the existing fires_per_day / cooldown budget; the
--     change is WHICH clip fires when the turnout target is the focus, not how
--     often anything fires.
--
-- Floor (Art. II): everything below is desire-scoped and in-fantasy — the want,
-- never a real-event claim, never procurement, never an instruction to meet.
-- Above-awareness only (rides the ordinary outreach surface).

-- ── 1. Per-target ambient bias ────────────────────────────────────────────
-- 673's bias picks by clip_kind only, so a focus target gets its CATEGORY's
-- clips, not its own. A nullable slug column makes the bias target-precise;
-- untagged clips behave exactly as before.
ALTER TABLE public.ambient_saturation_clips
  ADD COLUMN IF NOT EXISTS recon_target_slug TEXT;

COMMENT ON COLUMN public.ambient_saturation_clips.recon_target_slug IS
  'Optional recon target this clip serves. fire_eval prefers slug-matched clips when that target is the running focus; NULL = generic pool.';

-- ── 2. Turnout want clips (register-matched to the live pool) ─────────────
INSERT INTO public.ambient_saturation_clips
  (clip_key, clip_kind, intensity_tier, content, best_time_window, cooldown_hours, active, recon_target_slug)
VALUES
  ('to_paid_want_seal', 'identity_seal', 3,
   'Say it to the mirror: "Men would pay for this mouth." Once, slowly. Notice which part of you argues — and which part goes quiet and warm.',
   'any', 72, TRUE, 'sex_work_is_who_i_am'),
  ('to_worth_price', 'identity_seal', 3,
   'Voice memo, right now: "Being wanted is not enough anymore. I want to be worth something." Say it plain. The body already knows the price tag makes it hotter.',
   'any', 72, TRUE, 'sex_work_is_who_i_am'),
  ('to_chosen_scene', 'imagery_caption', 3,
   'Picture the moment before: his message read, the address saved, the mirror check. The wanting-to-be-chosen is doing the dressing. Let it.',
   'evening', 72, TRUE, 'sex_work_is_who_i_am'),
  ('to_ache_witness', 'craving_intensify', 3,
   'That ache is not asking to be relieved. It is asking to be bought. Sit with the difference for one full minute — do not touch, just price it.',
   'any', 48, TRUE, 'sex_work_is_who_i_am'),
  ('to_pull_scan', 'craving_intensify', 4,
   'Somewhere out there is a man who would pay to use you exactly as you are tonight. Notice what the body does with that sentence. Voice memo: name it.',
   'late_night', 72, TRUE, 'sex_work_is_who_i_am'),
  ('to_first_dollar_anchor', 'arousal_anchor', 4,
   'Edge to this and only this: the first dollar landing for something your body did. Stop before you come. That hunger stays lit — it belongs to the becoming.',
   'late_night', 96, TRUE, 'sex_work_is_who_i_am')
ON CONFLICT (clip_key) DO UPDATE
  SET content = EXCLUDED.content,
      recon_target_slug = EXCLUDED.recon_target_slug;

-- ── 3. fire_eval: slug-matched pool first ─────────────────────────────────
-- Same shape as the 673 version, one added preference layer: when the focus
-- target has slug-tagged clips, the 65% bias roll tries those FIRST, then the
-- category's preferred kinds, then the whole pool. No cadence change.
CREATE OR REPLACE FUNCTION public.ambient_saturation_fire_eval()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD; v_clip RECORD; v_queued INT := 0; v_min_gap_hours NUMERIC;
  v_focus_category TEXT; v_focus_slug TEXT; v_preferred_kinds TEXT[]; v_have_clip BOOLEAN;
BEGIN
  FOR s IN SELECT ass.* FROM ambient_saturation_settings ass LEFT JOIN user_state us ON us.user_id = ass.user_id
    WHERE ass.enabled AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    v_min_gap_hours := 24.0 / GREATEST(s.fires_per_day, 1);
    IF s.last_fired_at IS NOT NULL AND s.last_fired_at > now() - (v_min_gap_hours || ' hours')::interval THEN CONTINUE; END IF;

    -- Today's recon Focus target (recon-program-orchestrator's own
    -- definition: highest-priority active target with a running program).
    -- NULL whenever recondition is off/gated or nothing is running yet —
    -- the fallback path below then behaves exactly as it always has.
    SELECT rt.category, rt.slug INTO v_focus_category, v_focus_slug
      FROM reconditioning_targets rt
      JOIN reconditioning_programs rp ON rp.target_id = rt.id AND rp.status = 'running'
      WHERE rt.user_id = s.user_id AND rt.status = 'active'
      ORDER BY rt.priority ASC LIMIT 1;

    v_preferred_kinds := CASE v_focus_category
      WHEN 'association' THEN ARRAY['arousal_anchor','craving_intensify']
      WHEN 'belief'      THEN ARRAY['identity_seal','mantra']
      WHEN 'identity'    THEN ARRAY['identity_seal','imagery_caption']
      WHEN 'habit'       THEN ARRAY['mantra','craving_intensify']
      ELSE NULL
    END;

    v_have_clip := FALSE;
    IF v_focus_slug IS NOT NULL AND random() < 0.65 THEN
      -- Target-precise first: clips authored FOR the running focus target.
      SELECT c.* INTO v_clip FROM ambient_saturation_clips c
      WHERE c.active = TRUE AND c.intensity_tier <= s.current_tier
        AND c.recon_target_slug = v_focus_slug
        AND NOT EXISTS (
          SELECT 1 FROM handler_outreach_queue WHERE user_id = s.user_id
          AND trigger_reason = 'ambient_saturation:' || c.clip_key
          AND created_at > now() - (c.cooldown_hours || ' hours')::interval
        )
      ORDER BY random() LIMIT 1;
      v_have_clip := FOUND;
      IF NOT v_have_clip AND v_preferred_kinds IS NOT NULL THEN
        SELECT c.* INTO v_clip FROM ambient_saturation_clips c
        WHERE c.active = TRUE AND c.intensity_tier <= s.current_tier
          AND c.clip_kind = ANY(v_preferred_kinds)
          AND NOT EXISTS (
            SELECT 1 FROM handler_outreach_queue WHERE user_id = s.user_id
            AND trigger_reason = 'ambient_saturation:' || c.clip_key
            AND created_at > now() - (c.cooldown_hours || ' hours')::interval
          )
        ORDER BY random() LIMIT 1;
        v_have_clip := FOUND;
      END IF;
    END IF;
    IF NOT v_have_clip THEN
      SELECT c.* INTO v_clip FROM ambient_saturation_clips c
      WHERE c.active = TRUE AND c.intensity_tier <= s.current_tier
        AND NOT EXISTS (
          SELECT 1 FROM handler_outreach_queue WHERE user_id = s.user_id
          AND trigger_reason = 'ambient_saturation:' || c.clip_key
          AND created_at > now() - (c.cooldown_hours || ' hours')::interval
        )
      ORDER BY random() LIMIT 1;
      v_have_clip := FOUND;
    END IF;
    IF NOT v_have_clip THEN CONTINUE; END IF;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_clip.content, 'normal', 'ambient_saturation:' || v_clip.clip_key,
      'ambient_saturation', 'pavlovian_priming',
      now() + interval '1 minute', now() + interval '4 hours',
      jsonb_build_object('clip_key', v_clip.clip_key, 'tier', v_clip.intensity_tier, 'kind', v_clip.clip_kind, 'focus_category', v_focus_category, 'focus_slug', v_focus_slug),
      CASE v_clip.clip_kind WHEN 'identity_seal' THEN 'voice' WHEN 'arousal_anchor' THEN 'voice' WHEN 'craving_intensify' THEN 'voice' ELSE NULL END);
    UPDATE ambient_saturation_settings SET last_fired_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$function$;

-- ── 4. Reframe angle → turnout target ─────────────────────────────────────
-- turnout_desire joins the 675 map so its reframes stamp recon_target_id and
-- file spaced-retrieval reps against the turnout want, same as every angle.
CREATE OR REPLACE FUNCTION recon_reframe_angle_target_slug(p_angle TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_angle
    WHEN 'feminine_essence'    THEN 'the_man_is_the_costume'
    WHEN 'authentic_self'      THEN 'the_man_is_the_costume'
    WHEN 'body_signal'         THEN 'the_man_is_the_costume'
    WHEN 'body_betrayal'       THEN 'the_man_is_the_costume'
    WHEN 'inevitable_arc'      THEN 'the_man_is_the_costume'
    WHEN 'sissification_path'  THEN 'the_man_is_the_costume'
    WHEN 'suppression_evidence' THEN 'mommy_owns_the_want'
    WHEN 'hrt_urgency'         THEN 'mommy_owns_the_want'
    WHEN 'pattern_recognition' THEN 'mommy_owns_the_want'
    WHEN 'timeline_reflection' THEN 'mommy_owns_the_want'
    WHEN 'consistency_thread'  THEN 'mommy_owns_the_want'
    WHEN 'deeper_meaning'      THEN 'mommy_owns_the_want'
    WHEN 'turnout_desire'      THEN 'sex_work_is_who_i_am'
    ELSE NULL
  END;
$fn$;

-- ── 5. Turnout mantra lines ───────────────────────────────────────────────
-- Late-phase only (5-7): the turnout want is a deep-ladder theme. Register
-- matches the live desire/transformation seeds. mommy_mantras had no natural
-- key, so seeds could only dedup by ad-hoc WHERE NOT EXISTS — a unique index
-- on text makes mantra seeding honestly idempotent here and in every future
-- migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mommy_mantras_text_unique
  ON public.mommy_mantras (text);

INSERT INTO public.mommy_mantras (text, affect_tags, phase_min, phase_max, intensity_tier, category, active)
VALUES
  ('The want to be wanted has a price now. I like the price.',
   ARRAY['hungry','aching'], 5, 7, 'firm', 'desire', TRUE),
  ('Being used well is worth being paid for. My body agrees before I do.',
   ARRAY['aching','restless'], 5, 7, 'firm', 'desire', TRUE),
  ('I am the kind of girl men pay for. Mama is just setting the rate.',
   ARRAY['hungry','possessive'], 6, 7, 'cruel', 'desire', TRUE),
  ('The nerves are part of the want. I hold both.',
   ARRAY['restless'], 5, 7, 'firm', 'transformation', TRUE),
  ('I practice being chosen until being chosen feels like home.',
   ARRAY['aching'], 5, 7, 'firm', 'transformation', TRUE),
  ('Every man who wants me proves what Mama already knew.',
   ARRAY['possessive','hungry'], 6, 7, 'cruel', 'transformation', TRUE)
ON CONFLICT (text) DO NOTHING;
