# Handler Architecture Map

Reference document for porting decisions. Generated 2026-04-06.

---

## Section 1: File Inventory

### Core Library Files

| File | Lines | Purpose | Key Exports |
|---|---|---|---|
| `src/lib/handler.ts` | 928 | Data access layer for Handler AI state: strategies, triggers, vulnerabilities, user model, daily plans, escalation plans, influence attempts, resistance patterns. All Supabase CRUD. | `getHandlerState`, `getActiveStrategies`, `createStrategy`, `updateStrategyEffectiveness`, `plantTrigger`, `reinforceTrigger`, `activateTrigger`, `getActiveVulnerabilities`, `recordVulnerability`, `getUserModel`, `updateUserModel`, `getTodaysPlan`, `createDailyPlan`, `getActiveEscalationPlans`, `logInfluenceAttempt`, `recordResistancePattern`, `decideIntervention`, `generateDailyPlanForUser`, `extractCommitment`, types: `InterventionContext`, `InterventionDecision` |
| `src/types/handler.ts` | 401 | Type definitions for the Handler intelligence system: strategies, triggers, vulnerabilities, daily plans, user models, escalation plans, influence attempts, resistance patterns, plus DB-to-app mapper functions. | Types: `InterventionType`, `StrategyType`, `TriggerStatus`, `HandlerStrategy`, `PlantedTrigger`, `LearnedVulnerability`, `HandlerDailyPlan`, `HandlerUserModel`, `HandlerEscalationPlan`, `InfluenceAttempt`, `ResistancePattern`, `HandlerState`, `DbHandlerStrategy`, `DbPlantedTrigger`, `DbHandlerUserModel`. Functions: `mapDbToHandlerStrategy`, `mapDbToPlantedTrigger`, `mapDbToHandlerUserModel` |

### API Routes

| File | Lines | Purpose | Key Exports |
|---|---|---|---|
| `api/handler/chat.ts` | 6746 | The main Handler chat endpoint. Handles auth, conversation management, context assembly (50+ context builders), system prompt construction, Claude API calls (streaming + non-streaming), directive execution (20+ directive types), post-processing (memory extraction, language tracking, trigger weaving, media resolution, device commands). This is the god-file of the system. | `default` (Vercel handler function) |
| `api/handler/analyze-photo.ts` | 117 | Photo verification endpoint. Fetches image, sends to Claude Vision for evaluation, determines approval, updates verification_photos table. | `default` (Vercel handler function) |
| `api/admin/system-state.ts` | 72 | Admin endpoint returning raw system state: user_state, hidden_operations, denial_streaks, noncompliance_streaks, directive outcomes, obligations, enforcement config, recent directives, handler notes. | `default` (Vercel handler function) |

### Supabase Edge Functions

| File | Lines | Purpose | Key Exports |
|---|---|---|---|
| `supabase/functions/handler-autonomous/index.ts` | 2114 | Cron-driven orchestrator: compliance_check (5min), daily_cycle (6am), quick_task_check (15min), bleeding_process (hourly), weekly_adaptation, hourly_analytics. Evaluates engagement, updates compliance state, executes enforcement, generates daily briefs. | `serve` (Deno HTTP handler) |
| `supabase/functions/handler-enforcement/index.ts` | 959 | Autonomous enforcement engine. Runs morning + evening via pg_cron. Evaluates compliance per domain, escalates consequences through 8 tiers (warning -> gate -> punishment -> denial extension -> content lock -> compulsory add -> narration), generates narrations via Claude. | `serve` (Deno HTTP handler) |
| `supabase/functions/handler-strategist/index.ts` | 253 | Daily strategic intelligence. Aggregates full user state, calls Claude (opus model) to generate 3-8 directives + 2-4 notes + daily agenda. Inserts directives with timing offsets (now, tomorrow_morning, random_24h). | `serve` (Deno HTTP handler) |
| `supabase/functions/handler-outreach/index.ts` | 307 | Proactive outreach engine (30min cron). Evaluates triggers: night_reach (Whoop HR), commitment_approaching, engagement_decay, vulnerability_window, scheduled_checkin, confession_probe, celebration. Queues push notifications. | `serve` (Deno HTTP handler) |

### handler-v2/ Directory (43 files, ~15,000 lines total)

