-- Task Retype Migration
-- Reclassifies ~200+ tasks from binary to their correct completion type.
-- Order matters: log_entry first (most specific), then photo, then reflect (broadest).

-- ============================================
-- 1. LOG_ENTRY — tasks that produce structured data
-- ============================================

UPDATE task_bank SET completion_type = 'log_entry'
WHERE completion_type = 'binary'
AND (
  instruction ILIKE '%record the%'
  OR instruction ILIKE '%log the%'
  OR instruction ILIKE '%measure%'
  OR instruction ILIKE '%baseline%'
  OR instruction ILIKE '%inventory%'
  OR instruction ILIKE '%audit%'
  OR instruction ILIKE '%checklist%'
  OR instruction ILIKE '%track your%'
  OR instruction ILIKE '%count how%'
  OR instruction ILIKE '%write down the number%'
  OR instruction ILIKE '%Hz%'
  OR steps ILIKE '%record the%'
  OR steps ILIKE '%log the%'
  OR steps ILIKE '%measure%'
  OR steps ILIKE '%write down the number%'
  OR steps ILIKE '%note the reading%'
);

-- ============================================
-- 2. PHOTO — tasks that produce/require visual evidence
-- ============================================

UPDATE task_bank SET completion_type = 'photo'
WHERE completion_type = 'binary'
AND (
  instruction ILIKE '%selfie%'
  OR instruction ILIKE '%photo%'
  OR instruction ILIKE '%picture%'
  OR instruction ILIKE '%capture yourself%'
  OR instruction ILIKE '%look at yourself%mirror%'
  OR instruction ILIKE '%screenshot%'
  OR instruction ILIKE '%before and after%'
  OR steps ILIKE '%take a photo%'
  OR steps ILIKE '%take a selfie%'
  OR steps ILIKE '%take a picture%'
  OR steps ILIKE '%camera%'
  OR steps ILIKE '%snap a%'
);

-- ============================================
-- 3. SCALE — tasks asking for a self-assessment rating
-- ============================================

UPDATE task_bank SET completion_type = 'scale'
WHERE completion_type = 'binary'
AND (
  instruction ILIKE '%rate yourself%'
  OR instruction ILIKE '%rate your%'
  OR instruction ILIKE '%scale of%'
  OR instruction ILIKE '%on a scale%'
  OR instruction ILIKE '%1-10%'
  OR instruction ILIKE '%1 to 10%'
  OR instruction ILIKE '%how much do you%'
  OR steps ILIKE '%rate from%'
  OR steps ILIKE '%rate on a%'
);

-- ============================================
-- 4. REFLECT — tasks that produce written reflection
-- ============================================

UPDATE task_bank SET completion_type = 'reflect'
WHERE completion_type = 'binary'
AND (
  instruction ILIKE '%write a%'
  OR instruction ILIKE '%write about%'
  OR instruction ILIKE '%write down%'
  OR instruction ILIKE '%journal%'
  OR instruction ILIKE '%letter to%'
  OR instruction ILIKE '%reflect on%'
  OR instruction ILIKE '%describe your%'
  OR instruction ILIKE '%describe how%'
  OR instruction ILIKE '%describe what%'
  OR instruction ILIKE '%list 3%'
  OR instruction ILIKE '%list three%'
  OR instruction ILIKE '%list five%'
  OR instruction ILIKE '%list 5%'
  OR instruction ILIKE '%name 3%'
  OR instruction ILIKE '%name three%'
  OR instruction ILIKE '%name five%'
  OR instruction ILIKE '%what do you%'
  OR instruction ILIKE '%how do you feel%'
  OR instruction ILIKE '%dear %'
  OR instruction ILIKE '%paragraph%'
  OR steps ILIKE '%write down%'
  OR steps ILIKE '%write a%'
  OR steps ILIKE '%journal about%'
  OR steps ILIKE '%describe%'
)
-- Exclude false positives already retyped above
AND completion_type = 'binary';

-- ============================================
-- 5. Fix empty/null completion types (Gina ladder tasks → log_entry)
-- ============================================

UPDATE task_bank SET completion_type = 'log_entry'
WHERE completion_type = '' OR completion_type IS NULL;
