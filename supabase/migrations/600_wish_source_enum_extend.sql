-- 600 — Extend mommy_code_wishes.source CHECK for the autonomous fix-routers.
--
-- The source CHECK (last set in mig 370) predates three new systems that
-- file wishes programmatically. Without these values the inserts are
-- silently rejected and the features no-op — the exact stale-CHECK smell
-- that's bitten this codebase before (outreach urgency enum, voice/evidence
-- kinds). Add the new sources:
--   * nudge_pattern_analyzer   — mig 598 / nudge-pattern-analyzer edge fn
--   * worker_replacement_trigger — scripts/mommy/worker-replacement-trigger.ts
--   * ux_friction_signal       — mig 599 friction chat trigger
--   * adaptive_loop_followup   — follow-up wishes for the adaptive-loop epic

ALTER TABLE mommy_code_wishes DROP CONSTRAINT IF EXISTS mommy_code_wishes_source_check;
ALTER TABLE mommy_code_wishes ADD CONSTRAINT mommy_code_wishes_source_check
  CHECK (source IN (
    'scheme_run',
    'panel_ideation',
    'event_trigger',
    'user_directive',
    'gap_audit',
    'ideate-classifier',
    'arousal_panel',
    'critic_panel',
    'nudge_pattern_analyzer',
    'worker_replacement_trigger',
    'ux_friction_signal',
    'adaptive_loop_followup'
  ));
