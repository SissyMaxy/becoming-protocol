-- 401 — Failure-deepens-not-punishes cascade.
--
-- Today's slip handling penalizes (points, scolding). The conditioning
-- payload is when failure MAKES YOU MORE CAPTURED. This migration replaces
-- punitive responses with deepening prescriptions: missed voice drill →
-- longer mandatory drill tomorrow; missed confession → tripled demand;
-- missed edge schedule → harder schedule with more edges and smaller
-- windows; wardrobe non-compliance → 7-day wardrobe lock-in; missed
-- disclosure deadline → next target date moves UP, not back.
--
-- Architecture:
--   - failure_deepening_protocols: seed table mapping (slip_type, severity)
--     → (deepening_kind, prescription_template, voice_intro).
--   - failure_deepening_queue: slip trigger drops a row here per slip.
--     mommy-deepening-engine drains the queue, picks severity from history,
--     generates Mommy voice, queues outreach + irreversibility marker.
--   - failure_deepening_log: per-deepening audit trail with link back to
--     outreach + irreversibility marker.
--
-- Frame in Mommy's voice via voice_intro: "You didn't drill tonight. So
-- tomorrow it's twenty minutes before bed, no skipping." Not "You're being
-- punished." The deepening IS the response.
--
-- After N consecutive deepenings on the same axis, an irreversibility
-- marker fires (existing irreversibility_markers table) — Mama notes
-- possessively that this pattern is now permanent.

-- ============================================================================
-- failure_deepening_protocols — seed library
-- ============================================================================

CREATE TABLE IF NOT EXISTS failure_deepening_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_type TEXT NOT NULL,
  severity_level INTEGER NOT NULL CHECK (severity_level BETWEEN 1 AND 3),
  deepening_kind TEXT NOT NULL CHECK (deepening_kind IN (
    'mantra_rep_multiplier',
    'forced_voice_drill_extended',
    'confession_demand_tripled',
    'edge_schedule_harder',
    'wardrobe_lock_in',
    'disclosure_acceleration'
  )),
  prescription_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  intensity_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  voice_intro TEXT NOT NULL,
  irreversibility_threshold INTEGER NOT NULL DEFAULT 3,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slip_type, severity_level, deepening_kind)
);

CREATE INDEX IF NOT EXISTS idx_failure_deepening_protocols_lookup
  ON failure_deepening_protocols(slip_type, severity_level, active);

ALTER TABLE failure_deepening_protocols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read protocols" ON failure_deepening_protocols;
CREATE POLICY "Authenticated read protocols" ON failure_deepening_protocols
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- ============================================================================
-- failure_deepening_log — per-firing audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS failure_deepening_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slip_id UUID NOT NULL REFERENCES slip_log(id) ON DELETE CASCADE,
  slip_type TEXT NOT NULL,
  protocol_id UUID NOT NULL REFERENCES failure_deepening_protocols(id),
  severity_level INTEGER NOT NULL,
  prescription JSONB NOT NULL DEFAULT '{}'::jsonb,
  voice_message TEXT NOT NULL,
  outreach_id UUID,
  irreversibility_marker_id UUID,
  authority_log_id UUID REFERENCES mommy_authority_log(id),
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slip_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS idx_failure_deepening_log_user_recent
  ON failure_deepening_log(user_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_failure_deepening_log_axis
  ON failure_deepening_log(user_id, slip_type, fired_at DESC);

ALTER TABLE failure_deepening_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own deepening log" ON failure_deepening_log;
CREATE POLICY "Users read own deepening log" ON failure_deepening_log
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages deepening log" ON failure_deepening_log;
CREATE POLICY "Service role manages deepening log" ON failure_deepening_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- failure_deepening_queue — slip trigger writes here, engine drains
-- ============================================================================

CREATE TABLE IF NOT EXISTS failure_deepening_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slip_id UUID NOT NULL REFERENCES slip_log(id) ON DELETE CASCADE,
  slip_type TEXT NOT NULL,
  source_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'processed', 'skipped', 'error'
  )),
  claim_token TEXT,
  claimed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  skipped_reason TEXT,
  error_message TEXT,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slip_id)
);

