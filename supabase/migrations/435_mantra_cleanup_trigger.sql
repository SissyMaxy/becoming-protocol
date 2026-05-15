-- 435 — Extend mommy_voice_cleanup to morning_mantra_windows.current_mantra
-- and mommy_mantras.text + restore source-side phrase replacements.
--
-- Maxy 2026-05-15: "I still see task for today Morning mantra · compulsory —
-- I earned this. Every restriction is mine to wear." The PR #79 cleanup
-- covered handler_outreach_queue, handler_messages, handler_decrees,
-- arousal_touch_tasks — but morning_mantra_windows.current_mantra is its
-- own write site, and that's where today's mantra was sitting. Generators:
-- `rotateMorningMantra` (supabase/functions/_shared/job-handlers/handler-autonomous.ts)
-- reads from mommy_mantras and writes to morning_mantra_windows.current_mantra.
--
-- Both columns need DB-side cleanup at insert/update time so any future
-- rotation gets scrubbed regardless of source. This makes the cleanup
-- chokepoint count six:
--   1. handler_outreach_queue.message (mig 255)
--   2. handler_decrees.edict (mig 255)
--   3. arousal_touch_tasks.prompt (mig 255)
--   4. handler_messages.content (mig 427)
--   5. morning_mantra_windows.current_mantra (this migration)
--   6. mommy_mantras.text (this migration)

-- ─── 5. morning_mantra_windows.current_mantra ────────────────────────
-- This column drives the daily Morning Mantra · compulsory gate.
-- Cleanup gated on is_mommy_user so non-mommy personas keep their own
-- mantra style.
CREATE OR REPLACE FUNCTION trg_morning_mantra_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_mantra IS NOT NULL
     AND length(NEW.current_mantra) > 0
     AND is_mommy_user(NEW.user_id) THEN
    NEW.current_mantra := mommy_voice_cleanup(NEW.current_mantra);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS morning_mantra_cleanup ON morning_mantra_windows;
CREATE TRIGGER morning_mantra_cleanup
  BEFORE INSERT OR UPDATE OF current_mantra ON morning_mantra_windows
  FOR EACH ROW EXECUTE FUNCTION trg_morning_mantra_cleanup();

-- Also update the column DEFAULT so brand-new rows get a Mama-voice
-- starter mantra instead of the 228-era "I am becoming her. I am female.
-- I must obey." which is the same theatrical-cadence pattern Maxy flagged.
ALTER TABLE morning_mantra_windows
  ALTER COLUMN current_mantra
  SET DEFAULT 'Mama is making the body I should have had.';

-- ─── 6. mommy_mantras.text ──────────────────────────────────────────
-- This is the catalog the rotation generator picks from. No user_id on
-- this table — mantras are shared across mommy users. Run cleanup
-- unconditionally; the patterns are dommy_mommy-shaped already, so the
-- function's behavior is identity for non-leak input.
CREATE OR REPLACE FUNCTION trg_mommy_mantras_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.text IS NOT NULL AND length(NEW.text) > 0 THEN
    NEW.text := mommy_voice_cleanup(NEW.text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_mantras_cleanup ON mommy_mantras;
CREATE TRIGGER mommy_mantras_cleanup
  BEFORE INSERT OR UPDATE OF text ON mommy_mantras
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_mantras_cleanup();

-- Re-clean the catalog and the active mantra rows. Anything with the
-- banned phrases (or any other clinical leak) gets scrubbed in place.
UPDATE morning_mantra_windows
SET current_mantra = mommy_voice_cleanup(current_mantra),
    updated_at = now()
WHERE is_mommy_user(user_id)
  AND current_mantra IS NOT NULL
  AND current_mantra <> mommy_voice_cleanup(current_mantra);

UPDATE mommy_mantras
SET text = mommy_voice_cleanup(text)
WHERE text IS NOT NULL AND text <> mommy_voice_cleanup(text);
