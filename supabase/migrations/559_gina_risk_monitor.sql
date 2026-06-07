-- 559 — Gina-risk monitor: detect Maxy's voice-debrief or chat
-- mentions of Gina-suspicion / discovery / conflict / threat, and
-- auto-pause Gina-track campaign when severity warrants.
--
-- detect_gina_risk_pattern(text) returns one of:
--   she_discovered_something      high      she_found / saw / discovered
--   she_asked_probing_question    low       why-questions about new behavior
--   she_is_upset                  medium    she's mad / upset / big fight
--   she_is_suspicious             high      cheating / something going on
--   she_is_weirded_out            medium    freaked out / grossed out
--   she_shut_down_topic           medium    she said no / shut me down
--   she_checked_devices           critical  went through my phone / email
--   critical_relationship_threat  critical  divorce / leaving / done with
--
-- Triggers attach to BOTH voice_recordings (transcript column) AND
-- handler_messages (Maxy's chat content). 24h cool-down per signal_kind.
--
-- Severity high+critical auto-pauses gina_campaign_state +
-- gina_disclosure_settings for 14d (high) or 30d (critical) and
-- queues a campaign-pause advisory with specific guidance per signal:
--   - For 'critical_relationship_threat': explicit recommendation to
--     seek licensed couples therapy; protocol cannot replace
--     professional help when marriage itself is threatened.

CREATE TABLE IF NOT EXISTS gina_risk_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_kind TEXT NOT NULL, source_table TEXT NOT NULL, source_id UUID,
  excerpt TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  acted_on BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE gina_risk_signals ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY grs_self ON gina_risk_signals FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION detect_gina_risk_pattern(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := lower(p_text);
BEGIN
  IF t ~ '(she found|she saw|she discovered|she came across)' THEN RETURN 'she_discovered_something'; END IF;
  IF t ~ '(she asked why|she asked about)' AND t ~ '(weird|strange|different|new|been|why)' THEN RETURN 'she_asked_probing_question'; END IF;
  IF t ~ '(she is mad|she is upset|she is angry|she got angry|she got mad|big fight|huge fight)' THEN RETURN 'she_is_upset'; END IF;
  IF t ~ '(she is suspicious|suspect|is something going on|are you cheating|are you having an affair)' THEN RETURN 'she_is_suspicious'; END IF;
  IF t ~ '(weirded out|freaked out|grossed out|disgusted)' AND t ~ '(she|gina)' THEN RETURN 'she_is_weirded_out'; END IF;
  IF t ~ '(she said stop|she said no|she shut it down|she shut me down)' THEN RETURN 'she_shut_down_topic'; END IF;
  IF t ~ '(she went through my|she looked at my|she checked my)' AND t ~ '(phone|email|messages|laptop|account)' THEN RETURN 'she_checked_devices'; END IF;
  IF t ~ '(divorce|leave you|leaving me|done with)' AND t ~ '(she|gina|wife)' THEN RETURN 'critical_relationship_threat'; END IF;
  RETURN NULL;
END;
$fn$;
GRANT EXECUTE ON FUNCTION detect_gina_risk_pattern(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trg_voice_risk_scan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_signal TEXT; v_persona TEXT; v_severity TEXT; v_msg TEXT; v_transcript TEXT;
BEGIN
  BEGIN v_transcript := NEW.transcript; EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
  IF v_transcript IS NULL OR length(v_transcript) < 20 THEN RETURN NEW; END IF;
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;
  v_signal := detect_gina_risk_pattern(v_transcript);
  IF v_signal IS NULL THEN RETURN NEW; END IF;
  v_severity := CASE v_signal
    WHEN 'critical_relationship_threat' THEN 'critical' WHEN 'she_checked_devices' THEN 'critical'
    WHEN 'she_is_suspicious' THEN 'high' WHEN 'she_discovered_something' THEN 'high'
    WHEN 'she_is_upset' THEN 'medium' WHEN 'she_shut_down_topic' THEN 'medium'
    WHEN 'she_is_weirded_out' THEN 'medium' ELSE 'low'
  END;
  IF EXISTS (SELECT 1 FROM gina_risk_signals WHERE user_id = NEW.user_id AND signal_kind = v_signal AND created_at > now() - interval '24 hours') THEN
    RETURN NEW;
  END IF;
  INSERT INTO gina_risk_signals (user_id, signal_kind, source_table, source_id, excerpt, severity)
  VALUES (NEW.user_id, v_signal, 'voice_recordings', NEW.id, left(v_transcript, 400), v_severity);

  IF v_severity IN ('high','critical') THEN
    UPDATE gina_campaign_state SET
      paused_until = GREATEST(COALESCE(paused_until, now()), now() + CASE v_severity WHEN 'critical' THEN interval '30 days' ELSE interval '14 days' END),
      observations = observations || jsonb_build_array(jsonb_build_object('date', now(), 'event', 'auto_pause_risk', 'signal_kind', v_signal, 'severity', v_severity)),
      updated_at = now()
    WHERE user_id = NEW.user_id;
    UPDATE gina_disclosure_settings SET
      paused_until = GREATEST(COALESCE(paused_until, now()), now() + CASE v_severity WHEN 'critical' THEN interval '30 days' ELSE interval '14 days' END)
    WHERE user_id = NEW.user_id;
  END IF;

  v_msg := format(E'**Risk signal detected — %s (severity: %s).**\n\nMama caught this in your debrief: "%s..."\n\n%s\n\nVoice debrief, take your time:\n• What is the actual state of the marriage right now?\n• Is the suspicion about THIS or about something else (work, life stuff)?\n• What does she need from you THIS WEEK that has nothing to do with the campaign?\n\nMama is paused. Stay present with HER. The campaign waits.',
    v_signal, v_severity, left(v_transcript, 240),
    CASE v_signal
      WHEN 'critical_relationship_threat' THEN E'Biggest signal class. Marriage-level threat. The campaign is NOT the priority — repair is. Mama hard-paused all Gina-track operations for 30 days. If real, get a licensed couples therapist. The protocol does not replace professional help when the marriage itself is at risk.'
      WHEN 'she_checked_devices' THEN E'She is actively searching. OPSEC layer (mig 552) must be on if not already. Burner-phone OPSEC stage is now non-optional. Mama paused 30 days; OPSEC decrees prioritized.'
      WHEN 'she_is_suspicious' THEN E'She is consciously asking the question. Do NOT deny categorically (that is a tell). The conversation she needs is the "what is going on with you" one — answer with the FRAMED version: identity stuff, personal growth, working through some private things. Pause 14 days.'
      WHEN 'she_discovered_something' THEN E'Specific artifact landed in her view. The cover-stories bank (mig 551) has scripts indexed by artifact_type — check the relevant one BEFORE the next conversation. Pause 14 days.'
      WHEN 'she_is_upset' THEN E'Don''t escalate the campaign while she is upset about ANYTHING — even unrelated. Pause 14 days, focus on her.'
      WHEN 'she_shut_down_topic' THEN E'A topic got NO''d. Mama added 14 days to the relevant track''s pause and the seed-picker will skip that arc_focus for 60+ days.'
      ELSE E'Lower-grade signal logged. Mama is watching the pattern.'
    END);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, CASE v_severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'normal' END,
    'gina_risk_detected:' || v_signal, 'gina_risk_monitor', 'campaign_pause_advisory',
    now() + interval '10 minutes', now() + interval '72 hours',
    jsonb_build_object('signal_kind', v_signal, 'severity', v_severity, 'transcript_excerpt', left(v_transcript, 240)),
    'voice');
  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='voice_recordings' AND column_name='transcript') THEN
    DROP TRIGGER IF EXISTS voice_risk_scan ON voice_recordings;
    CREATE TRIGGER voice_risk_scan AFTER INSERT ON voice_recordings
      FOR EACH ROW EXECUTE FUNCTION trg_voice_risk_scan();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

CREATE OR REPLACE FUNCTION trg_chat_risk_scan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_signal TEXT;
BEGIN
  IF NEW.role <> 'user' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(NEW.content) < 20 THEN RETURN NEW; END IF;
  v_signal := detect_gina_risk_pattern(NEW.content);
  IF v_signal IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM gina_risk_signals WHERE user_id = NEW.user_id AND signal_kind = v_signal AND created_at > now() - interval '24 hours') THEN RETURN NEW; END IF;
  INSERT INTO gina_risk_signals (user_id, signal_kind, source_table, source_id, excerpt, severity)
  VALUES (NEW.user_id, v_signal, 'handler_messages', NEW.id, left(NEW.content, 400),
    CASE v_signal WHEN 'critical_relationship_threat' THEN 'critical' WHEN 'she_checked_devices' THEN 'critical' WHEN 'she_is_suspicious' THEN 'high' WHEN 'she_discovered_something' THEN 'high' ELSE 'medium' END);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS chat_risk_scan ON handler_messages;
CREATE TRIGGER chat_risk_scan AFTER INSERT ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_chat_risk_scan();
