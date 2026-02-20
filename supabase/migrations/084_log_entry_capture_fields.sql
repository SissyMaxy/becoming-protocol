-- Migration 084: Add capture_fields column to task_bank + orgasm ledger task
-- capture_fields stores a JSON array of field definitions for log_entry completion type

-- Add capture_fields JSONB column
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS
  capture_fields JSONB DEFAULT NULL;

COMMENT ON COLUMN task_bank.capture_fields IS 'JSON array of CaptureFieldDef for log_entry completion type';

-- Insert the orgasm ledger task
INSERT INTO task_bank (
  id, category, domain, intensity,
  instruction, subtext,
  requires, exclude_if,
  completion_type, duration_minutes, target_count,
  points, affirmation,
  can_intensify, can_clone, track_resistance, is_core,
  created_by, active,
  capture_fields
) VALUES (
  'orgasm-ledger-001',
  'measure',
  'arousal',
  2,
  'Log your orgasm in the ledger',
  'Every release is tracked. Every detail recorded. The Handler sees everything.',
  '{}'::jsonb,
  '{}'::jsonb,
  'log_entry',
  NULL,
  NULL,
  10,
  'Good girl. Honesty earns trust.',
  false, false, true, true,
  'seed',
  true,
  '[
    {"key":"date","type":"date","default":"today"},
    {"key":"type","type":"select","options":["full","ruined","hands-free","denied","sissygasm"]},
    {"key":"method","type":"select","options":["prostate","penile","vibrator","partner","other"]},
    {"key":"authorized","type":"toggle","label":"Handler-authorized"},
    {"key":"arousal_before","type":"slider","min":1,"max":10},
    {"key":"arousal_after","type":"slider","min":1,"max":10},
    {"key":"notes","type":"text","optional":true}
  ]'::jsonb
);
