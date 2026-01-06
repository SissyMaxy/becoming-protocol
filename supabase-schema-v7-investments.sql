-- Becoming Protocol Schema v7: Investment Ledger + Wishlist System
-- Run this in Supabase SQL Editor after v6 schema

-- ============================================
-- INVESTMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Item details
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'clothing', 'skincare', 'makeup', 'body_care', 'voice',
    'accessories', 'hair', 'forms_shapewear', 'intimates',
    'fragrance', 'nails', 'medical_hrt', 'services', 'education'
  )),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Source tracking
  purchase_date DATE NOT NULL,
  retailer TEXT,
  original_url TEXT,
  from_wishlist_id UUID,

  -- Integration with protocol
  domain TEXT,
  notes TEXT,
  photo_url TEXT,

  -- Privacy
  private BOOLEAN DEFAULT FALSE,

  -- Usage tracking (for AI integration)
  times_used INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'retired', 'consumable')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVESTMENT MILESTONES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS investment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN (
    'first_purchase',
    'amount_100', 'amount_250', 'amount_500', 'amount_1000',
    'amount_2500', 'amount_5000', 'amount_10000',
    'new_category',
    'category_100', 'category_500'
  )),
  amount DECIMAL(10,2),
  category TEXT,
  message TEXT,

  achieved_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WISHLIST ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Item details
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'clothing', 'skincare', 'makeup', 'body_care', 'voice',
    'accessories', 'hair', 'forms_shapewear', 'intimates',
    'fragrance', 'nails', 'medical_hrt', 'services', 'education'
  )),
  estimated_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Links
  original_url TEXT,
  affiliate_url TEXT,
  retailer TEXT,
  image_url TEXT,

  -- Organization
  priority INT DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1=high, 2=medium, 3=low
  notes TEXT,
  private BOOLEAN DEFAULT FALSE,

  -- Gift registry (for shared wishlists)
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'purchased', 'removed')),
  purchased_at TIMESTAMPTZ,
  moved_to_investment_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key after investments table exists
ALTER TABLE wishlist_items
  ADD CONSTRAINT fk_wishlist_investment
  FOREIGN KEY (moved_to_investment_id)
  REFERENCES investments(id) ON DELETE SET NULL;

-- Add foreign key from investments to wishlist
ALTER TABLE investments
  ADD CONSTRAINT fk_investment_wishlist
  FOREIGN KEY (from_wishlist_id)
  REFERENCES wishlist_items(id) ON DELETE SET NULL;

