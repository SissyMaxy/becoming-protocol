# Supabase emergency-relief report — 2026-04-30

Project: `atevwvexapiykchvqvhm` (becoming-protocol)
Branch: `fix/supabase-resource-relief-2026-04-30`
Migrations: 316 (pg_net bloat purge), 317 (cron schedule relief)
Sibling: 314 (cron auth fix; lands first)

## TL;DR

- **Root cause:** `pg_net._http_response` had grown to **76 MB** of stale HTTP-response rows. The pg_net background worker's cleanup query (`DELETE FROM net._http_response WHERE created < now() - $ttl`) was consuming **75.4%** of all DB compute by churning batches of 200 rows out of a heavily bloated heap.
- **Compounding:** sibling-task migration 314 had staggered four critical crons (`auto-healer`, `deploy-health-monitor`, `mommy-praise`, `mommy-bedtime`) onto new offsets but did not unschedule the original `*/10` versions, so each was double-firing.
- **Fix applied:** mig 316 purged the bloat (76 MB → 48 kB), restarted the pg_net worker, and reset stats. Mig 317 unscheduled the four duplicates and stretched 19 low-priority cadences. Audit view `public.cron_paused_during_emergency` records every change.
- **What needs operator action:** `pg_net.ttl` is a postmaster GUC, can't be changed at runtime (`SQLSTATE 55P02`). Ask Supabase support to set it to `1 hour` cluster-side, OR I can ship a follow-up cron that mimics the worker. Compute upgrade is also worth considering (current saturation suggests we are at the edge of the tier).

---

## Top 20 hot queries (pre-relief snapshot)

Pulled via `supabase db query --linked` against `pg_stat_statements`. Window: stats had been accumulating for an unknown period; we reset them at end of mig 316 so future audits read clean.

| # | total_ms | mean_ms | calls | rows | pct_total | query (truncated) |
|---|---|---|---|---|---|---|
| 1 | 41,527,823 | 893.1 | 46,499 | 57,942 | **75.4%** | `WITH rows AS (SELECT ctid FROM net._http_response WHERE created < now() - $1 ORDER BY created LIMIT $2) DELETE FROM net._http_response r USING rows WHERE r.ctid …` |
| 2 | 1,867,372 | 70.7 | 26,412 | 26,412 | 3.4% | `SELECT invoke_edge_function($1, $2::jsonb)` |
| 3 | 1,609,274 | 21.6 | 74,675 | 74,675 | 2.9% | `insert into cron.job_run_details (jobid, runid, database, username, command, status) values …` |
| 4 | 989,521 | 63.3 | 15,624 | 15,624 | 1.8% | `SELECT net.http_post(url := $1, headers := jsonb_build_object(…))` |
| 5 | 926,464 | 63.3 | 14,635 | 14,635 | 1.7% | `SELECT net.http_post(url := $1, body := $2::jsonb, headers := jsonb_build_object(…))` |
| 6 | 539,210 | 7.2 | 74,675 | 74,675 | 1.0% | `update cron.job_run_details set status = $1 where runid = $2` |
| 7 | 442,107 | 227.1 | 1,947 | 1,947 | 0.8% | `update cron.job_run_details set status, return_message, start_time, end_time where runid = $5` |
| 8 | 404,785 | 434.3 | 932 | 93 | 0.7% | `SELECT public.check_david_suppression()` |
| 9 | 372,147 | 396.3 | 939 | 2,817 | 0.7% | `SELECT public.check_system_invariants()` |
| 10 | 298,506 | 318.9 | 936 | 936 | 0.5% | `SELECT public.classify_receptive_window()` |
| 11 | 268,924 | 289.2 | 930 | 1,864 | 0.5% | `SELECT public.check_v31_freshness()` |
| 12 | 268,284 | 755.7 | 355 | 423,870 | 0.5% | `SELECT name FROM pg_timezone_names` |
| 13 | 256,351 | 722.1 | 355 | 249,533 | 0.5% | PostgREST schema-cache introspection |
| 14 | 243,666 | 716.7 | 340 | 340 | 0.4% | `SELECT mark_expired_outreach()` |
| 15 | 186,875 | 201.4 | 928 | 928 | 0.3% | `SELECT public.check_body_evidence_freshness()` |
| 16 | 175,155 | 26.4 | 6,644 | 6,644 | 0.3% | PostgREST `handler_messages` recent-row select |
| 17 | 171,098 | 1.1 | 151,531 | 151,531 | 0.3% | PostgREST per-request `set_config(...)` |
| 18 | 165,133 | 36.9 | 4,481 | 4,481 | 0.3% | RPC w/ json payload (`p_user_id`, `p_current_time`) |
| 19 | 149,986 | 328.2 | 457 | 457 | 0.3% | `SELECT public.compute_daily_compliance_score()` |
| 20 | 149,763 | 218.3 | 686 | 686 | 0.3% | `SELECT public.fire_receptive_window_content()` |

