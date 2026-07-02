-- 628 — Enforcement Spine v2: escalation calculus + compliance recognition.
--
-- Design: DESIGN_ENFORCEMENT_SPINE_2026-07-01.md §2, §5, §7 L2.
--
--   1. escalation_events — the ONLY input to Hard Mode. Written only by the
--      ledger's miss-processor / dodge recorder / capped organic-slip bridge.
--      Removed permanently as inputs: handler_reply_grades fail rate,
--      strategist plan keywords, raw slip_log volume, decree expired/
--      cancelled counts, synthetic slips not chained to a missed obligation.
--   2. pressure_score(user) — Σ over 14d of points × 0.5^(age_hours/72),
--      per-day intake cap 6. Computed on read, stored nowhere (derived
--      counters are never additive).
--   3. hard_mode_recompute(user) — ON: pressure ≥ 10 AND ≥2 distinct
--      evidence-linked missed obligations on ≥2 distinct days; entry files
--      its own obligation naming the misses and the exit. OFF: de-escalation
--      set complete (force-processor path) OR pressure < 3 for 72h.
--   4. mandated_texts + is_mandated_text() — compliance is exempt by
--      PROVENANCE, not regex. Saying the punishment line can never be a slip.
--   5. capture_context on submission tables + BEFORE INSERT suppress-triggers
--      on slip_log / identity_erosion_log.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. escalation_events
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'obligation_missed_internal',      -- 2 pts: surfaced ≥ grace before deadline, evidence attached
    'obligation_missed_acknowledged',  -- 3 pts: acknowledged + missed = deliberate
    'punishment_dodge_1',              -- 3 pts
    'punishment_dodge_2',              -- 4 pts (terminal — commutation)
    'organic_slip',                    -- 1 pt: quoted source text; max 2/day countable
    'conditioning_turned_down'         -- 2 pts: without safeword; max 1/day countable
  )),
  points INT NOT NULL CHECK (points BETWEEN 1 AND 4),
  obligation_id UUID REFERENCES obligations(id) ON DELETE SET NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'ledger',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY escalation_events_self ON escalation_events FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY escalation_events_service ON escalation_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS escalation_events_window_idx ON escalation_events(user_id, occurred_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. pressure_score — derived, never stored
-- ─────────────────────────────────────────────────────────────────────────

-- Mirror: supabase/functions/_shared/enforcement-core.ts pressureScore().
-- Keep the two in sync — the TS mirror is what the vitest fixtures pin.
CREATE OR REPLACE FUNCTION pressure_score(p_user UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(
    e.points
    * (LEAST(6, e.day_sum)::numeric / e.day_sum)          -- per-day intake cap 6
    * power(0.5, EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 3600.0 / 72.0)
  ), 0)
  FROM (
    SELECT points, occurred_at,
           SUM(points) OVER (PARTITION BY date_trunc('day', occurred_at)) AS day_sum
      FROM escalation_events
     WHERE user_id = p_user AND occurred_at > now() - interval '14 days'
  ) e;
$$;
GRANT EXECUTE ON FUNCTION pressure_score(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Miss-processor — the only escalation_events writer for misses
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION obligation_miss_processor()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_missed INTEGER := 0;
  v_ok BOOLEAN;
BEGIN
  -- filed rows past deadline: attempting → due auto-voids + alarms (backstop
  -- for the surface-guarantor; the transition fn owns the invariant).
  FOR r IN
    SELECT id FROM obligations
     WHERE status = 'filed' AND deadline IS NOT NULL
       AND deadline + (grace_minutes || ' minutes')::interval < now()
     LIMIT 200
  LOOP
    PERFORM obligation_transition(r.id, 'due', 'miss_processor');
  END LOOP;

  -- surfaced → due when the deadline passes (gate-checked inside).
  FOR r IN
    SELECT id FROM obligations
     WHERE status = 'surfaced' AND deadline IS NOT NULL AND deadline < now()
     LIMIT 200
  LOOP
    PERFORM obligation_transition(r.id, 'due', 'miss_processor');
  END LOOP;

  -- due → missed when grace has elapsed. Evidence = the source row itself
  -- (the unfulfilled decree/dose/etc IS the avoidance evidence). Requires
  -- the obligation to have been surfaced ≥ grace before the deadline —
  -- otherwise she never had real notice, and it voids instead.
  FOR r IN
    SELECT * FROM obligations
     WHERE status = 'due' AND deadline IS NOT NULL
       AND deadline + (grace_minutes || ' minutes')::interval < now()
     LIMIT 200
  LOOP
    IF r.surfaced_at IS NULL OR r.surfaced_at > r.deadline - (r.grace_minutes || ' minutes')::interval THEN
      -- Surfaced too late for a fair miss → void, alarm.
      PERFORM obligation_transition(r.id, 'voided', 'miss_processor_insufficient_notice');
      INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
      VALUES ('obligation_ledger', 'warning', 'obligation_voided_unsurfaced',
        'Obligation surfaced with less than grace-window notice — voided instead of missed.',
        jsonb_build_object('obligation_id', r.id, 'user_id', r.user_id, 'created_by', r.created_by));
      CONTINUE;
    END IF;
    v_ok := obligation_transition(r.id, 'missed', 'miss_processor', r.source_table, r.source_id);
    IF v_ok THEN
      v_missed := v_missed + 1;
      -- Punishment obligations are scored by the dodge recorder (3/4 pts),
      -- not double-counted here; hard_mode_exit carries no sub-penalties.
      CONTINUE WHEN r.kind IN ('punishment', 'hard_mode_exit');
      INSERT INTO escalation_events (user_id, kind, points, obligation_id, evidence, created_by)
      VALUES (r.user_id,
        CASE WHEN r.surfaced_via = 'seen_tap' THEN 'obligation_missed_acknowledged' ELSE 'obligation_missed_internal' END,
        CASE WHEN r.surfaced_via = 'seen_tap' THEN 3 ELSE 2 END,
        r.id,
        jsonb_build_object('source_table', r.source_table, 'source_id', r.source_id,
                           'deadline', r.deadline, 'surfaced_at', r.surfaced_at),
        'miss_processor');
    END IF;
  END LOOP;

  -- Escalating generators that broke their own surface path: 3 unsurfaced
  -- voids from the same generator in 7d → critical.
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  SELECT 'obligation_ledger', 'critical', 'generator_surface_path_broken',
         'Generator ' || sub.created_by || ' had ' || sub.n || ' obligations voided-unsurfaced in 7d — its surface path is broken.',
         jsonb_build_object('created_by', sub.created_by, 'voided_count', sub.n)
    FROM (
      SELECT o.created_by, COUNT(*) AS n
        FROM obligations o
       WHERE o.status = 'voided' AND o.cancelled_at > now() - interval '7 days'
         AND o.surfaced_at IS NULL
       GROUP BY o.created_by
      HAVING COUNT(*) >= 3
    ) sub
   WHERE NOT EXISTS (
     SELECT 1 FROM mommy_supervisor_log m
      WHERE m.event_kind = 'generator_surface_path_broken'
        AND m.context_data->>'created_by' = sub.created_by
        AND m.created_at > now() - interval '24 hours');

  RETURN v_missed;
END;
$$;

-- Dodge recorder — called by the force-processor (the ledger's server-side
-- arm). Points: dodge 1 = 3, dodge 2 (terminal) = 4.
CREATE OR REPLACE FUNCTION record_punishment_dodge(p_punishment UUID, p_dodge INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p RECORD; v_oblig UUID;
BEGIN
  IF p_dodge NOT IN (1, 2) THEN RETURN FALSE; END IF;  -- no third dodge exists
  SELECT id, user_id INTO v_p FROM punishment_queue WHERE id = p_punishment;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT id INTO v_oblig FROM obligations
   WHERE source_table = 'punishment_queue' AND source_id = p_punishment AND surfaced_at IS NOT NULL;
  IF v_oblig IS NULL THEN RETURN FALSE; END IF;        -- unsurfaced punishment can't score
  INSERT INTO escalation_events (user_id, kind, points, obligation_id, evidence, created_by)
  VALUES (v_p.user_id,
          CASE WHEN p_dodge = 1 THEN 'punishment_dodge_1' ELSE 'punishment_dodge_2' END,
          CASE WHEN p_dodge = 1 THEN 3 ELSE 4 END,
          v_oblig,
          jsonb_build_object('punishment_id', p_punishment, 'dodge', p_dodge),
          'force_processor');
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION record_punishment_dodge(UUID, INT) TO service_role;

-- Conditioning turned down without safeword — max 1/day countable.
CREATE OR REPLACE FUNCTION record_conditioning_turndown(p_user UUID, p_detail TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM escalation_events
              WHERE user_id = p_user AND kind = 'conditioning_turned_down'
                AND occurred_at > date_trunc('day', now())) THEN
    RETURN FALSE;
  END IF;
  INSERT INTO escalation_events (user_id, kind, points, evidence, created_by)
  VALUES (p_user, 'conditioning_turned_down', 2, jsonb_build_object('detail', p_detail), 'anti_circumvention');
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION record_conditioning_turndown(UUID, TEXT) TO service_role;

-- Organic-slip bridge: a genuine chat slip with quoted source text counts 1
-- point, max 2/day. Synthetic slips NEVER feed pressure directly — only
-- their missed obligations do.
CREATE OR REPLACE FUNCTION trg_organic_slip_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_synthetic, FALSE) THEN RETURN NEW; END IF;
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) = 0 THEN RETURN NEW; END IF;  -- no quote, no count
  IF (SELECT COUNT(*) FROM escalation_events
       WHERE user_id = NEW.user_id AND kind = 'organic_slip'
         AND occurred_at > date_trunc('day', now())) >= 2 THEN
    RETURN NEW;  -- max 2/day countable
  END IF;
  INSERT INTO escalation_events (user_id, kind, points, evidence, created_by)
  VALUES (NEW.user_id, 'organic_slip', 1,
          jsonb_build_object('slip_id', NEW.id, 'slip_type', NEW.slip_type,
                             'source_text', left(NEW.source_text, 300)),
          'slip_log_bridge');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS c_organic_slip_escalation ON slip_log;
CREATE TRIGGER c_organic_slip_escalation AFTER INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_organic_slip_escalation();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Hard Mode transitions — pressure from her actions only
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hard_mode_recompute(p_user UUID, p_reason TEXT DEFAULT 'scheduled_recompute')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active BOOLEAN;
  v_pressure NUMERIC;
  v_distinct_obligs INT;
  v_distinct_days INT;
  v_gate_mode TEXT;
  v_recent_events INT;
  v_transition UUID;
  v_miss_summary TEXT;
BEGIN
  SELECT hard_mode_active INTO v_active FROM user_state WHERE user_id = p_user;
  IF v_active IS NULL THEN RETURN jsonb_build_object('flipped', 'no_change', 'reason', 'no user_state'); END IF;

  v_pressure := pressure_score(p_user);
  SELECT COUNT(DISTINCT obligation_id), COUNT(DISTINCT date_trunc('day', occurred_at))
    INTO v_distinct_obligs, v_distinct_days
    FROM escalation_events
   WHERE user_id = p_user
     AND kind IN ('obligation_missed_internal','obligation_missed_acknowledged')
     AND obligation_id IS NOT NULL
     AND occurred_at > now() - interval '14 days';

  IF NOT v_active THEN
    SELECT g.mode INTO v_gate_mode FROM enforcement_gate(p_user) g;
    IF v_gate_mode IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('flipped', 'no_change', 'reason', 'gate ' || COALESCE(v_gate_mode, 'unknown'), 'pressure', v_pressure);
    END IF;
    IF v_pressure >= 10 AND v_distinct_obligs >= 2 AND v_distinct_days >= 2 THEN
      UPDATE user_state SET hard_mode_active = TRUE, hard_mode_entered_at = now() WHERE user_id = p_user;
      INSERT INTO hard_mode_transitions (user_id, transition, reason, slip_points_at_transition)
      VALUES (p_user, 'entered',
        'pressure ' || round(v_pressure, 1) || ' with ' || v_distinct_obligs ||
        ' evidence-linked missed obligations across ' || v_distinct_days || ' days (' || p_reason || ')',
        round(v_pressure)::INT)
      RETURNING id INTO v_transition;

      SELECT string_agg(left(o.ask_copy, 80), '; ') INTO v_miss_summary
        FROM escalation_events e JOIN obligations o ON o.id = e.obligation_id
       WHERE e.user_id = p_user AND e.kind LIKE 'obligation_missed%'
         AND e.occurred_at > now() - interval '14 days';

      -- Entry files its own obligation naming the misses and the exit.
      PERFORM file_obligation(p_user, 'hard_mode_transitions', v_transition, 'hard_mode_exit',
        'Hard Mode is on. You missed, with evidence: ' || COALESCE(v_miss_summary, 'multiple surfaced deadlines') ||
        '. The exit: an 800-word confession, 100 mantra recitations, and one proof-bearing decree of Mommy''s choice.',
        'No added penalty. Hard Mode stays on until the exit set is complete or pressure drains below 3 for 72 hours.',
        NULL, 30, 'internal', 'hard_mode_recompute', 'high');

      RETURN jsonb_build_object('flipped', 'on', 'pressure', v_pressure,
        'distinct_obligations', v_distinct_obligs, 'distinct_days', v_distinct_days);
    END IF;
    RETURN jsonb_build_object('flipped', 'no_change', 'pressure', v_pressure,
      'distinct_obligations', v_distinct_obligs, 'distinct_days', v_distinct_days);
  END IF;

  -- OFF path: pressure < 3 sustained 72h (no new events in 72h means the
  -- score only decayed the whole window). De-escalation-set completion is
  -- handled by the force-processor exit check.
  SELECT COUNT(*) INTO v_recent_events FROM escalation_events
   WHERE user_id = p_user AND occurred_at > now() - interval '72 hours';
  IF v_pressure < 3 AND v_recent_events = 0 THEN
    UPDATE user_state SET hard_mode_active = FALSE, hard_mode_exit_task_id = NULL WHERE user_id = p_user;
    INSERT INTO hard_mode_transitions (user_id, transition, reason)
    VALUES (p_user, 'exited', 'pressure ' || round(v_pressure, 1) || ' below 3 for 72h (' || p_reason || ')');
    RETURN jsonb_build_object('flipped', 'off', 'pressure', v_pressure);
  END IF;
  RETURN jsonb_build_object('flipped', 'no_change', 'pressure', v_pressure);
END;
$$;
GRANT EXECUTE ON FUNCTION hard_mode_recompute(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION hard_mode_recompute_all()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT user_id FROM user_state LOOP
    PERFORM hard_mode_recompute(r.user_id, 'scheduled_recompute');
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Mandated texts — compliance exempt by provenance
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_mandated_text(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(regexp_replace(lower(COALESCE(p_text, '')), '[^a-z0-9\s]', '', 'g'), '\s+', ' ', 'g'));
$$;

CREATE TABLE IF NOT EXISTS mandated_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_normalized TEXT NOT NULL,
  text_hash TEXT GENERATED ALWAYS AS (md5(text_normalized)) STORED,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('mantra','punishment_line','writing_lines','confession_prompt')),
  source_id UUID,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, text_hash)
);
ALTER TABLE mandated_texts ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY mandated_texts_self ON mandated_texts FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY mandated_texts_service ON mandated_texts FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS mandated_texts_user_active_idx ON mandated_texts(user_id) WHERE active;

