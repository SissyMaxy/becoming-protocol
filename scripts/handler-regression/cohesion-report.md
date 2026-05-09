# Cohesion Audit

Generated: 2026-05-09T14:58:31.503Z

Each tracked artifact table must be both **written by** at least one generator AND **read by** at least one consumer. Tables that fail either side are flagged: orphan writers (output that nothing consumes — feature is decorative) or dangling readers (consumer expecting input that never arrives — feature is broken).

Aspiration: zero orphans. Allow-list legitimate exceptions in `EXPECTED_ORPHANS` with justification.

## Cohesion matrix

Columns: **Writes** (any code that writes to the table), **Reads** (any code that selects from it), **Ctx-reads** (reads in code paths that feed the Handler conversation context — `api/handler/chat.ts`, `handler-systems-context.ts`, `handler-briefing.ts`, `handler-autonomous`, `handler-outreach-auto`). Tables with writes but **zero ctx-reads** are particularly suspect: the artifact exists but the Handler never knows about it.

| Table | Writes | Reads | Ctx-reads | Status |
|-------|------:|------:|---------:|--------|
| `user_state` | 92 | 207 | 38 | OK |
| `denial_streaks` | 9 | 21 | 2 | OK |
| `arousal_log` | 2 | 7 | 0 | ⚠ HANDLER-BLIND (writes but no ctx-reads) |
| `orgasm_log` | 2 | 6 | 1 | OK |
| `handler_decrees` | 17 | 27 | 1 | OK |
| `handler_commitments` | 22 | 38 | 0 | ⚠ HANDLER-BLIND (writes but no ctx-reads) |
| `punishment_queue` | 18 | 16 | 1 | OK |
| `slip_log` | 22 | 31 | 4 | OK |
| `confession_queue` | 11 | 31 | 2 | OK |
| `forced_lockdown_triggers` | 5 | 4 | 0 | ⚠ HANDLER-BLIND (writes but no ctx-reads) |
| `wardrobe_inventory` | 9 | 10 | 1 | OK |
| `body_feminization_directives` | 6 | 11 | 4 | OK |
| `daily_outfit_mandates` | 2 | 7 | 0 | ⚠ HANDLER-BLIND (writes but no ctx-reads) |
| `medication_regimen` | 4 | 14 | 6 | OK |
| `dose_log` | 10 | 11 | 1 | OK |
| `verification_photos` | 9 | 14 | 5 | OK |
| `memory_implants` | 17 | 23 | 4 | OK |
| `narrative_reframings` | 4 | 11 | 3 | OK |
| `witness_fabrications` | 3 | 9 | 1 | OK |
| `handler_memory` | 26 | 23 | 3 | OK |
| `shame_journal` | 3 | 12 | 4 | OK |
| `key_admissions` | 2 | 4 | 2 | OK |
| `handler_outreach_queue` | 86 | 29 | 3 | OK |
| `handler_outreach` | 6 | 3 | 2 | OK |
| `handler_messages` | 3 | 38 | 12 | OK |
| `handler_directives` | 132 | 65 | 13 | OK |
| `gina_disclosure_schedule` | 7 | 14 | 1 | OK |
| `gina_disclosure_signals` | 1 | 1 | 1 | OK |
| `partner_disclosures` | 1 | 1 | 1 | OK |
| `designated_witnesses` | 3 | 11 | 5 | OK |
| `witness_notifications` | 11 | 2 | 1 | OK |
| `chastity_sessions` | 13 | 11 | 1 | OK |
| `chastity_milestones` | 5 | 5 | 1 | OK |
| `voice_pitch_samples` | 6 | 29 | 8 | OK |
| `voice_practice_log` | 3 | 8 | 3 | OK |
| `voice_pitch_floor` | 2 | 2 | 0 | ⚠ HANDLER-BLIND (writes but no ctx-reads) |
| `revenue_plans` | 3 | 6 | 1 | OK |
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

**Summary:** 0 orphan writes · 0 dangling reads · 5 handler-blind tables

## The orphan list (the synergy backlog)

Each entry below is either decorative (writes that nothing reads) or broken (reads expecting writes). Either close the loop or remove the dead code.

### `arousal_log` — WRITES BUT HANDLER NEVER SEES IT

**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.

**Writes (2):**
- `api\handler\_lib\chat-action.ts:13984` (insert)
- `src\components\today-redesign\ArousalLogCard.tsx:42` (insert)

**Reads (7, none in handler-context):**
- `supabase\functions\mommy-mood\index.ts:64`
- `supabase\functions\mommy-praise\index.ts:51`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2062`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2255`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2623`
- `supabase\functions\_shared\mommy-hardening-context.ts:190`
- `src\components\today-redesign\ArousalLogCard.tsx:25`

### `handler_commitments` — WRITES BUT HANDLER NEVER SEES IT

**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.

**Writes (22):**
- `api\handler\_lib\chat-action.ts:3933` (insert)
- `supabase\functions\vacation-mode\index.ts:50` (update)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:862` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1003` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1037` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1049` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1145` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1189` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1210` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1405` (insert)

**Reads (38, none in handler-context):**
- `supabase\functions\handler-evolve\index.ts:112`
- `supabase\functions\handler-evolve\index.ts:393`
- `supabase\functions\handler-strategist-v2\index.ts:109`
- `supabase\functions\hard-mode-auto-trigger\index.ts:38`
- `supabase\functions\loophole-hunter\index.ts:84`
- `supabase\functions\mommy-bedtime\index.ts:64`
- `supabase\functions\mommy-mood\index.ts:68`
- `supabase\functions\mommy-mood\index.ts:69`
- `supabase\functions\trajectory-predictor\index.ts:73`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:753`

### `forced_lockdown_triggers` — WRITES BUT HANDLER NEVER SEES IT

**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.

**Writes (5):**
- `supabase\functions\auto-healer\index.ts:143` (update)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2846` (insert)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2880` (insert)
- `src\components\today-redesign\ConditioningLockdown.tsx:175` (update)
- `src\components\today-redesign\ConditioningLockdown.tsx:247` (update)

**Reads (4, none in handler-context):**
- `supabase\functions\auto-healer\index.ts:137`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2838`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2874`
- `src\components\today-redesign\ConditioningLockdown.tsx:121`

### `daily_outfit_mandates` — WRITES BUT HANDLER NEVER SEES IT

**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.

**Writes (2):**
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1030` (insert)
- `src\components\today-redesign\FocusMode.tsx:470` (update)

**Reads (7, none in handler-context):**
- `supabase\functions\loophole-hunter\index.ts:86`
- `supabase\functions\trajectory-predictor\index.ts:75`
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:961`
- `src\components\today-redesign\DailyBriefingCard.tsx:39`
- `src\components\today-redesign\FocusMode.tsx:145`
- `src\components\today-redesign\OutfitMandateCard.tsx:36`
- `src\components\today-redesign\UnifiedTaskList.tsx:121`

### `voice_pitch_floor` — WRITES BUT HANDLER NEVER SEES IT

**Reads exist but none feed Handler conversation context.** The artifact gets created and probably shown in some UI surface, but the Handler will never reference it in chat. Either wire it into `handler-systems-context.ts` (or equivalent), or accept that the feature is display-only and add to `EXPECTED_ORPHANS`.

**Writes (2):**
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:918` (update)
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:940` (update)

**Reads (2, none in handler-context):**
- `supabase\functions\_shared\job-handlers\handler-autonomous.ts:896`
- `src\components\today-redesign\VoiceDrillCard.tsx:33`
