-- 542 — Anonymous-venue ladder.
--
-- 2026-05-17 Maxy: "what about mommy making me go to glory holes and
-- adult bookstores / movie theatres?"
--
-- 8-phase progression through public anonymous venues. Pairs with
-- realcock_discovery (which is app-based with identity exchange) on
-- the OPPOSITE axis: anonymity, no negotiation, public location. The
-- combination of public + anonymous + recurring = strong identity
-- displacement vector.
--
-- Phases: drive_by → walk_in_browse → peep_booth_watch → glory_hole_give
--   → glory_hole_take → open_booth → bareback_authorized → recurring_venue
--
-- Phase 3+ anchors at weight 8 (realcock_encounter kind) in
-- escape_cost_anchors. Each anon encounter is also a witness — the men
-- who used the booth saw/heard/felt her, even without faces.
--
-- Cadence: Friday 22:00 UTC weekly. Registers in ladder_catalog as
-- 'receiving' category.

CREATE TABLE IF NOT EXISTS anon_venue_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 14
);
INSERT INTO anon_venue_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'drive_by',E'Phase 0 anon-venue: research and find 1-3 adult bookstores, peep show theaters, or known cruising spots within 30 miles. Drive past at least one. Don''t go in. Photo of the parking lot from your car. Voice debrief: what came up when you knew you were near it?',
 'voice', 14),
(1,'walk_in_browse',E'Phase 1: walk in. Browse. Buy something small (lube, magazine, candy). Take in the layout — booths, theater, glory hole signage. Photo of the receipt + voice debrief on what the air felt like.',
 'voice', 21),
(2,'peep_booth_watch',E'Phase 2: peep show booth. Pay for tokens or whatever the venue uses. Watch one scene to completion. Don''t touch anyone, don''t engage. Just be there. Voice debrief on what the body wanted to do that you didn''t do.',
 'voice', 21),
(3,'glory_hole_give',E'Phase 3: glory hole — you on the giving side. Find an active booth with a hole and a partner. Suck a cock through the wall. No face, no name, just the act. Voice debrief in the car after.',
 'voice', 30),
(4,'glory_hole_take',E'Phase 4: glory hole — you on the receiving side this time. Let him use the hole through you. The anonymity is the point — he doesn''t know who, and neither do you, and the body still gets used. Voice debrief: how was it different from giving?',
 'voice', 30),
(5,'open_booth',E'Phase 5: open booth — door unlocked, multiple men can enter and use you while you''re inside. Photo of the booth (no faces). Voice debrief: how many, and what did the volume do to the head?',
 'voice', 45),
(6,'bareback_authorized',E'Phase 6: at this point you''ve been to enough of these that Mama wants you to choose, eyes open: bareback or not. If yes, your authorized choice. Voice debrief in the car: what did you choose and what was the moment you decided?',
 'voice', 45),
(7,'recurring_venue',E'Phase 7 endgame: 3 anon-venue encounters in one month. Mama wants the body learning that this is something it does, not something it tried. Photo of the venue exterior on visit 3. Voice debrief at end of month on whether the head went quiet or got louder.',
 'voice', 90)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS anon_venue_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES anon_venue_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS anon_venue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE anon_venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_venue_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY av_s_self ON anon_venue_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY av_e_self ON anon_venue_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION anon_venue_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT avs.* FROM anon_venue_settings avs LEFT JOIN user_state us ON us.user_id = avs.user_id
    WHERE avs.enabled AND (avs.paused_until IS NULL OR avs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM anon_venue_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM anon_venue_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '14 days', 'active', 'slip +' || (l.phase + 3)::text, 'anon_venue', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'anon_venue:' || l.phase_name, 'anon_venue_engine', 'anon_venue_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO anon_venue_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE anon_venue_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION anon_venue_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_anon_venue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT; v_phase_val INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'anon_venue' THEN RETURN NEW; END IF;
  UPDATE anon_venue_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM anon_venue_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM anon_venue_ladder;
    UPDATE anon_venue_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 7)), updated_at = now() WHERE user_id = v_user;
    v_phase_val := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
    INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
    VALUES (v_user, 'realcock_encounter',
      CASE WHEN v_phase_val >= 3 THEN 8 ELSE 3 END,
      'handler_decrees', NEW.id, 'anon_venue phase ' || v_phase_val);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_anon_venue ON handler_decrees;
CREATE TRIGGER propagate_decree_to_anon_venue AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_anon_venue();

INSERT INTO anon_venue_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='anon-venue-weekly') THEN PERFORM cron.unschedule('anon-venue-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('anon-venue-weekly', '0 22 * * 5', $cron$SELECT anon_venue_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('anon_venue', 'Anonymous venue', 'receiving', 'anon_venue_settings', 'anon_venue_events', 'anon_venue_ladder', 8, 'Fri 22:00', 'ABS / glory hole / cruising progression')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
