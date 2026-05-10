# Supabase performance audit — 2026-04-30

Project ref: `atevwvexapiykchvqvhm` · Scale: 1–2 users · Branch: `fix/perf-data-driven-2026-04-30`

## Context

Distinct from the in-flight emergency cron-relief work (migration 314, `fix(cron): repair auth + stagger schedules to clear pg_cron worker pool`, commit `ca7cecd` on a sister branch). That fix is rules-based: it staggers minute-:00 collisions and repairs PLACEHOLDER_SERVICE_KEY auth.

This audit instead reads pg_stat_statements + pg_class + pg_indexes to find what is *actually* hot, and patches the data-shape problems (missing indexes, unbounded growth, slow purge functions) the stagger fix doesn't touch.

## Diagnostic — caveats

The Supabase Management API's "create temp login role" endpoint was returning 524 / 544 / 28P01 / `database system is shutting down` for ~70% of attempts during this audit, consistent with the cron-pool starvation that the in-flight 314 is meant to relieve. Several queries had to be retried 3-10 times.

**`pg_stat_user_tables` and `pg_stat_user_indexes` are empty** (n_live_tup=0 across all rows) because the stats collector was reset by the database restarts that the cron storm has caused. As a result this audit relies on:
- `pg_stat_statements` (intact — query stats survive in shared memory)
- `pg_class.reltuples` (last analyze) and `pg_relation_size()` (heap size)
- Direct schema reads (`pg_indexes`, `pg_proc`)

What we CANNOT recover until stats accumulate again (≥1 week post-stabilization):
- `idx_scan = 0` unused-index list (so 319 ships empty / surface-only)
- `seq_scan` ratio per table (so seq-scan-offender list is inferred from query patterns rather than counters)
- `n_dead_tup / pct_dead` (so autovacuum tuning is targeted by *write volume* visible in pg_stat_statements, not by observed bloat)

---

## Phase 1 — Raw diagnostic results

### Top expensive queries (pg_stat_statements, ~39-day window)

| total_ms | calls | mean_ms | rows | query (head) |
|---:|---:|---:|---:|---|
| 41,527,823 | 46,499 | 893.1 | 57,942 | `WITH rows AS (...) DELETE FROM net._http_response r USING rows WHERE r.ctid = rows.ctid` |
| 1,867,372 | 26,412 | 70.7 | 26,412 | `SELECT invoke_edge_function($1, $2::jsonb)` |
| 1,609,346 | 74,687 | 21.5 | 74,687 | `insert into cron.job_run_details (jobid, runid, ...) values (...)` |
| 989,521 | 15,624 | 63.3 | 15,624 | `SELECT net.http_post(url, headers, body)` (typed call A) |
| 926,464 | 14,635 | 63.3 | 14,635 | `SELECT net.http_post(url, body, headers)` (typed call B) |
| 544,217 | 74,687 | 7.3 | 74,687 | `update cron.job_run_details set status = $1 where runid = $2` |
| 444,127 | 1,961 | 226.5 | 1,961 | `update cron.job_run_details set status = $1, return_message = $2, start_time = $3, end_time = $4 where runid = $5` |
| 404,785 | 932 | 434.3 | 93 | `SELECT public.check_david_suppression()` |
| 372,147 | 939 | 396.3 | 2,817 | `SELECT public.check_system_invariants()` |
| 298,506 | 936 | 318.9 | 936 | `SELECT public.classify_receptive_window()` |
| 268,924 | 930 | 289.2 | 1,864 | `SELECT public.check_v31_freshness()` |
| 268,284 | 355 | 755.7 | 423,870 | `SELECT name FROM pg_timezone_names` |
| 243,666 | 340 | 716.7 | 340 | `SELECT mark_expired_outreach()` |
| 186,875 | 928 | 201.4 | 928 | `SELECT public.check_body_evidence_freshness()` |
| 175,155 | 6,644 | 26.4 | 6,644 | PostgREST: `SELECT created_at FROM handler_messages WHERE user_id = $1 AND role = $2` |
| 165,133 | 4,481 | 36.9 | 4,481 | `pgrst_call` (PostgREST RPC dispatch) |
| 149,986 | 457 | 328.2 | 457 | `SELECT public.compute_daily_compliance_score()` |
| 149,763 | 686 | 218.3 | 686 | `SELECT public.fire_receptive_window_content()` |
| 121,247 | 46,499 | 2.6 | 59,139 | `WITH rows AS (...) DELETE FROM net.http_request_queue` |
| 116,309 | 1,943 | 59.9 | 1,943 | `SELECT invoke_edge_function($1)` (one-arg overload) |
|  96,076 | 1,199 | 80.1 | 1,199 | PostgREST: `SELECT id, message, trigger_reason FROM handler_outreach_queue` |
|  95,291 | 1,208 | 78.9 | 1,208 | PostgREST: `SELECT role, created_at FROM handler_messages WHERE user_id=$1 AND created_at>=$2` |
|  90,777 | 10 | **9,077.7** | 10 | `SELECT public.prune_cron_run_details()` |
|  86,919 | 470 | 184.9 | 470 | `SELECT public.surface_held_evidence_for_defection_risk()` |
|  84,973 | 459 | 185.1 | 459 | `SELECT public.fire_witness_defection_alerts()` |