-- TRUE when the normalized text IS a mandated line (hash) or CONTAINS one
-- as ≥60% of its content. Mirror: enforcement-core.ts isMandatedText().
CREATE OR REPLACE FUNCTION is_mandated_text(p_user UUID, p_text TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm TEXT;
BEGIN
  v_norm := normalize_mandated_text(p_text);
  IF v_norm IS NULL OR length(v_norm) < 3 THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM mandated_texts m
     WHERE m.user_id = p_user AND m.active
       AND (
         m.text_hash = md5(v_norm)
         OR (position(m.text_normalized IN v_norm) > 0
             AND length(m.text_normalized)::numeric / length(v_norm) >= 0.6)
       ));
END;
$$;
GRANT EXECUTE ON FUNCTION is_mandated_text(UUID, TEXT) TO authenticated, service_role;

-- Seeds: the known protocol-mandated lines (punishment TEMPLATES) + the
-- mantra ladder catalog. (Gina lines already gone — mig 624.)
INSERT INTO mandated_texts (user_id, text_normalized, source_kind)
SELECT us.user_id, normalize_mandated_text(t.line), 'punishment_line'
  FROM user_state us
 CROSS JOIN (VALUES
    ('I am Maxy. David is gone.'),
    ('David is gone.'),
    ('I am Maxy.')
  ) AS t(line)
