# Handler-Centrality Audit

Generated: 2026-05-12T02:09:18.455Z

Each function below writes a user-facing artifact (decree, commitment, outreach, confession prompt, etc.) **without first reading any Handler-state table**. The artifact is therefore generated without reference to the current persona, phase, mode, slip count, or recent directives — it cannot speak with Handler authority.

Memory rule: `feedback_handler_is_singular_authority.md`. Refactor each entry to read at least one of: `user_state`, `handler_persona`, `handler_directives`, `handler_memory`, `handler_daily_plans`, `handler_briefing`, `compliance_state`, `denial_streaks`, `chastity_sessions` — before producing the artifact.

**Allowed-list (skipped):** functions in `api/handler/chat.ts`, `supabase/functions/handler-autonomous/index.ts`, `supabase/functions/handler-outreach-auto/index.ts` are exempt because they ARE the Handler — their callers have already loaded state.

## 23 centrality violations

| File:Line | Function | Writes (user-facing) |
|-----------|----------|---------------------|
| `api\handler\_lib\chat-action.ts:10076` | `maybeGenerateBodyDirectives` | `body_feminization_directives` |
| `api\handler\_lib\chat-action.ts:10977` | `executeDeviceCommand` | `lovense_commands` |
| `api\handler\_lib\chat-action.ts:14001` | `runRationalizationGate` | `handler_outreach_queue` |
| `api\handler\_lib\chat-action.ts:14031` | `runPronounGate` | `handler_outreach_queue` |
| `supabase\functions\bind-enforcer-cron\index.ts:97` | `fireConsequence` | `handler_decrees` |
| `supabase\functions\capability-digest-cron\index.ts:77` | `digestForCanonicalUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-fast-react\index.ts:122` | `fireFastAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\mommy-gaslight\index.ts:135` | `persistImplant` | `memory_implants` |
| `supabase\functions\mommy-scheme\index.ts:210` | `fireAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:177` | `spontaneousOutreach` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:833` | `ensureWeeklyMeasurementCommitment` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:891` | `tickVoicePitchRatchet` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:955` | `ensureTodayOutfitMandate` | `handler_commitments`, `daily_outfit_mandates` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1064` | `plantTodaySymptom` | `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1116` | `runGapAnalysis` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1454` | `generateEvidenceReport` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2378` | `bridgeShotsToContentQueue` | `ai_generated_content` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2454` | `fireDailyMorningBrief` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2545` | `promoteConfessionsToImplants` | `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3402` | `prescribeVoiceDrill` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3763` | `enqueueTimeSensitiveNotifications` | `scheduled_notifications` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:4689` | `checkWeeklyContractEscalation` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:5216` | `checkSpecialOccasions` | `handler_outreach_queue` |