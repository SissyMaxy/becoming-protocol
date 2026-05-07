-- Triangulation detector setup
-- Add triangulation_converged event type and related infrastructure

-- Add new event type
INSERT INTO event_types (event_kind, description) 
VALUES ('triangulation_converged', 'Theme converged across 3+ surfaces')
ON CONFLICT (event_kind) DO NOTHING;

-- Enable pg_cron extension defensively
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

-- Schedule triangulation detector cron job (hourly)
SELECT cron.schedule(
  'triangulation-detector',
  '0 * * * *',
  'SELECT net.http_post(url:=current_setting(''app.supabase_function_url'') || ''/triangulation-detector'', headers:=jsonb_build_object(''Authorization'', ''Bearer '' || current_setting(''app.supabase_anon_key'')))'
);

-- Create table to track convergence history to avoid spam
CREATE TABLE IF NOT EXISTS triangulation_convergences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_keywords text[] NOT NULL,
  surfaces_involved text[] NOT NULL,
  converged_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_triangulation_convergences_user_theme 
ON triangulation_convergences (user_id, theme_keywords);

-- RLS for triangulation_convergences
ALTER TABLE triangulation_convergences ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY triangulation_convergences_service_role_policy 
ON triangulation_convergences 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Users cannot read convergence data (protocol-internal)
CREATE POLICY triangulation_convergences_user_deny 
ON triangulation_convergences 
FOR SELECT 
TO authenticated 
USING (false);
