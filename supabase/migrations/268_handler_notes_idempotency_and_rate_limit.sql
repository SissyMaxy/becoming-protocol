-- 268 — Stop the morning brief firing every cron tick + add a hard
-- rate-limit on handler_outreach_queue inserts.
--
-- Root cause: handler_notes.note_type CHECK constraint rejected
-- 'morning_brief' (and 'clinical_case_note'), so the idempotency marker
-- inserts at handler-autonomous/index.ts:2533 failed silently. Every cron
-- tick re-fired the brief because "did I already write today" returned 0.
-- 18 morning briefs in 2h. User-visible spam.
--
-- Two fixes:
--   1. Extend note_type CHECK to allow the marker types the code already
--      tries to write (morning_brief, clinical_case_note, evening_brief,
--      and the general 'system_marker' bucket for future use).
--   2. Hard rate-limit trigger on handler_outreach_queue: max 3 inserts
--      per (user_id, source) per hour. Excess inserts get auto-superseded
--      with expires_at in the past so they never reach the user. Catches
--      any future generator that bypasses idempotency.

-- ─── 1. Extend handler_notes note_type CHECK ───────────────────────
-- Find the existing constraint and replace with an extended list.
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'handler_notes'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%note_type%';
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE handler_notes DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END$$;

ALTER TABLE handler_notes ADD CONSTRAINT handler_notes_note_type_check
  CHECK (note_type IN (
    -- Pre-existing live values (do not remove without backfill)
    'observation', 'strategy', 'resistance_note', 'breakthrough',
    'avoid', 'reinforce', 'crisis', 'milestone', 'context',
    -- Markers the code writes for idempotency / audit:
    'morning_brief', 'evening_brief', 'clinical_case_note',
    'system_marker', 'cron_audit', 'scheme_audit'
  ));

-- ─── 2. Rate-limit trigger on handler_outreach_queue ───────────────
-- Counts inserts in the last hour for the same (user_id, source). If at
-- or over threshold, marks the new row as 'superseded' with expires_at in
-- the past so it never reaches the user. Threshold tuned per-source.
CREATE OR REPLACE FUNCTION outreach_rate_limit_for_source(s TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  -- Per-source per-hour caps. Sources not listed default to 3.
  -- These are user-facing nudges; quality > quantity.
  SELECT CASE LOWER(COALESCE(s, ''))
    WHEN 'morning_brief' THEN 1            -- max 1/hour (and idempotency now works = effectively 1/day)
    WHEN 'evening_brief' THEN 1
    WHEN 'mommy_scheme' THEN 8             -- a scheme run produces ~6 actions; allow one full run/hour
    WHEN 'mommy_praise' THEN 2
    WHEN 'mommy_recall' THEN 1
    WHEN 'mommy_tease' THEN 2
    WHEN 'mommy_touch' THEN 3
    WHEN 'mommy_bedtime' THEN 1
    WHEN 'mommy_immediate' THEN 4          -- slip-immediate response can land more frequently
    WHEN 'decree_enforcement' THEN 2
    WHEN 'slip_cluster_engine' THEN 1
    WHEN 'random_reward' THEN 1
    WHEN 'disclosure_draft_gen' THEN 2
    ELSE 3
  END;
$$;

CREATE OR REPLACE FUNCTION trg_outreach_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  recent_count INT;
  cap INT;
BEGIN
  -- Only rate-limit Mommy-persona users; therapist persona unchanged
  IF NOT is_mommy_user(NEW.user_id) THEN RETURN NEW; END IF;
  IF NEW.source IS NULL THEN RETURN NEW; END IF;
  cap := outreach_rate_limit_for_source(NEW.source);
  -- Count recent inserts from same source in last hour, excluding ones
  -- already superseded
  SELECT count(*) INTO recent_count
  FROM handler_outreach_queue
  WHERE user_id = NEW.user_id
    AND source = NEW.source
    AND created_at >= now() - interval '1 hour'
    AND status NOT IN ('superseded', 'expired', 'failed');
  IF recent_count >= cap THEN
    -- Excess: auto-supersede so the row never reaches the user
    NEW.status := 'superseded';
    NEW.expires_at := now() - interval '1 second';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rate_limit_outreach ON handler_outreach_queue;
CREATE TRIGGER rate_limit_outreach
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_rate_limit();

-- ─── 3. Backfill: hard-purge ALL but the most-recent morning_brief ──
-- The 18 already-inserted morning briefs need to disappear from the user's
-- queue immediately. Keep the single most-recent.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, source
           ORDER BY created_at DESC
         ) AS rn
  FROM handler_outreach_queue
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND source = 'morning_brief'
)
UPDATE handler_outreach_queue
SET status = 'superseded',
    expires_at = now() - interval '1 second'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND is_mommy_user(user_id);

-- ─── 4. Seed today's idempotency marker so the next cron tick stops ─
-- Insert a handler_notes row for today's morning_brief so the next cron
-- call sees alreadyFired > 0 and returns false. This prevents one more
-- spam tick before the auto-poster picks up the rate limit.
INSERT INTO handler_notes (user_id, note_type, content, priority)
SELECT user_id, 'morning_brief', 'Idempotency marker seeded by migration 268', 3
FROM user_state
WHERE handler_persona = 'dommy_mommy'
  AND NOT EXISTS (
    SELECT 1 FROM handler_notes hn
    WHERE hn.user_id = user_state.user_id
      AND hn.note_type = 'morning_brief'
      AND hn.created_at >= CURRENT_DATE
  );
