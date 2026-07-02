-- 638 — wardrobe intelligence (FEM §6).
--
-- One vocabulary: the mig 623 18-value CHECK is canonical. Legacy category
-- values (from the pre-623 8-value era and the TS LEVEL_REQUIREMENTS
-- vocabulary that never matched the DB) are mapped onto it. Attributes
-- (heel, fem_level, color) live in attrs jsonb — no category proliferation.
--
-- Acquisition bridge (the protocol pays, never Maxy): a missing
-- prerequisite creates a wishlist_items row (Throne/WishTender surface via
-- user_state.wishlist_url) + an acquisition prescription that turns the
-- gap into content. skip_reason='missing_item' feeds the same path.

-- ─── 1. attrs jsonb ──────────────────────────────────────────────────

ALTER TABLE wardrobe_inventory
  ADD COLUMN IF NOT EXISTS attrs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. Legacy category data-migration ───────────────────────────────
-- Keep in sync with src/lib/wardrobe/categories.ts LEGACY_CATEGORY_MAP.
-- Rows already inside the 623 set are untouched. shoes_heels keeps its
-- heel-ness as an attr (the information the collapse would lose).

UPDATE wardrobe_inventory
   SET attrs = attrs || '{"heel": true}'::jsonb
 WHERE category = 'shoes_heels';

UPDATE wardrobe_inventory SET category = CASE category
  WHEN 'bra'            THEN 'bras'
  WHEN 'top'            THEN 'tops'
  WHEN 'dress'          THEN 'dresses'
  WHEN 'skirt'          THEN 'skirts'
  WHEN 'wig'            THEN 'wigs'
  WHEN 'leggings'       THEN 'bottoms'
  WHEN 'bottom'         THEN 'bottoms'
  WHEN 'stockings'      THEN 'hosiery'
  WHEN 'shoes_flats'    THEN 'shoes'
  WHEN 'shoes_heels'    THEN 'shoes'
  WHEN 'jewelry'        THEN 'accessories'
  WHEN 'makeup_product' THEN 'makeup'
  WHEN 'scent'          THEN 'other'
  WHEN 'outerwear'      THEN 'tops'
  ELSE 'other'
END
WHERE category NOT IN (
  'panties','underwear','bras','lingerie','tops','bottoms','dresses','skirts',
  'socks','tights','shoes','accessories','wigs','makeup','sleepwear','swimwear',
  'other','hosiery'
);

-- ─── 3. Acquisition bridge ───────────────────────────────────────────
-- wishlist_items live shape (verified against src/lib/wishlist.ts /
-- DbWishlistItem — the table's CREATE predates committed migrations):
--   name, category (InvestmentCategory), priority (1-3), notes, private,
--   status ('active'|'purchased'|'removed'), estimated_price, currency.

CREATE OR REPLACE FUNCTION wardrobe_acquisition_bridge(
  p_user uuid,
  p_wardrobe_category text,
  p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_wishlist_category text;
  v_item_name text;
  v_wishlist_id uuid;
BEGIN
  IF p_user IS NULL OR COALESCE(p_wardrobe_category, '') = '' THEN
    RETURN NULL;
  END IF;

  -- wardrobe category → wishlist InvestmentCategory
  v_wishlist_category := CASE p_wardrobe_category
    WHEN 'panties'   THEN 'intimates'
    WHEN 'underwear' THEN 'intimates'
    WHEN 'bras'      THEN 'intimates'
    WHEN 'lingerie'  THEN 'intimates'
    WHEN 'hosiery'   THEN 'intimates'
    WHEN 'tights'    THEN 'intimates'
    WHEN 'wigs'      THEN 'hair'
    WHEN 'makeup'    THEN 'makeup'
    WHEN 'accessories' THEN 'accessories'
    ELSE 'clothing'
  END;

  v_item_name := 'Wardrobe gap: ' || p_wardrobe_category;

  -- Dedup: one open wishlist ask per (user, gap category).
  SELECT id INTO v_wishlist_id FROM wishlist_items
   WHERE user_id = p_user AND name = v_item_name AND status = 'active'
   LIMIT 1;

  IF v_wishlist_id IS NULL THEN
    INSERT INTO wishlist_items (user_id, name, category, priority, notes, private, status)
    VALUES (
      p_user, v_item_name, v_wishlist_category, 1,
      COALESCE(p_reason, 'Missing prerequisite — the protocol pays, never Maxy.'),
      false, 'active'
    )
    RETURNING id INTO v_wishlist_id;
  END IF;

  -- The gap becomes content: one acquisition prescription for tomorrow.
  -- Plain-facts copy composed here; the 259 DB voice trigger doesn't run on
  -- this table, so keep it clean and concrete (stranger-readable).
  INSERT INTO feminization_prescriptions (
    user_id, prescribed_date, domain, instruction, intensity, phase, status,
    evidence_kind, deadline, requires, engagement_meta
  )
  SELECT
    p_user, CURRENT_DATE + 1, 'style',
    'Mama put a ' || p_wardrobe_category || ' ask on the list. Your job tonight is one tease post that points at it.',
    2, COALESCE((SELECT current_phase FROM user_state WHERE user_id = p_user), 1), 'pending',
    'text',
    ((CURRENT_DATE + 1)::timestamp AT TIME ZONE 'America/New_York') + interval '23 hours 59 minutes',
    jsonb_build_object('item_category', p_wardrobe_category, 'acquisition', true),
    jsonb_build_object('source', 'wardrobe_acquisition_bridge', 'wishlist_item_id', v_wishlist_id, 'reason', left(COALESCE(p_reason, ''), 400))
  WHERE NOT EXISTS (
    SELECT 1 FROM feminization_prescriptions
     WHERE user_id = p_user AND status = 'pending'
       AND requires->>'item_category' = p_wardrobe_category
       AND (requires->>'acquisition')::boolean IS TRUE
  );

  RETURN v_wishlist_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION wardrobe_acquisition_bridge(uuid, text, text) TO service_role;

-- skip_reason='missing_item' feeds the same path automatically.
CREATE OR REPLACE FUNCTION trg_fem_prescription_missing_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'skipped' AND NEW.skip_reason = 'missing_item'
     AND COALESCE(OLD.status, '') <> 'skipped' THEN
    PERFORM wardrobe_acquisition_bridge(
      NEW.user_id,
      COALESCE(NEW.requires->>'item_category', 'other'),
      'Skipped as missing_item: ' || left(NEW.instruction, 200)
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS fem_prescription_missing_item ON feminization_prescriptions;
CREATE TRIGGER fem_prescription_missing_item
  AFTER UPDATE ON feminization_prescriptions
  FOR EACH ROW EXECUTE FUNCTION trg_fem_prescription_missing_item();