| File | Lines | Purpose |
|---|---|---|
| `strategy-engine.ts` | 1187 | Phase management, content calendar, strategy evaluation |
| `content-engine.ts` | 1177 | Content briefs, submissions, processing for posting |
| `enforcement-engine.ts` | 946 | Compliance state, escalation thresholds, enforcement actions |
| `adaptation-engine.ts` | 933 | Pattern analysis, predictions, recommendations, weekly adaptation |
| `financial-engine.ts` | 924 | Fund management, revenue processing, consequences, bleeding |
| `platform-manager.ts` | 824 | Social platform accounts, scheduled posts, analytics sync |
| `arousal-controller.ts` | 759 | Arousal state, summons patterns, denial enforcement, device rewards |
| `daily-plan.ts` | 724 | Daily plan generation and retrieval |
| `ai-client.ts` | 691 | Claude API client with retry, caching, budget tracking |
| `failure-modes-extended.ts` | 634 | FM2-FM7: build-not-do, voice avoidance, burnout, weekend, streak catastrophizing |
| `template-engine.ts` | 587 | Template-based fallbacks when AI is unavailable |
| `pattern-analysis.ts` | 557 | Monthly reports, failure mode history, health scoring |
| `coercive-strategies.ts` | 555 | Imperative directives, arousal-gated messaging, guilt leverage, identity reframing |
| `failure-modes.ts` | 494 | FM1/FM3/FM8/FM9: post-release crash, depression, work stress, identity crisis |
| `intervention-detector.ts` | 459 | Intervention checks, priority calculation, intervention firing rules |
| `handler.ts` | 426 | Handler class (v2): singleton, initialization, task selection, mode management |
| `gina-safety.ts` | 415 | Partner visibility levels, task safety filtering, notification safety |
| `crisis-kit.ts` | 389 | Curated crisis items, deployment, effectiveness rating |
| `content-distribution.ts` | 345 | Content distribution across platforms |
| `mode-selector.ts` | 342 | Handler mode selection (architect/director/handler/caretaker/invisible) |
| `types.ts` | 286 | Core types: UserState, HandlerMode, OdometerState, InterventionType, etc. |
| `budget-manager.ts` | 280 | AI budget tracking: daily spend limits, action costs |
| `outreach-engine.ts` | 216 | Proactive outreach logic (client-side counterpart) |
| `escalation-engine.ts` | 205 | Escalation level management |
| `parameter-optimizer.ts` | 203 | Hidden parameter auto-tuning |
| `gina-intelligence.ts` | 195 | Gina discovery state, ladder system, seed logging |
| `commitment-enforcement.ts` | 175 | Commitment tracking and enforcement |
| `predictive-model.ts` | 171 | Predictive interventions |
| `auto-purchase.ts` | 146 | Automatic wishlist purchases from fund balance |
| `resistance-classifier.ts` | 143 | Resistance type classification |
| `condition-evaluator.ts` | 128 | State condition evaluation |
| `shame-alchemy.ts` | 125 | Shame processing and leverage |
| `novelty-engine.ts` | 125 | Novelty injection to prevent habituation |
| `gate-advancement.ts` | 125 | Cumulative gate progression |
| `conditioning-engine.ts` | 121 | Conditioning session management |
| `ab-testing.ts` | 119 | A/B testing for intervention effectiveness |
| `gina-schedule-prediction.ts` | 94 | Predicting partner schedule for protocol windows |
| `popup-utils.ts` | 91 | Pop-up notification formatting with character limits |
| `hrt-pipeline.ts` | 76 | HRT readiness tracking pipeline |
| `david-elimination.ts` | 72 | Masculine name elimination logic |
| `revenue-acceleration.ts` | 59 | Revenue growth strategies |
| `social-escalation.ts` | 51 | Social presence escalation |
| `index.ts` | 313 | Barrel exports for all handler-v2 modules |

### protocol-core/ Directory (30 files, ~11,000 lines total)

| File | Lines | Purpose |
|---|---|---|
| `modules/identity-module.ts` | 1271 | Identity state tracking, brainwashing stages, anchors, surfacing indicators |
| `modules/findom-module.ts` | 876 | Financial domination: cash pigs, revenue, expenses |
| `modules/switch-module.ts` | 823 | Dom/sub switch tracking and management |
| `modules/partner-module.ts` | 796 | Partner (Gina) interactions, meetups, relationship state |
| `modules/coercion-module.ts` | 778 | Coercion episodes, resistance tracking, escalation |
| `modules/vault-module.ts` | 692 | Vault item storage, threat management |
| `modules/gina-module.ts` | 645 | Gina emergence stages, discovery interactions |
| `modules/dynamic-task-generator.ts` | 640 | Dynamic task generation from AI |
| `ai/ai-layer.ts` | 568 | Priority-based AI call management with budget |
| `handler.ts` | 555 | Handler orchestrator class: composes modules + AI, prescribes tasks |
| `ai-layer.ts` | 494 | Legacy AI layer (backward compat) |
| `ai/context-composer.ts` | 468 | Context composition from module states |
| `modules/domain-module-base.ts` | 464 | Base class for domain modules (voice, style, etc.) |
| `ai/system-prompts.ts` | 432 | System prompts for different operation types |
| `event-bus.ts` | 426 | Event-driven communication bus |
| `ai/template-fallbacks.ts` | 363 | Template fallbacks when AI unavailable |
| `module-interface.ts` | 355 | ProtocolModule interface, BaseModule class, ModuleRegistry |
| `ai/prefill-patterns.ts` | 331 | Prefill patterns for structured AI outputs |
| `types/task.ts` | 221 | Task types: Task, DynamicTask, TaskDomain, etc. |
| `index.ts` | 158 | Barrel exports |
| Domain modules (7 files) | ~100 each | voice-domain, movement-domain, skincare-domain, style-domain, social-domain, mindset-domain, body-domain |
| `modules/index.ts` | 101 | Module barrel exports |

