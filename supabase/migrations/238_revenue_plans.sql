-- Migration 238: revenue_plans + revenue_plan_items
-- Handler-generated weekly revenue plan. The planner edge function
-- writes a revenue_plans row + revenue_plan_items + handler_decrees.
-- Each item tracks projected vs actual revenue. Sunday review scores
-- conversion and feeds the next week's strategy.

CREATE TABLE IF NOT EXISTS revenue_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reviewed', 'cancelled')),
  projected_cents INTEGER NOT NULL DEFAULT 0,
  actual_cents INTEGER NOT NULL DEFAULT 0,
  plan_summary TEXT,
  reasoning TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_plans_user_week
  ON revenue_plans (user_id, week_start);

ALTER TABLE revenue_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revenue_plans_owner ON revenue_plans;
CREATE POLICY revenue_plans_owner ON revenue_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS revenue_plans_service ON revenue_plans;
CREATE POLICY revenue_plans_service ON revenue_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS revenue_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES revenue_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_label TEXT NOT NULL,
  deliverable TEXT,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  projected_cents INTEGER NOT NULL,
  actual_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'missed', 'cancelled')),
  deadline TIMESTAMPTZ,
  decree_id UUID,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_plan_items_plan ON revenue_plan_items (plan_id);
CREATE INDEX IF NOT EXISTS idx_revenue_plan_items_user_status ON revenue_plan_items (user_id, status);

ALTER TABLE revenue_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revenue_plan_items_owner ON revenue_plan_items;
CREATE POLICY revenue_plan_items_owner ON revenue_plan_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS revenue_plan_items_service ON revenue_plan_items;
CREATE POLICY revenue_plan_items_service ON revenue_plan_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