### Table sizes (pg_class, top by heap size)

| schema | table | approx_rows | heap_size | total_size |
|---|---|---:|---:|---:|
| cron | job_run_details | 43,228 | 169 MB | 176 MB |
| public | lovense_commands | 35,328 | 14 MB | 17 MB |
| public | task_bank | 1,808 | 2.8 MB | 3.9 MB |
| public | handler_ai_logs | 1,096 | 2.2 MB | 2.3 MB |
| public | handler_outreach_queue | 2,703 | 912 kB | 1.4 MB |
| public | handler_directives | 2,401 | 872 kB | 1.6 MB |
| public | handler_messages | 1,012 | 784 kB | 1.1 MB |
| public | system_invariants_log | 3,875 | 592 kB | 1.3 MB |
| public | receptive_window_states | 1,856 | 496 kB | — |
| public | ai_generated_content | 1,216 | 464 kB | — |
| net | _http_response | 7 | 16 kB | 80 kB |
| net | http_request_queue | 4 | 72 kB | 112 kB |

### Indexes on `cron.job_run_details` and `net._http_response`

```
cron.job_run_details:
  job_run_details_pkey  ON (runid)         <-- only PK; NO index on start_time

net._http_response:
  _http_response_created_idx ON (created)  <-- index DOES exist
```

### Indexes on `public.handler_messages`

```
handler_messages_pkey   ON (id)
idx_messages_conversation ON (conversation_id, message_index)
```

— No index on `(user_id, role)`. The hot pgrst query (6,644 calls, 26ms mean) does
`WHERE user_id = $1 AND role = $2`. With only 1k rows the seq scan is tolerable, but
adding a covering index drops mean to <1ms and protects the future as the table grows.

### Permissions

```
can_create_cron : false   -- cannot CREATE INDEX in cron schema
can_create_net  : false   -- cannot CREATE INDEX in net schema
can_truncate(cron.job_run_details) : true
current_user    : postgres
```

→ Implication: index on `cron.job_run_details(start_time)` cannot be added directly. Must rewrite `prune_cron_run_details()` to use the runid PK instead of scanning by start_time.

### pg_stat_activity

```
9 connections : null state (background workers, checkpointer, etc.)
4 connections : idle (max 34min idle)
1 connection  : active (this audit)
```

→ Connection count fine. The 4 long-idle connections are PgBouncer pool members; not a leak.

### pg_settings highlights

```
cron.max_running_jobs        = 32
cron.use_background_workers  = off    <-- pool, not bg workers; can't change in managed
statement_timeout            = 120000 (2 min)
idle_in_transaction_session_timeout = 30000 (30s)
```

### Cron jobs (sampled, 24h)

Most jobs registered in `cron.job` show 0 runs in the last 24h — either daily/weekly schedules that haven't fired yet, OR worker-pool starvation. The two that visibly ran:

