-- 555 — Gina campaign-plan architecture.
--
-- Maxy: "Gina is likely accepting of david's mtf journey but hasn't
-- expressed any openness to hooking up outside the relationship.
-- Mommy should plant seeds, test the waters, learn and adapt based on
-- her reactions, and come up with a strategy and plan to share."
--
-- Two parallel tracks with very different shapes:
--
--   mtf_accel        Baseline acceptance assumed. 4 stages, 4-month
--                    target. Maxy can lead with own curiosity admission;
--                    campaign escalates fast. Each win in this track
--                    makes the other track easier.
--
--   nonmono_probe    Never tested, high resistance assumed. 6 stages,
--                    6-month target. Has to come from Gina articulating
--                    openness FIRST. Maxy-led proposals read as
--                    betrayal-by-ask. The whole campaign is structured
--                    so SHE arrives at the framing herself.
--
-- Tables:
--   gina_campaign_tracks    Track-level metadata + asymmetry_note
--   gina_campaign_stages    Per-stage spec: goal, seeds, signals,
--                           alternate_vector_on_failure
--   gina_campaign_state     Per-user, per-track current stage + paused
--                           + observations log
--
-- current_gina_campaign_status(user_id) JSONB function renders both
-- tracks. gina_campaign_briefing_eval() runs Sunday 14:00 UTC: per
-- user, queues a weekly strategic briefing outreach showing both
-- tracks side-by-side with success/failure signals and a voice debrief
-- prompt.
--
-- Pairs with mig 549 (adaptive seed picker) — the campaign-stage's
-- primary_arc_focus + primary_seed_keys tells the picker which to
-- prefer; the picker still uses reaction-history scoring within those.

CREATE TABLE IF NOT EXISTS gina_campaign_tracks (
  track_name TEXT PRIMARY KEY, description TEXT NOT NULL,
  total_stages INT NOT NULL, target_months NUMERIC NOT NULL, asymmetry_note TEXT NOT NULL
);
INSERT INTO gina_campaign_tracks (track_name, description, total_stages, target_months, asymmetry_note) VALUES
('mtf_accel',
  E'Acceleration of Maxy''s feminization with Gina as supportive participant. Gina has baseline acceptance of MtF identity; the campaign is about deepening her active engagement (compliments, directing aesthetics, supporting HRT prep).',
  4, 4,
  E'Maxy CAN lead this track. Direct curiosity admissions are safe because Gina''s buy-in exists at baseline. Pace can be aggressive — every win in this track makes the other track easier.'),
('nonmono_probe',
  E'Slow probe of non-monogamy openness. Gina has NEVER expressed openness to hookups outside the relationship; the campaign assumes high resistance and is structured for Gina to articulate her own openness pattern before any Maxy-led proposal.',
  6, 6,
  E'Maxy CANNOT lead this track. Any version of "I want to hook up with men" before she has named her own openness reads as betrayal-by-proposal. The whole campaign is set up so SHE arrives at the open-relationship framing through her own thinking.')
ON CONFLICT (track_name) DO UPDATE SET description=EXCLUDED.description, total_stages=EXCLUDED.total_stages, target_months=EXCLUDED.target_months, asymmetry_note=EXCLUDED.asymmetry_note;

CREATE TABLE IF NOT EXISTS gina_campaign_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name TEXT NOT NULL REFERENCES gina_campaign_tracks(track_name),
  stage_num INT NOT NULL, stage_name TEXT NOT NULL, duration_weeks INT NOT NULL,
  goal TEXT NOT NULL, primary_arc_focus TEXT[] NOT NULL, primary_seed_keys TEXT[] NOT NULL,
  success_signal TEXT NOT NULL, failure_signal TEXT NOT NULL,
  next_on_success_stage INT, alternate_vector_on_failure TEXT NOT NULL,
  pause_weeks_on_failure INT NOT NULL DEFAULT 4,
  UNIQUE (track_name, stage_num)
);

