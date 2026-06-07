-- 491 — Daily focus picker.
--
-- ARCHITECTURAL CORRECTION: After shipping 25+ ladders in this session
-- both users had 14-27 active decrees each. Violates the standing
-- feedback_one_task_focus rule (Today defaults to FocusMode, single
-- task, one CTA). The ladders are useful as accumulating WORK; what
-- was missing is the TRIAGE layer that picks ONE per day.
--
-- focus_picker_eval (daily 05:00 UTC) picks per user:
--   1. Overdue (deadline within next 12h) — highest priority
--   2. Highest urgency, prefer least-recently-fulfilled ladder
--      (rotate across systems to prevent same-ladder fatigue)
--   3. Random tiebreak
--
-- Tags chosen decree's outreach context_data.focus_today=true +
-- proof_payload.focus_today=true. FocusMode UI reads focus_picks
-- table directly for the day's pick and surfaces ABOVE all other
-- priority logic.
--
-- All other decrees still exist; the ladders still propagate
-- fulfillment correctly. They just aren't pushed.

CREATE TABLE IF NOT EXISTS focus_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decree_id UUID NOT NULL, pick_date DATE NOT NULL, pick_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pick_date)
);
ALTER TABLE focus_picks ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY focus_picks_self ON focus_picks FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Full eval function + cron applied via DB (see deployed function).