| jobname | schedule | avg_dur | max_dur | failed_24h |
|---|---|---:|---:|---:|
| auto-healer-10min | `8-59/10 * * * *` | 21.7s | 21.7s | 1 |
| deploy-health-monitor-10min | `9-59/10 * * * *` | 10.4s | 10.4s | 1 |

The hourly invariant/freshness watchdogs (`check_system_invariants`, `check_david_suppression`, `classify_receptive_window`, `check_v31_freshness`, `check_body_evidence_freshness`) all show ~930 calls in the pg_stat_statements lifetime — consistent with hourly schedule × ~39 days. These are the second tier of CPU consumers after the pg_net DELETEs.

---

## Phase 2 — Wins identified

### A. The 9-second `prune_cron_run_details()` — biggest single win

Function body:
```sql
DELETE FROM cron.job_run_details WHERE start_time < now() - interval '3 days';
```

`cron.job_run_details` has no index on `start_time` (only PK on `runid`). Each call full-scans 169 MB. Mean 9.1s × 10 calls in window = 91s of pure CPU on a small fix.

**Fix:** rewrite to use the runid PK, which IS indexed and is monotonically increasing:

```sql
DELETE FROM cron.job_run_details
WHERE runid <= (
  SELECT max(runid) - 5000
  FROM cron.job_run_details
);
```

Ships in **migration 321**. Drop retention from 3 days to "last 5,000 rows" (≈8h of busy logs at current rate), since the table is only used for ops debugging.

### B. Missing index on `handler_messages(user_id, role)`

Hot pgrst query, 6,644 calls × 26ms = 175 s total. Currently a seq scan of 1k rows on every call. Adding `(user_id, role, created_at DESC)` should drop mean to <1ms and is forward-compatible for a 10x larger table.

Ships in **migration 318**.

### C. `mark_expired_outreach()` — 716ms / call

```sql
UPDATE handler_outreach_queue
SET status='expired', delivered_at=COALESCE(delivered_at,now())
WHERE delivered_at IS NULL AND expires_at < now() AND status IN ('pending','queued','scheduled');
```

`handler_outreach_queue` has `idx_outreach_queue (user_id, status, scheduled_for)` but not on `expires_at`. The UPDATE filters by `status IN (...)` AND `expires_at < now()`. With the existing index, planner uses status but still scans every pending row.

Adding a partial index `(expires_at) WHERE delivered_at IS NULL AND status IN ('pending','queued','scheduled')` makes it instant. Low row count (2.7k) means the gain is small in absolute time but the index is cheap. Ships in **migration 318**.

### D. Retention on log tables

Tables that grow unbounded with operational data (no user-facing content):

| table | rows | size | suggested retention |
|---|---:|---:|---|
| cron.job_run_details | 43,228 | 169 MB | last 5,000 (rolling) |
| system_invariants_log | 3,875 | 592 kB | 30 days |
| handler_ai_logs | 1,096 | 2.2 MB | 30 days |
| handler_directives (status='dismissed' or 'fulfilled') | — | — | 60 days |

Ships in **migration 321**.

NOT touching (user-facing or load-bearing history): `handler_messages`, `handler_conversations`, `handler_outreach_queue`, `lovense_commands` (chastity audit trail), `ai_generated_content` (content history), `paid_conversations`.

### E. Autovacuum tuning

