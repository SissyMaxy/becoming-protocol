-- Sprint 6: Integration & Polish
-- custom_orders, wardrobe_inventory, content_events, narrative_arc_progress

-- ============================================
-- Custom Orders — fan content requests
-- ============================================

CREATE TABLE IF NOT EXISTS custom_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  fan_username TEXT,
  platform TEXT,
  inquiry_text TEXT NOT NULL,
  handler_evaluation TEXT,
  quoted_price_cents INTEGER,
  accepted BOOLEAN,
  shoot_prescription_id UUID,
  media_paths TEXT[] DEFAULT '{}',
  delivery_status TEXT DEFAULT 'inquiry'
    CHECK (delivery_status IN ('inquiry', 'quoted', 'accepted', 'in_progress', 'captured', 'editing', 'delivered', 'cancelled')),
  delivered_at TIMESTAMPTZ,
  revenue_cents INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_orders_user_status
  ON custom_orders(user_id, delivery_status);

ALTER TABLE custom_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own custom orders"
  ON custom_orders FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Wardrobe Inventory — tier-based wardrobe items
-- ============================================

CREATE TABLE IF NOT EXISTS wardrobe_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('lingerie', 'hosiery', 'accessories', 'shoes', 'tops', 'bottoms', 'makeup', 'wigs')),
  tier INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 3),
  purchase_url TEXT,
  estimated_cost_cents INTEGER,
  purchased BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMPTZ,
  unlocked_by_milestone TEXT,
  content_types_enabled TEXT[] DEFAULT '{}',
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_user_tier
  ON wardrobe_inventory(user_id, tier);

ALTER TABLE wardrobe_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wardrobe"
  ON wardrobe_inventory FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Content Events — milestone-triggered content
-- ============================================

CREATE TABLE IF NOT EXISTS content_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  trigger_data JSONB DEFAULT '{}',
  content_produced BOOLEAN DEFAULT FALSE,
  shoot_prescription_id UUID,
  posts_created INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_events_user_type
  ON content_events(user_id, event_type);

ALTER TABLE content_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own content events"
  ON content_events FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Narrative Arc Progress — long-arc tracking
-- ============================================

CREATE TABLE IF NOT EXISTS narrative_arc_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  arc_number INTEGER NOT NULL CHECK (arc_number BETWEEN 1 AND 6),
  arc_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  seeds_planted JSONB DEFAULT '[]',
  key_moments JSONB DEFAULT '[]',
  handler_context TEXT,
  status TEXT DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, arc_number)
);

ALTER TABLE narrative_arc_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own narrative arcs"
  ON narrative_arc_progress FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Corruption Milestones — revenue event tracking
-- ============================================

CREATE TABLE IF NOT EXISTS corruption_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  milestone_key TEXT NOT NULL,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  milestone_data JSONB DEFAULT '{}',
  corruption_event_logged BOOLEAN DEFAULT FALSE,
  handler_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_corruption_milestones_user
  ON corruption_milestones(user_id, triggered);

ALTER TABLE corruption_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own corruption milestones"
  ON corruption_milestones FOR ALL USING (auth.uid() = user_id);
