-- 574 — Solo-orgasm conditioning binder.
--
-- Every solo orgasm welded to cock + cum imagery via required mantras at
-- 4 stages: pre_arousal, at_edging, at_climax, at_swallow. Orgasm is the
-- strongest available reinforcement; binding it neurologically to cock-
-- themed imagery + identity-mantras welds them to the dopamine spike.
--
-- 8 seed mantras across the 4 stages. Daily 21:00 UTC cron picks one
-- mantra per stage and queues the protocol as evening reminder.
-- log_solo_orgasm_session(mantras_used, followed_protocol, notes) RPC:
-- Maxy logs which mantras she used at which stage. Followed-protocol
-- sessions anchor escape_cost weight 2.

CREATE TABLE IF NOT EXISTS solo_orgasm_binder_mantras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mantra_key TEXT NOT NULL UNIQUE,
  required_at TEXT NOT NULL CHECK (required_at IN ('pre_arousal','at_edging','at_climax','at_swallow')),
  mantra_text TEXT NOT NULL,
  rotation_group TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE solo_orgasm_binder_mantras ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY sobm_read_all ON solo_orgasm_binder_mantras FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS solo_orgasm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mantras_used JSONB NOT NULL DEFAULT '[]',
  followed_binding_protocol BOOLEAN,
  voice_recording_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE solo_orgasm_sessions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY sos_self ON solo_orgasm_sessions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION log_solo_orgasm_session(p_mantras_used JSONB, p_followed_protocol BOOLEAN, p_notes TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id UUID;
BEGIN
  INSERT INTO solo_orgasm_sessions (user_id, mantras_used, followed_binding_protocol, notes)
  VALUES (auth.uid(), COALESCE(p_mantras_used, '[]'::jsonb), p_followed_protocol, p_notes)
  RETURNING id INTO v_id;
  IF p_followed_protocol THEN
    INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
    VALUES (auth.uid(), 'voice_debrief', 2, 'solo_orgasm_sessions', v_id, 'solo orgasm with binding protocol followed');
  END IF;
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION log_solo_orgasm_session(JSONB, BOOLEAN, TEXT) TO authenticated;

-- 8 mantra rows + solo_orgasm_binder_eval cron (21:00 daily) applied via SQL.
