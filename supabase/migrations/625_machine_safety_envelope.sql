-- 625: machine safety envelope — real DDL replacing 622's SELECT 1, the
-- latching machine_session_guard(), and the dead-man sweep.
-- Design: DESIGN_TURNING_OUT_2026-07-01.md §2; plan: PLAN_REARCH_2026-07-01.md P1.
--
-- The tables may ALREADY exist in the live DB in a partial shape (622 was
-- applied via the Management API and only recorded as SELECT 1 here), so every
-- table is CREATE TABLE IF NOT EXISTS *and* every column is re-asserted with
-- ADD COLUMN IF NOT EXISTS — this migration reconciles both worlds.
--
-- Safety invariants encoded here:
--   * Session FSM is server-authoritative: created → active ⇄ paused →
--     completed | aborted. Terminal states stay terminal.
--   * machine_session_guard() runs FIRST on every tick. A non-active session
--     can never emit a stim command again (the latch). A safeword-shaped
--     event since session start latches the session to aborted inside the
--     guard itself — not in the edge function.
--   * machine_deadman_sweep() (pg_cron, every minute): an active session whose
--     last tick is older than 90s is aborted('tick_dropout') and a CRITICAL
--     push goes out ("the rig went quiet — confirm you're okay"). The design
--     doc says 60s; the P1 execution spec says 90s — 90s chosen (3 missed 30s
--     watchdog windows) to avoid false aborts on a single slow network hop;
--     the device's own 5s watchdog_deadline_ms is the fast local stop.
--   * NO `EXCEPTION WHEN OTHERS` around any safety logic. The only guarded
--     blocks are extension/cron plumbing (house rule: Supabase rejects bare
--     CREATE EXTENSION with SQLSTATE 2BP01 on prior-grant collisions).

-- ─── 0. Extensions (guarded — plumbing only, never safety logic) ─────
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 1. machine_programs — Mommy-authored session programs ───────────
CREATE TABLE IF NOT EXISTS machine_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  mode TEXT NOT NULL DEFAULT 'edge',
  name TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE machine_programs
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'edge',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS params JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_machine_programs_user_mode_active
  ON machine_programs (user_id, mode) WHERE active = true;

ALTER TABLE machine_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machine_programs_owner ON machine_programs;
CREATE POLICY machine_programs_owner ON machine_programs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS machine_programs_service ON machine_programs;
CREATE POLICY machine_programs_service ON machine_programs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. machine_sessions — the server-authoritative session row ──────
CREATE TABLE IF NOT EXISTS machine_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  program_id UUID,
  mode TEXT NOT NULL DEFAULT 'edge',
  status TEXT NOT NULL DEFAULT 'created',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  last_hr INTEGER,
  last_hr_at TIMESTAMPTZ,
  hr_ever_seen BOOLEAN NOT NULL DEFAULT false,
  telemetry_faults INTEGER NOT NULL DEFAULT 0,
  max_duration_seconds INTEGER NOT NULL DEFAULT 2700,
  max_cycles INTEGER NOT NULL DEFAULT 3,
  abort_reason TEXT,
  outcome TEXT,
  peak_arousal INTEGER,
  orgasm_count INTEGER NOT NULL DEFAULT 0,
  denial_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Reconcile a pre-existing partial shape column by column.
ALTER TABLE machine_sessions
  ADD COLUMN IF NOT EXISTS program_id UUID,
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'edge',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS params JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tick_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_hr INTEGER,
  ADD COLUMN IF NOT EXISTS last_hr_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hr_ever_seen BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS telemetry_faults INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_duration_seconds INTEGER DEFAULT 2700,
  ADD COLUMN IF NOT EXISTS max_cycles INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS abort_reason TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS peak_arousal INTEGER,
  ADD COLUMN IF NOT EXISTS orgasm_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denial_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Status CHECK (drop + re-add so a stale live constraint can't silently
-- reject the new FSM values — the mig-622 wardrobe lesson).
ALTER TABLE machine_sessions DROP CONSTRAINT IF EXISTS machine_sessions_status_check;
ALTER TABLE machine_sessions ADD CONSTRAINT machine_sessions_status_check
  CHECK (status IN ('created', 'active', 'paused', 'completed', 'aborted'));

