-- Add notes column to compulsory_completions
-- Allows storing log data (morning intention, physical state summary, evening reflection)
ALTER TABLE compulsory_completions ADD COLUMN IF NOT EXISTS notes TEXT;
