-- 623: fix wardrobe add — DB category CHECK only allowed 8 categories but the UI
-- (WardrobeInventoryView CATEGORIES) offers 17, incl. the DEFAULT 'panties'. Every
-- add with the default category silently failed the constraint (console-logged only,
-- item never saved). Expand the constraint to the full UI category set.
-- Applied 2026-06-29 via Management API; recorded here.
ALTER TABLE wardrobe_inventory DROP CONSTRAINT IF EXISTS wardrobe_inventory_category_check;
ALTER TABLE wardrobe_inventory ADD CONSTRAINT wardrobe_inventory_category_check
  CHECK (category = ANY(ARRAY['panties','underwear','bras','lingerie','tops','bottoms','dresses','skirts','socks','tights','shoes','accessories','wigs','makeup','sleepwear','swimwear','other','hosiery']));