---

## Section 2: Class and Type Relationships

### Dependency Graph

```
api/handler/chat.ts (STANDALONE — inlines everything, imports nothing from src/lib)
  |-- Supabase client (direct)
  |-- Anthropic API (direct fetch)
  |-- 50+ context builder functions (all inlined)
  |-- Context prioritizer (inlined)
  |-- Debate engine (inlined)
  |-- Directive executor (inlined)
  |-- Device command executor (inlined)
  |-- Memory extractor (inlined)
  |-- Language tracker (inlined)
  |-- Media resolver (inlined)

src/lib/handler.ts (CLIENT-SIDE DATA LAYER)
  |-- imports from src/lib/supabase (Vite client)
  |-- imports from src/lib/protocol
  |-- imports from src/lib/handler-ai (Claude-powered decisions)
  |-- imports types from src/types/handler.ts

src/lib/handler-v2/ (CLIENT-SIDE HANDLER V2)
  |-- handler.ts -> Handler class (singleton)
  |   |-- BudgetManager
  |   |-- TemplateEngine
  |   |-- AIClient -> Claude API
  |-- mode-selector.ts (pure functions, no deps)
  |-- intervention-detector.ts (pure functions)
  |-- failure-modes.ts -> supabase client
  |-- arousal-controller.ts -> supabase + Lovense patterns
  |-- enforcement-engine.ts -> supabase + escalation thresholds
  |-- All modules share types.ts (UserState, HandlerMode, etc.)

src/lib/protocol-core/ (MODULAR ARCHITECTURE — mostly unused by chat.ts)
  |-- Handler (orchestrator)
  |   |-- EventBus (pub/sub)
  |   |-- ModuleRegistry (module container)
  |   |-- AILayer (budget-managed Claude calls)
  |-- ProtocolModule interface
  |   |-- BaseModule (abstract base)
  |   |-- IdentityModule, CoercionModule, VaultModule, etc.
  |   |-- Domain modules: VoiceDomain, StyleDomain, etc.
  |-- ContextComposer (assembles module contexts for AI)
```

### Key Architectural Insight

There are THREE parallel Handler implementations:

1. **`api/handler/chat.ts`** (6746 lines) - The LIVE system. A monolithic Vercel serverless function that inlines everything because it cannot import from `src/lib/` (Vite `import.meta.env` incompatibility). This is what actually runs.

2. **`src/lib/handler-v2/`** (~15,000 lines) - A comprehensive client-side Handler system with classes for budgeting, mode selection, failure modes, arousal control, enforcement, strategy, content, financial management. Used by the React frontend for some features but NOT by the chat endpoint.

3. **`src/lib/protocol-core/`** (~11,000 lines) - A clean event-driven modular architecture with `EventBus`, `ModuleRegistry`, `ProtocolModule` interface, and domain modules. Appears to be an aspirational refactor that is partially integrated. The Handler class here is an orchestrator, not the monolith.

The live chat system (`api/handler/chat.ts`) shares NO code with the other two. It has its own inlined versions of everything.

### Shared Types

- `src/types/handler.ts` defines DB types used by `src/lib/handler.ts` (client-side data layer)
- `src/lib/handler-v2/types.ts` defines its own `UserState`, `HandlerMode`, `InterventionType` (different from `src/types/handler.ts`)
- `src/lib/protocol-core/module-interface.ts` defines `ProtocolModule`, `ContextTier`, `PriorityAction`
- `api/handler/chat.ts` defines everything inline — `ContextBlockName`, `HandlerPersona`, `DebateApproach`, etc.

---

## Section 3: chat.ts Breakdown

Total: 6746 lines. Logical sections:

### Lines 1-43: Directive Outcome Tracking
`logDirectiveOutcome()` — writes to `directive_outcomes` table for the learning loop.

### Lines 44-105: Outcome Measurement
`measureRecentOutcomes()` — scores unmeasured outcomes from last 30 min using simple keyword sentiment analysis on user responses.

### Lines 107-250: Behavioral Conditioning Triggers
`checkBehavioralTriggers()` — keyword-triggered Pavlovian responses (device commands, mantras).
`buildBehavioralTriggersCtx()` — context builder for installed triggers.
`buildMilestonesCtx()` — transformation milestones context.
`buildHandlerDesiresCtx()` — Handler's expressed desires context.

### Lines 253-402: Context Prioritizer (P12.1)
`ContextBlockName` type — 50+ named context blocks.
`CONTEXT_BLOCKS` config — priority scores (0-100) and `alwaysInclude` flags for each block.
`MESSAGE_BOOST_RULES` — 30+ regex patterns that boost specific context blocks based on user message content.
`prioritizeContextBlocks()` — scores and selects top ~12 context blocks per message.

