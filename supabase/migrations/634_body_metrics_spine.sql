-- 634 — one measurement spine (FEM §4, §5 storage half).
--
-- Canonical: body_metrics, metric units. The legacy 058 imperial
-- body_measurements table is renamed to zz_legacy_body_measurements (data
-- preserved) and replaced with a compatibility VIEW; a second VIEW,
-- body_measurement_log, gives the phantom writers (MeasurementEntry,
-- useTodayData, handler-context-builders, witness-fabrication-scheduler)
-- the metric shape they always expected. INSTEAD OF INSERT triggers route
-- both views into body_metrics — the silently-failing inserts start
-- working with ZERO client changes.
--
-- WHR note: 058 stored hips/waist ("hip_waist_ratio"); canonical is
-- waist/hips. The legacy view re-inverts for legacy readers.
--
-- Also: transition_tracking_log gains fulfillment provenance columns +
-- the collapsed 'measurements' type; fulfillment triggers write the log
-- (decree fulfilled → log; body_metrics insert → log + auto-fulfill
-- measurement tracking decrees); plausibility gate flags implausible
-- rows (>8cm single-dimension jump, exact-repeat ×3) as evidence_required
-- so fulfillment holds until a tape photo lands.
--
-- Plus: DB-side Mommy unit-scrub parity (cm/in/kg/lbs never reach Mommy
-- copy) — wraps mommy_voice_cleanup at the three 259 trigger chokepoints.

-- ─── 1. Canonical table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric(5,2), waist_cm numeric(5,2), hips_cm numeric(5,2),
  chest_cm numeric(5,2), underbust_cm numeric(5,2), thigh_cm numeric(5,2),
  neck_cm numeric(5,2), shoulders_cm numeric(5,2),
  waist_hip_ratio numeric GENERATED ALWAYS AS
    (CASE WHEN hips_cm > 0 THEN round(waist_cm / hips_cm, 3) END) STORED,
  source text NOT NULL CHECK (source IN ('focus_task','handler_chat','card','decree_fulfillment','backfill')),
  evidence_path text, notes text,
  -- Anti-circumvention (§4): set by the plausibility gate; auto-fulfillment
  -- holds while true and evidence_path is empty.
  evidence_required boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_body_metrics_user_time
  ON body_metrics (user_id, measured_at DESC);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_metrics_owner ON body_metrics;
CREATE POLICY body_metrics_owner ON body_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS body_metrics_service ON body_metrics;
CREATE POLICY body_metrics_service ON body_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. Plausibility gate (BEFORE INSERT) ───────────────────────────
-- >8cm single-dimension jump vs the user's latest prior row, or the same
-- exact dimension set repeated 3× in a row → evidence_required. Insert
-- always lands (the record is real either way); only auto-FULFILLMENT
-- holds. Backfill rows are exempt (historical).

CREATE OR REPLACE FUNCTION trg_body_metrics_plausibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  prev RECORD;
  repeat_count INT;
