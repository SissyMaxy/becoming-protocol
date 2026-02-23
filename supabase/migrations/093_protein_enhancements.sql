-- Migration 093: Protein tracking enhancements
-- Adds gram adjustments (low/med/high per source), supplement tracking columns.

-- Per-source gram level overrides (e.g. {"shakePostWorkout":"high","lunchProtein":"low"})
ALTER TABLE daily_protein ADD COLUMN IF NOT EXISTS gram_adjustments JSONB DEFAULT '{}';

-- Supplement tracking (phase-gated by handler)
ALTER TABLE daily_protein ADD COLUMN IF NOT EXISTS supplement_protein BOOLEAN DEFAULT false;
ALTER TABLE daily_protein ADD COLUMN IF NOT EXISTS supplement_creatine BOOLEAN DEFAULT false;
ALTER TABLE daily_protein ADD COLUMN IF NOT EXISTS supplement_collagen BOOLEAN DEFAULT false;