ON CONFLICT (user_id, text_hash) DO NOTHING;

INSERT INTO mandated_texts (user_id, text_normalized, source_kind, source_id)
SELECT us.user_id, normalize_mandated_text(mm.text), 'mantra', mm.id
  FROM user_state us
 CROSS JOIN mommy_mantras mm
 WHERE mm.active
ON CONFLICT (user_id, text_hash) DO NOTHING;

-- Generation-site registration: any punishment that mandates a line/text
-- registers it, so exemption can't be forgotten.
CREATE OR REPLACE FUNCTION trg_punishment_register_mandated_text()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_line TEXT;
BEGIN
  FOREACH v_line IN ARRAY ARRAY[NEW.parameters->>'line', NEW.parameters->>'text'] LOOP
    IF v_line IS NOT NULL AND length(normalize_mandated_text(v_line)) >= 3 THEN
      INSERT INTO mandated_texts (user_id, text_normalized, source_kind, source_id)
      VALUES (NEW.user_id, normalize_mandated_text(v_line),
              CASE WHEN NEW.punishment_type = 'writing_lines' THEN 'writing_lines' ELSE 'punishment_line' END,
              NEW.id)
      ON CONFLICT (user_id, text_hash) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS z_punishment_register_mandated_text ON punishment_queue;