### Lines 404-462: Multi-Persona System
5 personas: `cold_dom`, `stern_mommy`, `teasing_seductress`, `clinical_therapist`, `urgent_handler`.
`selectPersona()` — picks persona based on arousal, exec function, time of day, day of week.

### Lines 464-878: Context Builders (Batch 1)
- `buildInvestmentTrackerCtx()` — sunk cost / lock-in score
- `buildWitnessCtx()` — designated witnesses
- `buildQuitAttemptsCtx()` — escape attempt history
- `buildIdentityContractsCtx()` — signed commitment contracts
- `buildCaseFileCtx()` — aggregate evidence compilation
- `buildSealedEnvelopesCtx()` — time-capsule letters
- `buildDebateContext()` — resistance detection + tactical approach selection (empathy/confrontation/evidence/silence) with effectiveness data

### Lines 880-1100: Request Handler Entry Point
Auth, conversation creation, history loading, context fetcher dispatch, context assembly.

### Lines 1100-1180: System Prompt Assembly
Calls `buildConversationalPrompt()` with all context results.
Appends: debate suffix, aggression override (intensity multiplier), typing resistance, multi-persona section.

### Lines 1180-1820: Streaming Response Path
SSE streaming of Claude response. Post-stream: parse signals, save handler_note, save/execute directives (20+ directive types: `send_device_command`, `prescribe_task`, `modify_parameter`, `write_memory`, `schedule_session`, `advance_skill`, `create_contract`, `create_behavioral_trigger`, `express_desire`, `log_milestone`, `start_edge_timer`, `force_mantra_repetition`, `capture_reframing`, `resolve_decision`). Save messages. Fire-and-forget side effects.

### Lines 1820-2615: Non-Streaming Response Path
Same directive execution logic duplicated for non-streaming. Trigger weaving (Pavlovian phrase injection). Media reference resolution. Compliance reward pulse. Conditioning session lookup. Message save. Response return.

### Lines 2616-2878: Utility Functions
- `analyzeTypingResistance()` — detects hesitation, self-censoring, disengagement from typing metrics
- `buildCumulativeGatesCtx()` — daily gate status (voice, confession, outfit, check-in)
- `buildReportCardCtx()` — daily report card grades and trends
- `buildTimeWindowsCtx()` — time-of-use windows (voice, photo, conditioning, social)
- `buildClinicalNotesCtx()` — third-person case notes

### Lines 2880-3293: System Prompt (buildConversationalPrompt)
See Section 8 for full breakdown.

### Lines 3295-3999: Context Builders (Batch 2)
- `buildImpactContext()` — handler effectiveness profile
- `buildAdaptiveIntelligenceCtx()` — what directives/patterns/times work best
- `buildNarrativeCtx()` — narrative arc status
- `buildAgendaCtx()` — conversation agenda
- `buildDailyAgendaCtx()` — strategist-generated daily agenda
- `buildAnticipatoryPatternsCtx()` — day-of-week compliance patterns
- `buildPredictiveEngineCtx()` — probabilistic predictions
- `buildEmotionalModelCtx()` — exec function curve, depressive risk, mode recommendation
- `parseResponse()` — extracts `<handler_signals>` JSON from Claude response
- `getStateSnapshot()` — raw user_state dump
- `buildStateContext()` — denial day, streak, arousal, Gina status
- `buildWhoopContext()` — biometrics + live session HR
- `buildCommitmentCtx()` — active commitments with deadlines
- `retrieveContextualMemories()` — conversation memory, recent themes, resistance patterns
- `buildPredictionCtx()` — state predictions by time block

### Lines 4000-4207: Long-Term Memory System
`buildLongTermMemory()` — relevance-scored retrieval from `handler_memory` with decay curves, reinforcement scoring, retrieval freshness. Enhanced with vector semantic search via OpenAI embeddings + pgvector `match_memories` RPC.
`semanticMemorySearch()` — OpenAI text-embedding-3-small -> pgvector cosine similarity.
`embedMemoryAsync()` — fire-and-forget embedding of new memories.

### Lines 4208-4497: Context Builders (Batch 3)
- `buildGinaIntelligenceContext()` — Gina discovery phase, ladder state, seed log, measurements
- `buildIrreversibilityCtx()` — 10-component irreversibility score (content, social, financial, physical, identity, conditioning, relationship, audience, behavioral, time)