BEGIN
  IF NEW.source = 'backfill' THEN RETURN NEW; END IF;

  SELECT * INTO prev FROM body_metrics
   WHERE user_id = NEW.user_id AND source <> 'backfill'
   ORDER BY measured_at DESC LIMIT 1;

  IF FOUND THEN
    IF (NEW.waist_cm IS NOT NULL AND prev.waist_cm IS NOT NULL AND abs(NEW.waist_cm - prev.waist_cm) > 8)
    OR (NEW.hips_cm IS NOT NULL AND prev.hips_cm IS NOT NULL AND abs(NEW.hips_cm - prev.hips_cm) > 8)
    OR (NEW.chest_cm IS NOT NULL AND prev.chest_cm IS NOT NULL AND abs(NEW.chest_cm - prev.chest_cm) > 8)
    OR (NEW.underbust_cm IS NOT NULL AND prev.underbust_cm IS NOT NULL AND abs(NEW.underbust_cm - prev.underbust_cm) > 8)
    OR (NEW.thigh_cm IS NOT NULL AND prev.thigh_cm IS NOT NULL AND abs(NEW.thigh_cm - prev.thigh_cm) > 8)
    OR (NEW.neck_cm IS NOT NULL AND prev.neck_cm IS NOT NULL AND abs(NEW.neck_cm - prev.neck_cm) > 8)
    OR (NEW.shoulders_cm IS NOT NULL AND prev.shoulders_cm IS NOT NULL AND abs(NEW.shoulders_cm - prev.shoulders_cm) > 8)
    THEN
      NEW.evidence_required := true;
    END IF;

    -- Exact-repeat ×3: the two latest prior rows carry the identical
    -- dimension tuple this row carries → this is the third copy.
    SELECT count(*) INTO repeat_count FROM (
      SELECT waist_cm, hips_cm, chest_cm, weight_kg FROM body_metrics
       WHERE user_id = NEW.user_id AND source <> 'backfill'
       ORDER BY measured_at DESC LIMIT 2
    ) last2
    WHERE last2.waist_cm IS NOT DISTINCT FROM NEW.waist_cm
      AND last2.hips_cm IS NOT DISTINCT FROM NEW.hips_cm
      AND last2.chest_cm IS NOT DISTINCT FROM NEW.chest_cm
      AND last2.weight_kg IS NOT DISTINCT FROM NEW.weight_kg;
    IF repeat_count >= 2 THEN
      NEW.evidence_required := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS body_metrics_plausibility ON body_metrics;
CREATE TRIGGER body_metrics_plausibility
  BEFORE INSERT ON body_metrics
  FOR EACH ROW EXECUTE FUNCTION trg_body_metrics_plausibility();

-- ─── 3. Backfill from the legacy table, then swap in the views ──────
-- Handles BOTH possible live shapes (058 imperial won the CREATE race in
-- committed history, but be robust): imperial → ×2.54 / ×0.4536.

DO $do$
BEGIN
  IF to_regclass('public.body_measurements') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'body_measurements'
                   AND table_type = 'BASE TABLE') THEN

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'body_measurements'
                 AND column_name = 'waist_inches') THEN
      -- 058 imperial shape
      INSERT INTO body_metrics (user_id, measured_at, weight_kg, waist_cm, hips_cm, thigh_cm, shoulders_cm, source, notes)
      SELECT user_id, COALESCE(measured_at, now()),
             round((weight_lbs * 0.4536)::numeric, 2),
             round((waist_inches * 2.54)::numeric, 2),
             round((hips_inches * 2.54)::numeric, 2),
             round((COALESCE(thigh_left_inches, thigh_right_inches) * 2.54)::numeric, 2),
             round((shoulders_inches * 2.54)::numeric, 2),
             'backfill', notes
        FROM body_measurements
       WHERE COALESCE(waist_inches, hips_inches, weight_lbs, thigh_left_inches, shoulders_inches) IS NOT NULL;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'body_measurements'
                    AND column_name = 'waist_cm') THEN
      -- 227 metric shape (defensive — only if 058 never applied)
      INSERT INTO body_metrics (user_id, measured_at, weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm, source, notes)
      SELECT user_id, COALESCE(measured_at, now()),
             weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm, 'backfill', notes
        FROM body_measurements
       WHERE COALESCE(waist_cm, hips_cm, weight_kg, chest_cm) IS NOT NULL;
    END IF;

    -- Rename (data preserved) rather than DROP: RLS policies, indexes and
    -- any unknown FK references ride along with the rename; nothing is lost
    -- if an unexpected dependent exists.
    ALTER TABLE body_measurements RENAME TO zz_legacy_body_measurements;
  END IF;
END $do$;

-- ─── 4. Compatibility view: body_measurements ───────────────────────
-- Exposes BOTH the 058 imperial columns (hips_inches …, hip_waist_ratio =
-- hips/waist — legacy inversion) AND the metric columns some readers
-- (handler-context-builders, BodyMeasurementCard history) already select.

