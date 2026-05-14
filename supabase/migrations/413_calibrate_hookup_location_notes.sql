-- 413 — Calibrate hookup_locations safety_notes / cruise_history.
--
-- Maxy challenged 2026-05-14: "where are you getting your info about police
-- stings in the area?" Honest answer was that the chat-reply text overstated.
-- The migration-411 seed data is largely clean (the sting claim only lived
-- in chat, not in the rows), but a few entries do carry unverified
-- specificity that should be softened to match what's actually verifiable.
--
-- Changes:
--   - Hart Park south: drop the "Most-used Tosa park cruise lot per Sniffies
--     pin history" cruise_history claim — that was inferred, not measured.
--   - Hart Park north: soften "Lower-traffic cruise lot than south side"
--     to "Smaller than the south lot" (verifiable from a map, not from pin
--     data I haven't actually queried).
--   - Mayfair north: drop the "no police presence" assertion; replace with
--     "less park-curfew exposure than the park lots" which is true by
--     definition (the mall is open hours).
--   - This Is It: drop the "quickest 'land a connection in person' path in
--     MKE" — opinion phrased as fact.
--
-- What stays:
--   - Park-curfew language (10–11pm close) — verifiable from Wauwatosa
--     municipal code.
--   - "Park head-out, kill dome light, tinted windows" — general car-play
--     hygiene that applies anywhere.
--   - Drive-minute estimates from the Village — geometric fact.
--   - Cost / legal-risk tier estimates — calibrated honestly.

UPDATE hookup_locations
SET cruise_history = NULL,
    safety_notes = 'Park lot officially closes ~10–11pm — being there after = curfew-violation pretext for PD. Park head-out, kill dome light, tinted windows help. Treat real-time risk by checking current Sniffies pin density yourself — fresh pins = recently fine, sudden silence = something happened.',
    updated_at = now()
WHERE name = 'Hart Park — south lot (Schoonmaker Creek side)';

UPDATE hookup_locations
SET cruise_history = NULL,
    safety_notes = 'Smaller than the south lot. Same curfew rules apply. More visible from State St.',
    updated_at = now()
WHERE name = 'Hart Park — north lot (off State St)';

UPDATE hookup_locations
SET safety_notes = 'Open hours, so no park-curfew exposure. Heavy camera coverage and 24h security car. Trade: cops less likely to swing through than a park lot after close, but your audio / movement may be recorded.',
    updated_at = now()
WHERE name = 'Mayfair Mall — north lot after midnight';

UPDATE hookup_locations
SET cruise_history = NULL,
    safety_notes = 'Gay bar in downtown MKE — about 10–12 min drive from the Village.',
    updated_at = now()
WHERE name = 'This Is It';
