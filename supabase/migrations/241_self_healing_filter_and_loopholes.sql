-- 241 — leak_patterns (runtime-extensible filter) +
--       trajectory_predictions (next-24h dodge risk).

CREATE TABLE IF NOT EXISTS public.leak_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  source_phrase text,
  extracted_from_grade_id uuid REFERENCES handler_reply_grades(id) ON DELETE SET NULL,
  category text DEFAULT 'status_dump',
  active boolean DEFAULT true,
  hit_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_leak_patterns_user_active ON public.leak_patterns(user_id, active);
ALTER TABLE public.leak_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own leak_patterns" ON public.leak_patterns;
CREATE POLICY "user reads own leak_patterns" ON public.leak_patterns FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes leak_patterns" ON public.leak_patterns;
CREATE POLICY "service writes leak_patterns" ON public.leak_patterns FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.trajectory_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  predicted_at timestamptz NOT NULL DEFAULT now(),
  horizon_hours int DEFAULT 24,
  risk_title text NOT NULL,
  risk_kind text,                     -- 'task_avoidance' | 'mantra_skip' | 'gate_dodge' | 'voice_skip' | etc.
  predicted_dodge_at timestamptz,
  confidence int,                     -- 0-100
  evidence text,
  preemptive_action text,             -- the move queued to land before the predicted dodge
  preemptive_action_id uuid,          -- punishment_queue/decrees/outreach_queue id
  outcome text,                       -- 'predicted_correctly' | 'predicted_wrong' | 'pending'
  predicted_by text                   -- model id
);
CREATE INDEX IF NOT EXISTS idx_trajectory_user_pending ON public.trajectory_predictions(user_id, outcome, predicted_dodge_at);
ALTER TABLE public.trajectory_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own trajectory" ON public.trajectory_predictions;
CREATE POLICY "user reads own trajectory" ON public.trajectory_predictions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "service writes trajectory" ON public.trajectory_predictions;
CREATE POLICY "service writes trajectory" ON public.trajectory_predictions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
