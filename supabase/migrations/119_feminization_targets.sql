-- Feminization Targets
-- Persistent weekly target that shapes every Handler prescription.
-- Exposure level ratchet (never decrements) tracks progressive content escalation.

CREATE TABLE IF NOT EXISTS feminization_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Current target
  target_domain TEXT NOT NULL,
  target_description TEXT NOT NULL,
  target_metric TEXT,
  target_intensity INTEGER DEFAULT 3,

  -- Escalation tracking
  exposure_level INTEGER DEFAULT 1,
  comfort_zone_edge TEXT,
  last_boundary_pushed TEXT,
  last_boundary_pushed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'replaced')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  replaced_by UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feminization_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own targets" ON feminization_targets
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_fem_targets_active ON feminization_targets(user_id, status) WHERE status = 'active';

-- Add exposure_level and feminization_payload to shoot_prescriptions
ALTER TABLE shoot_prescriptions ADD COLUMN IF NOT EXISTS exposure_level INTEGER DEFAULT 1;
ALTER TABLE shoot_prescriptions ADD COLUMN IF NOT EXISTS feminization_payload TEXT;
