# Generator Coverage Audit

Generated: 2026-04-28T23:37:19.589Z
Source roots scanned: api, supabase\functions, src\lib
Tables tracked: handler_decrees, confession_queue, punishment_queue, slip_log, narrative_reframings, witness_fabrications, memory_implants, handler_outreach_queue, handler_commitments, forced_lockdown_triggers, daily_outfit_mandates, body_feminization_directives, engagement_obligations, verification_photos, arousal_log, orgasm_log
Regression tests found: 19

## Coverage by table

| Table | Insert sites | Covered sites | Gap |
|-------|-------------:|-------------:|----:|
| `arousal_log` | 1 | 1 | 0 |
| `body_feminization_directives` | 3 | 1 | 2 |
| `confession_queue` | 3 | 0 | 3 |
| `daily_outfit_mandates` | 1 | 0 | 1 |
| `forced_lockdown_triggers` | 2 | 0 | 2 |
| `handler_commitments` | 12 | 0 | 12 |
| `handler_decrees` | 4 | 0 | 4 |
| `handler_outreach_queue` | 47 | 4 | 43 |
| `memory_implants` | 7 | 7 | 0 |
| `narrative_reframings` | 4 | 0 | 4 |
| `orgasm_log` | 1 | 0 | 1 |
| `punishment_queue` | 4 | 0 | 4 |
| `slip_log` | 10 | 0 | 10 |
| `witness_fabrications` | 1 | 1 | 0 |
| **TOTAL** | **100** | **14** | **86** |

## Uncovered insert sites (the backlog)

Each row below is a generator that writes to a user-facing artifact table without a corresponding regression test. Add a test before the next bug-fix on these.

