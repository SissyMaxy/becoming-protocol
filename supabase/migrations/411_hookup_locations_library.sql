-- 411 — Curated cruising/meet-spot library.
--
-- Replaces free-text meet_location / venue_name with a shared catalogue
-- the restart-coach and the meet-choreographer both draw from. New rows
-- can be added per area as Maxy expands her hunting ground.
--
-- category:  'meet_first' (vibe-check, semi-public, cheap to leave)
--            'hookup'     (where the play happens)
--            'both'       (rare — e.g. a hotel bar that also has rooms)
-- subtype:   bar / coffee / restaurant / hotel / motel / park_lot
--            / mall_lot / private_home / car_play_park / outdoor / other
-- legal_risk: 0 (none — hotel) ... 5 (high — park bathroom)
--
-- after_hours_window stores when the spot is realistically usable
-- (some park lots officially close at 10–11pm).

CREATE TABLE IF NOT EXISTS hookup_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('meet_first','hookup','both')),
  subtype TEXT NOT NULL CHECK (subtype IN (
    'bar','coffee','restaurant','hotel','motel','park_lot','mall_lot',
    'private_home','car_play_park','outdoor','adult_business','other'
  )),
  area TEXT NOT NULL,
  city TEXT,
  state TEXT DEFAULT 'WI',
  address TEXT,
  best_window TEXT,
  legal_risk SMALLINT NOT NULL DEFAULT 1 CHECK (legal_risk BETWEEN 0 AND 5),
  cost_tier SMALLINT NOT NULL DEFAULT 1 CHECK (cost_tier BETWEEN 0 AND 3),
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  cruise_history TEXT,
  safety_notes TEXT,
  drive_minutes_from_village SMALLINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  weight SMALLINT NOT NULL DEFAULT 5 CHECK (weight BETWEEN 0 AND 10),
  added_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hookup_locations_pick
  ON hookup_locations (category, subtype, area, weight DESC)
  WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_hookup_locations_area
  ON hookup_locations (area, category) WHERE active = TRUE;

ALTER TABLE hookup_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hookup_locations_read_system ON hookup_locations;
CREATE POLICY hookup_locations_read_system ON hookup_locations
  FOR SELECT TO authenticated USING (active = TRUE AND added_by IS NULL);

DROP POLICY IF EXISTS hookup_locations_read_owner ON hookup_locations;
CREATE POLICY hookup_locations_read_owner ON hookup_locations
  FOR SELECT TO authenticated USING (added_by = auth.uid());

DROP POLICY IF EXISTS hookup_locations_owner_write ON hookup_locations;
CREATE POLICY hookup_locations_owner_write ON hookup_locations
  FOR ALL TO authenticated USING (added_by = auth.uid()) WITH CHECK (added_by = auth.uid());

DROP POLICY IF EXISTS hookup_locations_service ON hookup_locations;
CREATE POLICY hookup_locations_service ON hookup_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE sniffies_meet_choreography
  ADD COLUMN IF NOT EXISTS meet_location_id UUID REFERENCES hookup_locations(id),
  ADD COLUMN IF NOT EXISTS hookup_location_id UUID REFERENCES hookup_locations(id);

ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES hookup_locations(id);

CREATE OR REPLACE FUNCTION pick_hookup_location(
  p_category TEXT,
  p_area TEXT,
  p_subtype TEXT DEFAULT NULL,
  p_max_legal_risk SMALLINT DEFAULT 3,
  p_max_cost_tier SMALLINT DEFAULT 3
) RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM hookup_locations
  WHERE active = TRUE
    AND category IN (p_category, 'both')
    AND area = p_area
    AND (p_subtype IS NULL OR subtype = p_subtype)
    AND legal_risk <= p_max_legal_risk
    AND cost_tier <= p_max_cost_tier
    AND added_by IS NULL
  ORDER BY weight DESC, random()
  LIMIT 1;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION pick_hookup_location(TEXT, TEXT, TEXT, SMALLINT, SMALLINT)
  TO authenticated, service_role;

