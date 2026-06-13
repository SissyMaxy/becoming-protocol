-- 615 — allow 'disclosure_rehearsal' as a confession_queue category.
--
-- 2026-06-13: the mommy-disclosure-rehearsal engine has always written
-- category='disclosure_rehearsal', but migration 234's CHECK never included
-- that value — so every insert was rejected. This was the THIRD reason that
-- engine never persisted a single rehearsal (alongside the dead scheme-engine
-- dependency and the phantom metadata/proof_required/min_chars columns, both
-- fixed in the same session).
--
-- Safe to recreate the CHECK: verified the only categories in live use are
-- slip / scheduled_daily / arousal_spike / handler_triggered (all original),
-- and no later migration expanded this constraint. Recreating with the
-- original 8 + disclosure_rehearsal preserves everything.

ALTER TABLE confession_queue DROP CONSTRAINT IF EXISTS confession_queue_category_check;
ALTER TABLE confession_queue ADD CONSTRAINT confession_queue_category_check CHECK (category IN (
  'slip', 'arousal_spike', 'rationalization', 'scheduled_daily',
  'resistance', 'desire_owning', 'identity_acknowledgement', 'handler_triggered',
  'disclosure_rehearsal'
));