## Diagnosis (corrected from initial assumption)

The first read suggested a missing index on `net._http_response(created)` — but **the index already exists** as `_http_response_created_idx`. The cleanup query *was* using it. The reason it was still slow:

- Table size: **76 MB heap, 824 kB index, ~150k–200k rows of stale responses.**
- pg_net's worker runs the query repeatedly with `LIMIT 200` (configured by `pg_net.batch_size`).
- Each cycle: index seek for 200 oldest rows → delete → WAL → vacuum lazy-cleanup. With heavy concurrent inserts (~30k `net.http_post` calls in the window), the worker chases its tail.
- The bigger the table, the slower each delete (more index pages to touch, more dead tuples for autovacuum). 893 ms mean is consistent with a bloated btree under steady DELETE-then-INSERT traffic.

**Solution:** purge the bloat in one shot. Once the table is small, the worker's cleanup pass is near-instant per cycle, even with the same TTL.

## What was applied

### Migration 316 — `316_pg_net_response_bloat_relief.sql`

| Step | Action | Result |
|---|---|---|
| 1 | Chunked DELETE of `net._http_response` rows older than 1 hour, LIMIT 2000/loop | **Table dropped from 76 MB → 48 kB** |
| 2 | `net.worker_restart()` so the cleanup worker resets state | applied |
| 3 | `ANALYZE net._http_response` | applied |
| 4 | `pg_stat_statements_reset()` so we have a clean baseline for verification | reset at 2026-05-09 00:38:42 UTC |

`ALTER DATABASE postgres SET pg_net.ttl = '1 hour'` was **not** applied — `pg_net.ttl` is a postmaster GUC and Postgres returned `SQLSTATE 55P02 cannot be changed now`. See "Operator follow-ups" below.

No indexes were dropped or added (the only candidate, on `net._http_response (created)`, already exists).

### Migration 317 — `317_emergency_cron_relief.sql`

**Unscheduled (4 duplicate jobs):**

| jobname | old schedule | reason |
|---|---|---|
| `auto-healer-10m` | `*/10 * * * *` | duplicate of `auto-healer-10min` (mig 314 staggered) |
| `deploy-health-monitor-10m` | `*/10 * * * *` | duplicate of `deploy-health-monitor-10min` (mig 314 staggered) |
| `mommy-praise-burst` | `*/10 * * * *` | duplicate of `mommy-praise-10min` (mig 314 staggered) |
| `mommy-bedtime-goodnight` | `0 22 * * *` | duplicate of `mommy-bedtime-daily-22` |

(All four staggered replacements remain active — none of the hard-rule whitelist (`auto-healer`, `deploy-health-monitor`, `mommy-praise`, `mommy-builder`) was paused outright.)

**Reduced cadence (19 jobs):**

| jobname | old | new | reason |
|---|---|---|---|
| `mommy-tease-engine` | `23 */2 * * *` | `23 */6 * * *` | low-priority engagement; emergency stretch |
| `mommy-recall-surprise` | `42 */2 * * *` | `42 */6 * * *` | low-priority engagement; emergency stretch |
| `mommy-touch-cycle` | `17 */3 * * *` | `17 */6 * * *` | low-priority engagement; emergency stretch |
| `streak_break_recovery` | `34 */2 * * *` | `34 */6 * * *` | low-priority recovery; emergency stretch |
| `system_invariants_watchdog` | `*/15 * * * *` | `*/30 * * * *` | invariant check; halve cadence |
| `david_suppression_watchdog` | `1-59/15 * * * *` | `1-59/30 * * * *` | invariant check; halve cadence |
| `v31_freshness_watchdog` | `2-59/15 * * * *` | `2-59/30 * * * *` | invariant check; halve cadence |
| `body_evidence_freshness_watchdog` | `6-59/15 * * * *` | `6-59/30 * * * *` | invariant check; halve cadence |
| `receptive_window_classifier` | `4-59/15 * * * *` | `4-59/30 * * * *` | classification job; halve cadence |
| `compute_daily_compliance_score` | `*/30 * * * *` | `0 * * * *` | a "daily" score running every 30 min was wasteful |
| `outreach-expiry-janitor-5min` | `0-59/5 * * * *` | `0-59/15 * * * *` | `mark_expired_outreach()` @ 717 ms mean; trim cadence |
| `memory-implant-audit-cron` | `*/30 * * * *` | `17 */2 * * *` | audit; every 2 hours plenty |
| `defection_proof_demand` | `7,22,37,52 * * * *` | `7,37 * * * *` | demand cycle; halve cadence |
| `anti_procrastination_shame` | `11,41 * * * *` | `11 * * * *` | shame cycle; halve cadence |
| `sanctuary_delivery_regression` | `11,41 * * * *` | `11 * * * *` | sanctuary delivery; halve cadence |
| `defection_sanctuary_amplification` | `26,56 * * * *` | `26 * * * *` | amplification; halve cadence |
| `held_evidence_surfacing_engine` | `8,38 * * * *` | `8 * * * *` | surfacing; halve cadence |
| `predictive_defection_lockdown` | `23,53 * * * *` | `23 * * * *` | lockdown trigger; halve cadence |
| `daily_confession_auto_prompt` | `15,45 * * * *` | `15 * * * *` | confession prompt; halve cadence |

