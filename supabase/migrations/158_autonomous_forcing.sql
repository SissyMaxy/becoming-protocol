-- 158: Autonomous Forcing Engine
-- Tables: daily_cycles, daily_obligations, consequence_history

-- =============================================
-- daily_cycles — Full day plan generated at 6am
-- =============================================
CREATE TABLE IF NOT EXISTS daily_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_date DATE NOT NULL,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  morning_status TEXT DEFAULT 'pending',
  midday_status TEXT DEFAULT 'pending',
  afternoon_status TEXT DEFAULT 'pending',
  evening_status TEXT DEFAULT 'pending',
  night_status TEXT DEFAULT 'pending',
  compliance_score FLOAT,
  consequences_fired INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, cycle_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_cycles_user_date ON daily_cycles(user_id, cycle_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_cycles_status ON daily_cycles(user_id, morning_status, midday_status, afternoon_status, evening_status, night_status);

ALTER TABLE daily_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_cycles_select" ON daily_cycles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_cycles_insert" ON daily_cycles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_cycles_update" ON daily_cycles FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- daily_obligations — Assigned social/content obligations
-- =============================================
CREATE TABLE IF NOT EXISTS daily_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obligation_date DATE NOT NULL,
  obligation_type TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'auto_completed')),
  consequence_on_failure TEXT,
  auto_complete_available BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_obligations_user_date ON daily_obligations(user_id, obligation_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_obligations_status ON daily_obligations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_daily_obligations_deadline ON daily_obligations(user_id, deadline) WHERE status = 'pending';

ALTER TABLE daily_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_obligations_select" ON daily_obligations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "daily_obligations_insert" ON daily_obligations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "daily_obligations_update" ON daily_obligations FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- consequence_history — Escalating consequence log
-- =============================================
CREATE TABLE IF NOT EXISTS consequence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consequence_level INTEGER NOT NULL,
  consequence_type TEXT NOT NULL,
  trigger_reason TEXT,
  executed BOOLEAN DEFAULT FALSE,
  directive_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consequence_history_user ON consequence_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consequence_history_level ON consequence_history(user_id, consequence_level);

ALTER TABLE consequence_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consequence_history_select" ON consequence_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "consequence_history_insert" ON consequence_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "consequence_history_update" ON consequence_history FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- device_schedule — Poisson-distributed device activations
-- =============================================
CREATE TABLE IF NOT EXISTS device_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 20),
  duration_seconds INTEGER NOT NULL,
  pattern TEXT DEFAULT 'pulse',
  paired_message TEXT,
  fired BOOLEAN DEFAULT FALSE,
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_schedule_user_date ON device_schedule(user_id, schedule_date DESC);
CREATE INDEX IF NOT EXISTS idx_device_schedule_pending ON device_schedule(user_id, scheduled_at) WHERE fired = FALSE;

ALTER TABLE device_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_schedule_select" ON device_schedule FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "device_schedule_insert" ON device_schedule FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_schedule_update" ON device_schedule FOR UPDATE USING (auth.uid() = user_id);
