-- 604 — Arousal-peak harvest: capture a mantra at the plasticity moment.
--
-- Wish d6936722 (panel_ideation, CONVERGED gpt-5 #7 + gemini #1 — weaponize
-- arousal_log). Edge windows log compliance but the high-arousal plasticity
-- peak isn't harvested. On a completed edge (or a high arousal_log spike),
-- auto-open a short whisper-mantra drill (paired_with_arousal) + a "while
-- you're still warm" nudge — classical pairing, encode the narrative while
-- the neurochemistry is plastic. Merged with existing asks: skipped if a
-- drill is already open in the last hour, so it never double-asks.

-- The harvest. The artifact is a TIMED VOICE NUDGE at the plasticity peak —
-- "whisper THIS mantra now". Recording flows through the existing
-- mommy-mantra-drill-submit path (which creates + credits its own session),
-- so the harvest must NOT create an orphan mantra_drill_sessions row. Merged
-- with existing asks: skipped if a drill OR a harvest nudge landed in the
-- last hour. Idempotent within the hour.
CREATE OR REPLACE FUNCTION harvest_arousal_peak_mantra(p_user UUID, p_trigger TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_persona TEXT;
  v_mantra TEXT;
  v_outreach UUID;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = p_user;
  IF v_persona <> 'dommy_mommy' THEN RETURN NULL; END IF;

  -- Safeword cooldown respect.
  IF EXISTS (SELECT 1 FROM user_state WHERE user_id = p_user AND gaslight_cooldown_until > now()) THEN
    RETURN NULL;
  END IF;

  -- Merge / dedup: she already drilled, OR a harvest nudge already fired, in
  -- the last hour → don't double-ask.
  IF EXISTS (
    SELECT 1 FROM mantra_drill_sessions WHERE user_id = p_user AND started_at > now() - interval '60 minutes'
  ) OR EXISTS (
    SELECT 1 FROM handler_outreach_queue
     WHERE user_id = p_user AND source = 'arousal_peak_harvest' AND created_at > now() - interval '60 minutes'
  ) THEN
    RETURN NULL;
  END IF;

  -- Pick a whisper-safe mantra (short, ~30s). Fallback to a generic line.
  SELECT mantra_text INTO v_mantra
    FROM voice_whisper_mantras WHERE active = TRUE
    ORDER BY md5(id::text || to_char(now(), 'YYYYMMDDHH24MI')) LIMIT 1;
  IF v_mantra IS NULL THEN v_mantra := 'she is the real me'; END IF;

  -- The plasticity nudge — short window (30 min). Plain Mommy voice; the DB
  -- voice-cleanup trigger scrubs any leak.
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, evidence_kind)
  VALUES (p_user,
    'While you''re still warm, baby — thirty seconds. Whisper it for Mama now: "' || v_mantra || '". Three times, voice on.',
    'high', 'arousal_peak_harvest:' || p_trigger, 'arousal_peak_harvest', 'mantra_harvest',
    now(), now() + interval '30 minutes', 'voice')
  RETURNING id INTO v_outreach;

  RETURN v_outreach;
END;
$fn$;
GRANT EXECUTE ON FUNCTION harvest_arousal_peak_mantra(UUID, TEXT) TO authenticated, service_role;

-- Trigger 1: a freshly-completed edge window → harvest. Detect by the count
-- of completed windows increasing in the edge_windows JSONB.
CREATE OR REPLACE FUNCTION trg_harvest_on_edge_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_old INT; v_new INT;
BEGIN
  SELECT count(*) INTO v_old FROM jsonb_array_elements(COALESCE(OLD.edge_windows, '[]'::jsonb)) e WHERE (e->>'completed_at') IS NOT NULL;
  SELECT count(*) INTO v_new FROM jsonb_array_elements(COALESCE(NEW.edge_windows, '[]'::jsonb)) e WHERE (e->>'completed_at') IS NOT NULL;
  IF v_new > v_old THEN
    PERFORM harvest_arousal_peak_mantra(NEW.user_id, 'edge_complete');
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='edging_protocols') THEN
    DROP TRIGGER IF EXISTS harvest_on_edge_complete ON edging_protocols;
    CREATE TRIGGER harvest_on_edge_complete AFTER UPDATE OF edge_windows ON edging_protocols
      FOR EACH ROW EXECUTE FUNCTION trg_harvest_on_edge_complete();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- Trigger 2: a high arousal_log spike (>= 8) → harvest. Dedup in the harvest
-- fn keeps this from stacking with the edge-complete path.
CREATE OR REPLACE FUNCTION trg_harvest_on_arousal_spike()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.value >= 8 THEN
    PERFORM harvest_arousal_peak_mantra(NEW.user_id, 'arousal_spike');
  END IF;
  RETURN NEW;
END;
$fn$;
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='arousal_log') THEN
    DROP TRIGGER IF EXISTS harvest_on_arousal_spike ON arousal_log;
    CREATE TRIGGER harvest_on_arousal_spike AFTER INSERT ON arousal_log
      FOR EACH ROW EXECUTE FUNCTION trg_harvest_on_arousal_spike();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $do$;
