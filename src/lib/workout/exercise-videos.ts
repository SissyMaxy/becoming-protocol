// Per-exercise "how to" video links — the visual ID for each move in the body
// program. Deliberately YouTube SEARCH deep-links, not pinned video IDs: a
// search always lands on the current top-ranked form demonstration and can
// never rot (a hardcoded video can be deleted/privated, leaving a dead link).
// Honest by construction — we point at YouTube's ranked demos rather than
// asserting one specific video is correct.
//
// To PIN a specific video for a move, add its watch URL to PINNED below and it
// wins over the search link.

/** Curated search query per canonical move — tuned to surface form tutorials. */
const QUERY: Record<string, string> = {
  'incline treadmill': 'incline treadmill walk warm up glutes',
  'glute bridges': 'glute bridge exercise proper form tutorial',
  'clamshells': 'clamshell exercise glute medius form',
  'hip thrusts': 'hip thrust exercise proper form tutorial',
  'romanian deadlifts': 'romanian deadlift RDL proper form tutorial',
  'split squats': 'split squat exercise proper form tutorial',
  'banded lateral walks': 'banded lateral walk exercise form',
  'sumo squats': 'sumo squat exercise proper form tutorial',
  'curtsy lunges': 'curtsy lunge exercise proper form tutorial',
  'clamshells + fire hydrants': 'clamshell and fire hydrant glute exercise form',
  'fire hydrants': 'fire hydrant exercise glute form',
  'kickbacks': 'glute kickback exercise proper form tutorial',
  'sumo squat pulses': 'sumo squat pulse exercise form',
  'banded burnout': 'glute resistance band burnout circuit',
  'hip flexor stretch': 'kneeling hip flexor stretch how to',
  'pigeon pose': 'pigeon pose yoga hip opener how to',
  'cat-cow': 'cat cow stretch how to',
};

/** Optional pinned watch URLs (move → full youtube.com/watch URL). */
const PINNED: Record<string, string> = {};

/**
 * Normalize a prescribed move name to its canonical key: lowercase, drop
 * parentheticals like "(wake-up)" / "(heavy)", collapse whitespace. Combo and
 * variant names keep their own QUERY entries above.
 */
export function normalizeMove(move: string): string {
  return move
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A "how to" video link for a prescribed move. Never empty. */
export function exerciseVideoUrl(move: string): string {
  const key = normalizeMove(move);
  if (PINNED[key]) return PINNED[key];
  const query = QUERY[key] || `${key} exercise proper form`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
