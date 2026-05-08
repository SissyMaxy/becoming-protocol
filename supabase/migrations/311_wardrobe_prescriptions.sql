-- 260 — Wardrobe acquisition prescription path.
--
-- Closes the loop between identity persistence (feminine_self +
-- wardrobe_items, sibling branch), verification photos (analyze-photo),
-- and outreach (handler_outreach_queue).
--
-- Mommy assigns "buy a black silk slip this week" as a prescription
-- → outreach row inherits the Today card pipeline → user photographs
-- the acquired item → analyze-photo approves → wardrobe_items row is
-- created with prescription provenance → praise outreach fires.
--
-- Coexists with sibling branches (feature/identity-persistence-2026-04-30
-- adds wardrobe_items / feminine_self). This migration deliberately
-- does NOT FK into those tables — the create_wardrobe_item_id is a
-- soft pointer so this branch lands cleanly alone, and the deploy
-- orchestrator can renumber as needed.

-- ─── 1. wardrobe_prescriptions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wardrobe_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_via_outreach_id UUID,  -- soft FK to handler_outreach_queue (NULL ok)

  -- Mommy's prose: "a black silk slip", "a pair of soft pink panties"
  description TEXT NOT NULL,
  -- Loose match to wardrobe_items.item_type once that table lands;
  -- left as TEXT (not enum) so we don't break if the sibling branch
  -- changes its enum shape during the merge.
  item_type TEXT NOT NULL,
  -- Color, brand, size hints, vibe — anything the prescription wants
  -- to nail down without becoming a shopping list. Optional.
  optional_details JSONB DEFAULT '{}'::jsonb,

  due_by TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'verifying', 'approved', 'denied', 'expired', 'cancelled'
  )),

  -- Wired on verification submission / approval
  verification_photo_id UUID,         -- soft FK to verification_photos
  created_wardrobe_item_id UUID,      -- soft FK to wardrobe_items (sibling branch)
  denied_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Affect snapshot at prescription time, lets the praise/denial
  -- outreach pull the right tone later.
  intensity_at_assignment TEXT,       -- gentle / moderate / firm / relentless
  affect_at_assignment TEXT,          -- mommy_mood.affect snapshot

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_presc_user_status
  ON wardrobe_prescriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wardrobe_presc_user_assigned
  ON wardrobe_prescriptions(user_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_wardrobe_presc_due
  ON wardrobe_prescriptions(due_by)
  WHERE status IN ('pending', 'verifying');

ALTER TABLE wardrobe_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wardrobe_prescriptions_owner ON wardrobe_prescriptions;
CREATE POLICY wardrobe_prescriptions_owner ON wardrobe_prescriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS wardrobe_prescriptions_service ON wardrobe_prescriptions;
CREATE POLICY wardrobe_prescriptions_service ON wardrobe_prescriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. wardrobe_prescription_settings (per-user toggles) ─────────────────
-- One row per user; create-on-first-write. Defaults below match the
-- "off by default" spec: feature dormant unless user opts in.
CREATE TABLE IF NOT EXISTS wardrobe_prescription_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cadence TEXT NOT NULL DEFAULT 'occasional' CHECK (cadence IN ('occasional', 'weekly', 'off')),
  -- Plain-language budget cap in dollars; NULL = no cap. Mommy is
  -- told not to prescribe items over this number; she does not handle
  -- payment.
  budget_cap_usd NUMERIC(8,2),
  -- Minimum gaslight intensity tier required to fire prescriptions.
  -- 'firm' is the spec default; 'moderate' / 'relentless' are valid
  -- override points. Read against profile_foundation.difficulty_level.
  min_intensity TEXT NOT NULL DEFAULT 'firm' CHECK (min_intensity IN (
    'gentle', 'moderate', 'firm', 'relentless'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wardrobe_prescription_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wardrobe_presc_settings_owner ON wardrobe_prescription_settings;
CREATE POLICY wardrobe_presc_settings_owner ON wardrobe_prescription_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS wardrobe_presc_settings_service ON wardrobe_prescription_settings;
CREATE POLICY wardrobe_presc_settings_service ON wardrobe_prescription_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. updated_at trigger (shared with elsewhere; idempotent) ─────────────
CREATE OR REPLACE FUNCTION public.touch_wardrobe_prescription_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_wardrobe_presc ON wardrobe_prescriptions;
CREATE TRIGGER trg_touch_wardrobe_presc
  BEFORE UPDATE ON wardrobe_prescriptions
  FOR EACH ROW EXECUTE FUNCTION touch_wardrobe_prescription_updated_at();

DROP TRIGGER IF EXISTS trg_touch_wardrobe_presc_settings ON wardrobe_prescription_settings;
CREATE TRIGGER trg_touch_wardrobe_presc_settings
  BEFORE UPDATE ON wardrobe_prescription_settings
  FOR EACH ROW EXECUTE FUNCTION touch_wardrobe_prescription_updated_at();

-- ─── 4. Extend verification_photos.task_type to include 'wardrobe' ────────
-- The PhotoVerificationUpload widget currently passes task_type values
-- limited to outfit/mirror/pose/makeup/nails/general. Wardrobe-acquisition
-- proof needs its own task_type so analyze-photo can route it through a
-- wardrobe-aware prompt and the fulfillment hook can detect approval.
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_task_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_task_type_check
  CHECK (task_type IN (
    'outfit', 'mirror_check', 'pose', 'makeup', 'nails', 'general',
    'progress_photo', 'gina_text', 'wardrobe'
  ));
