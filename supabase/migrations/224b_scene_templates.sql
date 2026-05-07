-- Migration 224: scene templates for multi-turn mommy-dom arcs.
-- See corresponding apply_migration call for full DDL + seed data.

CREATE TABLE IF NOT EXISTS scene_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  flavor TEXT NOT NULL,
  description TEXT,
  beats JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_templates_flavor ON scene_templates (flavor);

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS active_scene_template_id UUID REFERENCES scene_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scene_beat_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scene_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_active_scene
  ON contacts (active_scene_template_id)
  WHERE active_scene_template_id IS NOT NULL;
