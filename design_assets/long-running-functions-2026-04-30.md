# Long-running edge functions — 2026-04-30 (timeout follow-up)

These six edge functions blew past Supabase's 150s edge-function cap and
returned 546/504. **Migration 314 fixed the cron auth + collision issue
that was multiplying their failures, but does NOT fix the underlying
timeouts** — each function below needs a chunking refactor or a
background-processor split. None should remain a synchronous
fire-and-forget cron handler.

| Function | Status | Duration | Suspected reason | Recommended fix shape |
|---|---|---|---|---|
| `send-notifications` | 546 | 150202 ms | Per-row external calls to Expo + FCM in nested `for` loop with no Promise.all batching. Slow external service or many users → linear blow-up. | Chunk: read all due notifications, build per-provider batches, fire `Promise.all(chunks.map(send))` in groups of 50. Already has the structure; just wrap the `for of` in chunked Promise.all. **Small change, no new infra.** |
| `device-control` | 546 | 150193 ms | 6 sequential `for...of` loops over predictions / sessions / due-schedules / enforcing / users — each iteration calls Lovense API (`https://api.lovense-api.com/...`) one-at-a-time. Lovense is the prime suspect for hangs. | Background-queue split: replace inline Lovense fire with insert into `device_command_queue`; new `device-control-worker` cron drains the queue in chunked batches. Hot path returns ≤5s. **Medium change — new table + new fn.** |
| `handler-autonomous` | 546 | 150128 ms | 6203-line god function. Each action (`compliance_check`, `daily_cycle`, `quick_task_check`, `bleeding_process`, `weekly_adaptation`, `hourly_analytics`) loops over every active user with multiple awaits per user. 18+ awaited calls per request path. | Split per action into discrete edge functions: `handler-autonomous-compliance`, `handler-autonomous-daily-cycle`, etc. Each cron points at its dedicated function. Within each, chunk users with `LIMIT n / OFFSET` and self-re-invoke if more remain. **Large change — split + per-fn refactor.** |
| `handler-revenue` | 546 | 150116 ms | 5-action switch (`process_ai_queue`, `engagement_cycle`, `daily_batch`, `gfe_morning`, `gfe_evening`). `daily_batch` likely fans out per-user content-calendar + vault-multiplication + GFE-reset; serial loops + AI calls. | Same split-per-action shape as handler-autonomous. Particularly `daily_batch` should become a dispatcher that enqueues per-user work into a job table; a separate worker drains. **Medium-large.** |
| `conditioning-engine` | 504 | 150209 ms | 14+ action types in one fn, including TTS / ElevenLabs synthesis paths. Synthesis calls are the dominant per-call latency (5–30s each); any action that loops over users + synthesizes serially will blow the cap. | Hot synth path → background queue. New `conditioning_synth_queue` table; cron-driven `conditioning-synth-worker` chunks 5–10 synths per run. The cron-invoked actions (`prescribe_sleep_content`, `execute_daily_cycle_*`) just enqueue; the worker fulfills. **Medium — new table + worker.** |
| `force-processor` | 546 | 150138 ms | 13+ sequential `for...of` loops over disjoint tables (missedDoses, dodged, missedDisclosures, hardModeUsers, completedDeEsc, deferredStale, streakStates, expiredLocks, draftContent, recentPosts, completedWorkouts, skippedWorkouts). Each iteration does its own UPDATE/INSERT. No batching, no chunking. | Chunk-and-self-reinvoke: each loop becomes a cursor with `LIMIT 50`; if rows remain, re-invoke the function via `pg_net.http_post` to itself with `{"continuation": "<phase>"}` payload. Phase enum lets the next invocation pick up where the prior phase ran out. **Small-medium — pure refactor of the existing fn.** |

## Cross-cutting recommendation

The pattern is consistent: **edge functions are doing all-users-at-once
work synchronously**. The Supabase edge runtime is not built for that.
Two systemic fixes worth considering before doing per-fn refactors:

1. **Job queue table** — single `background_jobs` table (kind, payload,
   scheduled_at, status, attempts) with one generic
   `background-job-worker` cron that pulls 10 rows at a time, dispatches
   by kind. Then *every* cron-triggered fn just enqueues; the worker
   does the slow work. Cuts per-fn refactor cost.

2. **Per-user fanout via pg_net** — Postgres iterates the user list and
   issues N `pg_net.http_post` calls (one edge function invocation per
   user). Each invocation has its own 150s budget. Trades fan-out
   complexity for trivial parallelism.

Pick one. Either dramatically reduces the chance any single edge
function blows the cap.

## Next-action priority

Order by user-visible impact of the failure:

1. **`send-notifications`** — push delivery is the most user-visible
   failure mode and the simplest fix.
2. **`device-control`** — Lovense schedule is the conditioning loop's
   physical surface; broken = silent failure, but heard about quickly.
3. **`force-processor`** — protocol enforcement; failures cascade into
   missed slip-detection.
4. **`handler-autonomous`** — large refactor but the 18+ awaited calls
   are the worst offender; needs a real split.
5. **`handler-revenue`** — lower priority while revenue posting cadence
   is tolerant of skipped runs.
6. **`conditioning-engine`** — only `prescribe_sleep_content` /
   `execute_daily_cycle_*` paths matter for hot-path; the rest can
   tolerate the timeout for now.
