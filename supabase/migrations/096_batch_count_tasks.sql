-- 096: Convert hands-busy exercise tasks from 'count' to 'batch_count'
-- These are floor exercises, planks, wall sits, etc. where the user
-- can't tap their phone per-rep. Instead they do the full set and tap Done.

UPDATE task_bank
SET completion_type = 'batch_count'
WHERE completion_type = 'count'
  AND target_count IS NOT NULL
  AND (
    instruction ILIKE '%push%up%'
    OR instruction ILIKE '%pushup%'
    OR instruction ILIKE '%plank%'
    OR instruction ILIKE '%squat%'
    OR instruction ILIKE '%lunge%'
    OR instruction ILIKE '%burpee%'
    OR instruction ILIKE '%crunch%'
    OR instruction ILIKE '%sit%up%'
    OR instruction ILIKE '%situp%'
    OR instruction ILIKE '%jumping jack%'
    OR instruction ILIKE '%mountain climber%'
    OR instruction ILIKE '%wall sit%'
    OR instruction ILIKE '%hip thrust%'
    OR instruction ILIKE '%glute bridge%'
    OR instruction ILIKE '%leg raise%'
    OR instruction ILIKE '%flutter kick%'
    OR instruction ILIKE '%bicycle%'
    OR instruction ILIKE '%donkey kick%'
    OR instruction ILIKE '%fire hydrant%'
    OR instruction ILIKE '%kegel%'
  );
