-- Migration 021: State Logs View
-- Creates a view to alias feminine_state_logs as state_logs with logged_at column
-- This resolves the mismatch between code expecting 'state_logs.logged_at'
-- and the actual table 'feminine_state_logs.timestamp'

-- ============================================
-- STATE LOGS VIEW
-- Maps feminine_state_logs to state_logs with column aliases
-- ============================================
CREATE OR REPLACE VIEW state_logs AS
SELECT
  id,
  user_id,
  timestamp AS logged_at,
  state_score,
  prompt_type,
  context,
  triggers_present,
  notes
FROM feminine_state_logs;

-- ============================================
-- ENABLE RLS ON THE VIEW
-- Views inherit RLS from underlying tables, but we need
-- to grant access and set up security invoker
-- ============================================

-- Grant access to authenticated users (RLS on base table will filter)
GRANT SELECT ON state_logs TO authenticated;

-- For inserts/updates through the view, create rules
CREATE OR REPLACE RULE state_logs_insert AS
ON INSERT TO state_logs
DO INSTEAD
INSERT INTO feminine_state_logs (user_id, timestamp, state_score, prompt_type, context, triggers_present, notes)
VALUES (NEW.user_id, COALESCE(NEW.logged_at, NOW()), NEW.state_score, NEW.prompt_type, NEW.context, NEW.triggers_present, NEW.notes);

CREATE OR REPLACE RULE state_logs_update AS
ON UPDATE TO state_logs
DO INSTEAD
UPDATE feminine_state_logs
SET
  timestamp = NEW.logged_at,
  state_score = NEW.state_score,
  prompt_type = NEW.prompt_type,
  context = NEW.context,
  triggers_present = NEW.triggers_present,
  notes = NEW.notes
WHERE id = OLD.id AND user_id = auth.uid();

CREATE OR REPLACE RULE state_logs_delete AS
ON DELETE TO state_logs
DO INSTEAD
DELETE FROM feminine_state_logs
WHERE id = OLD.id AND user_id = auth.uid();