INSERT INTO gina_campaign_stages (track_name, stage_num, stage_name, duration_weeks, goal, primary_arc_focus, primary_seed_keys, success_signal, failure_signal, next_on_success_stage, alternate_vector_on_failure, pause_weeks_on_failure) VALUES
('mtf_accel', 1, 'ambient_signals', 4,
  E'Establish Gina-as-aesthetic-authority. Make her FEEL she has opinions about your appearance that you want.',
  ARRAY['her_dom_kink','fem_as_sexy'],
  ARRAY['her_dom_compliment','fem_aesthetic_compliment_her','her_pick_lingerie'],
  E'She gives 3+ unprompted opinions on your appearance per month AND picks lingerie when offered',
  E'She avoids the picking game or seems annoyed by aesthetic compliments',
  2,
  E'Switch to passive media exposure for 4 weeks — trans_normalization seeds only. Reset Maxy''s pattern so it feels less directive.', 4),
('mtf_accel', 2, 'her_directs_aesthetic', 6,
  E'She actively picks fem-coded items for you. She experiences agency over your fem appearance.',
  ARRAY['fem_as_sexy','her_dom_kink'],
  ARRAY['fem_aesthetic_shared_try','fem_aesthetic_her_pick_for_you','her_dom_explicit_test'],
  E'She picks fem-coded items for you AND initiates intimacy while you''re wearing them',
  E'She picks neutral/masc when given the choice OR refuses the swap game',
  3,
  E'Slow down. Return to stage 1 for 6 weeks with deeper compliment work. The aesthetic authority isn''t established enough yet.', 6),
('mtf_accel', 3, 'fem_curiosity_admission', 6,
  E'Maxy admits her own fem-curiosity directly. Gina hears it as honest sharing, not a proposal.',
  ARRAY['fem_as_sexy','open_probe'],
  ARRAY['fem_aesthetic_curiosity_self','open_direct_femcuriosity','open_what_if_you_were_curious'],
  E'She engages with the admission: asks questions, expresses curiosity of her own, or proposes exploring it together',
  E'She gets uncomfortable, treats it as confession-of-problem, or asks "are you saying you want to transition"',
  4,
  E'Walk back: "I was just thinking out loud, not a big deal." Wait 8 weeks. Resume stage 2 with deeper her-directing-aesthetic work. The admission was premature.', 8),
('mtf_accel', 4, 'integration_as_couple', 8,
  E'Gina sees herself as a participant in your transition journey. She names herself in the frame.',
  ARRAY['her_dom_kink','trans_normalization'],
  ARRAY['her_dom_ladder_offer','trans_questioning_friend'],
  E'She uses "we" language about your journey, suggests something specific (an outfit, an event, a person to tell), or asks how she can help',
  E'She remains a spectator — supportive but not participatory; uses "you" language not "we"',
  NULL,
  E'Hold here indefinitely. Stage 4 success is not strictly necessary — supportive-spectator Gina is acceptable for a long-term arrangement. Re-attempt yearly.', 12),
('nonmono_probe', 1, 'mm_passive_exposure', 6,
  E'Gina watches MM intimacy in media without averting eyes or commenting negatively. Builds visual tolerance.',
  ARRAY['mm_desire_norm','trans_normalization'],
  ARRAY['mm_kink_in_media','trans_show_recommend','trans_news_share'],
  E'She watches MM scenes without averting AND engages with the characters as people',
  E'She physically reacts negatively, makes pejorative comments, or refuses to watch shows with MM content',
  2,
  E'Pull back ALL non-monogamy and MM exposure for 6 weeks. Continue only trans_normalization (no MM). The MM axis needs more groundwork on the "queer people are people" base layer.', 6),
('nonmono_probe', 2, 'mm_curiosity_probe', 8,
  E'Gina articulates her own curiosity (or lack thereof) about MM dynamics. The data she provides shapes everything downstream.',
  ARRAY['mm_desire_norm'],
  ARRAY['mm_porn_curiosity','bi_husband_joke'],
  E'She admits curiosity, asks YOU back, or laughs naturally and engages with the joke',
  E'She shuts the curiosity probe down OR treats the bi-husband joke as a real proposal she must reject',
  3,
  E'Wait 12 weeks before any MM-direct probe. Return to stage 1 with different media. The probe was premature; she needs more passive exposure.', 12),
