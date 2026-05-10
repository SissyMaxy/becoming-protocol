# Contributing — CI Gate Parity

Every check that runs in CI runs locally first, same scope, same baselines.
The failure pattern this exists to prevent: "local checks pass, CI catches
new violation" (TS errors in `api/`, baseline drift, pattern lint
regressions, mobile-100vh, etc.). Each of those traps used to be a separate
fix. The fix is a single gate: `npm run ci`.

## One-time setup

```sh
npm install
npm run ci:install-hooks   # enables the pre-push gate (sets core.hooksPath)
```

## Daily flow

```sh
# Edit, commit freely — pre-commit is fast/local, no full gate.
git commit -am "..."

# Pushing runs the full gate first. If anything is red, the push is blocked.
git push
```

## What `npm run ci` runs

In order, matching `.github/workflows/preflight.yml`:

1. **typecheck** — `tsc --noEmit -p tsconfig.json` (the `src/` surface).
2. **typecheck-api** — `tsc --noEmit -p tsconfig.api.json` (the `api/` surface).
   This is the missing scope that let TS errors in serverless functions slip
   past local builds and only surface at deploy. Baselined; new errors fail
   the gate.
3. **lint** — `eslint .`.
4. **tests** — `vitest run`.
5. **patterns** — `npm run lint:patterns` (fails on new pattern hits).
6. **migrations** — `npm run lint:migrations` (fails on new non-idempotent SQL).
7. **storage** — `npm run lint:storage` (private bucket / `getPublicUrl` lint).
8. **centrality** — `npm run centrality` (Handler-blind generators).
9. **check-baselines** — verifies no baseline file would change if regenerated.
   This catches stale-baseline drift early (the failure pattern that blocked
   merges for hours today).

The first step that fails short-circuits the run. The failure class is
captured to `ci_local_failures` (see migration 364) for clustering — patterns
recurring 3+ times become candidates for new auto-fix recipes in the
deploy-fixer pattern library.

## Refreshing baselines (after a refactor)

Don't edit baseline JSON files by hand. After a refactor that intentionally
shifts violation counts:

```sh
npm run ci:refresh-baselines
git diff scripts/handler-regression/*-baseline.json
git commit -m "ci: refresh baselines after <refactor>"
```

The `check-baselines` step will fail until the diff is committed.

## Bypass (do not use without a reason)

```sh
CI_GATE_SKIP=1 git push
# OR
git push --no-verify
```

Both bypass the pre-push gate. Use them only if you've already verified the
push is safe and the gate itself is broken — and then fix the gate, not the
bypass habit. Force-push without a gate run will still get caught by the GH
Actions preflight on PR.

## Mommy autonomous builder

`scripts/mommy/builder.ts --ship` runs the same `npm run ci` gate before
pushing. If the gate fails, the worktree commit is reverted, the wish is
returned to `queued`, and a `mommy_builder_run` row is logged with status
`failed_ci_gate`. The next builder iteration can re-draft against the same
wish.

## Adding a new gate

1. Add the script to `package.json` as `ci:<name>`.
2. Add it to the `steps` array in `scripts/ci/run.mjs` in the position
   matching `.github/workflows/preflight.yml`.
3. Add it to `.github/workflows/preflight.yml` in the same position.
4. If it produces a baseline, register the baseline in
   `scripts/ci/check-baselines.mjs` and `scripts/ci/refresh-baselines.mjs`.
