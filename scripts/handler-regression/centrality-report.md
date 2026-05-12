# Handler-Centrality Audit

Generated: 2026-05-12T05:35:13.952Z

Each function below writes a user-facing artifact (decree, commitment, outreach, confession prompt, etc.) **without first reading any Handler-state table**. The artifact is therefore generated without reference to the current persona, phase, mode, slip count, or recent directives — it cannot speak with Handler authority.

Memory rule: `feedback_handler_is_singular_authority.md`. Refactor each entry to read at least one of: `user_state`, `handler_persona`, `handler_directives`, `handler_memory`, `handler_daily_plans`, `handler_briefing`, `compliance_state`, `denial_streaks`, `chastity_sessions` — before producing the artifact.

**Allowed-list (skipped):** functions in `api/handler/chat.ts`, `supabase/functions/handler-autonomous/index.ts`, `supabase/functions/handler-outreach-auto/index.ts` are exempt because they ARE the Handler — their callers have already loaded state.

## 23 centrality violations

| File:Line | Function | Writes (user-facing) |
|-----------|----------|---------------------|
| `api\handler\_lib\chat-action.ts:9961` | `maybeGenerateBodyDirectives` | `body_feminization_directives` |
| `api\handler\_lib\chat-action.ts:10862` | `executeDeviceCommand` | `lovense_commands` |
| `api\handler\_lib\chat-action.ts:13886` | `runRationalizationGate` | `handler_outreach_queue` |
| `api\handler\_lib\chat-action.ts:13916` | `runPronounGate` | `handler_outreach_queue` |
| `supabase\functions\bind-enforcer-cron\index.ts:97` | `fireConsequence` | `handler_decrees` |
| `supabase\functions\capability-digest-cron\index.ts:77` | `digestForCanonicalUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-fast-react\index.ts:125` | `fireFastAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\mommy-gaslight\index.ts:136` | `persistImplant` | `memory_implants` |
| `supabase\functions\mommy-scheme\index.ts:211` | `fireAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:177` | `spontaneousOutreach` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:822` | `ensureWeeklyMeasurementCommitment` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:880` | `tickVoicePitchRatchet` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:945` | `ensureTodayOutfitMandate` | `handler_commitments`, `daily_outfit_mandates` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1054` | `plantTodaySymptom` | `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1106` | `runGapAnalysis` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1444` | `generateEvidenceReport` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2369` | `bridgeShotsToContentQueue` | `ai_generated_content` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2445` | `fireDailyMorningBrief` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2536` | `promoteConfessionsToImplants` | `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3394` | `prescribeVoiceDrill` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3755` | `enqueueTimeSensitiveNotifications` | `scheduled_notifications` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:4682` | `checkWeeklyContractEscalation` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:5209` | `checkSpecialOccasions` | `handler_outreach_queue` |