-- ============================================
-- WISHLIST SHARES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS wishlist_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Share type
  share_type TEXT NOT NULL CHECK (share_type IN ('link', 'email', 'public')),
  share_token TEXT UNIQUE NOT NULL,
  shared_with_email TEXT,

  -- Permissions
  can_see_prices BOOLEAN DEFAULT TRUE,
  can_see_private BOOLEAN DEFAULT FALSE,
  can_claim_items BOOLEAN DEFAULT TRUE,

  -- Tracking
  last_accessed_at TIMESTAMPTZ,
  access_count INT DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AFFILIATE EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS affiliate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  wishlist_item_id UUID REFERENCES wishlist_items(id) ON DELETE SET NULL,
  share_id UUID REFERENCES wishlist_shares(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'conversion')),
  retailer TEXT,

  -- Conversion details
  order_amount DECIMAL(10,2),
  commission_amount DECIMAL(10,2),

  -- Tracking
  ip_hash TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Investments indexes
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments(user_id, category);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(user_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_investments_private ON investments(user_id, private);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(user_id, status);

-- Investment milestones indexes
CREATE INDEX IF NOT EXISTS idx_investment_milestones_user ON investment_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_milestones_type ON investment_milestones(user_id, type);

-- Wishlist indexes
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_status ON wishlist_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_wishlist_priority ON wishlist_items(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_wishlist_category ON wishlist_items(user_id, category);

-- Wishlist shares indexes
CREATE INDEX IF NOT EXISTS idx_wishlist_shares_token ON wishlist_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_wishlist_shares_user ON wishlist_shares(user_id);

-- Affiliate events indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_events_user ON affiliate_events(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_type ON affiliate_events(event_type);
CREATE INDEX IF NOT EXISTS idx_affiliate_events_wishlist ON affiliate_events(wishlist_item_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Investments RLS
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own investments" ON investments;
CREATE POLICY "Users can manage own investments"
  ON investments FOR ALL USING (auth.uid() = user_id);

-- Investment milestones RLS
ALTER TABLE investment_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own milestones" ON investment_milestones;
CREATE POLICY "Users can view own milestones"
  ON investment_milestones FOR ALL USING (auth.uid() = user_id);

-- Wishlist items RLS
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own wishlist" ON wishlist_items;
CREATE POLICY "Users can manage own wishlist"
  ON wishlist_items FOR ALL USING (auth.uid() = user_id);

-- Wishlist shares RLS
ALTER TABLE wishlist_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own shares" ON wishlist_shares;
CREATE POLICY "Users can manage own shares"
  ON wishlist_shares FOR ALL USING (auth.uid() = user_id);

-- Affiliate events RLS (users can see their own, system can insert)
ALTER TABLE affiliate_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own affiliate events" ON affiliate_events;
CREATE POLICY "Users can view own affiliate events"
  ON affiliate_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can insert affiliate events" ON affiliate_events;
CREATE POLICY "Anyone can insert affiliate events"
  ON affiliate_events FOR INSERT WITH CHECK (true);

-- ============================================
-- PUBLIC ACCESS FOR SHARED WISHLISTS
-- ============================================

-- Create a function to get shared wishlist by token (bypasses RLS)
CREATE OR REPLACE FUNCTION get_shared_wishlist(p_token TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  estimated_price DECIMAL(10,2),
  currency TEXT,
  original_url TEXT,
  affiliate_url TEXT,
  retailer TEXT,
  image_url TEXT,
  priority INT,
  notes TEXT,
  private BOOLEAN,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  status TEXT,
  can_see_prices BOOLEAN,
  can_see_private BOOLEAN,
  can_claim_items BOOLEAN,
  owner_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_share RECORD;
BEGIN
  -- Get share record and validate
  SELECT ws.*, up.preferred_name as owner_name
  INTO v_share
  FROM wishlist_shares ws
  LEFT JOIN user_profiles up ON ws.user_id = up.user_id
  WHERE ws.share_token = p_token
    AND ws.active = TRUE
    AND (ws.expires_at IS NULL OR ws.expires_at > NOW());

  IF v_share IS NULL THEN
    RETURN;
  END IF;

  -- Update access tracking
  UPDATE wishlist_shares
  SET access_count = access_count + 1,
      last_accessed_at = NOW()
  WHERE share_token = p_token;

  -- Return wishlist items based on permissions
  RETURN QUERY
  SELECT
    wi.id,
    wi.name,
    wi.category,
    CASE WHEN v_share.can_see_prices THEN wi.estimated_price ELSE NULL END,
    wi.currency,
    wi.original_url,
    wi.affiliate_url,
    wi.retailer,
    wi.image_url,
    wi.priority,
    wi.notes,
    wi.private,
    wi.claimed_by,
    wi.claimed_at,
    wi.status,
    v_share.can_see_prices,
    v_share.can_see_private,
    v_share.can_claim_items,
    v_share.owner_name
  FROM wishlist_items wi
  WHERE wi.user_id = v_share.user_id
    AND wi.status = 'active'
    AND (v_share.can_see_private OR wi.private = FALSE);
END;
$$;

-- Function to claim an item on shared wishlist
CREATE OR REPLACE FUNCTION claim_wishlist_item(
  p_token TEXT,
  p_item_id UUID,
  p_claimer_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_share RECORD;
BEGIN
  -- Validate share and permissions
  SELECT * INTO v_share
  FROM wishlist_shares
  WHERE share_token = p_token
    AND active = TRUE
    AND can_claim_items = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF v_share IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update the item
  UPDATE wishlist_items
  SET claimed_by = p_claimer_email,
      claimed_at = NOW()
  WHERE id = p_item_id
    AND user_id = v_share.user_id
    AND status = 'active'
    AND claimed_by IS NULL;

  RETURN FOUND;
END;
$$;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to investments
DROP TRIGGER IF EXISTS update_investments_updated_at ON investments;
CREATE TRIGGER update_investments_updated_at
  BEFORE UPDATE ON investments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to wishlist_items
DROP TRIGGER IF EXISTS update_wishlist_items_updated_at ON wishlist_items;
CREATE TRIGGER update_wishlist_items_updated_at
  BEFORE UPDATE ON wishlist_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION get_shared_wishlist(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_wishlist_item(TEXT, UUID, TEXT) TO anon, authenticated;
