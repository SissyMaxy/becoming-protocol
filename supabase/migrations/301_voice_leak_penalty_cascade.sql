-- 301 — Voice-leak penalty cascade: convert audit-only mommy_voice_leaks rows
-- into in-fantasy consequences via arousal_touch_tasks.
--
-- Today: mommy_voice_leaks logs telemetry that survived mommy_voice_cleanup()
-- (the SQL trigger from migration 259). Nothing reads those rows.
--
-- This migration:
--  1. Adds resolved_at / resolved_via_touch_task_id / penalty_severity to the
--     leaks table so the cascade can track which leak produced which task.
--  2. Adds linked_leak_id to arousal_touch_tasks so the cascade can stamp a
--     forward FK; the trigger below uses it to close the loop on completion.
--  3. Adds user_state.voice_leak_penalties_enabled (default TRUE). When off,
--     leaks are still logged but mommy-leak-cascade refuses to fire.
--  4. classify_voice_leak_severity(text) — deterministic SQL classifier.
--     Same input → same severity, always. The TS mirror in
--     supabase/functions/_shared/leak-severity.ts and src/lib/persona/
--     leak-severity.ts must stay in sync with this list.
--  5. Backfills penalty_severity on existing rows so the cascade and
--     backfill script have a stable read.
--  6. trg_mommy_leak_resolve_on_task_complete: when an arousal_touch_tasks
--     row with linked_leak_id has completed_at flipped to non-null, mark
--     the parent leak resolved. This is the honest closing-of-the-loop the
--     spec calls for — no in-fantasy distortion of which leak was for what.

-- ─── 1. Add columns to mommy_voice_leaks ───────────────────────────────
ALTER TABLE mommy_voice_leaks
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_via_touch_task_id UUID,
  ADD COLUMN IF NOT EXISTS penalty_severity TEXT
    CHECK (penalty_severity IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_mommy_leaks_pending_cascade
  ON mommy_voice_leaks (user_id, detected_at ASC)
  WHERE NOT resolved AND resolved_via_touch_task_id IS NULL;

-- ─── 2. Add column to arousal_touch_tasks ──────────────────────────────
ALTER TABLE arousal_touch_tasks
  ADD COLUMN IF NOT EXISTS linked_leak_id UUID;

CREATE INDEX IF NOT EXISTS idx_arousal_touch_linked_leak
  ON arousal_touch_tasks (linked_leak_id)
  WHERE linked_leak_id IS NOT NULL;

-- ─── 3. Add settings toggle to user_state ──────────────────────────────
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS voice_leak_penalties_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 4. Severity classifier (deterministic) ────────────────────────────
-- HIGH: assistant-voice break, raw $ telemetry, /100 scores, Hz pitch leaks.
-- MEDIUM: arousal/slip/compliance/denial-day numeric leaks.
-- LOW: anything else (mild residue, hours-silent, generic Day-N strings).
CREATE OR REPLACE FUNCTION classify_voice_leak_severity(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL THEN 'low'
    -- HIGH: persona break or most-egregious telemetry
    WHEN t ~* '\mAI\s+(assistant|model|system)\M' THEN 'high'
    WHEN t ~* '\mas\s+an?\s+AI\M' THEN 'high'
    WHEN t ~* '\$\s*\d+\s+(?:bleeding|bleed|tax)\M' THEN 'high'
    WHEN t ~* '\m\d{1,3}\s*/\s*100\M' THEN 'high'
    WHEN t ~* '\mscore\s*[:=]?\s*\d{1,3}\s*/\s*100\M' THEN 'high'
    WHEN t ~* '\mpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz' THEN 'high'
    -- MEDIUM: arousal / slip / compliance / denial-day numerics
    WHEN t ~* '\m\d{1,2}\s*/\s*10\M' THEN 'medium'
    WHEN t ~* '\marousal\s+(?:at|level|score)\s+\d' THEN 'medium'
    WHEN t ~* '\mday[\s\-_]*\d+\s*(?:of\s+)?denial\M' THEN 'medium'
    WHEN t ~* '\mdenial[_\s]*day\s*[=:]?\s*\d' THEN 'medium'
    WHEN t ~* '\m\d+\s+slip\s+points?\M' THEN 'medium'
    WHEN t ~* '\mslip[_\s]*points?\s*[=:]?\s*\d' THEN 'medium'
    WHEN t ~* '\m\d{1,3}\s*%\s+compliance\M' THEN 'medium'
    WHEN t ~* '\mcompliance\s+(?:at|is|=|:)?\s*\d' THEN 'medium'
    ELSE 'low'
  END;
$$;

-- ─── 5. Backfill severity on existing rows ─────────────────────────────
UPDATE mommy_voice_leaks
SET penalty_severity = classify_voice_leak_severity(leaked_text)
WHERE penalty_severity IS NULL;

-- ─── 6. Resolution trigger ─────────────────────────────────────────────
-- When a touch task that's linked to a leak gets completed, mark the leak
-- resolved. completed_at can be set by either Did-it OR skip-this-whisper;
-- both count as resolution (the leak's fantasy-debt is paid either way).
CREATE OR REPLACE FUNCTION trg_mommy_leak_resolve_on_task_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL
     AND (OLD.completed_at IS NULL)
     AND NEW.linked_leak_id IS NOT NULL THEN
    UPDATE mommy_voice_leaks
    SET resolved = TRUE,
        resolved_at = COALESCE(resolved_at, NEW.completed_at),
        resolved_via_touch_task_id = COALESCE(resolved_via_touch_task_id, NEW.id)
    WHERE id = NEW.linked_leak_id
      AND resolved = FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_leak_resolve_on_task_complete ON arousal_touch_tasks;
CREATE TRIGGER mommy_leak_resolve_on_task_complete
  AFTER UPDATE OF completed_at ON arousal_touch_tasks
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_leak_resolve_on_task_complete();
