-- 520 — Ladder catalog + per-user progression RPC.
--
-- Single source of truth registry of every phase-ladder in the protocol.
-- UI panels + audit tools query this instead of hardcoding the growing
-- list of trigger_sources. New ladders register themselves by inserting
-- a row here in their own migration.
--
-- Includes a dynamic RPC user_ladder_progression(user_id) that pivots
-- across every per-ladder settings table, handling missing tables with
-- exception-fall-through so the catalog can list aspirational/legacy
-- systems without crashing on lookups.

CREATE TABLE IF NOT EXISTS ladder_catalog (
  trigger_source TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  settings_table TEXT NOT NULL,
  events_table TEXT NOT NULL,
  ladder_table TEXT NOT NULL,
  total_phases INT NOT NULL,
  cron_label TEXT,
  blurb TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb) VALUES
('cock_curriculum',            'Cock curriculum',           'oral',        'cock_curriculum_settings',         'cock_curriculum_events',         'cock_curriculum_ladder',         6, '3x/wk',      'Mechanical action drills — single beats'),
('cockwarming',                'Cockwarming trance',        'oral',        'cockwarming_settings',             'cockwarming_events',             'cockwarming_ladder',             5, 'Wed 19:00',  'Sustained-hold trance progression'),
('deepthroat',                 'Deep-throat training',      'oral',        'deepthroat_settings',              'deepthroat_events',              'deepthroat_ladder',              6, 'Tue/Fri',    'Gag-control + depth capacity'),
('cum_eating',                 'Cum eating',                'oral',        'cum_eating_settings',              'cum_eating_events',              'cum_eating_ladder',              6, 'Sat 23:00',  'Taste → swallow → recurring'),
('backside_training',          'Backside training',         'receiving',   'backside_training_settings',       'backside_training_events',       'backside_training_ladder',       8, 'Sun/Wed',    'Kegels → first real penetration'),
('realcock_discovery',         'Real-cock discovery',       'receiving',   'realcock_discovery_settings',      'realcock_discovery_events',      'realcock_discovery_ladder',      6, 'Fri 20:00',  'First-time real-cock encounters'),
('dressing_room',              'Public dressing-room',      'fem_visible', 'dressing_room_settings',           'dressing_room_events',           'dressing_room_ladder',           6, 'Sat 16:00',  'Browse → buy full fem outfit'),
('scent_marking',              'Scent marking',             'fem_visible', 'scent_marking_settings',           'scent_marking_events',           'scent_marking_ladder',           6, 'Wed 14:00',  'Olfactory feminization'),
('forced_purchase',            'Forced purchase',           'fem_visible', 'forced_purchase_carts',            'forced_purchase_carts',          'forced_purchase_catalog',        20, 'Mon 12:00',  'Silence = consent = order; $40/mo cap'),
('breast_fixation',            'Breast fixation',           'fem_body',    'breast_fixation_settings',         'breast_fixation_events',         'breast_fixation_ladder',         6, 'Mon 13:00',  'Areola awareness → daily massage'),
('depilation',                 'Depilation/grooming',       'fem_body',    'depilation_settings',              'depilation_events',              'depilation_ladder',              6, 'Sun 18:00',  'Trim → fully smooth maintenance'),
('permanent_body_opt_ins',     'Permanent body opt-ins',    'fem_body',    'permanent_body_settings',          'permanent_body_events',          'permanent_body_ladder',          8, 'Mon 15:00',  'Piercings, laser, electrolysis (irreversible)'),
('pronoun_integration',        'Pronoun + name integration','fem_social',  'pronoun_integration_settings',     'pronoun_integration_events',     'pronoun_integration_ladder',     6, 'Thu 11:00',  'Mirror → ask one person IRL')
ON CONFLICT (trigger_source) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  settings_table = EXCLUDED.settings_table,
  events_table = EXCLUDED.events_table,
  ladder_table = EXCLUDED.ladder_table,
  total_phases = EXCLUDED.total_phases,
  cron_label = EXCLUDED.cron_label,
  blurb = EXCLUDED.blurb;

ALTER TABLE ladder_catalog ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ladder_catalog_read_all ON ladder_catalog FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION user_ladder_progression(p_user_id UUID)
RETURNS TABLE(
  trigger_source TEXT,
  display_name TEXT,
  category TEXT,
  current_phase INT,
  total_phases INT,
  enabled BOOLEAN,
  last_assigned_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  cron_label TEXT,
  blurb TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; q TEXT; v_current_phase INT; v_enabled BOOLEAN; v_last TIMESTAMPTZ; v_paused TIMESTAMPTZ;
BEGIN
  FOR r IN SELECT * FROM ladder_catalog ORDER BY category, display_name LOOP
    BEGIN
      q := format('SELECT current_phase, enabled, last_assigned_at, paused_until FROM %I WHERE user_id = $1', r.settings_table);
      EXECUTE q INTO v_current_phase, v_enabled, v_last, v_paused USING p_user_id;
    EXCEPTION WHEN OTHERS THEN
      v_current_phase := NULL; v_enabled := NULL; v_last := NULL; v_paused := NULL;
    END;

    trigger_source := r.trigger_source;
    display_name := r.display_name;
    category := r.category;
    current_phase := v_current_phase;
    total_phases := r.total_phases;
    enabled := v_enabled;
    last_assigned_at := v_last;
    paused_until := v_paused;
    cron_label := r.cron_label;
    blurb := r.blurb;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$fn$;
GRANT EXECUTE ON FUNCTION user_ladder_progression(UUID) TO authenticated, service_role;
