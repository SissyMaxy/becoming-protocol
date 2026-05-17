-- 540 — Hookup-attestation cascade. The "can't go back" lock for
-- realcock encounters.
--
-- 2026-05-17 Maxy: "what if mommy forced me to hookup with men so I
-- couldn't think I can go back to being a cis male?" This trigger
-- implements that directly: every fulfilled realcock_discovery phase
-- >=2 inserts a hookup_attestations row, a high-weight escape_cost
-- anchor (5/7/12/15 weight per phase), AND TWO outreaches:
--
--   1. Immediate (20min): names the cumulative count, surfaces the
--      "X men have now been with you, the number only goes up" framing.
--      Critical-urgency.
--   2. Delayed (6hr): Gina-disclosure pressure cascade — "Gina doesn't
--      know yet. Does she find out from you, or from a chance?" The
--      higher the realcock count climbs without Gina knowing, the
--      harder the eventual disclosure.
--
-- Anchored to real fulfilled decrees — no fabrication. Each encounter
-- is independently verified.

CREATE TABLE IF NOT EXISTS hookup_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  related_decree_id UUID,
  partner_anon_handle TEXT,
  what_happened TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attestation_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE hookup_attestations ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ha_self ON hookup_attestations FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_hookup_attestation_on_realcock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_phase INT; v_attestation TEXT; v_count INT; v_msg TEXT;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'realcock_discovery' THEN RETURN NEW; END IF;

  v_phase := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
  IF v_phase IS NULL OR v_phase < 2 THEN RETURN NEW; END IF;

  v_attestation := CASE v_phase
    WHEN 2 THEN 'A man saw it in person. There''s now a person in the world who has watched you in fem with his cock out for you.'
    WHEN 3 THEN 'A man''s cock has been in your hand. The body knows now what real warmth feels like there.'
    WHEN 4 THEN 'A man''s cock has been in your mouth. There''s now a person in the world who can say "she sucked me." That sentence exists about you now.'
    WHEN 5 THEN 'A man has finished with you — in your mouth, on your face, somewhere. There''s evidence of you in fem on his phone or in his memory or both. The before-and-after line is real and behind you.'
    ELSE 'Something happened with a man in person. The body has a new file.'
  END;

  INSERT INTO hookup_attestations (user_id, phase_at_event, related_decree_id, what_happened, attestation_text)
  VALUES (NEW.user_id, v_phase, NEW.id, 'realcock_discovery phase ' || v_phase || ' fulfilled', v_attestation);

  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'realcock_encounter',
    CASE v_phase WHEN 2 THEN 5 WHEN 3 THEN 7 WHEN 4 THEN 12 WHEN 5 THEN 15 ELSE 5 END,
    'hookup_attestations', NULL, v_attestation);

  SELECT count(*) INTO v_count FROM hookup_attestations WHERE user_id = NEW.user_id;

  v_msg := format(E'%s\n\n%s men have now been with you in fem. That number only goes up — Mama wants you to feel that the cis-male version of you couldn''t un-experience this if he tried. Voice debrief, 90 seconds: what part of you is most awake right now?',
    v_attestation, v_count);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'critical', 'hookup_attestation:phase_' || v_phase,
    'hookup_attestation', 'point_of_no_return', now() + interval '20 minutes', now() + interval '24 hours',
    jsonb_build_object('phase', v_phase, 'total_count', v_count, 'attestation', v_attestation), 'voice');

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id,
    format(E'Gina doesn''t know about phase %s yet. Mama wants you thinking about who she finds out from — you, or a chance. The more this number climbs (%s now) without her, the harder the eventual conversation. Voice debrief: when does she find out and from whom?',
      v_phase, v_count),
    'high', 'hookup_attestation:gina_pressure_phase_' || v_phase,
    'hookup_attestation', 'gina_disclosure_pressure', now() + interval '6 hours', now() + interval '48 hours',
    jsonb_build_object('phase', v_phase, 'realcock_total', v_count), 'voice');

  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS hookup_attestation_on_realcock ON handler_decrees;
CREATE TRIGGER hookup_attestation_on_realcock AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_hookup_attestation_on_realcock();
