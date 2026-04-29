-- Migration 226: structured truth columns on maxy_facts.
-- Existing stateable_facts (JSONB) is for free-form deflection; these are
-- machine-readable booleans + dates that drive the slop-detector and profile
-- generators directly. Single source of truth — no fabrication possible if
-- generators consult these and slop-detector enforces them.

ALTER TABLE maxy_facts
  ADD COLUMN IF NOT EXISTS on_hrt BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hrt_start_date DATE,
  ADD COLUMN IF NOT EXISTS chastity_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chastity_start_date DATE,
  ADD COLUMN IF NOT EXISTS out_publicly BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_name TEXT,
  ADD COLUMN IF NOT EXISTS chosen_name TEXT,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS pronouns TEXT;
