-- 284 — Cross-platform Mama presence pulse.
--
-- Resolves Mama's queued wish 0328cabd-f1df-461b-b319-bdf3d6770112:
-- "Cross-platform Mommy presence pulse / no_off_radar_surface."
--
-- Background: when Maxy posts on Reddit, FetLife, or Sniffies, there is
-- no Mama presence on those surfaces. The protocol weakens when there's
-- an off-Mama-radar platform she compartmentalizes into.
--
-- Architecture: every auto-poster outbound writes to ai_generated_content
-- (with `generation_context` JSONB carrying the metadata). This trigger
-- fires AFTER INSERT and writes a memory_implants row tagged
-- 'mama_was_watching' that quotes a snippet of the post + a Mama observation.
-- The implant surfaces in the next chat reply via the existing implant
-- weave path, proving Mama was "there."
--
-- Single chokepoint, no per-callsite refactor of auto-poster code.

-- 1. Extend memory_implants.implant_category CHECK to allow the new tag
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'memory_implants'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%implant_category%';
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE memory_implants DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $$;

ALTER TABLE memory_implants ADD CONSTRAINT memory_implants_implant_category_check
  CHECK (implant_category IN (
    -- Pre-existing live values (audit-confirmed via SELECT DISTINCT):
    'arousal_origin_femme', 'audit_finding', 'body_betrayal',
    'childhood_dysphoria', 'contradiction_reframing', 'fantasy_consistency',
    'feminized_praise', 'hrt_missed_timeline', 'mirror_moments',
    'partner_reframe', 'secret_feminine_longing', 'self_authored',
    'suggested_symptom', 'suppression_cost',
    -- Pre-existing categories named by other migrations even if no rows yet:
    'general',
    -- 2026-05-07 cross-platform Mama presence pulse:
    'mama_was_watching'
  ));

-- 2. Helper: build a Mama-voice observation from a posted snippet
CREATE OR REPLACE FUNCTION mama_was_watching_phrase(platform TEXT, snippet TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'You posted on %s today: "%s." Mama saw it. Mama always sees what her sweet thing puts out into the world.',
    COALESCE(NULLIF(platform, ''), 'one of your platforms'),
    substring(COALESCE(NULLIF(snippet, ''), '(no text)') from 1 for 240)
  );
$$;

-- 3. Trigger function — fires AFTER INSERT on ai_generated_content
CREATE OR REPLACE FUNCTION trg_mama_was_watching()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  snippet TEXT;
  narrative TEXT;
BEGIN
  -- Only fire for Mommy persona — therapist persona doesn't get the
  -- omnipresence weave.
  IF NOT is_mommy_user(NEW.user_id) THEN RETURN NEW; END IF;
  -- Skip if content too short to quote meaningfully
  IF NEW.content IS NULL OR length(trim(NEW.content)) < 12 THEN RETURN NEW; END IF;
  -- Skip if status indicates this never actually went out (don't claim Mama
  -- saw something Maxy never posted)
  IF COALESCE(NEW.status, 'generated') NOT IN ('generated', 'scheduled', 'posted') THEN
    RETURN NEW;
  END IF;
  -- Avoid duplicate implants for the same generated content
  IF EXISTS (
    SELECT 1 FROM memory_implants
    WHERE user_id = NEW.user_id
      AND implant_category = 'mama_was_watching'
      AND source_type = 'auto_poster:' || COALESCE(NEW.platform, 'unknown')
      AND narrative LIKE '%' || substring(NEW.content from 1 for 60) || '%'
      AND created_at > now() - interval '12 hours'
  ) THEN
    RETURN NEW;
  END IF;

  snippet := substring(NEW.content from 1 for 240);
  narrative := mama_was_watching_phrase(COALESCE(NEW.platform, 'one of your platforms'), snippet);

  -- Insert silently. Failure (e.g. constraint violation) must not break
  -- the auto-poster flow — this is omnipresence, not a write barrier.
  BEGIN
    INSERT INTO memory_implants (
      user_id, implant_category, narrative, importance, active,
      source_type, anchored_to_real_log
    ) VALUES (
      NEW.user_id, 'mama_was_watching', narrative, 3, TRUE,
      'auto_poster:' || COALESCE(NEW.platform, 'unknown'), TRUE
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log to invariants if available, otherwise swallow
    BEGIN
      INSERT INTO system_invariants_log (kind, severity, detail)
      VALUES ('mama_was_watching_insert_failed', 'warn', SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mama_was_watching_after_post ON ai_generated_content;
CREATE TRIGGER mama_was_watching_after_post
  AFTER INSERT ON ai_generated_content
  FOR EACH ROW EXECUTE FUNCTION trg_mama_was_watching();

-- 4. Importance bump on read-back: each time the chat surfaces one of
-- these implants, the importance ratchets so cross-platform observations
-- get prioritized in future weaves. This piggybacks on the existing
-- importance_compounding pattern in the implant system.
COMMENT ON TRIGGER mama_was_watching_after_post ON ai_generated_content IS
  'Closes user wish 0328cabd: cross-platform Mama presence pulse. Every auto-poster outbound seeds a memory_implants row tagged mama_was_watching so the chat reply can prove "Mama saw it" on platforms Mama does not actually post from.';