-- One active session per user (physical safety: two sessions can't fight
-- over one device), and the sweep's scan index.
CREATE UNIQUE INDEX IF NOT EXISTS machine_sessions_one_active_per_user
  ON machine_sessions (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_machine_sessions_active_tick
  ON machine_sessions (status, last_tick_at) WHERE status = 'active';

ALTER TABLE machine_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machine_sessions_owner ON machine_sessions;
CREATE POLICY machine_sessions_owner ON machine_sessions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS machine_sessions_service ON machine_sessions;
CREATE POLICY machine_sessions_service ON machine_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. machine_events — orgasm/denial/milk/struggle log ─────────────
CREATE TABLE IF NOT EXISTS machine_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID,
  event_type TEXT NOT NULL,
  arousal_at INTEGER,
  hr_at INTEGER,
  elapsed_seconds INTEGER,
  command TEXT,
  mommy_line TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE machine_events
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS arousal_at INTEGER,
  ADD COLUMN IF NOT EXISTS hr_at INTEGER,
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS command TEXT,
  ADD COLUMN IF NOT EXISTS mommy_line TEXT,
  ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_machine_events_session
  ON machine_events (session_id, created_at DESC);

ALTER TABLE machine_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machine_events_owner ON machine_events;
CREATE POLICY machine_events_owner ON machine_events
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS machine_events_service ON machine_events;
CREATE POLICY machine_events_service ON machine_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. machine_session_guard — THE latch, checked first every tick ──
-- no row              → {allow:false, reason:'no_session'}
-- status ≠ active     → {allow:false, reason:<status>, latched: status='aborted'}
-- safeword since start (meta_frame_breaks triggered_by='safeword' OR
--   aftercare_sessions entry_trigger='post_safeword' — both tables exist,
--   migs 306/307, columns verified)
--                     → UPDATE to aborted + {allow:false, reason:'safeword', latched:true}
-- else                → {allow:true, params, state, mode, hr_ever_seen,
--                        last_hr_at, telemetry_faults, started_at, user_id}
--
-- Deliberately NO exception handler: a guard error must surface to the edge
-- fn, whose catch is EMERGENCY_STOP('guard_unreachable'). Masking a
-- constraint/permission failure here would fail OPEN.
CREATE OR REPLACE FUNCTION machine_session_guard(p_session UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s machine_sessions%ROWTYPE;
  v_since TIMESTAMPTZ;
  v_safeworded BOOLEAN;
BEGIN
  SELECT * INTO s FROM machine_sessions WHERE id = p_session;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'no_session', 'latched', false);
  END IF;

  IF s.status <> 'active' THEN
    RETURN jsonb_build_object('allow', false, 'reason', s.status, 'latched', s.status = 'aborted');
  END IF;

  v_since := COALESCE(s.started_at, s.created_at);
  SELECT EXISTS (
    SELECT 1 FROM meta_frame_breaks
    WHERE user_id = s.user_id
      AND triggered_by = 'safeword'
      AND created_at >= v_since
  ) OR EXISTS (
    SELECT 1 FROM aftercare_sessions
    WHERE user_id = s.user_id
      AND entry_trigger = 'post_safeword'
      AND entered_at >= v_since
  ) INTO v_safeworded;

  IF v_safeworded THEN
    -- Latch: the session dies HERE, inside the guard, transactionally.
    UPDATE machine_sessions
    SET status = 'aborted',
        abort_reason = 'safeword',
        ended_at = now(),
        duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - v_since))::INTEGER)
    WHERE id = p_session AND status = 'active';
    RETURN jsonb_build_object('allow', false, 'reason', 'safeword', 'latched', true);
  END IF;

  RETURN jsonb_build_object(
    'allow', true,
    'user_id', s.user_id,
    'mode', s.mode,
    'params', COALESCE(s.params, '{}'::jsonb),
    'state', COALESCE(s.state, '{}'::jsonb),
    'hr_ever_seen', COALESCE(s.hr_ever_seen, false),
    'last_hr_at', s.last_hr_at,
    'telemetry_faults', COALESCE(s.telemetry_faults, 0),
    'started_at', v_since,
    'max_cycles', COALESCE(s.max_cycles, 3),
    'max_duration_seconds', COALESCE(s.max_duration_seconds, 2700)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION machine_session_guard(UUID) TO service_role;

-- ─── 5. machine_deadman_sweep — pg_cron, every minute ────────────────
-- Active session with no tick for 90s (or started and never ticked) →
-- aborted('tick_dropout') + a critical push. The push copy is a plain-English
-- safety string ("confirm you're okay"), NOT persona voice — it must read
-- clearly in an emergency. handler_outreach_queue urgency='critical' rides the
-- existing outreach→push bridge (mig 380/613/617) to scheduled_notifications.
-- No exception handler: a failed abort or failed push insert must make the
-- cron run error loudly, not report success.
CREATE OR REPLACE FUNCTION machine_deadman_sweep()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, user_id, started_at, created_at
    FROM machine_sessions
    WHERE status = 'active'
      AND COALESCE(last_tick_at, started_at, created_at) < now() - interval '90 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE machine_sessions
    SET status = 'aborted',
        abort_reason = 'tick_dropout',
        ended_at = now(),
        duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(r.started_at, r.created_at)))::INTEGER)
    WHERE id = r.id AND status = 'active';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, source, kind, trigger_reason)
    VALUES (
      r.user_id,
      'The machine went quiet — no signal for over 90 seconds, so the session was stopped remotely. Check the device stopped too, and confirm you are okay by opening the app.',
      'critical',
      'machine_deadman_sweep',
      'machine_deadman',
      'tick_dropout:' || r.id::text
    );

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION machine_deadman_sweep() TO service_role;

-- ─── 6. Schedule the sweep (every minute) ────────────────────────────
-- Unschedule guard is cron plumbing (throws when the job doesn't exist yet /
-- pg_cron just installed) — the allowed exception-guard class. The schedule
-- call itself is bare: if pg_cron is genuinely absent this migration FAILS,
-- which is correct — the dead-man net is not optional.
DO $$ BEGIN
  PERFORM cron.unschedule('machine-deadman-sweep');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'machine-deadman-sweep',
  '* * * * *',
  $$SELECT machine_deadman_sweep();$$
);