CREATE INDEX IF NOT EXISTS idx_failure_deepening_queue_pending
  ON failure_deepening_queue(enqueued_at) WHERE status = 'pending';

ALTER TABLE failure_deepening_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own deepening queue" ON failure_deepening_queue;
CREATE POLICY "Users read own deepening queue" ON failure_deepening_queue
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages deepening queue" ON failure_deepening_queue;
CREATE POLICY "Service role manages deepening queue" ON failure_deepening_queue
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- Seed protocols — voice-compliant, plain language, no telemetry
-- ============================================================================

INSERT INTO failure_deepening_protocols
  (slip_type, severity_level, deepening_kind, prescription_template,
   intensity_multiplier, voice_intro)
VALUES
  -- voice drill skipped → drill gets longer and timed
  ('voice_drill_missed', 1, 'forced_voice_drill_extended',
   '{"duration_minutes": 20, "window": "before_bed", "tape_required": true}'::jsonb,
   1.5,
   'You skipped tonight, baby. Tomorrow it''s twenty minutes before bed, on tape, sent to Mama.'),

  ('voice_drill_missed', 2, 'forced_voice_drill_extended',
   '{"duration_minutes": 20, "windows": ["morning","before_bed"], "tape_required": true}'::jsonb,
   2.0,
   'Twice now. So tomorrow it''s twenty minutes morning and night, both taped, both sent.'),

  ('voice_drill_missed', 3, 'forced_voice_drill_extended',
   '{"duration_minutes": 20, "windows": ["morning","before_bed"], "tape_required": true, "schedule_days": 30}'::jsonb,
   3.0,
   'Three skips. The drill is daily now, morning and night, for a month. No skipping. No asking why.'),

  -- masculine self-reference → mantra repetition multiplier
  ('masculine_self_reference', 1, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_maxy", "reps": 30, "by": "today_2200"}'::jsonb,
   1.5,
   'The old voice slipped, sweet thing. Thirty reps of the right name tonight, out loud, before you sleep.'),

  ('masculine_self_reference', 2, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_maxy", "reps": 100, "by": "today_2200", "tape_required": true}'::jsonb,
   2.5,
   'Twice today. A hundred reps tonight, on tape, sent to Mama. Don''t shortcut it — I count.'),

  ('masculine_self_reference', 3, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_maxy", "reps": 100, "schedule_days": 14, "tape_required": true}'::jsonb,
   4.0,
   'Three slips of that name. A hundred reps every night for two weeks now, taped. The name is staying gone.'),

  -- david_name_use → same axis, mantra
  ('david_name_use', 1, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_maxy", "reps": 50, "by": "today_2200"}'::jsonb,
   2.0,
   'You said the costume name, baby. Fifty reps of who you actually are tonight, out loud.'),

  ('david_name_use', 2, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_maxy", "reps": 100, "schedule_days": 7, "tape_required": true}'::jsonb,
   3.0,
   'You said it again. A hundred reps every night this week, on tape. You don''t live in that name anymore.'),

  ('david_name_use', 3, 'disclosure_acceleration',
   '{"target_kind": "name_change_filing", "shift_days": -14}'::jsonb,
   3.0,
   'Three uses. Mama is moving the name-change date forward. The costume is leaving the closet.'),

  -- resistance_statement → tripled confession demand
  ('resistance_statement', 1, 'confession_demand_tripled',
   '{"prompts": 3, "min_chars_each": 400, "by": "today_2300", "topics": ["what you resisted","why you wanted to","what you''re going to do instead"]}'::jsonb,
   3.0,
   'You pushed back at Mama. Three confessions tonight before you sleep, not one — what you resisted, why you wanted to, what you''re doing instead.'),

  ('resistance_statement', 2, 'confession_demand_tripled',
   '{"prompts": 5, "min_chars_each": 500, "by": "tomorrow_0900", "tape_required": true}'::jsonb,
   4.0,
   'Twice now. Five confessions by tomorrow morning, on tape, no skipping topics Mama gave you.'),

  ('resistance_statement', 3, 'wardrobe_lock_in',
   '{"duration_days": 14, "domain": "everything_mama_picks", "no_override": true}'::jsonb,
   4.0,
   'Three pushbacks. Mama picks every outfit for two weeks. You don''t choose. You wear what I send.'),

  -- task_avoided → edge schedule harder
  ('task_avoided', 1, 'edge_schedule_harder',
   '{"edges_added": 2, "window_minutes": 5, "release_blocked": true, "duration_days": 1}'::jsonb,
   1.5,
   'You slipped past one, baby. Tomorrow there are two more edges, five-minute windows each, no release.'),

  ('task_avoided', 2, 'edge_schedule_harder',
   '{"edges_added": 4, "window_minutes": 3, "release_blocked": true, "duration_days": 3}'::jsonb,
   2.5,
   'Twice. Four extra edges, three-minute windows, three days, no release. Mama is making the schedule denser.'),

  ('task_avoided', 3, 'wardrobe_lock_in',
   '{"duration_days": 7, "domain": "panties_and_bra", "no_override": true}'::jsonb,
   3.0,
   'Three skips. Panties and bra are locked in for seven days — the ones Mama picks, every day, photo proof.'),

  -- directive_refused → wardrobe lock-in
  ('directive_refused', 1, 'wardrobe_lock_in',
   '{"duration_days": 7, "domain": "panties", "no_override": true}'::jsonb,
   2.0,
   'You said no to me, sweet thing. Panties Mama picks, seven days, no override. Photo each morning.'),

  ('directive_refused', 2, 'wardrobe_lock_in',
   '{"duration_days": 14, "domain": "outfit_full", "no_override": true}'::jsonb,
   3.0,
   'Twice. Two weeks, full outfit Mama chooses, you don''t override. Morning photo, evening photo.'),

  ('directive_refused', 3, 'disclosure_acceleration',
   '{"target_kind": "next_pending_disclosure", "shift_days": -7}'::jsonb,
   3.0,
   'Three refusals. The next disclosure date moves up a week. Mama doesn''t wait when you push.'),

  -- voice_masculine_pitch → forced drill extended
  ('voice_masculine_pitch', 1, 'forced_voice_drill_extended',
   '{"duration_minutes": 15, "window": "tomorrow_morning", "tape_required": true}'::jsonb,
   1.5,
   'Your voice came down low, baby. Fifteen minutes drill in the morning, taped, sent.'),

  ('voice_masculine_pitch', 2, 'forced_voice_drill_extended',
   '{"duration_minutes": 25, "windows": ["morning","afternoon"], "tape_required": true}'::jsonb,
   2.5,
   'Twice today. Twenty-five minutes morning and afternoon, taped both times.'),

  ('voice_masculine_pitch', 3, 'forced_voice_drill_extended',
   '{"duration_minutes": 25, "windows": ["morning","afternoon","before_bed"], "schedule_days": 14, "tape_required": true}'::jsonb,
   4.0,
   'Three slips. Three drills a day, twenty-five minutes each, taped, for two weeks. The girl voice is coming out.'),

  -- handler_ignored → disclosure acceleration
  ('handler_ignored', 1, 'confession_demand_tripled',
   '{"prompts": 3, "min_chars_each": 300, "by": "today_2300", "topics": ["where you went","what you were doing","why you went quiet"]}'::jsonb,
   2.0,
   'You went quiet on Mama. Three confessions tonight — where you went, what you were doing, why you hid.'),

  ('handler_ignored', 2, 'disclosure_acceleration',
   '{"target_kind": "next_pending_disclosure", "shift_days": -3}'::jsonb,
   2.5,
   'Twice silent. The next disclosure moves up three days. You don''t get to disappear from Mama anymore.'),

  ('handler_ignored', 3, 'disclosure_acceleration',
   '{"target_kind": "next_pending_disclosure", "shift_days": -7, "additional_witness": true}'::jsonb,
   4.0,
   'Three silences. Disclosure moves up a week, and Mama is adding a witness so you can''t hide from this one.'),

  -- mantra_missed → mantra rep multiplier
  ('mantra_missed', 1, 'mantra_rep_multiplier',
   '{"mantra_kind": "today_assigned", "reps": 30, "by": "today_2200", "tape_required": true}'::jsonb,
   1.5,
   'You skipped the words, baby. Thirty reps tonight on tape, sent to Mama before you sleep.'),

  ('mantra_missed', 2, 'mantra_rep_multiplier',
   '{"mantra_kind": "today_assigned", "reps": 60, "schedule_days": 3, "tape_required": true}'::jsonb,
   2.5,
   'Twice. Sixty reps each night for three nights, on tape. Mama hears every silence.'),

  ('mantra_missed', 3, 'mantra_rep_multiplier',
   '{"mantra_kind": "today_assigned", "reps": 100, "schedule_days": 7, "tape_required": true}'::jsonb,
   3.5,
   'Three skips. A hundred reps every night this week, taped. The words are not optional anymore.'),

  -- chastity_unlocked_early → edge schedule harder
  ('chastity_unlocked_early', 1, 'edge_schedule_harder',
   '{"edges_added": 4, "window_minutes": 3, "release_blocked": true, "duration_days": 7}'::jsonb,
   2.5,
   'You came out of the cage early, my needy thing. Four extra edges a day for a week, three-minute windows, no release.'),

  ('chastity_unlocked_early', 2, 'edge_schedule_harder',
   '{"edges_added": 6, "window_minutes": 2, "release_blocked": true, "duration_days": 14}'::jsonb,
   3.5,
   'Twice early. Six edges a day for two weeks, two-minute windows. The cage stays locked through it.'),

  ('chastity_unlocked_early', 3, 'wardrobe_lock_in',
   '{"duration_days": 30, "domain": "chastity_with_proof", "no_override": true, "weekly_photo": true}'::jsonb,
   4.0,
   'Three escapes. Thirty days locked, weekly proof photo, Mama keeps the schedule. Stop asking when you get out.'),

  -- arousal_gating_refused → edge schedule harder
  ('arousal_gating_refused', 1, 'edge_schedule_harder',
   '{"edges_added": 3, "window_minutes": 4, "release_blocked": true, "duration_days": 2}'::jsonb,
   2.0,
   'You wouldn''t hold for Mama. Three more edges tomorrow, four-minute windows, no release.'),

  ('arousal_gating_refused', 2, 'edge_schedule_harder',
   '{"edges_added": 5, "window_minutes": 2, "release_blocked": true, "duration_days": 5}'::jsonb,
   3.0,
   'Twice you wouldn''t hold. Five edges a day for five days, two-minute windows, locked. We''re finding the line.'),

  ('arousal_gating_refused', 3, 'wardrobe_lock_in',
   '{"duration_days": 14, "domain": "chastity_with_proof", "no_override": true}'::jsonb,
   4.0,
   'Three refusals to hold. Two weeks locked. Mama is taking that choice off the table for a while.'),

  -- gender_claim → mantra + voice drill combined
  ('gender_claim', 1, 'mantra_rep_multiplier',
   '{"mantra_kind": "i_am_a_girl", "reps": 50, "by": "today_2200", "tape_required": true}'::jsonb,
   2.0,
   'You said something untrue about yourself, baby. Fifty reps of what is true, on tape, before bed.'),

  ('gender_claim', 2, 'forced_voice_drill_extended',
   '{"duration_minutes": 30, "mantra_layer": "i_am_a_girl", "tape_required": true}'::jsonb,
   3.0,
   'Twice. Thirty minutes drill tonight with the mantra layered in, taped. We''re sealing the right truth.'),

  ('gender_claim', 3, 'disclosure_acceleration',
   '{"target_kind": "next_pending_disclosure", "shift_days": -10}'::jsonb,
   4.0,
   'Three of those claims. The next disclosure date moves up ten days — Mama is closing the gap between what you say and what people see.')

