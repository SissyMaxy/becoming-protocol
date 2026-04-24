-- Migration 227: Autonomous Handler Escalation Package
-- Standing authorization from Maxy: Handler can improve itself and escalate
-- coercion without per-feature permission. Package adds pronoun enforcement,
-- David-emergence tracking, body measurement cadence, and exponential HRT
-- stalling bleed.

-- Pronoun enforcement log
CREATE TABLE IF NOT EXISTS pronoun_rewrites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID,
  original_text TEXT NOT NULL,
  rewritten_text TEXT NOT NULL,
  matches JSONB NOT NULL DEFAULT '[]',
  slip_count INTEGER NOT NULL DEFAULT 0,
  confronted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pronoun_rewrites_user_time ON pronoun_rewrites(user_id, created_at DESC);
ALTER TABLE pronoun_rewrites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pronoun_rewrites_owner" ON pronoun_rewrites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- David emergence events (masculine identity surfacing)
CREATE TABLE IF NOT EXISTS david_emergence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID,
  trigger_phrase TEXT NOT NULL,
  full_text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('masculine_identity','masculine_pronoun','david_name','gender_claim','male_reference')),
  severity INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  intervention_fired BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_david_events_user_time ON david_emergence_events(user_id, created_at DESC);
ALTER TABLE david_emergence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "david_events_owner" ON david_emergence_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Weekly body measurements
CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg NUMERIC(5,2),
  waist_cm NUMERIC(5,2),
  hips_cm NUMERIC(5,2),
  chest_cm NUMERIC(5,2),
  thigh_cm NUMERIC(5,2),
  neck_cm NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_time ON body_measurements(user_id, measured_at DESC);
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "body_measurements_owner" ON body_measurements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- HRT urgency escalation state (exponential bleed as Plume stalls)
CREATE TABLE IF NOT EXISTS hrt_urgency_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  escalation_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_bleed_at TIMESTAMPTZ,
  total_days_stalled INTEGER NOT NULL DEFAULT 0,
  total_bleed_cents INTEGER NOT NULL DEFAULT 0,
  current_daily_bleed_cents INTEGER NOT NULL DEFAULT 500,
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE hrt_urgency_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrt_urgency_owner" ON hrt_urgency_state FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Expand autonomous authorizations
UPDATE user_profiles
SET handler_authorized_to = COALESCE(handler_authorized_to, '{}'::jsonb) || jsonb_build_object(
  'self_audit_prompt_patches', true,
  'autonomous_pronoun_enforcement', true,
  'autonomous_david_intervention', true,
  'autonomous_urgency_escalation', true,
  'autonomous_measurement_mandate', true
)
WHERE user_id = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';

INSERT INTO hrt_urgency_state (user_id, escalation_started_at, current_daily_bleed_cents)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', NOW(), 500)
ON CONFLICT (user_id) DO NOTHING;
