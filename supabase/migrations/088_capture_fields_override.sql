-- ============================================================
-- AI-Generated Capture Field Overrides
-- Migration: 088_capture_fields_override.sql
-- February 2026
--
-- When the Handler AI rewrites task copy to ask for data input,
-- these columns store the completion type and field definitions
-- so the UI renders the correct input form instead of a Done button.
-- Also adds context_line for Handler-voiced framing above the instruction.
-- ============================================================

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS completion_type_override TEXT DEFAULT NULL;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS capture_fields_override JSONB DEFAULT NULL;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS enhanced_context_line TEXT DEFAULT NULL;
