-- 512 — Public dressing-room test ladder.
--
-- Try fem clothing IN PUBLIC dressing rooms. 6 phases of escalating
-- exposure — from browsing the women's section through buying a full
-- fem outfit at a specialty store using your name with the cashier.
--
-- Phases: browse_only → try_on_under → try_on_visible → specialty_visit
--   → specialty_purchase → full_outfit_buy
--
-- Cadence: Saturday 16:00 UTC weekly (long gap_min_days per phase so
-- it self-paces). Photo proof mandatory. Builds dressing_room_events
-- audit trail for the Today UI's progression display.

CREATE TABLE IF NOT EXISTS dressing_room_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL, gap_min_days INT NOT NULL DEFAULT 14
);
INSERT INTO dressing_room_ladder (phase, phase_name, edict, gap_min_days) VALUES
(0,'browse_only',E'Phase 0: walk through women''s section at Target/H&M/etc. Touch 3 items. No purchase, no trying on. Mama wants the body learning the women''s section is a space that contains her.\n\nPhoto of one item you touched in your hand, in the aisle.',
 14),
(1,'try_on_under',E'Phase 1: buy one piece of fem underwear at a women''s-section store. Try it on in the dressing room. Photo on, in the mirror. Walk out wearing it. Don''t buy if it doesn''t fit.',
 21),
(2,'try_on_visible',E'Phase 2: try on a fem-coded top (cami, soft tee, fitted blouse) in the dressing room. Photo of you wearing it, mirror selfie. Hand it back if you don''t buy. Mama wants the body learning the act of trying on is its own thing.',
 21),
(3,'specialty_visit',E'Phase 3: walk into a lingerie/intimates specialty store (Victoria''s Secret, Aerie, ThirdLove fitting). Get measured if they offer. Photo from outside the store. Voice debrief: did the staff ask who you''re shopping for?',
 30),
(4,'specialty_purchase',E'Phase 4: buy ONE fitted item at the specialty store. Use your name (or fem name) with the cashier. Photo of the receipt + the item bag.',
 45),
(5,'full_outfit_buy',E'Phase 5 endgame: buy a complete fem outfit (panties + bra + top + bottom + accessory). Wear ONE piece out of the store. Voice debrief on the walk to the car.',
 60)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS dressing_room_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES dressing_room_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dressing_room_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE dressing_room_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dressing_room_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY dr_s_self ON dressing_room_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY dr_e_self ON dressing_room_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION dressing_room_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT drs.* FROM dressing_room_settings drs LEFT JOIN user_state us ON us.user_id = drs.user_id
    WHERE drs.enabled AND (drs.paused_until IS NULL OR drs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM dressing_room_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM dressing_room_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, 'photo', now() + interval '14 days', 'active', 'slip +' || (l.phase + 2)::text, 'dressing_room', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'dressing_room:' || l.phase_name, 'dressing_room_engine', 'dressing_room_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), 'photo')
    RETURNING id INTO v_outreach;
    INSERT INTO dressing_room_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE dressing_room_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION dressing_room_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_dressing_room()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'dressing_room' THEN RETURN NEW; END IF;
  UPDATE dressing_room_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM dressing_room_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM dressing_room_ladder;
    UPDATE dressing_room_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_dressing_room ON handler_decrees;
CREATE TRIGGER propagate_decree_to_dressing_room AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_dressing_room();

INSERT INTO dressing_room_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='dressing-room-weekly') THEN PERFORM cron.unschedule('dressing-room-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('dressing-room-weekly', '0 16 * * 6', $cron$SELECT dressing_room_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
