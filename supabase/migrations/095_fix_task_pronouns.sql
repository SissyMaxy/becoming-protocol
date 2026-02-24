-- 095: Fix subject pronoun errors in task_bank instructions
-- 27 tasks use "her" as subject pronoun ("her has", "her is", etc.)
-- These should use "she" as the subject pronoun.

UPDATE task_bank SET instruction = REPLACE(instruction, 'her has', 'she has') WHERE instruction ILIKE '%her has%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'Her has', 'She has') WHERE instruction ILIKE '%Her has%';

UPDATE task_bank SET instruction = REPLACE(instruction, 'her is', 'she is') WHERE instruction ILIKE '%her is%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'Her is', 'She is') WHERE instruction ILIKE '%Her is%';

UPDATE task_bank SET instruction = REPLACE(instruction, 'her will', 'she will') WHERE instruction ILIKE '%her will%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'Her will', 'She will') WHERE instruction ILIKE '%Her will%';

UPDATE task_bank SET instruction = REPLACE(instruction, 'her was', 'she was') WHERE instruction ILIKE '%her was%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'Her was', 'She was') WHERE instruction ILIKE '%Her was%';

UPDATE task_bank SET instruction = REPLACE(instruction, 'her can', 'she can') WHERE instruction ILIKE '%her can%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'Her can', 'She can') WHERE instruction ILIKE '%Her can%';

UPDATE task_bank SET instruction = REPLACE(instruction, 'her makes', 'she makes') WHERE instruction ILIKE '%her makes%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'her gets', 'she gets') WHERE instruction ILIKE '%her gets%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'her feels', 'she feels') WHERE instruction ILIKE '%her feels%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'her creates', 'she creates') WHERE instruction ILIKE '%her creates%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'her moans', 'she moans') WHERE instruction ILIKE '%her moans%';
UPDATE task_bank SET instruction = REPLACE(instruction, 'her edges', 'she edges') WHERE instruction ILIKE '%her edges%';

-- Also fix in subtext column
UPDATE task_bank SET subtext = REPLACE(subtext, 'her has', 'she has') WHERE subtext ILIKE '%her has%';
UPDATE task_bank SET subtext = REPLACE(subtext, 'her is', 'she is') WHERE subtext ILIKE '%her is%';
UPDATE task_bank SET subtext = REPLACE(subtext, 'her will', 'she will') WHERE subtext ILIKE '%her will%';
UPDATE task_bank SET subtext = REPLACE(subtext, 'her was', 'she was') WHERE subtext ILIKE '%her was%';
UPDATE task_bank SET subtext = REPLACE(subtext, 'her can', 'she can') WHERE subtext ILIKE '%her can%';