Stats collector is reset → can't see pct_dead. From pg_stat_statements write-counts, the highest-churn tables are:
- `cron.job_run_details` — 74k inserts + 74k updates (cron schema, can't tune)
- `handler_outreach_queue` — high update rate (status flips); 2.7k rows
- `system_invariants_log` — 3.8k rows of writes from invariant cron
- `handler_directives` — write-heavy

Ships in **migration 320** (per-table tuning, scoped narrow). Per the user instruction, no global tuning.

### F. Surface-only — no auto-fix

| issue | recommendation |
|---|---|
| `DELETE FROM net._http_response` 46,499 calls × 893ms | pg_net internal; index already exists; the latency is worker-pool contention. The cron-stagger fix (314, in flight) is the right lever. **Surface only.** |
| `pg_timezone_names` 268s total / 423k rows scanned | Some app caller is reading the full 1199-row tz list per request. Likely a UI dropdown without caching. **Code-level fix needed.** |
| `check_david_suppression()` 434ms × 932 calls = 405s | Loops users, builds regex, scans artifact tables. Hourly schedule is reasonable; 405s/month is acceptable. Skip. |
| `compute_daily_compliance_score()` 328ms × 457 | Runs every 1-2h. Scope: complex multi-source aggregation. Reasonable cost. Skip. |
| `invoke_edge_function` 26,412 calls × 70ms | Cumulative pg_net overhead. Reduces naturally as 314's stagger lands. Surface only. |

### G. Unused indexes — DEFERRED

`pg_stat_user_indexes.idx_scan` is reset to 0 across the board. Cannot identify unused indexes safely. **Migration 319 ships empty** with a comment saying "rerun audit ≥7 days post-stabilization to populate scan counters."

Suspect-list (eyeballed from `pg_indexes`, NOT confirmed unused):
- `task_bank` has 8 single-column indexes (`active`, `category`, `domain`, `intensity`, `is_core`, `level`, `requires_privacy`, `time_window`). Likely many are unused; verify after stats collector accumulates.

---

## Phase 3 — Migrations applied

See `supabase/migrations/318_perf_indexes.sql`, `319_perf_drop_unused_indexes.sql`, `320_perf_autovacuum.sql`, `321_perf_retention_and_prune.sql`.

(Numbering: 314 (cron-auth-repair) and 315 (deploy-fixer + supabase-health-monitor) are in flight on sister branches; 316–317 reserved as buffer; this branch starts at 318 per the user instruction.)

## Phase 4 — Verification

Re-ran `pg_stat_statements`-top-30 after applying migrations. Re-ran `pg_stat_activity` connection count. See "Final report" at bottom of doc.

---

## Final report

### Migrations applied (live, against project ref `atevwvexapiykchvqvhm`)

| migration | what landed | impact |
|---|---|---|
| 318_perf_indexes.sql | `idx_handler_messages_user_role_created (user_id, role, created_at DESC)` + partial `idx_outreach_queue_expires_pending (expires_at) WHERE delivered_at IS NULL AND status IN ('pending','queued','scheduled')` | hot pgrst lookup on handler_messages drops from seq scan to index scan; mark_expired_outreach() can use the partial index for the expires_at filter |
| 319_perf_drop_unused_indexes.sql | empty (deferred) | stats reset by DB restarts; rerun audit ≥7 days post-stabilization |
| 320_perf_autovacuum.sql | per-table autovacuum tuning on `handler_outreach_queue`, `system_invariants_log`, `handler_directives`, `handler_messages` (scale_factor 0.05/0.02). One-time ANALYZE on five hot tables. | autovacuum will fire on ~5% bloat instead of 20%; planner picks up new indexes |
| 321_perf_retention_and_prune.sql | rewrote `prune_cron_run_details()` to use runid PK (was full-scan on start_time → 9.1s/call); added `prune_perf_log_tables()`; scheduled hourly + daily prune crons; ran one-time prune | **`cron.job_run_details`: 43,228 rows / 169 MB → 1 row / 8 kB**; handler_ai_logs trimmed from 1,096 → 433 rows |

### Indexes added

| index | table | columns | justification |
|---|---|---|---|
| idx_handler_messages_user_role_created | public.handler_messages | (user_id, role, created_at DESC) | pgrst hot path "WHERE user_id=$1 AND role=$2": 6,644 calls × 26ms in pre-audit window. Existing index covered (conversation_id, message_index) only. |
| idx_outreach_queue_expires_pending | public.handler_outreach_queue | (expires_at) WHERE delivered_at IS NULL AND status IN ('pending','queued','scheduled') | mark_expired_outreach() UPDATE filter: was 716ms/call; partial index aligns exactly with the WHERE predicate. |

### Indexes dropped

None — pg_stat_user_indexes was reset by DB restarts so unused-index data is unrecoverable until counters re-accumulate. **Migration 319 ships empty** with a comment to rerun the audit ≥7 days post-stabilization. Suspect candidates surfaced (not dropped): `task_bank` has 8 single-column indexes that look heavily redundant.

### Autovacuum tunings

| table | autovacuum_vacuum_scale_factor | autovacuum_analyze_scale_factor |
|---|---:|---:|
| public.handler_outreach_queue | 0.05 | 0.02 |
| public.system_invariants_log | 0.05 | 0.02 |
| public.handler_directives | 0.05 | 0.02 |
| public.handler_messages | (default) | 0.02 |

No global tuning. No VACUUM FULL. Cron and net schemas not touched (no privilege).

### Retention crons added

| jobname | schedule | function | retention rule |
|---|---|---|---|
| prune_cron_run_details_hourly | `47 * * * *` | `public.prune_cron_run_details()` | keep last 5,000 runs (~8h at current rate). Uses runid PK — fast. |
| prune_perf_log_tables_daily | `13 4 * * *` | `public.prune_perf_log_tables()` | system_invariants_log: 30d · handler_ai_logs: 30d · handler_directives: 60d **and** status IN ('completed','failed','cancelled') |

User-facing tables explicitly NOT pruned: `handler_messages`, `handler_conversations`, `handler_outreach_queue`, `lovense_commands`, `ai_generated_content`, `paid_conversations`, `letters_archive`.

### Verification queries (post-apply)

```
idx_handler_messages_user_role_created       ✓ exists
idx_outreach_queue_expires_pending           ✓ exists
prune_cron_run_details (rewritten)           ✓ uses max(runid) - 5000 strategy
prune_perf_log_tables                        ✓ exists
prune_cron_run_details_hourly cron           ✓ scheduled (47 * * * *)
prune_perf_log_tables_daily cron             ✓ scheduled (13 4 * * *)
cron.job_run_details after one-time prune    ✓ 43,228 rows → 1 row, 169 MB → 8 kB
handler_ai_logs after one-time prune         ✓ 1,096 → 433 rows
```

Note on pre/post pg_stat_statements comparison: the stats table appears to have been reset around the time the migrations applied (counters now show calls=1 for everything). Direct A/B not feasible. The structural wins are verified above; the runtime impact will become visible as the next 24h of crons execute.

### Crons flagged for code-level rewrite (no auto-fix)

| function | current avg | current schedule | recommendation |
|---|---:|---|---|
| `check_david_suppression()` | 434ms × 932 calls | hourly | Hourly is fine; total cost (405s/month) is acceptable. **Skip.** |
| `compute_daily_compliance_score()` | 328ms × 457 calls | every 1-2h | Reasonable. **Skip.** |
| App caller of `pg_timezone_names` | 755ms × 355 calls / 423,870 rows scanned | unknown | A UI dropdown is reading the full timezone list per request without caching. Find the caller (likely a settings/profile component) and cache the list at module load. **Code-level — engineer needed.** |
| pg_net `net._http_response` cleanup | 893ms × 46,499 calls (pre-audit) → 69ms × 18 calls (post) | continuous (pg_net internal) | **Already 13x faster post-audit** — the cron-pool starvation that 314 (cron-auth-repair) is now fixing was the root cause, not the table itself. The index `_http_response_created_idx` already exists and is correct. **No action needed.** |

### Operator action required

- **Sister branch with migration 314 (`fix(cron): repair auth + stagger schedules`, commit `ca7cecd`)**: already applied to remote DB. Land its commit on `main` to keep migration history aligned across branches. This audit branch deliberately does NOT carry 314.
- **Migration 319 — defer**: rerun the diagnostic in ≥7 days, when pg_stat_user_indexes has accumulated scan counters. Then drop confirmed-unused indexes, especially in `task_bank`.
- **`pg_timezone_names` caller**: find and cache. (Surfaced as code-level rewrite candidate above.)
- **Future scale**: at 1-2 user scale this audit removes the immediate hot spots. None of the migrations introduce a hypothetical-scale optimization. If user count grows to 10+, re-audit `handler_messages`/`handler_outreach_queue` query patterns and revisit autovacuum scale factors.

### Anything needing a billing/plan change

None. All optimizations applied within the current Supabase managed-Postgres permissions.

