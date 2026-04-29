-- 240 — Voice corpus quality gate + deploy health monitor table
--
-- Two adjacent issues:
-- (a) user_voice_corpus was being polluted by regression test fixtures and
--     by the user's implementation-chat with Claude Code. Bigrams showed
--     "test regression", "claude code", "morning heather" as her signature
--     phrases. The Handler then mirrored that voice. Garbage in, garbage out.
-- (b) No autonomous engine reads GitHub/Vercel/Supabase deploy logs after a
--     push. User finds out via emails. Build a monitor table for an edge
--     function (deploy-health-monitor) to write into.

-- (a) Voice ingest filter — already applied via direct ALTER, included here
--     for migration audit and replay.
CREATE OR REPLACE FUNCTION public.trg_handler_messages_to_voice()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.role = 'user' THEN
    -- Skip regression-test fixtures — they pollute corpus + propagate into
    -- memory_implants via auto-promotion. Test data must never become voice.
    IF NEW.content ~* '(TEST regression|TEST_USER|<placeholder>|regression admission|regression auto-bind)' THEN
      RETURN NEW;
    END IF;
    -- Skip implementation-chat (she writes TO Claude Code about building the
    -- system). Voice corpus = her natural voice, not her engineering voice.
    -- Heuristic: presence of dev/system terms signals implementation chat.
    IF NEW.content ~* '(claude code|edge function|migration|supabase|vercel|github|preflight|lint|baseline|cron job|deploy|dashboard|repo|commit|tone lead|handler opens|assign tasks|system start|open threads|morning heather)' THEN
      RETURN NEW;
    END IF;
    PERFORM ingest_voice_sample(
      NEW.user_id,
      NEW.content,
      'handler_dm',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- (b) deploy_health_log — every monitor poll writes one row per failure.
CREATE TABLE IF NOT EXISTS public.deploy_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,           -- 'github_actions' | 'vercel' | 'supabase_edge' | 'preflight'
  severity text NOT NULL DEFAULT 'high',  -- 'critical' | 'high' | 'medium' | 'low'
  status text NOT NULL DEFAULT 'open',    -- 'open' | 'acknowledged' | 'resolved' | 'autopatched'
  ref_id text,                    -- run id / deployment id / function id
  ref_url text,                   -- direct link to the failure
  title text NOT NULL,
  detail text,
  hash text,                      -- dedup key (source|ref_id|title)
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  raw jsonb
);

CREATE INDEX IF NOT EXISTS idx_deploy_health_log_user_status ON public.deploy_health_log(user_id, status, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deploy_health_log_hash ON public.deploy_health_log(user_id, hash) WHERE hash IS NOT NULL;

ALTER TABLE public.deploy_health_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own deploy health" ON public.deploy_health_log;
CREATE POLICY "Users see own deploy health" ON public.deploy_health_log
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service writes deploy health" ON public.deploy_health_log;
CREATE POLICY "Service writes deploy health" ON public.deploy_health_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- (c) handler_reply_grades — every Handler reply gets a quality score
CREATE TABLE IF NOT EXISTS public.handler_reply_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  message_id uuid,
  reply_text text NOT NULL,
  graded_at timestamptz NOT NULL DEFAULT now(),
  -- Sub-scores 0-100. Lower = worse.
  score_voice_match int,         -- does it sound like her?
  score_status_dump int,         -- inverse: 100 = no telemetry leaks
  score_one_command int,         -- 100 = single CTA
  score_protocol_alignment int,  -- 100 = escalating, not coddling
  score_overall int,             -- weighted sum
  verdict text,                  -- 'pass' | 'borderline' | 'fail'
  failure_reasons jsonb,         -- ["status_dump: 'Day 3 denied'", ...]
  graded_by text,                -- model id
  was_rerolled boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_handler_reply_grades_user_verdict ON public.handler_reply_grades(user_id, verdict, graded_at DESC);
ALTER TABLE public.handler_reply_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own grades" ON public.handler_reply_grades;
CREATE POLICY "Users see own grades" ON public.handler_reply_grades
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service writes grades" ON public.handler_reply_grades;
CREATE POLICY "Service writes grades" ON public.handler_reply_grades
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- (d) loophole_findings — daily output of the loophole hunter
CREATE TABLE IF NOT EXISTS public.loophole_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  loophole_title text NOT NULL,
  pattern_evidence text,
  exploitation_count int,        -- how many times observed in window
  suggested_close text,          -- escalation move to seal it
  severity text DEFAULT 'medium',
  detected_by text,              -- model id (alternating provider)
  status text DEFAULT 'open',    -- 'open' | 'closing' | 'closed' | 'dismissed'
  closed_via_id uuid,            -- handler_decrees.id or punishment_queue.id that addressed it
  hash text
);

CREATE INDEX IF NOT EXISTS idx_loophole_findings_user_status ON public.loophole_findings(user_id, status, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_loophole_findings_hash ON public.loophole_findings(user_id, hash) WHERE hash IS NOT NULL;
ALTER TABLE public.loophole_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own loopholes" ON public.loophole_findings;
CREATE POLICY "Users see own loopholes" ON public.loophole_findings
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service writes loopholes" ON public.loophole_findings;
CREATE POLICY "Service writes loopholes" ON public.loophole_findings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
