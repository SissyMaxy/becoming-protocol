-- 673 — bias ambient saturation clips toward the day's reconditioning Focus target.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §2.8 (Attentional-bias
-- modification & priming): "tag the existing seeded ambient clips... by
-- target theme; the orchestrator raises the play-weight of the day's
-- focus-target clips." This was the one named-but-unwired mechanism in the
-- mechanism table — every ALTER in mig 650 gave the other reused tables a
-- nullable recon_target_id, but ambient_saturation_clips (mig 569) was never
-- touched and ambient_saturation_fire_eval() still ORDER BY random()s over
-- the whole active pool with no target awareness at all.
--
-- ambient_saturation_clips has no free-text theme column, and its actual
-- seed rows were applied straight to the database rather than committed as
-- INSERT statements in mig 569 ("see SQL apply payload"), so this migration
-- can't safely UPDATE specific clip_keys without guessing content it can't
-- read. Reuse-first instead: clip_kind (mantra / imagery_caption /
-- arousal_anchor / identity_seal / craving_intensify) already IS a theme
-- axis, and reconditioning_targets.category (belief / identity / habit /
-- association) already names what a target IS. Map category -> preferred
-- clip_kind(s) and let that mapping do the tagging with zero new data.
--
-- This is a passive channel (§2.8: "no task, no deadline") — it changes
-- which existing clip gets queued, nothing about cadence, penalty, or the
-- gate. When recondition is off, or no target is active+running, there is
-- no focus category and clip selection is byte-for-byte the prior random
-- pick — this is provably a no-op for anyone not opted into recondition.
-- "Raises the play-weight" (not "restricts to"): themed clips get preferred
-- on a majority-but-not-exclusive roll so the pool never narrows to zero
-- variety, and any cooldown/tier miss on the themed subset falls through to
-- the original unfiltered pick.

CREATE OR REPLACE FUNCTION ambient_saturation_fire_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; v_clip RECORD; v_queued INT := 0; v_min_gap_hours NUMERIC;
  v_focus_category TEXT; v_preferred_kinds TEXT[]; v_have_clip BOOLEAN;
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
    SELECT rt.category INTO v_focus_category
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
    IF v_preferred_kinds IS NOT NULL AND random() < 0.65 THEN
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
      jsonb_build_object('clip_key', v_clip.clip_key, 'tier', v_clip.intensity_tier, 'kind', v_clip.clip_kind, 'focus_category', v_focus_category),
      CASE v_clip.clip_kind WHEN 'identity_seal' THEN 'voice' WHEN 'arousal_anchor' THEN 'voice' WHEN 'craving_intensify' THEN 'voice' ELSE NULL END);
    UPDATE ambient_saturation_settings SET last_fired_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION ambient_saturation_fire_eval() TO service_role;
