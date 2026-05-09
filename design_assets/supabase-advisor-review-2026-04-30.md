# Supabase advisor — Pass 2 review (manual decisions required)

Generated 2026-05-09 against project `atevwvexapiykchvqvhm` after Pass 1 migrations
(333–336) cleared the four mechanical-fix categories.

**Pass 1 summary (already shipped, no action needed here):**

| Lint                              | Before | After |
| --------------------------------- | ------ | ----- |
| `duplicate_index`                 |     33 |     0 |
| `unindexed_foreign_keys`          |    149 |     0 |
| `auth_rls_initplan`               |   1085 |     0 |
| `function_search_path_mutable`    |    142 |     0 |

**Pass 2 summary (shipped 2026-05-09 in migrations 343–347, this PR):**

| Lint                                                | Before |  After | Notes |
| --------------------------------------------------- | -----: | -----: | ----- |
| `security_definer_view`                             |     16 |      0 | All flipped to `security_invoker = true` (mig 344) |
| `rls_disabled_in_public`                            |     20 |      0 | RLS + owner/reference/service policies (mig 343) |
| `rls_policy_always_true`                            |     22 |      0 | task_bank + affiliate_events bugs fixed; service-role bypasses scoped (mig 346) |
| `anon_security_definer_function_executable`         |    139 |      2 | Remaining 2 are intentional (`get_shared_wishlist`, `claim_wishlist_item`) — public token flow |
| `authenticated_security_definer_function_executable`|    139 |     23 | Remaining 23 are intentional re-grants for frontend `supabase.rpc()` callers (mig 347) |
| `multiple_permissive_policies`                      |   1654 |    706 | Top 33 tables consolidated (mig 345); ~95 long-tail tables deferred for re-audit |

**Outstanding (operator decisions, not code changes):**
- `extension_in_public` — `vector` extension still in `public` schema. Move to `extensions` schema requires deploy-window check; not bundled here.
- `auth_leaked_password_protection` — Studio → Authentication → Settings → "Leaked Password Protection". Dashboard toggle.
- `auth_db_connections_absolute` — Studio Auth setting; defer until traffic forces it.
- `unused_index` — re-audit on 2026-05-16 once stats refresh.

The historical pass-2 review notes below are kept for traceability of how the
migrations were reasoned about; the lints they describe are now resolved.

---

## 1. `rls_disabled_in_public` × 20  (ERROR)

Tables in the `public` schema with RLS turned off entirely. Anything with a `user_id`
column should turn RLS on with a `using ((select auth.uid()) = user_id)` policy.
Tables that are reference data (config, dimensions, templates) can stay no-RLS but
should be marked intentional.

Numbers below are `pg_class.reltuples` (planner stats — `-1` means stats not yet
collected, treat as "small"). Column count is shown to identify reference vs. user data.

| Table | Approx rows | Cols | Recommendation |
| --- | --- | --- | --- |
| `body_evidence_snapshots`     |    16 | 17 | Has user_id — enable RLS, owner policy |
| `cron_paused_during_emergency`|   177 | 10 | Cron-internal — confirm intentional, otherwise lock to `service_role` |
| `david_suppression_terms`     |    -1 |  4 | Reference data (suppression list) — mark intentional or move to private schema |
| `defection_risk_scores`       |   710 |  6 | Analytic table — likely needs RLS by user_id |
| `denial_cycle_shoots`         |    -1 | 15 | Has user_id — enable RLS, owner policy |
| `denial_day_content_map`      |    -1 | 11 | Reference data (day → content mapping) — mark intentional |
| `gina_topology_dimensions`    |    -1 |  8 | Reference data — mark intentional |
| `gina_vibe_captures`          |     0 | 10 | New table — enable RLS now before data lands |
| `held_evidence`               |   114 | 12 | Sensitive — enable RLS by user_id |
| `hrt_provider_directory`      |    -1 | 14 | Reference data (provider list) — mark intentional |
| `identity_dimensions`         |   764 |  7 | Has user_id — enable RLS, owner policy |
| `journal_entries`             |    -1 | 11 | **Sensitive user content — enable RLS, owner policy** |
| `merge_pipeline_items`        |     9 | 12 | Has user_id — enable RLS, owner policy |
| `receptive_window_states`     |  1856 |  7 | Per-user state — enable RLS, owner policy |
| `sanctuary_messages`          |   170 |  9 | Has user_id — enable RLS, owner policy |
| `scene_templates`             |    -1 |  6 | Reference data — mark intentional |
| `shoot_reference_images`      |    -1 | 11 | Reference data — mark intentional |
| `skill_level_definitions`     |    -1 |  9 | Reference data — mark intentional |
| `subscriber_polls`            |    -1 |  8 | Per-user content — enable RLS, owner policy |
| `system_invariants_log`       |  3915 |  6 | System-internal — confirm whether read needs to be locked to `service_role` |

**Action:** decide per row, then ship one migration enabling RLS + adding policies for
the user-data tables, and a `COMMENT ON TABLE ... IS '... intentionally no RLS ...'` for
the reference-data ones to silence the lint via documented intent.

---

