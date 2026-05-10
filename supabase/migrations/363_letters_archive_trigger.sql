-- Migration 301b — Letters Archive: acknowledgement trigger
--
-- Mirrors src/lib/letters/auto-archive.ts at the data layer. When an outreach
-- row transitions to "acknowledged" (status = 'delivered' or delivered_at
-- becomes non-null), the trigger flips is_archived_to_letters for sources
-- that need acknowledgement before archiving (mommy_recall, mommy_mantra).
--
-- Praise (under affect=delighted/possessive) and bedtime are archived at
-- insert by the edge fn — the trigger is idempotent and won't re-flip them.
-- Anything else (manually-pinned, non-Mommy outreach, etc.) is left alone.

CREATE OR REPLACE FUNCTION letters_auto_archive_on_ack()
RETURNS TRIGGER AS $$
BEGIN
  -- Only consider rows that just transitioned into an acknowledged state.
  -- Either:
  --   (a) status flipped from non-delivered to 'delivered'
  --   (b) delivered_at flipped from NULL to a value
  IF NEW.is_archived_to_letters = TRUE THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (NEW.status = 'delivered' AND COALESCE(OLD.status, '') <> 'delivered')
    OR (NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.source IN ('mommy_recall', 'mommy_mantra') THEN
    NEW.is_archived_to_letters := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS letters_auto_archive_on_ack_trg ON handler_outreach_queue;
CREATE TRIGGER letters_auto_archive_on_ack_trg
  BEFORE UPDATE ON handler_outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION letters_auto_archive_on_ack();
