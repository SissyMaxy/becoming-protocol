-- Lovense Cloud API Tables
-- Device management and haptic pattern library

-- ============================================
-- LOVENSE CONNECTIONS (Cloud API auth)
-- ============================================

CREATE TABLE IF NOT EXISTS lovense_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cloud API credentials
  uid TEXT, -- Lovense user ID
  token TEXT, -- API token

  -- Connection status
  connected_at TIMESTAMP WITH TIME ZONE,
  last_ping_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_lovense_connections_user_id ON lovense_connections(user_id);

-- ============================================
-- LOVENSE DEVICES (Connected toys)
-- ============================================

CREATE TABLE IF NOT EXISTS lovense_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Device identifiers
  toy_id TEXT NOT NULL, -- Lovense toy ID
  toy_name TEXT, -- e.g. "Lush", "Hush", "Max"
  toy_type TEXT, -- Type classification
  nickname TEXT, -- User-defined name

  -- Status
  is_connected BOOLEAN DEFAULT FALSE,
  battery_level INTEGER,
  firmware_version TEXT,

  -- Timestamps
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, toy_id)
);

CREATE INDEX IF NOT EXISTS idx_lovense_devices_user_id ON lovense_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_lovense_devices_connected ON lovense_devices(is_connected);
CREATE INDEX IF NOT EXISTS idx_lovense_devices_last_seen ON lovense_devices(last_seen_at);

-- ============================================
-- HAPTIC PATTERNS (Pattern library)
-- ============================================

CREATE TABLE IF NOT EXISTS haptic_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern identity
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT, -- reward, punishment, tease, edge, conditioning

  -- Pattern definition
  pattern JSONB NOT NULL, -- Array of {intensity, duration} steps
  total_duration_ms INTEGER, -- Total duration in milliseconds

  -- Context
  use_context TEXT[], -- Array of contexts: task_complete, edge_reached, etc.

  -- Metadata
  is_system BOOLEAN DEFAULT TRUE, -- System vs user-created
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL for system patterns
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to existing table if needed
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS pattern JSONB;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS use_context TEXT[];
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT TRUE;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE haptic_patterns ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_haptic_patterns_name ON haptic_patterns(name);
CREATE INDEX IF NOT EXISTS idx_haptic_patterns_category ON haptic_patterns(category);
CREATE INDEX IF NOT EXISTS idx_haptic_patterns_context ON haptic_patterns USING GIN(use_context);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE lovense_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lovense_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE haptic_patterns ENABLE ROW LEVEL SECURITY;

-- Connections: Users can only access their own
DROP POLICY IF EXISTS "Users can view own connection" ON lovense_connections;
CREATE POLICY "Users can view own connection" ON lovense_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own connection" ON lovense_connections;
CREATE POLICY "Users can insert own connection" ON lovense_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own connection" ON lovense_connections;
CREATE POLICY "Users can update own connection" ON lovense_connections
  FOR UPDATE USING (auth.uid() = user_id);

-- Devices: Users can only access their own
DROP POLICY IF EXISTS "Users can view own devices" ON lovense_devices;
CREATE POLICY "Users can view own devices" ON lovense_devices
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON lovense_devices;
CREATE POLICY "Users can insert own devices" ON lovense_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON lovense_devices;
CREATE POLICY "Users can update own devices" ON lovense_devices
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON lovense_devices;
CREATE POLICY "Users can delete own devices" ON lovense_devices
  FOR DELETE USING (auth.uid() = user_id);

-- Patterns: System patterns readable by all, user patterns only by owner
DROP POLICY IF EXISTS "Anyone can read system patterns" ON haptic_patterns;
CREATE POLICY "Anyone can read system patterns" ON haptic_patterns
  FOR SELECT USING (is_system = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own patterns" ON haptic_patterns;
CREATE POLICY "Users can insert own patterns" ON haptic_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can update own patterns" ON haptic_patterns;
CREATE POLICY "Users can update own patterns" ON haptic_patterns
  FOR UPDATE USING (auth.uid() = user_id AND is_system = false);

-- Note: Seed patterns not included as existing table has different schema
-- Patterns should be added via the application or a separate data migration