| Table | Function | File:Line | Snippet |
|-------|----------|-----------|---------|
| `body_feminization_directives` | `?` | `supabase\functions\handler-outreach-auto\index.ts:424` | await supa.from('body_feminization_directives').insert({ |
| `body_feminization_directives` | `?` | `supabase\functions\handler-outreach-auto\index.ts:454` | await supa.from('body_feminization_directives').insert({ |
| `confession_queue` | `snippet` | `supabase\functions\handler-autonomous\index.ts:2060` | await supabase.from('confession_queue').insert({ |
| `confession_queue` | `snippet` | `supabase\functions\handler-autonomous\index.ts:2090` | await supabase.from('confession_queue').insert({ |
| `confession_queue` | `?` | `supabase\functions\handler-autonomous\index.ts:2129` | await supabase.from('confession_queue').insert({ |
| `daily_outfit_mandates` | `phase` | `supabase\functions\handler-autonomous\index.ts:928` | await supabase.from('daily_outfit_mandates').insert({ |
| `forced_lockdown_triggers` | `lockedAt` | `supabase\functions\handler-autonomous\index.ts:2622` | await supabase.from('forced_lockdown_triggers').insert({ |
| `forced_lockdown_triggers` | `lockedAt` | `supabase\functions\handler-autonomous\index.ts:2656` | await supabase.from('forced_lockdown_triggers').insert({ |
| `handler_commitments` | `consequence` | `api\handler\chat.ts:3537` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `ensureWeeklyMeasurementCommitment` | `supabase\functions\handler-autonomous\index.ts:819` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `phase` | `supabase\functions\handler-autonomous\index.ts:931` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `lastAt` | `supabase\functions\handler-autonomous\index.ts:1023` | const { data } = await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `lastAt` | `supabase\functions\handler-autonomous\index.ts:1064` | const { data } = await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `lastAt` | `supabase\functions\handler-autonomous\index.ts:1085` | const { data } = await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `current` | `supabase\functions\handler-autonomous\index.ts:1277` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `sum` | `supabase\functions\handler-autonomous\index.ts:1508` | const { data: cmt } = await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `lockedAt` | `supabase\functions\handler-autonomous\index.ts:1869` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `?` | `supabase\functions\handler-autonomous\index.ts:1981` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `prescribeVoiceDrill` | `supabase\functions\handler-autonomous\index.ts:3098` | await supabase.from('handler_commitments').insert({ |
| `handler_commitments` | `phase` | `supabase\functions\handler-autonomous\index.ts:3323` | await supabase.from('handler_commitments').insert({ |
| `handler_decrees` | `phase` | `supabase\functions\handler-autonomous\index.ts:2439` | await supabase.from('handler_decrees').insert({ |
| `handler_decrees` | `phaseKey` | `supabase\functions\handler-autonomous\index.ts:2493` | await supabase.from('handler_decrees').insert({ |
| `handler_decrees` | `planId` | `supabase\functions\revenue-planner\index.ts:305` | const { data: insertedDecrees } = await supabase.from('handler_decrees').insert(decreeRows).select('id') |
| `handler_decrees` | `targetPlatform` | `supabase\functions\revenue-planner\index.ts:583` | const { data: inserted } = await supabase.from('handler_decrees').insert(decreeRows).select('id') |
| `handler_outreach_queue` | `consequences` | `api\handler\chat.ts:2602` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `consequences` | `api\handler\chat.ts:3393` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `total` | `api\handler\chat.ts:9498` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `runRationalizationGate` | `api\handler\chat.ts:13012` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `runPronounGate` | `api\handler\chat.ts:13040` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `handleProcessDeviceSchedule` | `supabase\functions\conditioning-engine\index.ts:1308` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\envelope-release\index.ts:46` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `userId` | `supabase\functions\force-processor\index.ts:403` | await supa.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `localHour` | `supabase\functions\handler-autonomous\index.ts:182` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `cdtHour` | `supabase\functions\handler-autonomous\index.ts:409` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `cdtHour` | `supabase\functions\handler-autonomous\index.ts:475` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `anyFulfilled` | `supabase\functions\handler-autonomous\index.ts:729` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `hasActive` | `supabase\functions\handler-autonomous\index.ts:771` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `ensureWeeklyMeasurementCommitment` | `supabase\functions\handler-autonomous\index.ts:829` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `arr` | `supabase\functions\handler-autonomous\index.ts:878` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `plantTodaySymptom` | `supabase\functions\handler-autonomous\index.ts:957` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `lastAt` | `supabase\functions\handler-autonomous\index.ts:1043` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `current` | `supabase\functions\handler-autonomous\index.ts:1264` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\handler-autonomous\index.ts:1441` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `sum` | `supabase\functions\handler-autonomous\index.ts:1518` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `draftText` | `supabase\functions\handler-autonomous\index.ts:1680` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `wfabs` | `supabase\functions\handler-autonomous\index.ts:1754` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `imps` | `supabase\functions\handler-autonomous\index.ts:1940` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `fmtRel` | `supabase\functions\handler-autonomous\index.ts:2309` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `slipMatch` | `supabase\functions\handler-autonomous\index.ts:2557` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `lockedAt` | `supabase\functions\handler-autonomous\index.ts:2629` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `lastSlipTime` | `supabase\functions\handler-autonomous\index.ts:2810` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `prescribeVoiceDrill` | `supabase\functions\handler-autonomous\index.ts:3108` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `newStreak` | `supabase\functions\handler-autonomous\index.ts:3686` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `localHour` | `supabase\functions\handler-autonomous\index.ts:3847` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `proactiveBoundaryPush` | `supabase\functions\handler-autonomous\index.ts:3918` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `localHour` | `supabase\functions\handler-autonomous\index.ts:3973` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `lastMessageStr` | `supabase\functions\handler-autonomous\index.ts:4097` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\handler-autonomous\index.ts:4315` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\handler-autonomous\index.ts:4844` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `hoursSinceActivity` | `supabase\functions\handler-outreach\index.ts:201` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\handler-outreach-auto\index.ts:606` | await supa.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `holdRows` | `supabase\functions\handler-outreach-auto\index.ts:718` | await supa.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `?` | `supabase\functions\handler-outreach-auto\index.ts:939` | await supa.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `planId` | `supabase\functions\revenue-planner\index.ts:316` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `itemRows` | `supabase\functions\revenue-planner\index.ts:630` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `need` | `supabase\functions\sponsor-page\index.ts:87` | await supabase.from('handler_outreach_queue').insert({ |
| `handler_outreach_queue` | `preference` | `supabase\functions\workout-prescriber\index.ts:188` | await supa.from('handler_outreach_queue').insert({ |
| `narrative_reframings` | `forkedBodyPart` | `api\handler\chat.ts:11582` | await supabase.from('narrative_reframings').insert({ |
| `narrative_reframings` | `idx` | `supabase\functions\handler-autonomous\index.ts:2752` | const { error } = await supabase.from('narrative_reframings').insert({ |
| `narrative_reframings` | `?` | `supabase\functions\handler-evolve\index.ts:307` | const { error } = await supabase.from('narrative_reframings').insert({ |
| `narrative_reframings` | `eligible` | `supabase\functions\handler-outreach-auto\index.ts:338` | await supa.from('narrative_reframings').insert({ |
| `orgasm_log` | `triggerPostReleaseSequence` | `src\lib\conditioning\post-release-bridge.ts:162` | await supabase.from('orgasm_log').insert({ |
| `punishment_queue` | `?` | `supabase\functions\force-processor\index.ts:54` | await supa.from('punishment_queue').insert({ |
| `punishment_queue` | `?` | `supabase\functions\force-processor\index.ts:142` | await supa.from('punishment_queue').insert([ |
| `punishment_queue` | `userId` | `supabase\functions\force-processor\index.ts:203` | await supa.from('punishment_queue').insert({ |
| `punishment_queue` | `userId` | `supabase\functions\force-processor\index.ts:214` | await supa.from('punishment_queue').insert({ |
| `slip_log` | `scanAndLogSlips` | `api\handler\chat.ts:9448` | const { data: inserted } = await supabase.from('slip_log').insert(rows).select('id'); |
| `slip_log` | `logGateResult` | `api\handler\_lib\pronoun-gate.ts:162` | await supabase.from('slip_log').insert({ |
| `slip_log` | `newDodge` | `supabase\functions\force-processor\index.ts:87` | await supa.from('slip_log').insert({ |
| `slip_log` | `lastAt` | `supabase\functions\force-processor\index.ts:577` | await supa.from('slip_log').insert({ |
| `slip_log` | `arr` | `supabase\functions\handler-autonomous\index.ts:895` | await supabase.from('slip_log').insert({ |
| `slip_log` | `?` | `supabase\functions\handler-autonomous\index.ts:2148` | await supabase.from('slip_log').insert({ |
| `slip_log` | `slipMatch` | `supabase\functions\handler-autonomous\index.ts:2523` | await supabase.from('slip_log').insert({ |
| `slip_log` | `enforceCommitments` | `supabase\functions\handler-autonomous\index.ts:3564` | await supabase.from('slip_log').insert({ |
| `slip_log` | `newDodge` | `src\lib\force\punishment-queue.ts:235` | await supabase.from('slip_log').insert({ |
| `slip_log` | `requestCease` | `src\lib\force\regimen-ratchet.ts:167` | await supabase.from('slip_log').insert({ |