**Audit:** `SELECT * FROM public.cron_paused_during_emergency;` — 23 rows mapping every change with old/new schedule and reason. Operators can replay the prior schedules from this view once compute headroom returns.

## Operator follow-ups (need human / billing)

1. **Compute upgrade.** During this incident the pooler tripped its auth circuit breaker (`ECIRCUITBREAKER`) just from us trying to introspect — that is a saturation signal, not just a cron-load signal. Pre-relief connection count was only 7, so the bottleneck is CPU/IO, not connections. **Recommend reviewing the compute add-on tier.**
2. **Set `pg_net.ttl = '1 hour'` cluster-side.** Without this, the bloat will rebuild over time and we'll be back here. Either (a) ask Supabase support to set it cluster-side, or (b) ship a follow-up migration that adds a periodic `DELETE FROM net._http_response WHERE created < now() - interval '1 hour'` cron as a safety net.
3. **`mark_expired_outreach()` @ 717 ms mean** — likely a missing index on `handler_outreach_queue(expires_at)` or `handler_outreach_queue(status, expires_at)`. Has not been investigated in this branch (out of scope per task constraints). Code-level review needed.
4. **`check_david_suppression()` @ 434 ms mean** — same story. Cadence is reduced for now, but the per-call cost is the underlying issue.
5. **PostgREST schema-cache thrash** (rows 12, 13). This is PostgREST refreshing its cache after migrations. Expected during a heavy-deploy day; will fade. If it doesn't, check whether something is hammering `NOTIFY pgrst, 'reload schema'`.

## Verification (post-apply, 8 min after stats reset)

| Metric | Pre-relief | Post-relief |
|---|---|---|
| `net._http_response` size | 76 MB | **48 kB** |
| Active cron jobs | ~142 | **138** (4 duplicates removed) |
| Cron jobnames in `cron_paused_during_emergency` audit view | n/a | **23** |
| Connection count (`pg_stat_activity`) | 14 | **9** |
| `net._http_response` cleanup query in top-10 hot list | **#1 @ 75.4%** | **GONE — not in top 10** |
| pg_stat_statements stats reset | unknown | 2026-05-09 00:38:42 UTC |
| Pooler auth circuit breaker (`ECIRCUITBREAKER`) | tripping during introspection | calls succeeding cleanly |

The pg_net worker now has nothing to clean (table is tiny), so the 75.4% compute drain is gone. Post-relief top-10 is dominated by one-shot migration calls and a small handful of legitimately slow functions:

- `cron.job_run_details` INSERT at 912 ms mean (45 calls / 8 min) — `cron.job_run_details` may have history bloat. The existing `prune_cron_run_details` cron runs daily at 04:00; check whether it's keeping up.
- `mark_expired_outreach()` at **14.3 seconds for ONE call** — this confirms the function itself is the problem, not its cadence. Reducing the cadence to `*/15` cuts wasted invocations but each call is still 14 s. **Highest-priority operator follow-up.**
- `fire_receptive_window_content()` 6.8 s / call — secondary follow-up.

If the cleanup query reappears at high pct after a few hours, that means `net._http_response` is regrowing and the operator follow-up #2 (cluster-level TTL or safety-net cron) is the long-term fix.

## Code-level surfaces (NOT fixed in this branch)

- **`mark_expired_outreach()` 14.3 s per call** — likely missing index on `handler_outreach_queue.expires_at` or `handler_outreach_queue(status, expires_at)`. Cadence reduction in mig 317 is a band-aid; the function itself needs investigation.
- **`fire_receptive_window_content()` 6.8 s** — same class of issue.
- **`check_david_suppression()` 434 ms** — cadence halved in mig 317; per-call cost still wants attention.
- **`compute_daily_compliance_score()` 328 ms** — cadence reduced to hourly in mig 317.
- **`cron.job_run_details` INSERT at 912 ms mean** — possible table bloat. Verify daily prune is working; consider tightening retention.
- **151,531 PostgREST `set_config`** calls in pre-relief window — normal but a leading indicator if request volume grows. Monitor connection-pool sizing.
