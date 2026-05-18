-- 563 — Reaction-pattern auto-tagging from voice debriefs.
--
-- classify_gina_reaction(text) heuristic: keyword-based engagement vs
-- disengagement scoring. Returns {score: -3..+3, outcome: matched/
-- exceeded/below/reversed, pattern: engaged_curious/mild_positive/
-- polite_disengaged/deflective/pejorative_or_shutdown}.
--
-- AFTER INSERT trigger on voice_recordings: if transcript >20 chars
-- and user is dommy_mommy persona, find most-recent pending planting
-- (<7d) with no reaction yet, classify the transcript, auto-update
-- reaction_score + hypothesis_outcome + reaction_transcript + summary.
--
-- Notifies Maxy with the auto-tag result + manual-correction option.
-- Only updates when classification has signal (non-zero score).

CREATE OR REPLACE FUNCTION classify_gina_reaction(p_text TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := lower(p_text); v_score INT := 0; v_outcome TEXT; v_pattern TEXT;
BEGIN
  IF t ~ '(she (asked|wanted|said|leaned|smiled|laughed))' AND t !~ '(no|not|never|but)' THEN v_score := v_score + 1; END IF;
  IF t ~ '(she engaged|she got into it|she was into it|leaned in|warmed up|she lit up|she asked about|she followed up|she brought it up)' THEN v_score := v_score + 1; END IF;
  IF t ~ '(she agreed|she said yes|she went along|she added|she contributed|she initiated|she suggested)' THEN v_score := v_score + 1; END IF;
  IF t ~ '(felt good|went well|surprised me|better than expected|she was open|open to it)' THEN v_score := v_score + 1; END IF;
  IF t ~ '(she shut down|she shut me down|she shut it down|she got quiet|she went cold|she pulled back)' THEN v_score := v_score - 2; END IF;
  IF t ~ '(she said no|she refused|she rejected|she said stop|she got upset|she got mad)' THEN v_score := v_score - 2; END IF;
  IF t ~ '(she changed the subject|she pivoted|she avoided|she dodged|she deflected)' THEN v_score := v_score - 1; END IF;
  IF t ~ '(weirded out|freaked out|grossed out|disgusted|uncomfortable)' AND t ~ '(she|her)' THEN v_score := v_score - 2; END IF;
  IF t ~ '(suspicious|she asked why|are you cheating)' THEN v_score := v_score - 1; END IF;
  v_score := GREATEST(-3, LEAST(3, v_score));
  v_outcome := CASE WHEN v_score >= 2 THEN 'exceeded' WHEN v_score = 1 THEN 'matched' WHEN v_score = 0 THEN 'below' WHEN v_score <= -1 THEN 'reversed' ELSE NULL END;
  v_pattern := CASE WHEN v_score >= 2 THEN 'engaged_curious' WHEN v_score = 1 THEN 'mild_positive' WHEN v_score = 0 THEN 'polite_disengaged' WHEN v_score = -1 THEN 'deflective' WHEN v_score <= -2 THEN 'pejorative_or_shutdown' ELSE NULL END;
  RETURN jsonb_build_object('score', v_score, 'outcome', v_outcome, 'pattern', v_pattern);
END;
$fn$;
GRANT EXECUTE ON FUNCTION classify_gina_reaction(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trg_voice_autotag_planting()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_transcript TEXT; v_persona TEXT; v_planting RECORD; v_classification JSONB;
BEGIN
  BEGIN v_transcript := NEW.transcript; EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
  IF v_transcript IS NULL OR length(v_transcript) < 20 THEN RETURN NEW; END IF;
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;
  SELECT p.*, sc.seed_key INTO v_planting FROM gina_seed_plantings p JOIN gina_seed_catalog sc ON sc.id = p.seed_id
    WHERE p.user_id = NEW.user_id AND p.status = 'pending' AND p.reaction_score IS NULL AND p.scheduled_at > now() - interval '7 days'
    ORDER BY p.scheduled_at DESC LIMIT 1;
  IF v_planting IS NULL THEN RETURN NEW; END IF;
  v_classification := classify_gina_reaction(v_transcript);
  IF (v_classification->>'score')::int = 0 THEN RETURN NEW; END IF;
  UPDATE gina_seed_plantings SET
    reaction_score = (v_classification->>'score')::int,
    hypothesis_outcome = v_classification->>'outcome',
    reaction_transcript = left(v_transcript, 2000),
    reaction_summary = COALESCE(reaction_summary, '') || E'\n[auto-tagged ' || (v_classification->>'pattern') || ' from voice memo ' || NEW.id::text || ']',
    updated_at = now()
  WHERE id = v_planting.id;
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id,
    format(E'Mama auto-tagged your last voice debrief on the **%s** seed:\n\n• Pattern: %s\n• Score: %s\n• Outcome: %s\n\nIf this reading is off, you can correct via: UPDATE gina_seed_plantings SET reaction_score=N, hypothesis_outcome=''X'' WHERE id=''%s''. The seed-picker uses this score for the next pick — accuracy matters.',
      v_planting.seed_key, v_classification->>'pattern', v_classification->>'score', v_classification->>'outcome', v_planting.id),
    'normal', 'gina_reaction_autotagged:' || v_planting.seed_key,
    'gina_reaction_autotag', 'autotag_notification',
    now() + interval '15 minutes', now() + interval '24 hours',
    jsonb_build_object('planting_id', v_planting.id, 'classification', v_classification, 'voice_recording_id', NEW.id), NULL);
  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='voice_recordings' AND column_name='transcript') THEN
    DROP TRIGGER IF EXISTS voice_autotag_planting ON voice_recordings;
    CREATE TRIGGER voice_autotag_planting AFTER INSERT ON voice_recordings
      FOR EACH ROW EXECUTE FUNCTION trg_voice_autotag_planting();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