## 2. `security_definer_view` × 16  (ERROR)

Views owned by `postgres`, which means they bypass caller RLS — anyone who can
query them gets the postgres view of all data joined into the view. All 16 below
are owned by `postgres`:

`bambi_session_summary`, `cross_domain_status`, `effective_gaslight_intensity`,
`escalation_overview`, `gina_investment_summary`, `gina_state_now`,
`hrt_progress_summary`, `hrt_state_now`, `penalty_pending_rows`,
`permanence_summary`, `resistance_effectiveness`, `revenue_analytics`,
`state_logs`, `time_ratchets`, `trigger_effectiveness`, `user_autonomous_summary`.

**Recommendation:** convert each to `SECURITY INVOKER` (Postgres 15+ supports
`ALTER VIEW … SET (security_invoker = true);`). Underlying tables already have
RLS; once the view runs as the caller, the join inherits it correctly. Spot-check
each for joins onto un-RLS'd tables (e.g. `system_invariants_log` from
section 1) — those need fixing first or the view will start returning empty.

---

## 3. `anon_security_definer_function_executable` × 139 + `authenticated_security_definer_function_executable` × 139  (WARN)

Same 139 functions are flagged once per role. Each function is `SECURITY DEFINER`
(runs with definer's permissions, typically `postgres`) and currently has
`EXECUTE` granted to both `anon` and `authenticated`. That means an unauthenticated
visitor to the PostgREST API could potentially invoke them.

A handful of these clearly should be auth-only or service-only — e.g.
`abandon_goal(p_goal_id uuid, p_reason text)`, `add_to_fund(p_user_id uuid, ...)`,
`auto_allocate_revenue_to_budget()`, `bridge_contradictions_to_implants(p_user_id uuid)`,
`amplify_sanctuary_on_defection_spike()`, plus the cron functions.

**Recommendation:** for each function, decide whether the caller should be `anon`,
`authenticated`, or `service_role`-only:

- Default action (high-confidence safe): `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated;`
  followed by `GRANT EXECUTE … TO service_role;` Most of these functions are called
  by edge functions or pg_cron, not by the client.
- Functions that the client genuinely needs (look for any in `api/` or `supabase/functions/`
  that call `supabase.rpc('foo')`): keep `authenticated` grant, drop `anon`.
- Functions called only on the table-events path (triggers): can have all role grants
  revoked — triggers run as the table-modifier's role, not via PostgREST.

Full list available at `.advisors-after.json` filter for these two lint names
(both reference identical functions, so dedupe by name). Recommend one migration that
revokes EXECUTE from `public`, `anon`, `authenticated` for all 139 functions, plus a
small grant-back list for the handful that the client actually invokes via `rpc()`.

---

## 4. `rls_policy_always_true` × 22  (WARN)

Three subgroups, mixing intentional service-role bypasses with what look like real
authorization bugs:

### 4a. Real bugs to fix (4 policies)

`task_bank` is shared reference data, but these policies allow any authenticated
user to mutate it freely:

- `task_bank.Users can delete tasks` — `FOR DELETE … USING (true)` for `authenticated`
- `task_bank.Users can insert tasks` — `FOR INSERT … WITH CHECK (true)` for `authenticated`
- `task_bank.Users can update tasks` — `FOR UPDATE … USING (true) WITH CHECK (true)` for `authenticated`

`affiliate_events` accepts inserts from anyone:

- `affiliate_events.Anyone can insert affiliate events` — `FOR INSERT … WITH CHECK (true)` for all roles

**Action:** scope `task_bank` mutations to `service_role` only (Handler / cron writes,
not user-driven), and either rate-limit `affiliate_events` writes or lock to a known
service path.

### 4b. Service-role bypasses (18 policies — likely intentional)

These are `Service manages X` policies on tables where the Handler / cron writes
on the user's behalf: `affiliate_links`, `ai_generated_content`, `assigned_tasks`,
`automatic_commitments`, `automatic_decisions`, `behavioral_directives`,
`engagement_targets`, `gfe_subscribers`, `gina_conversion_state`,
`gina_interaction_log`, `gina_missions`, `handler_authority`, `paid_conversations`,
`required_interventions`, `revenue_content_calendar`, `revenue_decisions`,
`scheduled_sessions`, `seed_scripts`.

**Recommendation:** confirm each was meant for `service_role` only. The cleanest
fix is dropping the `using (true) with check (true)` policies and replacing with
`TO service_role` policies (which don't need any USING clause at all — the role
itself is the gate). That preserves intent and silences the lint.

---

## 5. `multiple_permissive_policies` × 1654  (WARN)

128 distinct tables with overlapping permissive policies. Top 25 each have the
maximum 24 lints (4 commands × all role combinations). The pattern across the
"24-lint" tables is consistent: a `Service manages X` policy + a `Users can <verb>
own X` policy, both PERMISSIVE. PostgreSQL OR's permissive policies, so the
service-role policy effectively makes the user policy redundant.

| Table | Lints |
| --- | --- |
| `arousal_check_ins`              | 24 |
| `arousal_commitment_extractions` | 24 |
| `arousal_states`                 | 24 |
| `body_measurements`              | 24 |
| `boundary_dissolution`           | 24 |
| `chastity_milestones`            | 24 |
| `chastity_sessions`              | 24 |
| `content_calendar`               | 24 |
| `content_escalation`             | 24 |
| `daily_arousal_plans`            | 24 |
| `daily_tasks`                    | 24 |
| `escalation_events`              | 24 |
| `escalation_state`               | 24 |
| `gina_interactions`              | 24 |
| `gina_profile`                   | 24 |
| `gina_voice_samples`             | 24 |
| `goals`                          | 24 |
| `handler_daily_plans`            | 24 |
| `handler_escalation_plans`       | 24 |
| `handler_experiments`            | 24 |
| `handler_pending_tasks`          | 24 |
| `handler_strategies`             | 24 |
| `handler_user_model`             | 24 |
| `hrt_pipeline`                   | 24 |
| `investments`                    | 24 |

(103 more tables follow same pattern — full list filterable from
`.advisors-after.json`.)

**Recommendation:** the cleanest consolidation strategy is

1. Scope `Service manages X` to `TO service_role` (already needed for §4b above).
2. Scope user policies to `TO authenticated` instead of leaving `TO public`.

That collapses each table from 2 overlapping policies on shared roles to 2
non-overlapping policies on disjoint roles, eliminating the lint without changing
access semantics. **This change is small per table but spans 128 tables — should be
generated programmatically rather than hand-written.**

---

## 6. `unused_index` × 946  (INFO — UNRELIABLE STATS)

Stats appear to have been reset recently (855 reported pre-migration, 946 after
adding 149 FK indexes — the new FK indexes correctly show as unused with 0 scans).
**Do not act on this list yet — re-audit in 7 days** so production traffic has had
time to populate `pg_stat_user_indexes.idx_scan`.

Top 10 by size (preview only, do not drop):

| Size | Table | Index |
| --- | --- | --- |
| 2.1 MB | `handler_memory` | `idx_handler_memory_embedding` |
| 1.3 MB | `lovense_commands` | `lovense_commands_pkey` |
|  824 kB | `lovense_commands` | `idx_lovense_commands_executed` |
|  416 kB | `lovense_commands` | `idx_lovense_commands_trigger` |
|  392 kB | `lovense_commands` | `idx_lovense_commands_user` |
|  312 kB | `system_invariants_log` | `system_invariants_log_pkey` |
|  264 kB | `lovense_commands` | `idx_lovense_commands_fk_device_id` |
|  136 kB | `system_invariants_log` | `idx_invariants_log_failing` |
|  104 kB | `paid_conversations` | `idx_paid_conversations` |
|  104 kB | `daily_tasks` | `daily_tasks_pkey` |

Total wasted space across top 50 is well under 10 MB — even the worst case is
small. The PK indexes (`*_pkey`) above showing 0 scans is the strongest signal
that stats were reset recently; drop those and inserts break.

**Recommendation:** add a calendar reminder for 2026-05-16. Re-run `npx supabase db
advisors --linked --type performance` and inspect `pg_stat_user_indexes` directly.
Drop only indexes >1 MB with idx_scan=0 AND that aren't backing PK/UNIQUE
constraints.

---

## 7. Singleton lints

### `extension_in_public` × 1
- `vector` extension is in the `public` schema. Move to a dedicated `extensions`
  schema: `CREATE SCHEMA IF NOT EXISTS extensions; ALTER EXTENSION vector SET SCHEMA extensions;`
  followed by adding `extensions` to `search_path` in `config.toml`. Likely safe but
  needs a deploy-window check — anything that uses `vector` types unqualified will
  break.

### `auth_leaked_password_protection` × 1
- HaveIBeenPwned check is off in Supabase Auth settings. **One-click fix:** Studio
  → Authentication → Settings → "Leaked Password Protection" → enable. No code
  change.

### `auth_db_connections_absolute` × 1
- Auth server hardcoded to 10 connections. Switch to percentage-based. Does not
  need migration — Studio setting only. Currently fine for this load level but
  becomes a bottleneck if instance is upsized.

### `rls_enabled_no_policy` × 3 (INFO)
- `arousal_gated_commitments`, `automatic_escalations`, `task_evolution` — RLS on
  but no policies, so nobody can read or write. Either intentional ("nobody but
  service_role should touch this") or a missed migration. Add a policy or
  document the lockdown.

---

## Recommended Pass 2 ordering

1. **First pass (security correctness):** §1 RLS-disabled tables with user data,
   §4a real bugs in `task_bank` / `affiliate_events`. Both are real authorization
   gaps.
2. **Second pass (consolidation):** §2 SECURITY INVOKER conversion + §3 grant
   cleanup + §4b service-role scoping + §5 permissive consolidation. These are all
   the same shape — scoping policies to specific roles instead of `public` — and
   should be one bulk migration covering all 128+ tables.
3. **Third pass (low-stakes):** §7 singletons, §6 after 7-day stats refresh.

Each phase should re-run `supabase db advisors --linked` to confirm the targeted
lint count drops to expected level.