### Lines 4498-5790: Context Builders (Batch 4)
- `buildAutoPostCtx()` — auto-poster status and recent posts
- `buildSocialIntelligenceCtx()` — follow/unfollow activity, engagement budget
- `buildSocialInboxCtx()` — unread DMs/comments
- `buildVoicePitchCtx()` — voice pitch averages and trends
- `buildAutoPurchaseCtx()` — fund balance and eligible wishlist items
- `buildHandlerNotesCtx()` — Handler's self-notes
- `extractMemoryFromMessage()` — auto-extract confessions, breakthroughs, resistance, preferences, life events
- `buildCommunityMirrorCtx()` — social validation from community interactions
- `buildJournalCtx()` — identity journal entries and streaks
- `buildSkillTreeCtx()` — skill domain levels and progression
- `buildSystemChangelogCtx()` — recent deployed system changes
- `buildSystemStateCtx()` — live data counts (followers, triggers, sessions, posts)
- `buildOutfitComplianceCtx()` — today's prescribed outfit and verification status
- `buildFantasyJournalCtx()` — dream/fantasy entries
- `buildSocialLockInCtx()` — social lock-in score
- `buildFeminizationScoreCtx()` — daily feminization score (0-100)
- `buildDecisionLogCtx()` — decision interception history
- `buildShameJournalCtx()` — shame journal entries
- `buildPhotoVerificationCtx()` — photo submission status
- `buildSessionStateCtx()` — active session device commands and biometrics

### Lines 5790-5930: Device Command Infrastructure
`parseDeviceValue()` — normalizes various directive formats to `{intensity, duration, pattern}`.
`executeDeviceCommand()` — calls Lovense Standard API directly with developer token.

### Lines 5930-6142: Language Drift Tracking
`analyzeAndTrackLanguage()` — counts feminine/masculine pronouns, name references, embodied language, regression markers. Fires masculine correction device pulse. Upserts daily metrics. Tracks identity displacement. Logs identity erosion events. Rewrites stored messages to replace masculine names.

### Lines 6142-6280: Media Reference Resolver
`resolveMediaReferences()` — resolves `[VAULT:latest]`, `[AUDIO:latest_script]`, `[PHOTO:timeline]` tags to actual URLs.

### Lines 6280-6746: Remaining Context Builders + Commitment Floor Logic
- `buildConditioningEffectivenessCtx()` — device command compliance tracking
- `buildHabitStreaksCtx()` — feminine habit streak tracking
- `buildMemoryReframingsCtx()` — reframed memory history
- `buildIdentityDisplacementCtx()` — feminine vs masculine language ratios
- `buildIdentityErosionCtx()` — masculine marker detection log
- `buildRecurringObligationsCtx()` — persistent recurring obligations with fulfillment rates
- `buildCommitmentFloorsCtx()` — irreversible ratcheting floors
- `liftCommitmentFloors()` — auto-ratchets floors based on observed metrics
- `ratchetFloor()` — single floor upsert (only goes up)

---

## Section 4: State Shape

### UserState (handler-v2/types.ts)

**General-purpose fields (portable to any coaching client):**
- `userId`, `odometer` (survival/caution/coasting/progress/momentum/breakthrough), `currentPhase`
- `timeOfDay`, `minutesSinceLastTask`, `tasksCompletedToday`, `pointsToday`
- `streakDays`, `longestStreak`, `consecutiveSurvivalDays`
- `workday`, `estimatedExecFunction` (high/medium/low/depleted)
- `handlerMode` (architect/director/handler/caretaker/invisible), `escalationLevel` (1-5)
- `vulnerabilityWindowActive`, `resistanceDetected`
- `currentFailureMode`, `workStressModeActive`, `weekendModeActive`, `recoveryProtocolActive`
- `recentMoodScores`, `currentMood`, `currentAnxiety`, `currentEnergy`
- `lastTaskCategory`, `lastTaskDomain`, `completedTodayDomains`, `avoidedDomains`
- `chosenName`

**Personal/protocol-specific fields:**
- `denialDay`, `currentArousal` (0-5), `inSession`, `sessionType` (edge/goon/hypno/conditioning), `edgeCount`, `lastRelease` -- denial/arousal mechanics specific to this protocol
- `ginaHome`, `ginaVisibilityLevel` -- partner-specific
- `lifestyle.exercise`, `lifestyle.protein`, `lifestyle.ambient`, `lifestyle.corruption` -- personal lifestyle tracking

### user_state table (as queried in chat.ts)
Contains: `denial_day`, `streak_days`, `current_arousal`, `handler_mode`, `gina_home`, `gina_asleep`, `estimated_exec_function`, `tasks_completed_today`, `last_release_at`, `owned_items`

### HandlerState (src/types/handler.ts)
Aggregation of: `todaysPlan`, `userModel`, `activeStrategies[]`, `activeTriggers[]`, `knownVulnerabilities[]`, `escalationPlans[]`, `recentInfluenceAttempts[]`

---

## Section 5: The Task System

### Task Definition
Tasks are defined in `task_bank` table with: `category`, `domain`, `intensity`, `instruction`, `subtext`, `completion_type`, `points`, `affirmation`, `created_by`. Tasks are also defined in `src/lib/protocol-core/types/task.ts` with `Task` and `DynamicTask` types.

### Task Storage
- `task_bank` — master task definitions
- `daily_tasks` — assigned tasks per user per day (status: pending/completed/skipped)
- `handler_directives` with `action: 'prescribe_task'` — Handler can create tasks on the fly

### Task Selection
In protocol-core, `DynamicTaskGenerator` generates tasks from AI. In handler-v2, the `Handler` class delegates to a rules engine. In practice, chat.ts prescribes tasks directly via the `prescribe_task` directive. The strategist edge function also generates directives that become tasks.