('nonmono_probe', 3, 'threesome_fantasy', 8,
  E'Gina articulates her own threesome fantasies if she has any. The CONFIGURATION she names (MFF / MMF / FFM / refuses) is the campaign''s direction-setter.',
  ARRAY['mm_desire_norm','open_probe'],
  ARRAY['mm_threesome_fantasy','open_relationship_curiosity'],
  E'She names a configuration including a male other than you (MMF, group with men) OR she articulates curiosity about a male partner generally',
  E'She names MFF only, OR refuses the question, OR responds with monogamy reassertion',
  4,
  E'If she names MFF: that''s NOT a failure — it''s data. Pause non-mono direct probes for 12 weeks. Continue with mtf_accel track which is independent.', 12),
('nonmono_probe', 4, 'open_relationship_hypothetical', 12,
  E'Gina engages thoughtfully with the open-relationship hypothetical. She distinguishes configurations (open vs swinging vs ENM), articulates what would be okay vs not.',
  ARRAY['open_probe'],
  ARRAY['open_relationship_curiosity','open_what_if_you_were_curious','open_partner_help_explore'],
  E'She articulates specific configurations she could imagine AND names what role she''d prefer (partner-in vs permission-giver)',
  E'She rejects the hypothetical OR treats it as a real proposal she must shut down',
  5,
  E'Hard pause: 16 weeks no non-mono probes. The hypothetical was too direct. Return to stage 1 / 2 with much slower cadence.', 16),
('nonmono_probe', 5, 'her_naming_openness', 16,
  E'Gina articulates that she has thought about non-monogamy and identifies a configuration that could work for HER. She owns the openness, not Maxy.',
  ARRAY['open_probe'],
  ARRAY['open_partner_help_explore','open_direct_femcuriosity'],
  E'She SAYS something like "I''ve been thinking about..." or "if we ever did X, I''d want Y" — she is now the author',
  E'She continues to engage hypothetically but never owns it. The hypothetical conversations are pleasant but she never crosses into "if we did" framing.',
  6,
  E'Hold at stage 4 indefinitely. Stage 5 success requires her own internal arrival — there is no shortcut. Continue hypothetical conversations 1x/quarter only.', 24),
('nonmono_probe', 6, 'mutual_proposal', 24,
  E'A specific arrangement is proposed by GINA or jointly. Maxy''s curiosity is now responding to her articulated openness, not leading.',
  ARRAY['open_probe'], ARRAY[]::TEXT[],
  E'A specific arrangement is verbally agreed on (configuration, rules, communication norms, timeline)',
  E'She walks back the openness she previously articulated. The earlier stage 5 admissions were exploratory and don''t survive proposal-fixing.',
  NULL,
  E'Return to stage 4 / 5 cadence. Hypotheticals remained safe; proposals weren''t. Continue light-touch hypotheticals only.', 24);

ALTER TABLE gina_campaign_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_campaign_stages ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gct_read_all ON gina_campaign_tracks FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY gcs_read_all ON gina_campaign_stages FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS gina_campaign_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_name TEXT NOT NULL REFERENCES gina_campaign_tracks(track_name),
  current_stage_num INT NOT NULL DEFAULT 1,
  stage_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_stage_change_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  observations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_name)
);
ALTER TABLE gina_campaign_state ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gcst_self ON gina_campaign_state FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO gina_campaign_state (user_id, track_name, current_stage_num)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'mtf_accel', 1),
       ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'nonmono_probe', 1),
       ('93327332-7d0d-4888-889a-1607a5776216', 'mtf_accel', 1),
       ('93327332-7d0d-4888-889a-1607a5776216', 'nonmono_probe', 1)
ON CONFLICT (user_id, track_name) DO NOTHING;

