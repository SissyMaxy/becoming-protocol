-- Migration 061: Collection management — wigs, scent products, anchor objects
-- Physical identity artifacts for "Her World"

-- ===========================================
-- 1. Wig Collection
-- ===========================================

CREATE TABLE IF NOT EXISTS wig_collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'synthetic', 'human_hair', 'blend'
  color TEXT,
  length TEXT, -- 'pixie', 'bob', 'medium', 'long'
  lace_type TEXT, -- 'lace_front', 'full_lace', 'none'
  purchase_price DECIMAL,
  purchase_date DATE,
  times_worn INTEGER DEFAULT 0,
  last_worn_at TIMESTAMPTZ,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wig_collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wigs" ON wig_collection
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wigs" ON wig_collection
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wigs" ON wig_collection
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wigs" ON wig_collection
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wig_collection_user
  ON wig_collection(user_id, created_at DESC);

-- ===========================================
-- 2. Scent Products
-- ===========================================

CREATE TABLE IF NOT EXISTS scent_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  scent_notes TEXT,
  is_signature BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  needs_restock BOOLEAN DEFAULT false,
  purchase_price DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scent_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scents" ON scent_products
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scents" ON scent_products
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scents" ON scent_products
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scents" ON scent_products
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scent_products_user
  ON scent_products(user_id, created_at DESC);

-- ===========================================
-- 3. Scent Pairings
-- ===========================================

CREATE TABLE IF NOT EXISTS scent_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  scent_product_id UUID REFERENCES scent_products ON DELETE CASCADE NOT NULL,
  paired_with TEXT NOT NULL, -- 'arousal', 'edge', 'morning', 'workout', 'sleep'
  pairing_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scent_pairings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pairings" ON scent_pairings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pairings" ON scent_pairings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pairings" ON scent_pairings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pairings" ON scent_pairings
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scent_pairings_product
  ON scent_pairings(scent_product_id);

-- ===========================================
-- 4. Anchor Objects
-- ===========================================

CREATE TABLE IF NOT EXISTS anchor_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  wear_frequency TEXT DEFAULT 'daily',
  is_active BOOLEAN DEFAULT true,
  acquired_date DATE,
  cost DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE anchor_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anchors" ON anchor_objects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own anchors" ON anchor_objects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own anchors" ON anchor_objects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own anchors" ON anchor_objects
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_anchor_objects_user
  ON anchor_objects(user_id, created_at DESC);