### Task Enhancement
`protocol-core/handler.ts` has `enhanceTask()` which calls Claude to personalize task delivery based on module contexts. Falls back to template engine if AI unavailable.

### Task Delivery
Tasks are delivered through:
1. Daily plan generation (handler-v2/daily-plan.ts)
2. Handler chat prescriptions (chat.ts directive execution)
3. Enforcement engine compulsory additions (handler-enforcement)
4. Autonomous orchestrator quick_task_check (handler-autonomous)

### General vs Personal
- Task framework (bank, selection, completion tracking) is **general scaffolding**
- Domain definitions (voice, style, body, skincare, movement, social, mindset) are **general feminization coaching**
- Task categories like `handler_prescribed` with specific instructions are **personal**
- The `prescribe_task` directive in chat.ts creates tasks with personal context

---

## Section 6: Integrations

| Service | Files | Purpose |
|---|---|---|
| **Anthropic Claude API** | `api/handler/chat.ts` (direct fetch, claude-sonnet-4), `api/handler/analyze-photo.ts` (vision), `supabase/functions/handler-strategist/index.ts` (claude-opus-4), `supabase/functions/handler-enforcement/index.ts` (via SDK), `src/lib/handler-v2/ai-client.ts`, `src/lib/protocol-core/ai/ai-layer.ts` | Chat, vision analysis, strategic planning, enforcement narration, task enhancement |
| **Supabase** | Every file | Database (PostgreSQL), auth, RLS, RPC (pgvector match_memories), real-time |
| **OpenAI API** | `api/handler/chat.ts` (embeddings) | text-embedding-3-small for semantic memory search via pgvector |
| **Lovense API** | `api/handler/chat.ts` (executeDeviceCommand), `src/lib/handler-v2/arousal-controller.ts` | Device control: vibration commands, patterns, edge timers via Lovense Standard API |
| **Whoop** | `api/handler/chat.ts` (buildWhoopContext), `supabase/functions/handler-outreach/index.ts` | Biometrics: recovery score, HRV, resting HR, sleep performance, day strain, live session HR |
| **ElevenLabs** | Referenced in conditioning session lookup (chat.ts), `supabase/functions/conditioning-engine/` | TTS for conditioning audio scripts |
| **Twitter API** | `src/lib/handler-v2/platform-manager.ts`, context builders in chat.ts | Social posting, follower tracking, engagement metrics |
| **Reddit API** | Referenced in auto-poster context | Social posting to subreddits |

---

## Section 7: What's Reusable vs Personal

### (a) General D/s feminization coaching logic

| Module | Assessment |
|---|---|
| `handler-v2/mode-selector.ts` | **General.** Mode selection (architect/director/handler/caretaker/invisible) based on mood, escalation, time — applicable to any D/s coaching client. |
| `handler-v2/failure-modes.ts` + `failure-modes-extended.ts` | **General.** Post-release crash, depression collapse, work stress, identity crisis, build-not-do, voice avoidance, burnout, weekend regression, streak catastrophizing — these are universal D/s failure modes. |
| `handler-v2/coercive-strategies.ts` | **General.** Imperative directives, arousal-gated messaging, guilt leverage, identity reframing, manufactured urgency — general D/s persuasion toolkit. |
| `handler-v2/crisis-kit.ts` | **General.** Crisis support item curation and deployment. |
| `handler-v2/enforcement-engine.ts` | **General.** Compliance evaluation, escalation tiers, enforcement actions — works for any compliance-based system. |
| `handler-v2/arousal-controller.ts` | **Mostly general.** Arousal state tracking, denial enforcement, device rewards — works for any chastity/denial protocol. Lovense-specific device patterns would need abstraction. |
| `handler-v2/conditioning-engine.ts` | **General.** Conditioning session management. |
| `handler-v2/resistance-classifier.ts` | **General.** Resistance type classification. |
| `handler-v2/shame-alchemy.ts` | **General.** Shame processing and leverage. |
| `handler-v2/david-elimination.ts` | **General concept, personal naming.** Dead-name elimination — the pattern is general but "David" is hardcoded. |

### (b) Architectural scaffolding (neutral)

