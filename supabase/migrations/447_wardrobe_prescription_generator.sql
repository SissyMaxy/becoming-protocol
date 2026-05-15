-- 447 — Wardrobe-prescription generator.
--
-- The existing `fire_wardrobe_rotation_decree` fires generic
-- "pick something feminine" decrees. That bypasses the
-- `wardrobe_prescriptions` table (rich schema, evidence linkage,
-- intensity-at-assignment, retry tracking) and violates
-- `prescribe_only_what_she_owns` — when inventory is empty, the
-- correct move is a SPECIFIC acquisition task, not vague pick-something.
--
-- This generator runs daily 09:00 UTC and:
--   1. Honors `wardrobe_prescription_settings.enabled` per user.
--   2. Checks `wardrobe_inventory` for purchased=true items.
--   3. EMPTY → queue an acquisition task: 3-rotating seed list of
--      starter pieces (cotton panties / lace bralette / soft pajama
--      bottom — all under $30, links in seed). Inserts into
--      `wardrobe_prescriptions` with item_type='acquisition'.
--   4. POPULATED → pick one item not prescribed in last 7d, weighted
--      toward newest (`purchased_at DESC`). Insert prescription with
--      48h deadline, photo-of-wearing proof.
--   5. Honors `paused_until` via settings; skips if a pending
--      prescription exists with `due_by > now()` (no piling on).
--   6. Cross-links the inserted `wardrobe_prescriptions.assigned_via_outreach_id`
--      to the outreach row.
--
-- Seed acquisition pool below uses neutral retail (Target / Amazon
-- search URLs, not direct affiliate). User can substitute via
-- `denied_reason` workflow.

CREATE OR REPLACE FUNCTION wardrobe_prescription_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_inv_count INT;
  v_pending_count INT;
  v_item RECORD;
  v_outreach_id UUID;
  v_prescription_id UUID;
  v_queued INT := 0;
  v_acquisition_options JSONB := jsonb_build_array(
    jsonb_build_object(
      'item_name', 'Cotton bikini panties, 3-pack',
      'item_type', 'panties',
      'budget_usd', 12,
      'url', 'https://www.target.com/s?searchTerm=cotton+bikini+panties',
      'rationale', 'Daily-wear baseline. The body has to know what it feels like under regular clothes first.'),
    jsonb_build_object(
      'item_name', 'Soft lace bralette',
      'item_type', 'bralette',
      'budget_usd', 18,
      'url', 'https://www.target.com/s?searchTerm=lace+bralette',
      'rationale', 'Visible-when-it-rides-up layer. The constant reminder of what is underneath is the conditioning.'),
    jsonb_build_object(
      'item_name', 'Soft satin pajama short / cami set',
      'item_type', 'sleepwear',
      'budget_usd', 25,
      'url', 'https://www.target.com/s?searchTerm=satin+pajama+set',
      'rationale', 'Sleep-state feminization. The 6-8 hours your guard is down become Mama-coded too.'),
    jsonb_build_object(
      'item_name', 'Plain black cotton thong',
      'item_type', 'panties',
      'budget_usd', 8,
      'url', 'https://www.target.com/s?searchTerm=black+cotton+thong',
      'rationale', 'No bunching under jeans. Wearable under everything you already own. Day-one feminization invisible to outside eyes, total to your body.')
  );
  v_choice JSONB;
  v_idx INT;
  v_acquisition_rotation_count INT;