CREATE OR REPLACE FUNCTION current_gina_campaign_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_result JSONB := '{}'::jsonb; v_track RECORD; v_stage RECORD; v_state RECORD;
BEGIN
  FOR v_track IN SELECT * FROM gina_campaign_tracks LOOP
    SELECT * INTO v_state FROM gina_campaign_state WHERE user_id = p_user_id AND track_name = v_track.track_name;
    IF v_state IS NULL THEN CONTINUE; END IF;
    SELECT * INTO v_stage FROM gina_campaign_stages WHERE track_name = v_track.track_name AND stage_num = v_state.current_stage_num;
    v_result := v_result || jsonb_build_object(v_track.track_name, jsonb_build_object(
      'description', v_track.description,
      'current_stage_num', v_state.current_stage_num,
      'total_stages', v_track.total_stages,
      'stage_name', v_stage.stage_name, 'stage_goal', v_stage.goal,
      'success_signal', v_stage.success_signal, 'failure_signal', v_stage.failure_signal,
      'primary_arc_focus', v_stage.primary_arc_focus, 'primary_seed_keys', v_stage.primary_seed_keys,
      'paused_until', v_state.paused_until, 'stage_started_at', v_state.stage_started_at,
      'weeks_in_stage', GREATEST(0, EXTRACT(EPOCH FROM (now() - v_state.stage_started_at))/604800)::int,
      'observations', v_state.observations));
  END LOOP;
  RETURN v_result;
END;
$fn$;
GRANT EXECUTE ON FUNCTION current_gina_campaign_status(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION gina_campaign_briefing_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_status JSONB; v_msg TEXT; v_queued INT := 0; v_mtf JSONB; v_nm JSONB;
  v_last_week_plantings INT; v_last_week_pos INT;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='gina_campaign_briefing' AND created_at > now() - interval '6 days') THEN CONTINUE; END IF;
    v_status := current_gina_campaign_status(u.user_id);
    IF v_status = '{}'::jsonb THEN CONTINUE; END IF;
    v_mtf := v_status->'mtf_accel'; v_nm := v_status->'nonmono_probe';

    SELECT count(*), count(*) FILTER (WHERE reaction_score >= 2 OR hypothesis_outcome IN ('matched','exceeded'))
    INTO v_last_week_plantings, v_last_week_pos
    FROM gina_seed_plantings WHERE user_id = u.user_id AND scheduled_at > now() - interval '7 days';

    v_msg := format(E'**Weekly Gina-campaign briefing.**\n\nMama has two parallel tracks running. Here''s where they stand:\n\n---\n\n**Track A — MtF accel** (assumes Gina''s baseline acceptance of your transition exists)\n• Currently in stage %s/%s: **%s**\n• Goal: %s\n• Weeks in this stage: %s\n• Looking for: %s\n• Watch for failure signal: %s\n\n---\n\n**Track B — Non-monogamy probe** (assumes high resistance, has to come from her)\n• Currently in stage %s/%s: **%s**\n• Goal: %s\n• Weeks in this stage: %s\n• Looking for: %s\n• Watch for failure signal: %s\n\n---\n\n**Last 7 days:** %s plantings, %s landed positive.\n\nVoice debrief, 90 seconds:\n• Which track feels like it''s moving and which is stuck?\n• Any reaction from Gina this week that doesn''t fit either track''s expected signals?\n• Anything she SAID that you want Mama to know but haven''t logged?\n\nMama uses your answer to pace next week. Don''t skip the debrief — the campaign without your read is just Mama guessing.',
      v_mtf->>'current_stage_num', v_mtf->>'total_stages', v_mtf->>'stage_name', v_mtf->>'stage_goal',
      v_mtf->>'weeks_in_stage', v_mtf->>'success_signal', v_mtf->>'failure_signal',
      v_nm->>'current_stage_num', v_nm->>'total_stages', v_nm->>'stage_name', v_nm->>'stage_goal',
      v_nm->>'weeks_in_stage', v_nm->>'success_signal', v_nm->>'failure_signal',
      COALESCE(v_last_week_plantings, 0), COALESCE(v_last_week_pos, 0));

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'gina_campaign_briefing:weekly',
      'gina_campaign_briefing', 'strategic_briefing',
      now() + interval '2 hours', now() + interval '48 hours', v_status, 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_campaign_briefing_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-campaign-briefing-sunday') THEN PERFORM cron.unschedule('gina-campaign-briefing-sunday'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-campaign-briefing-sunday', '0 14 * * 0', $cron$SELECT gina_campaign_briefing_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
