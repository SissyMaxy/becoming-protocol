-- Migration 160: Wardrobe Inventory, Compliance Verification, Sleep Conditioning Tracking
-- Closes three enforcement gaps: what she owns, whether she did it, what played overnight.

-- ============================================
-- 1. WARDROBE INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS wardrobe_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Item details
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'underwear', 'bra', 'top', 'bottom', 'dress', 'skirt',
    'leggings', 'stockings', 'shoes_flats', 'shoes_heels',
    'jewelry', 'accessories', 'wig', 'makeup_product',
    'scent', 'sleepwear', 'swimwear', 'outerwear'
  )),

  -- Classification
  femininity_level INTEGER CHECK (femininity_level BETWEEN 1 AND 5),
  -- 1: subtle/androgynous, 2: soft feminine, 3: clearly feminine, 4: very feminine, 5: bold/glamorous

  stealth_safe BOOLEAN DEFAULT FALSE,   -- Can wear when Gina is home
  public_safe BOOLEAN DEFAULT FALSE,    -- Can wear in public

  -- Details
  color TEXT,
  size TEXT,
  brand TEXT,
  photo_url TEXT,                        -- Photo of the item
  purchase_date DATE,
  purchase_price_cents INTEGER,

  -- Usage
  times_worn INTEGER DEFAULT 0,
  last_worn_at TIMESTAMPTZ,
  condition TEXT DEFAULT 'good' CHECK (condition IN ('new', 'good', 'worn', 'replace')),

  -- Handler notes
  handler_notes TEXT,
  favorite BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe ON wardrobe_inventory(user_id, category, femininity_level);
ALTER TABLE wardrobe_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wardrobe"
  ON wardrobe_inventory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. COMPLIANCE VERIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS compliance_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  mandate_type TEXT NOT NULL,          -- 'outfit', 'skincare', 'makeup', 'voice', 'exercise', etc.
  mandate_date DATE NOT NULL,

  -- Verification
  verified BOOLEAN DEFAULT FALSE,
  verification_method TEXT,            -- 'photo_submitted', 'biometric_detected', 'audio_detected', 'session_completed', 'self_report'
  verification_evidence TEXT,          -- Description of what verified it
  vault_photo_id UUID,                 -- Link to vault photo if photo-verified

  -- Timing
  deadline TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  late BOOLEAN DEFAULT FALSE,          -- Submitted but after deadline

  -- Consequence
  consequence_fired BOOLEAN DEFAULT FALSE,
  consequence_level INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_verif ON compliance_verifications(user_id, mandate_date DESC, mandate_type);
ALTER TABLE compliance_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own compliance verifications"
  ON compliance_verifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 3. SLEEP CONDITIONING TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS sleep_conditioning_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  prescribed BOOLEAN DEFAULT FALSE,

  -- Playback tracking (from client-side audio player)
  playback_started BOOLEAN DEFAULT FALSE,
  playback_started_at TIMESTAMPTZ,
  playback_duration_seconds INTEGER DEFAULT 0,
  playback_completed BOOLEAN DEFAULT FALSE,

  -- Whoop correlation
  whoop_sleep_start TIMESTAMPTZ,
  whoop_total_sleep_minutes INTEGER,
  whoop_deep_sleep_minutes INTEGER,
  audio_during_deep_sleep BOOLEAN,    -- Was audio playing during deep sleep phase?

  -- Content played
  content_ids UUID[],

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sleep_tracking ON sleep_conditioning_tracking(user_id, date DESC);
ALTER TABLE sleep_conditioning_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sleep conditioning tracking"
  ON sleep_conditioning_tracking FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