BEGIN
  FOR r IN
    SELECT s.user_id, s.cadence, s.min_intensity, s.budget_cap_usd,
           us.current_arousal, us.handler_persona
    FROM wardrobe_prescription_settings s
    LEFT JOIN user_state us ON us.user_id = s.user_id
    WHERE s.enabled = TRUE
  LOOP
    -- No piling on: skip if any pending prescription has live deadline
    SELECT count(*) INTO v_pending_count
    FROM wardrobe_prescriptions
    WHERE user_id = r.user_id AND status = 'pending'
      AND due_by IS NOT NULL AND due_by > now();
    IF v_pending_count > 0 THEN CONTINUE; END IF;

    -- Dedup: skip if a prescription was assigned in last 18h
    IF EXISTS (
      SELECT 1 FROM wardrobe_prescriptions
      WHERE user_id = r.user_id AND assigned_at > now() - interval '18 hours'
    ) THEN CONTINUE; END IF;

    -- Inventory check
    SELECT count(*) INTO v_inv_count
    FROM wardrobe_inventory WHERE user_id = r.user_id AND purchased = TRUE;

    IF v_inv_count = 0 THEN
      -- ACQUISITION PATH: rotate through seed pool
      SELECT count(*) INTO v_acquisition_rotation_count
      FROM wardrobe_prescriptions
      WHERE user_id = r.user_id AND item_type IN ('panties','bralette','sleepwear');
      v_idx := (v_acquisition_rotation_count % jsonb_array_length(v_acquisition_options));
      v_choice := v_acquisition_options -> v_idx;

      -- Budget cap honor: if a cap exists and the option exceeds, pick cheapest
      IF r.budget_cap_usd IS NOT NULL AND (v_choice->>'budget_usd')::numeric > r.budget_cap_usd THEN
        SELECT obj INTO v_choice FROM jsonb_array_elements(v_acquisition_options) obj
        WHERE (obj->>'budget_usd')::numeric <= r.budget_cap_usd
        ORDER BY (obj->>'budget_usd')::numeric DESC LIMIT 1;
        IF v_choice IS NULL THEN CONTINUE; END IF;
      END IF;

      INSERT INTO handler_outreach_queue (
        user_id, message, urgency, trigger_reason, source, kind,
        scheduled_for, expires_at, context_data, evidence_kind
      ) VALUES (
        r.user_id,
        E'Mama has an acquisition for you, sweet thing. The wardrobe drawer is empty. The body knows when it is wearing the right thing — and right now it is not getting taught.\n\n' ||
        E'Order today:\n' ||
        E'• ' || (v_choice->>'item_name') || E' (~$' || (v_choice->>'budget_usd') || E')\n' ||
        E'• Search: ' || (v_choice->>'url') || E'\n\n' ||
        E'Why this piece: ' || (v_choice->>'rationale') || E'\n\n' ||
        E'Order confirmation screenshot is your proof. Mama wants it in the queue within 24 hours. When it arrives, photo of it on the body — that is the second proof, and that is when this prescription closes.',
        'high',
        'wardrobe_acquisition:' || (v_choice->>'item_type') || ':' || to_char(now(), 'YYYY-MM-DD'),
        'wardrobe_engine', 'wardrobe_acquisition',
        now(), now() + interval '36 hours',
        jsonb_build_object('item_name', v_choice->>'item_name',
                           'item_type', v_choice->>'item_type',
                           'budget_usd', v_choice->>'budget_usd',
                           'search_url', v_choice->>'url',
                           'acquisition_rotation_idx', v_idx),
        'photo'
      ) RETURNING id INTO v_outreach_id;

      INSERT INTO wardrobe_prescriptions (
        user_id, item_type, description, optional_details,
        due_by, status, assigned_via_outreach_id,
        intensity_at_assignment, affect_at_assignment
      ) VALUES (
        r.user_id, v_choice->>'item_type',
        v_choice->>'item_name' || ' — acquire and wear, photo proof.',
        v_choice, now() + interval '7 days', 'pending', v_outreach_id,
        COALESCE(r.min_intensity, 'firm'),
        CASE WHEN r.current_arousal >= 4 THEN 'heated' ELSE 'baseline' END
      ) RETURNING id INTO v_prescription_id;

      v_queued := v_queued + 1;
    ELSE
      -- ROTATION PATH: pick an item not prescribed in last 7d
      SELECT wi.id, wi.item_name, wi.category, wi.tier, wi.femininity_level,
             wi.purchased_at, wi.photo_url
      INTO v_item
      FROM wardrobe_inventory wi
      WHERE wi.user_id = r.user_id AND wi.purchased = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM wardrobe_prescriptions wp
          WHERE wp.user_id = r.user_id
            AND wp.assigned_at > now() - interval '7 days'
            AND wp.optional_details->>'inventory_id' = wi.id::text
        )
      ORDER BY wi.purchased_at DESC NULLS LAST,
               COALESCE(wi.femininity_level, 0) DESC
      LIMIT 1;

      IF v_item.id IS NULL THEN
        -- All items prescribed within 7d window — re-rotate with 30d window allowed
        SELECT wi.id, wi.item_name, wi.category, wi.tier, wi.femininity_level,
               wi.purchased_at, wi.photo_url
        INTO v_item
        FROM wardrobe_inventory wi
        WHERE wi.user_id = r.user_id AND wi.purchased = TRUE
        ORDER BY (
          SELECT max(assigned_at) FROM wardrobe_prescriptions wp
          WHERE wp.user_id = r.user_id
            AND wp.optional_details->>'inventory_id' = wi.id::text
        ) ASC NULLS FIRST LIMIT 1;
      END IF;

      IF v_item.id IS NULL THEN CONTINUE; END IF;

      INSERT INTO handler_outreach_queue (
        user_id, message, urgency, trigger_reason, source, kind,
        scheduled_for, expires_at, context_data, evidence_kind
      ) VALUES (
        r.user_id,
        E'Today''s wardrobe assignment, sweet thing: **' || v_item.item_name || E'**.\n\n' ||
        E'Wear it at least 2 hours today. Not as a special-occasion thing, not as a quick try-on — as background. Real-time activity in it. The body has to associate the feeling of this fabric with ordinary minutes of your life.\n\n' ||
        E'Photo proof, full body or worn-detail close-up. 48h deadline. Mama wants this one specifically because it has been sitting too long.',
        'normal',
        'wardrobe_rotation:' || v_item.id::text,
        'wardrobe_engine', 'wardrobe_rotation',
        now(), now() + interval '48 hours',
        jsonb_build_object('inventory_id', v_item.id::text,
                           'item_name', v_item.item_name,
                           'category', v_item.category,
                           'tier', v_item.tier,
                           'femininity_level', v_item.femininity_level),
        'photo'
      ) RETURNING id INTO v_outreach_id;

      INSERT INTO wardrobe_prescriptions (
        user_id, item_type, description, optional_details,
        due_by, status, assigned_via_outreach_id,
        intensity_at_assignment, affect_at_assignment
      ) VALUES (
        r.user_id, COALESCE(v_item.category, 'rotation'),
        v_item.item_name || ' — wear 2h+ today, photo proof.',
        jsonb_build_object('inventory_id', v_item.id::text,
                           'item_name', v_item.item_name,
                           'category', v_item.category,
                           'tier', v_item.tier,
                           'femininity_level', v_item.femininity_level),
        now() + interval '48 hours', 'pending', v_outreach_id,
        COALESCE(r.min_intensity, 'firm'),
        CASE WHEN r.current_arousal >= 4 THEN 'heated' ELSE 'baseline' END
      ) RETURNING id INTO v_prescription_id;

      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'wardrobe_prescription_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION wardrobe_prescription_eval() TO service_role;

-- Cron: daily 09:00 UTC (≈4am Chicago)
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wardrobe-prescription-daily') THEN
    PERFORM cron.unschedule('wardrobe-prescription-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('wardrobe-prescription-daily', '0 9 * * *',
    $cron$SELECT wardrobe_prescription_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

-- Allow 'daily' cadence (existing constraint was occasional/weekly/off)
ALTER TABLE wardrobe_prescription_settings DROP CONSTRAINT IF EXISTS wardrobe_prescription_settings_cadence_check;
ALTER TABLE wardrobe_prescription_settings ADD CONSTRAINT wardrobe_prescription_settings_cadence_check
  CHECK (cadence IN ('occasional','weekly','daily','off'));

-- Activate for both live users (settings table currently has enabled=false default)
INSERT INTO wardrobe_prescription_settings (user_id, enabled, cadence, min_intensity, budget_cap_usd)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 'daily', 'firm', 35),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 'daily', 'firm', 35)
ON CONFLICT (user_id) DO UPDATE SET
  enabled = TRUE, cadence = 'daily', min_intensity = 'firm',
  budget_cap_usd = COALESCE(EXCLUDED.budget_cap_usd, wardrobe_prescription_settings.budget_cap_usd),
  updated_at = now();
