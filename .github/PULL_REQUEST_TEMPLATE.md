<!--
This template is required. Un-ticked boxes are visible in review.
The preflight CI runs automatically and must pass before merge.
-->

## What changed and why

<!-- One paragraph. The "why" is more important than the "what" — the diff
shows the what; only the author can explain the why. If this is a bug fix,
link the incident: when did it surface, how did the user experience it,
what was the root cause? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Schema migration
- [ ] Edge function deploy

## Required for bug fixes

- [ ] Regression test added in `scripts/handler-regression/db.mjs` (or equivalent harness)
- [ ] Test verified to **fail** on the broken version (not just pass on the fixed version)
- [ ] If the bug was in a generator (writes to user-facing artifact tables): semantic gate added at the generation site
- [ ] Memory updated if this is a new bug class (`memory/feedback_*.md`)

## Required for new features

- [ ] Test covers the happy path AND at least one failure mode
- [ ] Watchdog invariant added if the feature has a derivable correctness condition
- [ ] Pattern-lint extended if a new anti-pattern is now possible
- [ ] Coverage report (`npm run audit`) reviewed; new generators have tests

## Required for schema migrations

- [ ] Migration is idempotent (safe to re-run / partial-run)
- [ ] Rollback path documented
- [ ] Existing data backfill considered and either applied or explicitly deferred
- [ ] Indexes for new query patterns added in same migration

## Documentation

- [ ] CHANGELOG.md entry added (under `## Unreleased`)
- [ ] Inline `// why:` comment on any non-obvious decision (no obvious-comments)
- [ ] If a constraint is being enforced in code that isn't enforced at the schema level, the rationale is explained

## Pre-merge checks (CI runs these automatically)

- [ ] `npm run lint:patterns` clean
- [ ] `npm run preflight` passes (regression + live invariants)
- [ ] `npm run build` succeeds
- [ ] Edge function deploys, if any, are listed and their effects documented above

## User-facing impact

<!-- If this changes anything the user sees (gates, decrees, briefings, slip
calculation, etc.), describe the visible behaviour delta. If a stale row in
their queue might surface this change incorrectly, note the cleanup query
that should be run post-deploy. -->
