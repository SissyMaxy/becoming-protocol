-- 102: Generate pivot_if_unable for high-intensity tasks missing pivots
-- Gives users a softer alternative when they can't complete the assigned task.

-- Generic pivots based on category patterns
UPDATE task_bank
SET pivot_if_unable = 'Do a lighter version: half the time, half the intensity. What matters is showing up.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 4
  AND category IN ('edge', 'plug', 'sissygasm', 'oral', 'worship', 'corrupt', 'deepen');

-- Wear tasks — pivot to something simpler
UPDATE task_bank
SET pivot_if_unable = 'Wear panties under your clothes instead. Same signal, lower barrier.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 4
  AND category = 'wear';

-- Practice tasks — pivot to shorter duration
UPDATE task_bank
SET pivot_if_unable = 'Do 2 minutes instead. Voice, movement, or posture — pick the easiest. Consistency beats intensity.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 3
  AND category = 'practice';

-- Listen/watch tasks — pivot to shorter duration
UPDATE task_bank
SET pivot_if_unable = 'Listen for 5 minutes instead. Partial exposure still builds the pattern.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 3
  AND category IN ('listen', 'watch');

-- Expose/social tasks — pivot to private version
UPDATE task_bank
SET pivot_if_unable = 'Do the private version: practice at home, no audience needed.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 3
  AND category IN ('expose', 'thirst');

-- Lock/chastity tasks — pivot to time-limited version
UPDATE task_bank
SET pivot_if_unable = 'Wear for 1 hour instead of the full duration. Build the tolerance gradually.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 3
  AND category = 'lock';

-- Say/commit tasks — pivot to written version
UPDATE task_bank
SET pivot_if_unable = 'Write it in your journal instead of saying it out loud. The commitment still counts.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 3
  AND category IN ('say', 'commit', 'surrender');

-- Remaining high-intensity tasks without pivots
UPDATE task_bank
SET pivot_if_unable = 'Do a lighter version: half the time, half the intensity. Showing up is what matters.'
WHERE pivot_if_unable IS NULL
  AND intensity >= 4;