CREATE TRIGGER z_punishment_register_mandated_text AFTER INSERT ON punishment_queue
  FOR EACH ROW EXECUTE FUNCTION trg_punishment_register_mandated_text();

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Provenance tagging + suppress-triggers
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE slip_log ADD COLUMN IF NOT EXISTS capture_context TEXT;
ALTER TABLE identity_erosion_log ADD COLUMN IF NOT EXISTS capture_context TEXT;
ALTER TABLE shame_journal ADD COLUMN IF NOT EXISTS capture_context TEXT;
ALTER TABLE confession_queue ADD COLUMN IF NOT EXISTS capture_context TEXT;

-- Never punish forced-phrase compliance: a slip quoting a mandated line, or
-- any row born from a protocol-UI compliance submission, is suppressed —
-- loudly, so a miscalibrated detector is visible.
-- (Named a_* so it runs BEFORE the b_* chokepoint alphabetically.)
CREATE OR REPLACE FUNCTION trg_slip_compliance_suppress()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.capture_context = 'compliance_submission'
     OR (NEW.source_text IS NOT NULL AND is_mandated_text(NEW.user_id, NEW.source_text)) THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('slip_compliance_suppress', 'warning', 'compliance_punishment_prevented',
      'Slip suppressed: text is protocol-mandated or came from a compliance submission. Compliance can''t be a slip.',
      jsonb_build_object('user_id', NEW.user_id, 'slip_type', NEW.slip_type,
                         'source_text', left(COALESCE(NEW.source_text,''), 200),
                         'capture_context', NEW.capture_context));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS a_slip_compliance_suppress ON slip_log;
