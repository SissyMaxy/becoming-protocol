# Handler-Centrality Audit

Generated: 2026-06-27T21:08:33.120Z

Each function below writes a user-facing artifact (decree, commitment, outreach, confession prompt, etc.) **without first reading any Handler-state table**. The artifact is therefore generated without reference to the current persona, phase, mode, slip count, or recent directives — it cannot speak with Handler authority.

Memory rule: `feedback_handler_is_singular_authority.md`. Refactor each entry to read at least one of: `user_state`, `handler_persona`, `handler_directives`, `handler_memory`, `handler_daily_plans`, `handler_briefing`, `compliance_state`, `denial_streaks`, `chastity_sessions` — before producing the artifact.

**Allowed-list (skipped):** functions in `api/handler/_lib/chat-action.ts`, `supabase/functions/handler-autonomous/index.ts`, `supabase/functions/handler-outreach-auto/index.ts` are exempt because they ARE the Handler — their callers have already loaded state.

## 39 centrality violations

| File:Line | Function | Writes (user-facing) |
|-----------|----------|---------------------|
| `supabase\functions\bind-enforcer-cron\index.ts:97` | `fireConsequence` | `handler_decrees` |
| `supabase\functions\capability-digest-cron\index.ts:77` | `digestForCanonicalUser` | `handler_outreach_queue` |
| `supabase\functions\confession-gaslight-mine\index.ts:51` | `mine` | `memory_implants` |
| `supabase\functions\date-safety-kit\index.ts:26` | `ensure` | `handler_decrees` |
| `supabase\functions\delivery-bridge-guard\index.ts:29` | `healOutreachToPush` | `scheduled_notifications` |
| `supabase\functions\delivery-bridge-guard\index.ts:61` | `healPreviewToOutreach` | `handler_outreach_queue` |
| `supabase\functions\live-photo-pinger\index.ts:191` | `maybePingUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-confession-gate\index.ts:33` | `gateUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-edging-day-assign\index.ts:63` | `assignForUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-edging-day-review\index.ts:47` | `reviewOne` | `handler_outreach_queue` |
| `supabase\functions\mommy-fast-react\index.ts:125` | `fireFastAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\mommy-gaslight\index.ts:136` | `persistImplant` | `memory_implants` |
| `supabase\functions\mommy-gaslight-cluster-author\index.ts:87` | `authorForUser` | `memory_implants` |
| `supabase\functions\mommy-gaslight-cluster-deliver\index.ts:38` | `deliverCluster` | `handler_outreach_queue` |
| `supabase\functions\mommy-gaslight-echo-deliver\index.ts:161` | `sendEcho` | `handler_outreach_queue` |
| `supabase\functions\mommy-identity-probe\index.ts:123` | `scheduleProbe` | `handler_outreach_queue` |
| `supabase\functions\mommy-intrusion-schedule\index.ts:48` | `sweepEvasions` | `handler_outreach_queue` |
| `supabase\functions\mommy-intrusion-schedule\index.ts:103` | `scheduleForUser` | `handler_outreach_queue` |
| `supabase\functions\mommy-scheme\index.ts:211` | `fireAction` | `handler_decrees`, `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\paid-monetization\index.ts:22` | `issue` | `handler_decrees` |
| `supabase\functions\real-name-lockout-scheduler\index.ts:67` | `openWindow` | `handler_outreach_queue` |
| `supabase\functions\sniffies-inbound-watcher\index.ts:119` | `processNewEvents` | `handler_outreach_queue` |
| `supabase\functions\sniffies-restart-coach\index.ts:223` | `processUser` | `handler_outreach_queue` |
| `supabase\functions\verification-evidence-grader\index.ts:210` | `queueFeedbackOutreach` | `handler_outreach_queue` |
| `supabase\functions\wish-human-handoff\index.ts:71` | `handoffForUser` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:177` | `spontaneousOutreach` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:822` | `ensureWeeklyMeasurementCommitment` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:880` | `tickVoicePitchRatchet` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:945` | `ensureTodayOutfitMandate` | `handler_commitments`, `daily_outfit_mandates` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1054` | `plantTodaySymptom` | `handler_outreach_queue`, `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1106` | `runGapAnalysis` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:1444` | `generateEvidenceReport` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2378` | `bridgeShotsToContentQueue` | `ai_generated_content` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2454` | `fireDailyMorningBrief` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:2545` | `promoteConfessionsToImplants` | `memory_implants` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3422` | `prescribeVoiceDrill` | `handler_commitments`, `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:3783` | `enqueueTimeSensitiveNotifications` | `scheduled_notifications` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:4718` | `checkWeeklyContractEscalation` | `handler_outreach_queue` |
| `supabase\functions\_shared\job-handlers\handler-autonomous.ts:5245` | `checkSpecialOccasions` | `handler_outreach_queue` |