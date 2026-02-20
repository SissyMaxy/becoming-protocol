-- ============================================
-- 075: Fan-Funded Task Marketplace
-- Fans purchase tasks for Maxy to complete.
-- Handler routes paid requests into normal task pipeline.
-- ============================================

-- ============================================
-- task_listings: Items fans can purchase
-- ============================================

CREATE TABLE IF NOT EXISTS task_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  listing_type TEXT DEFAULT 'fixed' CHECK (listing_type IN ('fixed', 'auction', 'custom_request')),

  price_cents INTEGER,
  min_bid_cents INTEGER,

  category TEXT NOT NULL CHECK (category IN (
    'photo', 'video', 'voice', 'outfit', 'challenge', 'custom', 'lifestyle', 'explicit'
  )),
  explicitness_level INTEGER DEFAULT 1 CHECK (explicitness_level BETWEEN 1 AND 5),
  estimated_effort_minutes INTEGER,

  max_orders INTEGER DEFAULT 1,
  orders_filled INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'paused', 'sold_out', 'expired', 'cancelled'
  )),
  expires_at TIMESTAMPTZ,

  handler_generated BOOLEAN DEFAULT false,
  handler_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_listings_user_status ON task_listings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_listings_category ON task_listings(category, status);

-- ============================================
-- task_orders: Fan purchases
-- ============================================

CREATE TABLE IF NOT EXISTS task_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  listing_id UUID REFERENCES task_listings(id),
  fan_id UUID REFERENCES fan_profiles(id),

  amount_cents INTEGER NOT NULL,
  platform TEXT NOT NULL,
  special_instructions TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'in_progress', 'completed', 'delivered', 'refunded', 'cancelled'
  )),

  internal_task_code TEXT,
  delivery_vault_id UUID REFERENCES content_vault(id),

  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  fan_rating INTEGER CHECK (fan_rating BETWEEN 1 AND 5),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_orders_user_status ON task_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_orders_listing ON task_orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_task_orders_fan ON task_orders(fan_id);

-- ============================================
-- task_auctions: Bidding on auction listings
-- ============================================

CREATE TABLE IF NOT EXISTS task_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES task_listings(id) NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id),

  bid_cents INTEGER NOT NULL,
  platform TEXT NOT NULL,
  bid_message TEXT,
  is_winning BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_auctions_listing ON task_auctions(listing_id, bid_cents DESC);
CREATE INDEX IF NOT EXISTS idx_task_auctions_fan ON task_auctions(fan_id);

-- ============================================
-- RLS policies
-- ============================================

ALTER TABLE task_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_listings_user ON task_listings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY task_orders_user ON task_orders
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY task_auctions_user ON task_auctions
  FOR ALL USING (auth.uid() = user_id);