CREATE OR REPLACE VIEW body_measurements AS
SELECT
  id, user_id, measured_at, notes,
  round((hips_cm / 2.54)::numeric, 2)  AS hips_inches,
  round((waist_cm / 2.54)::numeric, 2) AS waist_inches,
  CASE WHEN waist_cm > 0 THEN round((hips_cm / waist_cm)::numeric, 3) END AS hip_waist_ratio,
  round((thigh_cm / 2.54)::numeric, 2) AS thigh_left_inches,
  round((thigh_cm / 2.54)::numeric, 2) AS thigh_right_inches,
  round((shoulders_cm / 2.54)::numeric, 2) AS shoulders_inches,
  round((weight_kg / 0.4536)::numeric, 2) AS weight_lbs,
  weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm,
  measured_at AS created_at
FROM body_metrics;

-- NOT security definer: the insert into body_metrics runs as the invoker so
-- RLS still forbids spoofing another user_id through the view.
CREATE OR REPLACE FUNCTION trg_body_measurements_view_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  INSERT INTO body_metrics (user_id, measured_at, weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm, shoulders_cm, source, notes)
  VALUES (
    NEW.user_id,
    COALESCE(NEW.measured_at, now()),
    COALESCE(NEW.weight_kg, round((NEW.weight_lbs * 0.4536)::numeric, 2)),
    COALESCE(NEW.waist_cm,  round((NEW.waist_inches * 2.54)::numeric, 2)),
    COALESCE(NEW.hips_cm,   round((NEW.hips_inches * 2.54)::numeric, 2)),
    NEW.chest_cm,
    COALESCE(NEW.thigh_cm,  round((COALESCE(NEW.thigh_left_inches, NEW.thigh_right_inches) * 2.54)::numeric, 2)),
    NEW.neck_cm,
    round((NEW.shoulders_inches * 2.54)::numeric, 2),
    'card',
    NEW.notes
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS body_measurements_view_insert ON body_measurements;
CREATE TRIGGER body_measurements_view_insert
  INSTEAD OF INSERT ON body_measurements
  FOR EACH ROW EXECUTE FUNCTION trg_body_measurements_view_insert();

-- ─── 5. Compatibility view: body_measurement_log ────────────────────
-- The metric shape the phantom writers/readers expect. body_fat_pct is
-- accepted on INSERT (folded into notes — body_metrics doesn't carry it)
-- and exposed as NULL on read.

CREATE OR REPLACE VIEW body_measurement_log AS
SELECT
  id, user_id, measured_at,
  weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm,
  NULL::numeric AS body_fat_pct,
  notes,
  measured_at AS created_at
FROM body_metrics;

CREATE OR REPLACE FUNCTION trg_body_measurement_log_view_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  INSERT INTO body_metrics (user_id, measured_at, weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm, source, notes)
  VALUES (
    NEW.user_id,
    COALESCE(NEW.measured_at, now()),
    NEW.weight_kg, NEW.waist_cm, NEW.hips_cm, NEW.chest_cm, NEW.thigh_cm, NEW.neck_cm,
    'handler_chat',
    CASE WHEN NEW.body_fat_pct IS NOT NULL
         THEN COALESCE(NEW.notes || ' · ', '') || 'body fat ' || NEW.body_fat_pct || '%'
         ELSE NEW.notes END
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS body_measurement_log_view_insert ON body_measurement_log;
CREATE TRIGGER body_measurement_log_view_insert
  INSTEAD OF INSERT ON body_measurement_log
  FOR EACH ROW EXECUTE FUNCTION trg_body_measurement_log_view_insert();

-- Views are owner-invoked; grant the app roles passage. RLS on body_metrics
-- still applies through security_invoker=false definer functions above, so
-- pin the views to security_invoker to keep auth.uid() scoping on reads.
ALTER VIEW body_measurements SET (security_invoker = true);
ALTER VIEW body_measurement_log SET (security_invoker = true);
GRANT SELECT, INSERT ON body_measurements TO authenticated, service_role;
GRANT SELECT, INSERT ON body_measurement_log TO authenticated, service_role;

-- ─── 6. Trend view (28d deltas + WHR slope) ─────────────────────────

CREATE OR REPLACE VIEW body_metrics_trend AS
WITH latest AS (
  SELECT DISTINCT ON (user_id) * FROM body_metrics
  ORDER BY user_id, measured_at DESC
),
prior AS (
  SELECT DISTINCT ON (bm.user_id) bm.* FROM body_metrics bm
  JOIN latest l ON l.user_id = bm.user_id
  WHERE bm.measured_at <= l.measured_at - interval '21 days'
  ORDER BY bm.user_id, bm.measured_at DESC
)
SELECT
  l.user_id,
  l.measured_at AS latest_at,
  p.measured_at AS prior_at,
  l.waist_cm, l.hips_cm, l.chest_cm, l.weight_kg, l.waist_hip_ratio,
  round((l.waist_cm - p.waist_cm)::numeric, 2)   AS waist_delta_cm,
  round((l.hips_cm - p.hips_cm)::numeric, 2)     AS hips_delta_cm,
  round((l.chest_cm - p.chest_cm)::numeric, 2)   AS chest_delta_cm,
  round((l.weight_kg - p.weight_kg)::numeric, 2) AS weight_delta_kg,
  round((l.waist_hip_ratio - p.waist_hip_ratio)::numeric, 3) AS whr_delta
FROM latest l
LEFT JOIN prior p ON p.user_id = l.user_id;

ALTER VIEW body_metrics_trend SET (security_invoker = true);
GRANT SELECT ON body_metrics_trend TO authenticated, service_role;

-- ─── 7. transition_tracking_log: provenance + collapsed type ────────

ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS evidence_path TEXT;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS decree_id UUID;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS source_table TEXT;
ALTER TABLE transition_tracking_log ADD COLUMN IF NOT EXISTS source_id UUID;

-- Widen the tracking_type CHECK: legacy values stay valid, 'measurements'
-- (the collapsed tape session) joins them.
ALTER TABLE transition_tracking_log DROP CONSTRAINT IF EXISTS transition_tracking_log_tracking_type_check;
ALTER TABLE transition_tracking_log ADD CONSTRAINT transition_tracking_log_tracking_type_check
  CHECK (tracking_type IN (
    'body_photo','face_photo','voice_sample','pitch_measurement',
    'measurement_chest','measurement_waist','measurement_hip','measurement_other',
    'measurements','wardrobe_check','name_use_log'
  ));

CREATE INDEX IF NOT EXISTS idx_transition_tracking_decree
  ON transition_tracking_log (decree_id) WHERE decree_id IS NOT NULL;

-- ─── 8. Fulfillment writers ─────────────────────────────────────────

-- 8a. Decree fulfilled → log row (the log is written by fulfillment).
CREATE OR REPLACE FUNCTION trg_tracking_log_on_decree_fulfilled()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_type TEXT;
BEGIN
  IF NEW.status = 'fulfilled' AND COALESCE(OLD.status, '') <> 'fulfilled'
     AND NEW.trigger_source LIKE 'transition_tracking:%' THEN
    v_type := split_part(NEW.trigger_source, ':', 2);
    -- Collapse legacy per-dimension measurement decrees into the one type.
    IF v_type LIKE 'measurement%' THEN v_type := 'measurements'; END IF;
    IF v_type = '' THEN RETURN NEW; END IF;
    INSERT INTO transition_tracking_log (user_id, tracking_type, recorded_at, decree_id, source_table, source_id)
    SELECT NEW.user_id, v_type, COALESCE(NEW.fulfilled_at, now()), NEW.id, 'handler_decrees', NEW.id
    WHERE NOT EXISTS (
      SELECT 1 FROM transition_tracking_log WHERE decree_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tracking_log_on_decree_fulfilled ON handler_decrees;
CREATE TRIGGER tracking_log_on_decree_fulfilled
  AFTER UPDATE ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_tracking_log_on_decree_fulfilled();

-- 8b. body_metrics insert → log 'measurements' + auto-fulfill any active
-- measurement tracking decree. Measuring IS fulfilling — closes the
-- punishes-completed-work gap. Fulfillment HOLDS when the plausibility
-- gate demanded evidence and none is attached.
CREATE OR REPLACE FUNCTION trg_tracking_log_on_body_metric()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.source = 'backfill' THEN RETURN NEW; END IF;

  INSERT INTO transition_tracking_log (user_id, tracking_type, recorded_at, evidence_path, source_table, source_id)
  VALUES (NEW.user_id, 'measurements', NEW.measured_at, NEW.evidence_path, 'body_metrics', NEW.id);

  IF NOT (NEW.evidence_required AND NEW.evidence_path IS NULL) THEN
    UPDATE handler_decrees
       SET status = 'fulfilled', fulfilled_at = now()
     WHERE user_id = NEW.user_id
       AND status = 'active'
       AND trigger_source LIKE 'transition_tracking:measurement%';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tracking_log_on_body_metric ON body_metrics;
CREATE TRIGGER tracking_log_on_body_metric
  AFTER INSERT ON body_metrics
  FOR EACH ROW EXECUTE FUNCTION trg_tracking_log_on_body_metric();

-- ─── 9. One-time backfills (nothing starts perpetually due) ──────────

-- Fulfilled tracking decrees → log rows.
INSERT INTO transition_tracking_log (user_id, tracking_type, recorded_at, decree_id, source_table, source_id)
SELECT d.user_id,
       CASE WHEN split_part(d.trigger_source, ':', 2) LIKE 'measurement%' THEN 'measurements'
            ELSE split_part(d.trigger_source, ':', 2) END,
       COALESCE(d.fulfilled_at, d.created_at, now()),
       d.id, 'handler_decrees', d.id
  FROM handler_decrees d
 WHERE d.status = 'fulfilled'
   AND d.trigger_source LIKE 'transition_tracking:%'
   AND split_part(d.trigger_source, ':', 2) <> ''
   AND NOT EXISTS (SELECT 1 FROM transition_tracking_log t WHERE t.decree_id = d.id);

-- body_metrics backfill rows → 'measurements' log entries.
INSERT INTO transition_tracking_log (user_id, tracking_type, recorded_at, source_table, source_id)
SELECT bm.user_id, 'measurements', bm.measured_at, 'body_metrics', bm.id
  FROM body_metrics bm
 WHERE bm.source = 'backfill'
   AND NOT EXISTS (
     SELECT 1 FROM transition_tracking_log t
      WHERE t.source_table = 'body_metrics' AND t.source_id = bm.id
   );

-- ─── 10. Mommy unit-scrub parity (DB side) ──────────────────────────
-- TS copies gain a \d+(cm|in|kg|lbs) scrub (measurementDeltaToPhrase et al);
-- the DB trigger chokepoint must match. Rather than re-emit the 200-line
-- mommy_voice_cleanup body, wrap it: scrub units after the main cleanup at
-- the three 259 trigger fns.

CREATE OR REPLACE FUNCTION mommy_scrub_units(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := input;
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;
  -- "83.5 cm" / "33in" / "89 kg" / "196 lbs" — measurement telemetry.
  t := regexp_replace(t, '\m\d+(\.\d+)?\s?(cm|in|kg|lbs)\M', '', 'gi');
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  RETURN trim(t);
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.message IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.message := mommy_scrub_units(mommy_voice_cleanup(NEW.message));
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_edict()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.edict IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.edict := mommy_scrub_units(mommy_voice_cleanup(NEW.edict));
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_prompt()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.prompt IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.prompt := mommy_scrub_units(mommy_voice_cleanup(NEW.prompt));
  END IF;
  RETURN NEW;
END;
$fn$;