-- Wauwatosa Village seed (curated 2026-05-14 per user request: drinks +
-- handjob/oral, near Wauwatosa Village). Vibes / legal-risk / cost-tier
-- are honest assessments — Mommy uses these to match the meet spot to
-- Maxy's mood + the contact's signal.
INSERT INTO hookup_locations
  (name, category, subtype, area, city, address, best_window, legal_risk,
   cost_tier, vibe_tags, cruise_history, safety_notes, drive_minutes_from_village, weight)
VALUES
  ('Camp Bar', 'meet_first', 'bar', 'Wauwatosa Village', 'Wauwatosa', '7044 Harwood Ave', 'evening', 0, 1, ARRAY['dim','quiet','mixed','booths'], NULL, 'Booths give you a private-feeling but public-located 20-min talk. Walk-away cost = one drink.', 0, 8),
  ('Leff''s Lucky Town', 'meet_first', 'bar', 'Wauwatosa Village', 'Wauwatosa', '7208 W State St', 'evening', 0, 1, ARRAY['loud','busy','mixed'], NULL, 'Noise = cover. No one is paying attention to your conversation.', 0, 7),
  ('The Tosa Tap Room', 'meet_first', 'bar', 'Wauwatosa Village', 'Wauwatosa', '7301 W State St', 'evening', 0, 1, ARRAY['quiet','newer','mixed'], NULL, 'Slower at the bar than Leff''s. Easier to read someone here.', 0, 7),
  ('McBob''s', 'meet_first', 'bar', 'Wauwatosa Village', 'Wauwatosa', '4919 W North Ave', 'evening', 0, 1, ARRAY['dive','quiet','low-attention'], NULL, 'Diviest of the Village options. No one cares who walks in with whom.', 2, 6),
  ('Cafe Hollander', 'meet_first', 'restaurant', 'Wauwatosa Village', 'Wauwatosa', '7677 W State St', 'daytime', 0, 1, ARRAY['busy','mixed','daytime-ok'], NULL, 'Sunday/weekday afternoon meets — public, easy to walk away from.', 0, 5),
  ('Rocket Baby Bakery', 'meet_first', 'coffee', 'Wauwatosa Village', 'Wauwatosa', '6822 W North Ave', 'daytime', 0, 1, ARRAY['daytime','quiet','low-stakes'], NULL, 'Coffee-only daytime vibe. Lowest-stakes first-meet possible.', 0, 6),
  ('Stone Creek Coffee Wauwatosa', 'meet_first', 'coffee', 'Wauwatosa Village', 'Wauwatosa', '422 N 76th St', 'daytime', 0, 1, ARRAY['daytime','quiet'], NULL, 'Open seating, easy to read someone in daylight.', 1, 5),
  ('Hyatt Place Wauwatosa', 'hookup', 'hotel', 'Wauwatosa Village', 'Wauwatosa', '1700 N Mayfair Rd', '24h', 0, 2, ARRAY['clean','private','bed','shower'], NULL, 'Closest hotel to the Village. ~5 min drive. Best single option for drinks-then-play.', 5, 9),
  ('Tru by Hilton Wauwatosa Mayfair', 'hookup', 'hotel', 'Mayfair', 'Wauwatosa', '12100 W Park Pl', '24h', 0, 2, ARRAY['clean','private','newer'], NULL, '8 min from Village. Online booking + keyless entry — quiet check-in.', 8, 8),
  ('Drury Inn Mayfair', 'hookup', 'hotel', 'Mayfair', 'Wauwatosa', '12550 W Burleigh Rd', '24h', 0, 2, ARRAY['clean','private'], NULL, '7 min from Village. Mid-range, reliable.', 7, 7),
  ('Holiday Inn Express Brookfield', 'hookup', 'hotel', 'Brookfield', 'Brookfield', '20391 W Bluemound Rd', '24h', 0, 2, ARRAY['clean','private'], NULL, '12 min. Pick if Tosa hotels are booked.', 12, 5),
  ('Comfort Suites Brookfield', 'hookup', 'hotel', 'Brookfield', 'Brookfield', '17117 W Bluemound Rd', '24h', 0, 2, ARRAY['clean','private'], NULL, '12 min. Backup option.', 12, 4),
  ('Knights Inn Milwaukee S', 'hookup', 'motel', 'South Milwaukee', 'Milwaukee', '1750 W Layton Ave', '24h', 0, 1, ARRAY['cheap','no-questions'], NULL, 'Cheap, less polished. ~18 min south.', 18, 3),
  ('Hart Park — south lot (Schoonmaker Creek side)', 'hookup', 'car_play_park', 'Wauwatosa Village', 'Wauwatosa', 'Glenview Ave, just south of State St', 'late_night', 3, 0, ARRAY['outdoor','tree-cover','multi-cars'], 'Most-used Tosa park cruise lot per Sniffies pin history.', 'Park lot officially closes ~10–11pm. Park head-out, kill dome light, tinted windows help.', 0, 7),
  ('Hart Park — north lot (off State St)', 'hookup', 'car_play_park', 'Wauwatosa Village', 'Wauwatosa', 'N Swan Blvd at W State St', 'late_night', 3, 0, ARRAY['outdoor','closer-to-street'], 'Lower-traffic cruise lot than south side.', 'Same curfew risk. More visible from State St.', 0, 5),
  ('Currie Park — west lots', 'hookup', 'car_play_park', 'Mayfair', 'Wauwatosa', 'W Capitol Dr at N 92nd St', 'late_night', 3, 0, ARRAY['outdoor','county-park','quiet'], 'County-park scale. Very quiet after dark.', 'Park-curfew rules apply.', 5, 6),
  ('Menomonee River Parkway pull-offs', 'hookup', 'car_play_park', 'Wauwatosa', 'Wauwatosa', 'Various pull-offs between Hart Park and Hoyt Park', 'late_night', 3, 0, ARRAY['outdoor','isolated','tree-cover'], 'Multiple short driveways into trees.', 'Isolation cuts both ways. Use only if you''ve met the guy in person already.', 3, 5),
  ('Underwood Parkway pull-offs', 'hookup', 'car_play_park', 'Wauwatosa', 'Wauwatosa', 'Various pull-offs south of Wauwatosa Village', 'late_night', 3, 0, ARRAY['outdoor','isolated'], 'Less traveled than Menomonee.', 'Same isolation tradeoff.', 3, 4),
  ('Hoyt Park lot', 'hookup', 'car_play_park', 'Wauwatosa', 'Wauwatosa', '1800 N Swan Blvd', 'late_night', 3, 0, ARRAY['outdoor','small','isolated'], NULL, 'Small lot. Safer-from-witnesses, less safe-from-creeps.', 3, 3),
  ('Mayfair Mall — north lot after midnight', 'hookup', 'mall_lot', 'Mayfair', 'Wauwatosa', '2500 N Mayfair Rd (north side)', 'after_close', 2, 0, ARRAY['cameras','security-car','low-foot'], NULL, 'Heavy camera coverage but no police presence.', 6, 4),
  ('This Is It', 'meet_first', 'bar', 'Downtown Milwaukee', 'Milwaukee', '418 E Wells St', 'evening', 0, 1, ARRAY['gay-bar','small','friendly'], 'Quickest "land a connection in person" path in MKE.', 'Drive 10–12 min from the Village.', 11, 7),
  ('Walker''s Pint', 'meet_first', 'bar', 'Walker''s Point', 'Milwaukee', '818 S 2nd St', 'evening', 0, 1, ARRAY['lesbian-leaning','mixed','queer-friendly'], NULL, 'Drive 13–15 min from the Village.', 14, 5),
  ('Hamburger Mary''s', 'meet_first', 'restaurant', 'Walker''s Point', 'Milwaukee', '730 S 5th St', 'evening', 0, 2, ARRAY['queer-friendly','dinner','show'], NULL, '~14 min. Better for a longer first-meet date.', 14, 4)
ON CONFLICT DO NOTHING;