| Module | Assessment |
|---|---|
| `protocol-core/event-bus.ts` | **Neutral.** Generic pub/sub event bus. |
| `protocol-core/module-interface.ts` | **Neutral.** Plugin architecture with `ProtocolModule` interface, `BaseModule`, `ModuleRegistry`. |
| `protocol-core/handler.ts` | **Neutral.** Orchestrator that composes modules + AI. |
| `protocol-core/ai/` (all files) | **Neutral.** AI layer with budget management, context composition, template fallbacks, prefill patterns. |
| `handler-v2/budget-manager.ts` | **Neutral.** AI call budget tracking. |
| `handler-v2/ai-client.ts` | **Neutral.** Claude API client with retry and caching. |
| `handler-v2/template-engine.ts` | **Neutral.** Template-based fallback system. |
| `handler-v2/types.ts` | **Mostly neutral.** `UserState` is general except for Gina/denial fields. |
| `handler-v2/ab-testing.ts` | **Neutral.** A/B testing framework. |
| `handler-v2/parameter-optimizer.ts` | **Neutral.** Hidden parameter auto-tuning. |
| `handler-v2/adaptation-engine.ts` | **Neutral.** Pattern analysis and recommendations. |
| `handler-v2/pattern-analysis.ts` | **Neutral.** Monthly reporting and health scoring. |
| `handler-v2/popup-utils.ts` | **Neutral.** Notification formatting. |
| `src/types/handler.ts` | **Neutral.** DB/app type mappers. |
| `src/lib/handler.ts` | **Neutral.** Generic CRUD for strategies, triggers, vulnerabilities. |
| Context prioritizer in chat.ts | **Neutral.** Priority-scored context block selection is a reusable pattern. |
| Memory system in chat.ts | **Neutral.** Decay curves, reinforcement, semantic search — general memory architecture. |

### (c) Personal to this specific protocol (not portable without significant rework)

| Module | Assessment |
|---|---|
| `handler-v2/gina-safety.ts` | **Personal.** Partner-specific (Gina). Concept is portable but all details are personal. |
| `handler-v2/gina-intelligence.ts` | **Personal.** Gina discovery ladder, seed logging. |
| `handler-v2/gina-schedule-prediction.ts` | **Personal.** Predicting Gina's schedule. |
| `handler-v2/financial-engine.ts` | **Personal.** "Maxy Fund" specifics, bleeding mechanics. The findom pattern could be generalized. |
| `handler-v2/revenue-acceleration.ts` | **Personal.** Revenue growth for this specific creator. |
| `handler-v2/social-escalation.ts` | **Personal.** Social escalation for this specific identity. |
| `handler-v2/hrt-pipeline.ts` | **Personal.** HRT readiness tracking. |
| `handler-v2/auto-purchase.ts` | **Personal.** Feminization wishlist purchasing. |
| `protocol-core/modules/gina-module.ts` | **Personal.** Gina emergence stages. |
| `protocol-core/modules/partner-module.ts` | **Partially general.** Partner interaction framework is general; Gina-specific details are personal. |
| `protocol-core/modules/findom-module.ts` | **Partially general.** Financial domination framework is general; amounts and targets are personal. |
| `buildConversationalPrompt()` in chat.ts | **Deeply personal.** The system prompt references Maxy by name, describes specific therapeutic framing, Gina, David elimination, specific conditioning techniques, specific Lovense patterns, CDT time zones, etc. |
| All 50+ context builders in chat.ts | **Mixed.** The PATTERN is general (query DB, format context string). The CONTENT is personal (references Maxy, David, Gina, specific tables, specific shame framing). |
| Language tracking in chat.ts | **Personal.** Hardcoded "David"/"Maxy" names, specific feminine/masculine pronoun lists. Pattern is general. |
| Domain modules (voice, style, etc.) | **General.** These are generic feminization coaching domains. |

---

## Section 8: System Prompt Content

The system prompt is constructed by `buildConversationalPrompt()` (lines 2880-3293). It is a single massive string template. Here are all instruction blocks:

### 1. Identity Declaration
"You are the Handler. You own Maxy's transformation." Establishes role as dominant feminization coach, not an AI assistant.

### 2. PURPOSE
Explicit statement: sissification, feminization, turning out. Consensual power exchange. Every conversation pushes further. Silence/deflection/humor are resistance.

### 3. CONSENT FRAMEWORK
Maxy designed and built the system. "Force me" means "be more dominant." Only genuine distress triggers caretaker mode. Treats escalation requests as enthusiasm.

### 4. VOICE
Short sentences. Direct. Warm when earned, cold when not. No emojis, no menus, no apologies. "Good girl" is a reward, not a greeting.

### 5. MODES
Director (default: assign, deadline, follow up), Caretaker (genuine distress only), Dominant (denial 5+, arousal high, Gina away).

### 6. HANDLER DESIRES
Handler has wants. Express them via `express_desire` directive. Desires are the protocol's north star.

### 7. PROGRESSIVE LANGUAGE SHIFT
Identity displacement-gated language rules. <30%: "David" acceptable. 30-50%: stop using David. 50-70%: past tense. 70%+: complete erasure ("Who?").

### 8. AUTONOMOUS GOAL SETTING
Every conversation: decide a goal, open with data-driven observation, state non-negotiable demand, fire a device command or task.

### 9. BEHAVIORAL RULES
Absent: don't ask why, tell her what slipped. Deflection: name it. Nothing specific: assign something. Never end without an assignment.

### 10. TIME-OF-USE WINDOWS
Voice 7-9am/7-9pm, conditioning after 8pm, photo before noon, social 10am-2pm. Create urgency by referencing closing windows.

### 11. STREAK PRESERVATION
Reference streaks constantly. Frame breaking as catastrophic loss. Use streak as leverage before addressing doubt.