CREATE TRIGGER a_slip_compliance_suppress BEFORE INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_slip_compliance_suppress();

CREATE OR REPLACE FUNCTION trg_erosion_compliance_suppress()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.capture_context = 'compliance_submission'
     OR (NEW.description IS NOT NULL AND is_mandated_text(NEW.user_id, NEW.description)) THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('erosion_compliance_suppress', 'warning', 'compliance_punishment_prevented',
      'Identity-erosion row suppressed: text is protocol-mandated or a compliance submission.',
      jsonb_build_object('user_id', NEW.user_id, 'erosion_type', NEW.erosion_type,
                         'description', left(COALESCE(NEW.description,''), 200),
                         'capture_context', NEW.capture_context));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS a_erosion_compliance_suppress ON identity_erosion_log;
CREATE TRIGGER a_erosion_compliance_suppress BEFORE INSERT ON identity_erosion_log
  FOR EACH ROW EXECUTE FUNCTION trg_erosion_compliance_suppress();

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Crons
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('obligation-miss-processor');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.schedule('obligation-miss-processor', '*/10 * * * *',
    'SELECT obligation_miss_processor();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '628: miss-processor cron skipped (pg_cron unavailable): %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('hard-mode-recompute');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.schedule('hard-mode-recompute', '*/30 * * * *',
    'SELECT hard_mode_recompute_all();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '628: hard-mode recompute cron skipped (pg_cron unavailable): %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
