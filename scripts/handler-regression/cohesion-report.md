# Cohesion Audit

Generated: 2026-04-29T13:45:45.680Z

Each tracked artifact table must be both **written by** at least one generator AND **read by** at least one consumer. Tables that fail either side are flagged: orphan writers (output that nothing consumes — feature is decorative) or dangling readers (consumer expecting input that never arrives — feature is broken).

Aspiration: zero orphans. Allow-list legitimate exceptions in `EXPECTED_ORPHANS` with justification.

## Cohesion matrix

Columns: **Writes** (any code that writes to the table), **Reads** (any code that selects from it), **Ctx-reads** (reads in code paths that feed the Handler conversation context — `api/handler/chat.ts`, `handler-systems-context.ts`, `handler-briefing.ts`, `handler-autonomous`, `handler-outreach-auto`). Tables with writes but **zero ctx-reads** are particularly suspect: the artifact exists but the Handler never knows about it.

| Table | Writes | Reads | Ctx-reads | Status |
|-------|------:|------:|---------:|--------|
| `user_state` | 76 | 157 | 53 | OK |
| `denial_streaks` | 9 | 21 | 3 | OK |
| `arousal_log` | 2 | 4 | 3 | OK |
| `orgasm_log` | 2 | 6 | 1 | OK |
| `handler_decrees` | 9 | 12 | 7 | OK |
| `handler_commitments` | 17 | 26 | 16 | OK |
| `punishment_queue` | 15 | 12 | 1 | OK |
| `slip_log` | 21 | 18 | 11 | OK |
| `confession_queue` | 7 | 13 | 9 | OK |
| `forced_lockdown_triggers` | 4 | 3 | 2 | OK |
| `wardrobe_inventory` | 6 | 8 | 1 | OK |
| `body_feminization_directives` | 6 | 11 | 4 | OK |
| `daily_outfit_mandates` | 1 | 4 | 1 | OK |
| `medication_regimen` | 4 | 11 | 6 | OK |
| `dose_log` | 9 | 5 | 1 | OK |
| `verification_photos` | 3 | 13 | 7 | OK |
| `memory_implants` | 8 | 16 | 9 | OK |
| `narrative_reframings` | 4 | 11 | 5 | OK |
| `witness_fabrications` | 2 | 9 | 3 | OK |
| `handler_memory` | 25 | 22 | 3 | OK |
| `shame_journal` | 3 | 12 | 4 | OK |
| `key_admissions` | 2 | 4 | 2 | OK |
| `handler_outreach_queue` | 56 | 18 | 8 | OK |
| `handler_outreach` | 6 | 3 | 2 | OK |
| `handler_messages` | 3 | 38 | 22 | OK |
| `handler_directives` | 132 | 64 | 25 | OK |
| `gina_disclosure_schedule` | 7 | 14 | 3 | OK |
| `gina_disclosure_signals` | 1 | 1 | 1 | OK |
| `partner_disclosures` | 1 | 1 | 1 | OK |
| `designated_witnesses` | 3 | 11 | 7 | OK |
| `witness_notifications` | 11 | 2 | 1 | OK |
| `chastity_sessions` | 10 | 9 | 3 | OK |
| `chastity_milestones` | 5 | 5 | 1 | OK |
| `voice_pitch_samples` | 5 | 26 | 11 | OK |
| `voice_practice_log` | 3 | 8 | 3 | OK |
| `voice_pitch_floor` | 2 | 2 | 1 | OK |
| `revenue_plans` | 3 | 6 | 2 | OK |
| `revenue_plan_items` | 4 | 4 | 1 | OK |
| `desire_log` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `sanctuary_messages` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `identity_dimensions` | 0 | 2 | 1 | (SQL-written: trigger/cron) |
| `defection_risk_scores` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `receptive_window_states` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `held_evidence` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `merge_pipeline_items` | 0 | 1 | 1 | (SQL-written: trigger/cron) |
| `gina_vibe_captures` | 1 | 1 | 1 | OK |
| `body_evidence_snapshots` | 0 | 2 | 1 | (SQL-written: trigger/cron) |

**Summary:** 0 orphan writes · 0 dangling reads · 0 handler-blind tables