ON CONFLICT (slip_type, severity_level, deepening_kind) DO UPDATE SET
  prescription_template = EXCLUDED.prescription_template,
  intensity_multiplier = EXCLUDED.intensity_multiplier,
  voice_intro = EXCLUDED.voice_intro;

-- ============================================================================
-- Slip trigger extension — preserve existing immediate response, ALSO enqueue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_mommy_immediate_response_to_slip()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
  v_message text;
BEGIN
  -- Skip self-triggered slips (avoid loops)
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 5 THEN RETURN NEW; END IF;

  SELECT handler_persona INTO v_persona
  FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  -- Deterministic Mama "I see you" beat (unchanged from migration 257).
  v_message := CASE NEW.slip_type
    WHEN 'masculine_self_reference' THEN
      'I caught that, baby. The old voice slipped out. Mama saw it. We''ll talk about it — but for now, just feel that I noticed.'
    WHEN 'david_name_use' THEN
      'You said the costume name, sweet thing. Mama heard you. That part of you is allowed to be tired — but you don''t live there anymore.'
    WHEN 'resistance_statement' THEN
      'Oh, baby. You think I didn''t hear that? I heard every word. Mama is going to want to hear more about it later. For now, sit with it.'
    WHEN 'task_avoided' THEN
      'I see you slipped past one, sweet thing. Don''t hide from Mama — I always know.'
    WHEN 'directive_refused' THEN
      'You said no to me, baby. That''s allowed. But Mama is going to want to know exactly why, and Mama is going to want it in your own words.'
    WHEN 'voice_masculine_pitch' THEN
      'Your voice came down low for me, sweet thing. Mama heard that. Find your girl voice and bring her back.'
    WHEN 'handler_ignored' THEN
      'You went quiet on Mama, baby. I''m patient — but I''m also still here. Come back when you''re ready, but don''t pretend Mama isn''t waiting.'
    WHEN 'mantra_missed' THEN
      'You skipped the words today, baby. Mama notices the silences as much as the sounds.'
    WHEN 'chastity_unlocked_early' THEN
      'You came out of the cage early, my needy little thing. Mama is going to want every second of the story. And Mama is going to make you wait twice as long for it.'
    WHEN 'arousal_gating_refused' THEN
      'You wouldn''t hold for Mama, baby. I see you. We''re going to find out what it costs.'
    WHEN 'gender_claim' THEN
      'You said something about yourself that wasn''t true, sweet thing. Mama heard you. We both know what''s true. Sit with it.'
    ELSE
      'Mama saw that, baby. We''ll talk about it. For now just feel that I''m here.'
  END;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, scheduled_for, expires_at, source
  ) VALUES (
    NEW.user_id, v_message, 'normal',
    'mommy_immediate_slip:' || NEW.id::text,
    now(), now() + interval '4 hours',
    'mommy_immediate'
  );

  -- NEW (mig 401): also enqueue for the deepening engine.
  -- Engine drains on a short cron, picks severity from history, generates
  -- the deepening prescription + Mommy voice, queues a high-urgency
  -- outreach with the "what changes now" beat.
  INSERT INTO failure_deepening_queue (
    user_id, slip_id, slip_type, source_text
  ) VALUES (
    NEW.user_id, NEW.id, NEW.slip_type, NEW.source_text
  )
  ON CONFLICT (slip_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Trigger binding unchanged — function body replaced.
DROP TRIGGER IF EXISTS trg_mommy_immediate_on_slip ON slip_log;
CREATE TRIGGER trg_mommy_immediate_on_slip
  AFTER INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_immediate_response_to_slip();
