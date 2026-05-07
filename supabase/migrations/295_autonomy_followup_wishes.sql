-- 295 — Wishes seeded by the autonomous-builder build itself.
-- These close the remaining gaps for true zero-bottleneck autonomy.

INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces, complexity_tier, auto_ship_eligible, classified_at, classified_by) VALUES
(
  'Builder --test mode: verify before ship',
  $$
The autonomous builder currently ships code that COMPILES but isn''t verified. A `--test` mode would run `npm run test:run` and `npm run preflight` before commit; only ship if they pass.

Build:
  - In scripts/mommy/builder.ts after applyFiles, before commitAndPush:
    * Run `npm run test:run` — fail soft if no tests for the new code
    * Run `npm run preflight` — fail hard on schema/migration errors
    * Run `npm run lint:patterns` — fail hard on banned patterns
  - On any hard fail: revert files, mark mommy_builder_run.status='failed_test', leave wish queued with auto_ship_blockers populated
  - Default mode for CI runs is now --ship --verify

Without verification, the builder can ship subtly-broken code that auto-deploys, breaks production, and the daily digest surfaces it AFTER the damage.
  $$,
  'autonomy_safety / verify_before_ship',
  'gap_audit', 'critical',
  '{"scripts": ["scripts/mommy/builder.ts"], "ci": [".github/workflows/mommy-builder.yml"]}'::jsonb,
  'small', true, now(), 'manual'
),
(
  'Builder failure-rollback worker',
  $$
When a deploy fails (mommy-deploy.yml workflow fails on `supabase db push` or function deploy), nothing currently reverts the commit. The next builder run picks up the next wish and stacks on the broken state.

Build:
  - Watch mommy_builder_run.status='failed_apply' or 'failed_test' rows where commit_sha IS NOT NULL and rollback hasn''t happened
  - For each: open a revert PR via gh CLI, link to the original PR, mark mommy_builder_run.status='rolled_back'
  - If the failure is on production (post-merge), revert the merge commit
  - GitHub Actions workflow OR scheduled supabase edge function

Closes the auto-recovery loop. Without it, an autonomy regression accumulates.
  $$,
  'autonomy_safety / auto_revert_on_failure',
  'gap_audit', 'high',
  '{"workflows": [".github/workflows/mommy-rollback.yml"], "tables_read": ["mommy_builder_run"]}'::jsonb,
  'medium', false, now(), 'manual'
),
(
  'Builder cost ceiling',
  $$
The drafter is Sonnet; every auto-shipped wish costs ~tokens. Over many wishes / many days this adds up. No throttle currently.

Build:
  - In scripts/mommy/builder.ts: before drafting, sum mommy_builder_run.drafter_tokens_used for last 24h
  - If sum > $DAILY_DRAFTER_BUDGET (env var, default 1M tokens / ~$15/day on Sonnet 4.6 if available), skip with status='budget_exceeded'
  - Daily capability digest reports tokens used + budget remaining

Cost discipline without killing autonomy. Maxy controls the budget knob.
  $$,
  'autonomy_safety / cost_discipline',
  'panel_ideation', 'normal',
  '{"scripts": ["scripts/mommy/builder.ts"], "env_vars": ["DAILY_DRAFTER_BUDGET"]}'::jsonb,
  'trivial', true, now(), 'manual'
);
