-- 314 — CI gate parity: ci_local_failures table.
--
-- Why: today's recurring failure pattern is "local checks pass, CI catches
-- new violation". The fix is `npm run ci` running every CI gate locally
-- before push. When the local gate fails, this table captures the failure
-- class so deploy-fixer / auto-healer can mine recurring patterns into
-- auto-fix recipes (rule of three: a signature recurring 3+ times becomes a
-- candidate for a new auto-fix pattern).
--
-- Writers: pre-push hook, mommy/builder, manual `npm run ci` invocation.
-- Reader: deploy-fixer pattern miner (future), human triage queries.

CREATE TABLE IF NOT EXISTS ci_local_failures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,         -- 'mommy_builder' | 'operator' | 'pre_push_hook'
  checker     text NOT NULL,         -- 'typecheck' | 'typecheck-api' | 'lint' | 'tests' | 'patterns' | 'migrations' | 'storage' | 'centrality' | 'check-baselines'
  signature   text NOT NULL,         -- sha256(checker + stable error lines), 32 chars
  excerpt     text,                  -- last ~3.5KB of stdout/stderr
  branch      text,
  resolved_at timestamptz
);

-- Hot lookup: by signature (clustering) and by checker.
CREATE INDEX IF NOT EXISTS ci_local_failures_signature_idx
  ON ci_local_failures (signature, detected_at DESC);

CREATE INDEX IF NOT EXISTS ci_local_failures_checker_idx
  ON ci_local_failures (checker, detected_at DESC);

-- Open failures only — for "what's been red lately" dashboards.
CREATE INDEX IF NOT EXISTS ci_local_failures_open_idx
  ON ci_local_failures (detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE ci_local_failures ENABLE ROW LEVEL SECURITY;

-- Service role writes via the record-failure helper. No owner policies — this
-- is operator/CI metadata, not user-visible state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ci_local_failures'
      AND policyname = 'ci_local_failures_service_role_all'
  ) THEN
    CREATE POLICY ci_local_failures_service_role_all
      ON ci_local_failures
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
