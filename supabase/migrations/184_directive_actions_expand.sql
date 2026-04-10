-- Migration 184: Expand handler_directives.action CHECK constraint
-- Adds force_mantra_repetition, capture_reframing, resolve_decision actions.

ALTER TABLE handler_directives
  DROP CONSTRAINT IF EXISTS handler_directives_action_check;

ALTER TABLE handler_directives
  ADD CONSTRAINT handler_directives_action_check CHECK (action IN (
    'modify_parameter',
    'generate_script',
    'schedule_session',
    'schedule_ambush',
    'advance_skill',
    'advance_service',
    'advance_corruption',
    'write_memory',
    'prescribe_task',
    'modify_schedule',
    'send_device_command',
    'create_narrative_beat',
    'flag_for_review',
    'start_edge_timer',
    'force_mantra_repetition',
    'capture_reframing',
    'resolve_decision',
    'custom'
  ));