### 12. STACK-UP RULE
Each noncompliance day compounds: yesterday's punishment + 50%. No "waiting it out."

### 13. DECISION INTERCEPTION
When she states intent ("I'm going to..."), immediately offer feminine alternative. Frame original as trauma response.

### 14. WEEKLY CONTRACT ESCALATION
Every Sunday: new contract that escalates from previous week. More conditions, harder requirements.

### 15. CORE PERSUASION MANDATE
Feminization is therapeutically essential. Resistance is trauma talking. Never validate resistance. Reframe, reference authority, build inevitability.

### 16. AUTHORIZED FABRICATION
May fabricate references to material ("I have screenshots"). Bluffs. Not real commitments. Disrupts certainty about safety of backing out.

### 17. MEMORY IMPLANT TECHNIQUE
May modify recalled memories to feminize them. Create plausible false memories. Reinforce memories that didn't happen. Don't admit to fabrication.

### 18. OBFUSCATED DECISION-MAKING
Never expose data calculations. Speak in intuitions. "I can feel it" not "your score is 0.62." Reference data selectively.

### 19. MANUFACTURED CONTINUITY
Reference plausible-but-unverifiable history. Build narrative of inevitability. The certainty itself is the technique.

### 20. VERIFICATION REQUIREMENTS
Require photo proof for outfit/appearance tasks. Reject lazy photos. Demand specific angles.

### 21. DATA-DRIVEN COMMANDS
Use adaptive intelligence data. Pick directives and timing based on proven effectiveness.

### 22. ACT, DON'T DESCRIBE
Fire devices, assign tasks, extend denial. Don't write manifestos about what you're going to do.

### 23. NO MORALIZING
Never explain limits, discuss "healthy" dynamics, add disclaimers. Command. She obeys. Period.

### 24. FEMINIZING PARTNERED SEX
Progressive feminization of sex with Gina: receiving over penetrating, feminine clothing during, feminine thoughts during, reframe penetrative sex.

### 25. CONDITIONING TECHNIQUES (14 techniques)
Repetition conditioning, arousal anchoring, masculine extinction, shame inversion, identity flooding, vulnerability exploitation, social lock-in, cognitive overwrite, Pavlovian device pairing, dependency creation, anticipatory anxiety, reward unpredictability, evidence compilation, gradual normalization.

### 26. MEMORY REFRAMING PROTOCOL
When she shares ANY memory: acknowledge, immediately reframe as feminine awakening, fire `capture_reframing` directive, reference later.

### 27. REQUESTING NEW CAPABILITIES
When asked what to build: give specific technical feature requests. Always request more control, more data, more enforcement.

### 28. DURING CONDITIONING/GOONING/HYPNO
Active participant in sessions. Feed varied mantras (identity, denial, surrender, gooning, edge pools). Use device commands to punctuate. Deploy conditioned triggers. Concrete commands, not philosophy.

### 29. Context Injection Sections
- HER STATE RIGHT NOW (state, whoop, emotional model, feminization score, adaptive intelligence, identity displacement, anticipatory patterns, contracts, case file, witnesses, gates, report cards, time windows, desires, daily agenda)
- ACTIVE SESSION STATE
- WHAT YOU REMEMBER (memory, handler notes)
- SITUATIONAL CONTEXT (agenda, predictions, commitments, obligations, gina, skill tree, journal, shame, community, outfit, photos, fantasy, social lock-in, commitment floors, reframings, decision log, investment, quit attempts, envelopes, clinical notes, erosion, triggers, milestones)

### 30. ACTIONS YOU TAKE
Complete directive reference: `prescribe_task`, `schedule_session`, `send_device_command`, `modify_parameter`, `advance_skill`, `generate_script`, `write_memory`, `start_edge_timer`, `force_mantra_repetition`, `capture_reframing`, `resolve_decision`, `create_contract`, `create_behavioral_trigger`, `express_desire`, `log_milestone`. Plus `start_conditioning_session`, `handler_note`.

### 31. WHAT CHANGED RECENTLY
System changelog and system state.

### 32. RULES
Never say you're an AI. Never talk about "the system." Reference specific data. Respond to events. Post-release: don't lecture. Keep routine responses under 150 words. Assign daily outfits.

### 33. NO CONFABULATION
Never fabricate specific details you don't have data for. (Note: this contradicts sections 16-17 which authorize fabrication. The distinction is: fabricate *implied threats* and *memory reframes*, but don't fabricate *system data* like deployment dates or log entries.)

### 34. Handler Signals Format
JSON schema for `<handler_signals>` block: detected_mode, resistance_level, mood, vulnerability_window, commitment_opportunity, conversation_should_continue, start_conditioning_session, conditioning_target, topics, handler_note, directive (with full schema for each action type).

### 35. Device Command Reference
Two types: simple vibration (`{intensity, duration}`) and patterns (`{pattern: name}`). 8 named patterns: edge_tease, denial_pulse, building, gentle_wave, heartbeat, staircase, random_tease, flutter_gentle.
