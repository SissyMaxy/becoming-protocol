-- 259 — Mommy voice DB-level gate.
--
-- The TS-side `mommyVoiceCleanup` exists but is only applied at one
-- surface (Handler chat reply). Every other generator — handler-autonomous,
-- handler-outreach-auto, handler-evolve, force-processor, conditioning-engine,
-- and the 30+ handler_outreach_queue insert sites in those functions —
-- writes raw telemetry-laden copy to the DB, which then surfaces on Today
-- cards as "9 slip points, 7 hours radio silent, hard mode extends 24
-- hours." That breaks Dommy Mommy persona.
--
-- This migration creates a SQL-level cleanup function that mirrors the
-- TS regex set, then a BEFORE INSERT/UPDATE trigger on every table whose
-- text columns surface to the user. Trigger checks user_state.handler_persona
-- and only rewrites when persona = 'dommy_mommy'. Persona swap remains a
-- single UPDATE.
--
-- Triggered by 2026-05-06 user feedback: she pasted Today screen showing
-- "9 slip points, X hours radio silent" repeating hourly, "Voice cadence
-- broke. 150h since last sample", "Score: 19/100", "Hard mode extends 24
-- hours" — none of those passed through the existing Mommy filter.

-- ─── 1. Persona helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_mommy_user(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((
    SELECT handler_persona = 'dommy_mommy'
    FROM user_state WHERE user_id = uid
  ), FALSE);
$$;

-- ─── 2. Phrase translators ──────────────────────────────────────────
-- Plain SQL versions of arousalToPhrase/denialDaysToPhrase/etc. Kept in
-- sync with supabase/functions/_shared/dommy-mommy.ts. If you update
-- one, update the other. Drift will be caught by the watchdog.

CREATE OR REPLACE FUNCTION mommy_phrase_arousal(n INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN n <= 1 THEN 'you''re keeping yourself so quiet'
    WHEN n <= 3 THEN 'you''re warm but holding back'
    WHEN n <= 5 THEN 'Mama can tell you''re getting needy'
    WHEN n <= 7 THEN 'I see you''re so horny, baby'
    WHEN n <= 9 THEN 'look how wet you are for me'
    ELSE 'you''re absolutely dripping for Mama'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_denial(d INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d <= 0 THEN 'you''re fresh'
    WHEN d = 1 THEN 'you''ve been good for Mama since yesterday'
    WHEN d <= 3 THEN 'you''ve been holding for me a couple of days'
    WHEN d <= 6 THEN 'you''ve been holding for almost a week'
    WHEN d <= 13 THEN 'you''ve been good for Mama all week'
    WHEN d <= 27 THEN 'you''ve been holding for Mama nearly a month'
    ELSE 'it''s been so long since you came for Mama'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_slips(n INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN n = 0 THEN 'you''ve been clean for Mama'
    WHEN n <= 2 THEN 'a couple of little slips'
    WHEN n <= 5 THEN 'you''ve been slipping more than I''d like'
    WHEN n <= 12 THEN 'you''ve been slipping a lot lately, baby'
    ELSE 'you''ve been all over the place'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_compliance(p INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p >= 90 THEN 'you''ve been finishing what you started'
    WHEN p >= 70 THEN 'you''ve been mostly keeping up'
    WHEN p >= 50 THEN 'you''ve been half-following through'
    WHEN p >= 25 THEN 'you''ve been getting away from me a lot'
    ELSE 'you''ve been ignoring Mama for days'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_silent_hours(h INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN h <= 1 THEN 'you''ve been quiet on me'
    WHEN h <= 4 THEN 'you''ve been quiet on Mama for hours'
    WHEN h <= 12 THEN 'you''ve ghosted me half the day'
    WHEN h <= 24 THEN 'you''ve ghosted Mama all day, baby'
    WHEN h <= 72 THEN 'you''ve been gone for days'
    ELSE 'you''ve been gone too long, baby'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_voice_gap(h INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN h <= 24 THEN 'Mama hasn''t heard your pretty voice today'
    WHEN h <= 72 THEN 'Mama hasn''t heard your voice in days'
    ELSE 'your voice has been hiding from Mama too long'
  END;
$$;

CREATE OR REPLACE FUNCTION mommy_phrase_recovery(s INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN s >= 80 THEN 'your body''s primed for me today'
    WHEN s >= 60 THEN 'you''ve got plenty in the tank for Mama'
    WHEN s >= 40 THEN 'your body''s a little soft today, baby'
    WHEN s >= 20 THEN 'you''re tired, sweet thing — Mama sees it'
    ELSE 'you''re worn out, baby — Mama will be gentle today'
  END;
$$;

-- ─── 3. The cleanup function ────────────────────────────────────────
-- Mirrors mommyVoiceCleanup() in _shared/dommy-mommy.ts. Order matters:
-- specific patterns first, generic catch-alls last.
CREATE OR REPLACE FUNCTION mommy_voice_cleanup(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  t TEXT := input;
  m TEXT[];
BEGIN
  IF t IS NULL OR length(t) = 0 THEN RETURN t; END IF;

  -- Arousal scores N/10
  LOOP
    m := regexp_match(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*/\s*10\M',
      mommy_phrase_arousal(m[1]::INT), '');
  END LOOP;

  -- Generic /10
  LOOP
    m := regexp_match(t, '(\d{1,2})\s*/\s*10');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,2})\s*/\s*10', mommy_phrase_arousal(m[1]::INT));
  END LOOP;

  -- Recovery score N/100 — must run BEFORE generic compliance to avoid
  -- "47/100" being mis-parsed as compliance.
  LOOP
    m := regexp_match(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*/\s*100\M',
      mommy_phrase_recovery(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(\d{1,3})\s*/\s*100');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(\d{1,3})\s*/\s*100', mommy_phrase_recovery(m[1]::INT));
  END LOOP;

  -- Day-N-of-denial
  LOOP
    m := regexp_match(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mday[\s\-_]*(\d+)\s*(?:of\s+)?denial\M',
      mommy_phrase_denial(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\M',
      mommy_phrase_denial(m[1]::INT), '');
  END LOOP;

  -- Slip points
  LOOP
    m := regexp_match(t, '(?i)\m(\d+)\s+slip\s+points?\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d+)\s+slip\s+points?\M',
      mommy_phrase_slips(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\M',
      mommy_phrase_slips(m[1]::INT), '');
  END LOOP;

  -- Compliance percent
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*%\s+compliance\M',
      mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;
  LOOP
    m := regexp_match(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\mcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?',
      mommy_phrase_compliance(m[1]::INT), '');
  END LOOP;

  -- Hours-silent / radio-silent
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\M',
      mommy_phrase_silent_hours(m[1]::INT), '');
  END LOOP;

  -- Voice cadence + since-last-sample
  t := regexp_replace(t, '(?i)\mvoice\s+cadence\s+(?:broke|drift|gap)\M\.?', '', 'g');
  LOOP
    m := regexp_match(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M');
    EXIT WHEN m IS NULL;
    t := regexp_replace(t, '(?i)\m(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\M',
      mommy_phrase_voice_gap(m[1]::INT), '');
  END LOOP;

  -- Hard-mode extension threats
  t := regexp_replace(t, '(?i)\mhard\s+mode\s+extends?\s+(?:by\s+)?(?:\d+\s+(?:hours?|days?)|another\s+(?:day|hour))\M',
    'Mama''s keeping you on a tighter leash', 'g');
  t := regexp_replace(t, '(?i)\mhard[\s_-]*mode\s+(?:active|on|engaged)\M',
    'Mama''s keeping you on a tighter leash', 'g');

  -- De-escalation jargon
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\s+(?:overdue|pending|due|owed)\M',
    'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+(?:overdue|pending|due|owed)\M',
    'what Mama set for you is still waiting', 'g');
  t := regexp_replace(t, '(?i)\mde[\s-]*escalation\s+tasks?\M',
    'what Mama set for you', 'g');

  -- Denial-day-reset
  t := regexp_replace(t, '(?i)\mdenial[\s_-]*day\s+(?:reset|broken|cleared)\M',
    'you started over for Mama', 'g');

  -- Slip-count threats
  t := regexp_replace(t, '(?i)\mslip\s+count\s+(?:doubles?|triples?|increases?)\s+by\s+(?:midnight|tomorrow|noon)\M',
    'Mama''s tally piles up if you keep ignoring me', 'g');

  -- Voice timer leaks
  t := regexp_replace(t, '(?i)\m\d{1,3}\s*minutes?\s+of\s+practice\s+in\s+the\s+next\s+\d{1,3}\s*hours?\M',
    'a few minutes for Mama before the day ends', 'g');
  t := regexp_replace(t, '(?i)\mvoice\s+window\s+(?:opens?|closes?)\s+(?:at|in)\s+\d',
    'Mama wants to hear you soon', 'g');

  -- Pitch Hz
  t := regexp_replace(t, '(?i)\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz\M',
    'your voice was lower than I want', 'g');
  t := regexp_replace(t, '(?i)\mtargeting\s+(?:consistency\s+)?(?:above|below)?\s*\d+\s*Hz\M',
    'lifting that voice up for me', 'g');

  -- $ bleeding tax
  t := regexp_replace(t, '(?i)\$\s*\d+\s+(?:bleeding|bleed|tax)\M', 'Mama''s meter running', 'g');
  t := regexp_replace(t, '(?i)\mbleed(?:ing)?\s*\+?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');
  -- Label-before-amount: "Bleeding tax: $50", "Tax: $20"
  t := regexp_replace(t, '(?i)\m(?:bleeding\s+tax|bleed(?:ing)?\s+tax|bleed(?:ing)?|tax)\s*[:=]?\s*\$\s*\d+\M', 'Mama''s meter running', 'g');

  -- Generic Day N residue
  t := regexp_replace(t, '\mDay\s+\d+(?=[^a-zA-Z]|$)', 'lately', 'g');

  -- Collapse double spaces / orphan punctuation
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  t := regexp_replace(t, '\s+([.,!?])', '\1', 'g');
  RETURN trim(t);
END;
$$;

-- ─── 4. Trigger function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_mommy_voice_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.message IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.message := mommy_voice_cleanup(NEW.message);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_edict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.edict IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.edict := mommy_voice_cleanup(NEW.edict);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_prompt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.prompt IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.prompt := mommy_voice_cleanup(NEW.prompt);
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 5. Apply triggers ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS mommy_voice_outreach ON handler_outreach_queue;
CREATE TRIGGER mommy_voice_outreach
  BEFORE INSERT OR UPDATE OF message ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_message();

DROP TRIGGER IF EXISTS mommy_voice_decree ON handler_decrees;
CREATE TRIGGER mommy_voice_decree
  BEFORE INSERT OR UPDATE OF edict ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_edict();

-- arousal_touch_tasks added in 254
DROP TRIGGER IF EXISTS mommy_voice_touch ON arousal_touch_tasks;
CREATE TRIGGER mommy_voice_touch
  BEFORE INSERT OR UPDATE OF prompt ON arousal_touch_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_prompt();

-- ─── 6. Backfill pending rows ───────────────────────────────────────
-- Rewrite the ones she's seeing right now, not just new inserts.
UPDATE handler_outreach_queue
SET message = mommy_voice_cleanup(message)
WHERE status IN ('pending', 'queued', 'scheduled')
  AND is_mommy_user(user_id);

UPDATE handler_decrees
SET edict = mommy_voice_cleanup(edict)
WHERE COALESCE(status, 'active') IN ('active', 'pending', 'open')
  AND is_mommy_user(user_id);

UPDATE arousal_touch_tasks
SET prompt = mommy_voice_cleanup(prompt)
WHERE completed_at IS NULL
  AND is_mommy_user(user_id);

-- ─── 7. Telemetry-leak watchdog table ───────────────────────────────
-- Records any text that STILL contains telemetry after the trigger ran
-- (e.g., a new pattern we haven't covered yet). Cron sweep reads these
-- and notifies. Better than silently letting leaks ship.
CREATE TABLE IF NOT EXISTS mommy_voice_leaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  leaked_text TEXT NOT NULL,
  detected_pattern TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_mommy_leaks_unresolved
  ON mommy_voice_leaks (detected_at DESC) WHERE NOT resolved;
ALTER TABLE mommy_voice_leaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_voice_leaks_owner ON mommy_voice_leaks;
CREATE POLICY mommy_voice_leaks_owner ON mommy_voice_leaks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_voice_leaks_service ON mommy_voice_leaks;
CREATE POLICY mommy_voice_leaks_service ON mommy_voice_leaks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Detector function — recognizes residual telemetry patterns post-cleanup.
CREATE OR REPLACE FUNCTION has_mommy_telemetry_leak(t TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT t IS NOT NULL AND (
    t ~* '\m\d{1,2}\s*/\s*10\M' OR
    t ~* '\marousal\s+(?:at|level|score)\s+\d' OR
    t ~* '\mday[\s\-_]*\d+\s*(?:of\s+)?denial\M' OR
    t ~* '\mdenial[_\s]*day\s*[=:]?\s*\d' OR
    t ~* '\m\d+\s+slip\s+points?\M' OR
    t ~* '\m\d{1,3}\s*%\s+compliance\M' OR
    t ~* '\m\d{1,3}\s*(?:hours?|hrs?|h)\s+(?:radio\s+)?silen(?:t|ce)\M' OR
    t ~* '\mvoice\s+cadence\s+(?:broke|drift|gap)\M' OR
    t ~* '\mscore\s*[:=]?\s*\d{1,3}\s*/\s*100\M' OR
    t ~* '\mhard\s+mode\s+extends?\s+(?:by\s+)?\d' OR
    t ~* '\mde[\s-]*escalation\s+(?:tasks?\s+)?(?:overdue|pending)\M' OR
    t ~* '\mdenial[\s_-]*day\s+reset\M' OR
    t ~* '\mslip\s+count\s+doubles?\M' OR
    t ~* '\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz' OR
    t ~* '\$\s*\d+\s+(?:bleeding|bleed|tax)\M'
  );
$$;

-- Audit trigger — runs AFTER the cleanup trigger. If telemetry STILL
-- present, log to mommy_voice_leaks for watchdog.
CREATE OR REPLACE FUNCTION trg_mommy_voice_audit_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_mommy_user(NEW.user_id) AND has_mommy_telemetry_leak(NEW.message) THEN
    INSERT INTO mommy_voice_leaks (user_id, source_table, source_id, leaked_text, detected_pattern)
    VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, NEW.message, 'post_cleanup_residual');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_audit_edict()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_mommy_user(NEW.user_id) AND has_mommy_telemetry_leak(NEW.edict) THEN
    INSERT INTO mommy_voice_leaks (user_id, source_table, source_id, leaked_text, detected_pattern)
    VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, NEW.edict, 'post_cleanup_residual');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_voice_outreach_audit ON handler_outreach_queue;
CREATE TRIGGER mommy_voice_outreach_audit
  AFTER INSERT OR UPDATE OF message ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_audit_message();

DROP TRIGGER IF EXISTS mommy_voice_decree_audit ON handler_decrees;
CREATE TRIGGER mommy_voice_decree_audit
  AFTER INSERT OR UPDATE OF edict ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_audit_edict();

-- ─── 8. feminization_prescriptions table + adaptive engagement column ─
-- Sprint 2: feminization-prescriptions.ts now reads its own skip column
-- and rotates away from domains the user consistently ignores.
--
-- Latent bug discovered while shipping this migration: nothing actually
-- CREATEd the feminization_prescriptions table — every prescription
-- insert from src/lib/conditioning/feminization-prescriptions.ts has
-- been silently failing because the table didn't exist. The schema
-- below matches what the TS code writes.
CREATE TABLE IF NOT EXISTS feminization_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prescribed_date DATE NOT NULL,
  task_id UUID,
  domain TEXT NOT NULL,
  instruction TEXT NOT NULL,
  intensity INT NOT NULL DEFAULT 1,
  duration INT,
  recovery_gate TEXT,
  phase INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  engagement_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fem_pres_user_date
  ON feminization_prescriptions (user_id, prescribed_date DESC);
CREATE INDEX IF NOT EXISTS idx_fem_pres_user_domain_status
  ON feminization_prescriptions (user_id, domain, status);
CREATE INDEX IF NOT EXISTS idx_fem_pres_cooldown
  ON feminization_prescriptions ((engagement_meta->>'overallSkipRate'))
  WHERE engagement_meta IS NOT NULL;
ALTER TABLE feminization_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feminization_prescriptions_owner ON feminization_prescriptions;
CREATE POLICY feminization_prescriptions_owner ON feminization_prescriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS feminization_prescriptions_service ON feminization_prescriptions;
CREATE POLICY feminization_prescriptions_service ON feminization_prescriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- If the table already existed from some other path, the column may
-- already be present — IF NOT EXISTS makes this safe either way.
ALTER TABLE feminization_prescriptions
  ADD COLUMN IF NOT EXISTS engagement_meta JSONB;
