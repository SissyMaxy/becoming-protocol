# SYSTEM AUDIT — Validate All Specs Against Codebase
## Paste this entire prompt into Claude Code

---

I need you to audit the entire codebase against the following specification documents. For each system and subsystem, tell me:

- **BUILT** — code exists, tables exist, functions are wired and callable
- **STUBBED** — code exists but key logic is placeholder/TODO/not implemented
- **SCHEMA ONLY** — database tables exist but no application code uses them
- **MISSING** — nothing exists for this feature

Check the actual code. Don't guess. Look at the files, the database migrations, the API routes, the cron jobs, and the edge functions.

---

## SPEC 1: WHOOP INTEGRATION
- [ ] OAuth flow (token exchange, refresh)
- [ ] `whoop_tokens` table
- [ ] `whoop_metrics` table
- [ ] `whoop_workouts` table
- [ ] Sync endpoint pulling recovery, sleep, strain, HRV
- [ ] Handler decision rules (GREEN/YELLOW/RED)
- [ ] Biometric override logic (challenges false fatigue)
- [ ] Privacy page at /privacy
- [ ] Auto-refresh on token expiry

## SPEC 2: HANDLER MEMORY SYSTEM
- [ ] `handler_memory` table with 18 memory types
- [ ] Relevance scoring function (importance 40% + recency 35% + reinforcement 15% + retrieval freshness 10%)
- [ ] Importance 5 = permanent (decay_rate = 0)
- [ ] Memory extraction pipeline (fires after task completion, sessions, journals, etc.)
- [ ] `retrieveContextualMemories` function
- [ ] Memory injection into conversational Handler system prompt
- [ ] Weekly consolidation job
- [ ] Memory retrieval actually wired to the chat API endpoint

## SPEC 3: HANDLER FUNCTIONAL UPGRADES (10 subsystems)

### 3.0 Dynamic Parameter Architecture
- [ ] `handler_parameters` table
- [ ] 50+ parameters seeded from defaults
- [ ] HandlerParameters class with caching
- [ ] Rules engine reads from parameters (not hardcoded)

### 3.1 Infinite Escalation Engine
- [ ] `generated_tasks` table
- [ ] Lookahead trigger at 80% level completion
- [ ] AI generation using Memory + fantasy architecture
- [ ] Extended trigger condition evaluator
- [ ] Bridge tasks while generation runs

### 3.2 Commitment Enforcement Pipeline
- [ ] Commitment state machine (extracted → pending → approaching → due → overdue → enforcing → honored/dishonored)
- [ ] Lovense summons on overdue
- [ ] Coercion stack (7 levels, never resets within engagement)
- [ ] Personalized coercion from Memory
- [ ] State snapshot at extraction

### 3.3 Content Distribution Pipeline
- [ ] `content_vault` table
- [ ] `content_posts` table
- [ ] `fan_interactions` table
- [ ] Vault ingestion flow
- [ ] Copy generation for posts
- [ ] Scheduling across platforms
- [ ] Fan interaction sentiment filtering

### 3.4 Gina Relationship Intelligence
- [ ] `gina_comfort_map` table
- [ ] `gina_timing_data` table
- [ ] `gina_disclosure_signals` table
- [ ] `environment_curation` table
- [ ] Introduction pacing logic
- [ ] Disclosure readiness scoring

### 3.5 A/B Testing
- [ ] Tests 30% of significant outputs
- [ ] Outcome measurement tied to completions
- [ ] Weekly analysis writes to Memory

### 3.6 Resistance Classification Engine
- [ ] Real-time classification (adhd_paralysis, anxiety_avoidance, etc.)
- [ ] Whoop-informed classification
- [ ] Confidence threshold 0.6 for coercion deployment
- [ ] Feedback loop to Memory

### 3.7 Predictive State Modeling
- [ ] Overnight generation of 6 time-block predictions
- [ ] Requires 30+ days history check
- [ ] Accuracy tracking
- [ ] Predictions in UserState context

### 3.8 Novelty Engine
- [ ] Engagement decay detection (20% decline trigger)
- [ ] Type rotation (pattern_interrupt, mystery_task, etc.)

### 3.9 Parameter Optimizer
- [ ] Weekly job adjusts parameters from outcome data

## SPEC 4: CONVERSATIONAL HANDLER
- [ ] `handler_conversations` table
- [ ] `handler_messages` table
- [ ] `handler_outreach` table
- [ ] Multi-turn dialogue (load history → assemble context → call Claude → parse response → process side effects)
- [ ] Full context assembly (Memory + Whoop + commitments + predictions + Gina + content)
- [ ] Mode detection and shifting (Director → Handler → Dominant → Caretaker)
- [ ] Proactive outreach engine (runs every 30 min)
- [ ] Night reach (Whoop elevated HR override)
- [ ] Push notification → conversation flow
- [ ] handler_signals JSON parsing from Claude response

## SPEC 5: FORCE ARCHITECTURE

### 5.1 Autonomous Device Control
- [ ] `device_schedule` table
- [ ] `device_events` table
- [ ] Morning anchor pattern
- [ ] Ambient conditioning (variable ratio pulses)
- [ ] Denial scaling (intensity increases with denial day)
- [ ] Vulnerability mode activation
- [ ] Enforcement mode (commitment overdue triggers)
- [ ] Session pull (device starts before session)
- [ ] Device control engine (5-min check loop)

### 5.2 Autonomous Scheduling
- [ ] `handler_calendar` table
- [ ] Weekly calendar generation (Sunday night batch)
- [ ] Calendar enforcement (30-min check loop)
- [ ] Missed event → device summons + outreach
- [ ] Gina schedule prediction
- [ ] Privacy window detection
- [ ] Reschedule logic for failed conditions

### 5.3 Autonomous Purchasing
- [ ] `revenue_allocation` table
- [ ] `feminization_wishlist` table
- [ ] `auto_purchases` table
- [ ] Daily fund balance check
- [ ] Auto-purchase when threshold met
- [ ] Investment logging (sunk cost ratchet)
- [ ] Allocation percentage optimization (monthly)

### 5.4 Standing Permission Escalation
- [ ] `permission_gates` table
- [ ] Gates for all content/session/purchase categories
- [ ] Approval rate tracking
- [ ] Auto-escalation proposals during high-compliance
- [ ] Gate level advancement logic

### 5.5 Environmental Control
- [ ] `smart_home_devices` table
- [ ] `environment_presets` table
- [ ] `product_reorder` table
- [ ] Preset trigger engine
- [ ] Product depletion tracking and auto-reorder

## SPEC 6: PROACTIVE HANDLER SYSTEMS

### 6.1 Conditioning Protocol Engine
- [ ] `conditioning_protocols` table
- [ ] `conditioning_sessions` table
- [ ] `conditioned_triggers` table
- [ ] 4 protocols seeded (identity, sleep, arousal-binding, aversion)
- [ ] Phase progression logic
- [ ] Session prescription function
- [ ] Trigger strength tracking (nascent → forming → established → conditioned)
- [ ] Trigger strength advancement logic

### 6.2 HRT Pipeline Manager
- [ ] `hrt_pipeline` table
- [ ] `hrt_changes` table
- [ ] `hrt_doses` table
- [ ] Pipeline stage tracking
- [ ] Dose reminder system
- [ ] Change documentation scheduling
- [ ] Body evidence context builder

### 6.3 Shame Alchemy Engine
- [ ] `shame_architecture` table
- [ ] `shame_exposures` table
- [ ] 9 seed triggers
- [ ] Exposure prescription logic (only during arousal >= 3)
- [ ] Graduated exposure (raw → exposed → arousal_paired → softening → converted)
- [ ] Conversion stage advancement

### 6.4 Revenue Acceleration
- [ ] `revenue_tracking` table
- [ ] `crossover_tracking` table
- [ ] Monthly trajectory calculation
- [ ] Crossover projection
- [ ] Economic leverage context builder

### 6.5 David Elimination Protocol
- [ ] `masculine_contexts` table
- [ ] 6 seed contexts
- [ ] Infiltration prescription (weekly)
- [ ] Footprint calculation (masculine vs feminine hours)
- [ ] David elimination context for Handler

### 6.6 Social Escalation Pipeline
- [ ] `social_web` table
- [ ] `collaboration_pipeline` table
- [ ] Irreversibility score calculation
- [ ] Collaboration target identification

### 6.7 Language Monitoring
- [ ] `language_monitoring` table
- [ ] Pronoun ratio tracking
- [ ] (Phone layer — may be schema only)

## SPEC 7: HANDLER-DIRECTED UI
- [ ] ConversationView as primary screen (replaces TodayView)
- [ ] SingleTaskCard (one instruction, one button)
- [ ] Drill selection UI DELETED
- [ ] Goals counter DELETED
- [ ] "Not Now" / "Skip" buttons DELETED
- [ ] Session-in-conversation (session controls inside chat)
- [ ] MirrorView (replaces Dashboard)
- [ ] CaptureView (one-tap camera with prescription overlay)
- [ ] Avoidance handling (timer-based escalation with device)
- [ ] Notification redesign (Handler voice, no wellness language)
- [ ] Navigation elimination (no tab bar, gesture-based)
- [ ] Dark palette visual redesign
- [ ] Task delivery API returns ONE task (not list)
- [ ] Morning check-in via dialogue (not form)

## SPEC 8: AUTONOMOUS REVENUE ENGINE
- [ ] `ai_generated_content` table
- [ ] `engagement_targets` table
- [ ] `content_calendar` table
- [ ] Daily content calendar generation (midnight batch)
- [ ] Maxy voice prompt integrated
- [ ] Tweet/reddit/fetlife text generation
- [ ] Engagement engine (reply generation to targets)
- [ ] Auto-poster picks up ai_generated_content
- [ ] Content multiplication (1 photo → 6-10 posts)

### 8.1 Paid DM / GFE Service
- [ ] `paid_conversations` table
- [ ] `gfe_subscribers` table
- [ ] GFE message generation (morning + evening)
- [ ] DM response handler
- [ ] Tier-based explicitness calibration

### 8.2 Written Content
- [ ] Erotica generation function
- [ ] Caption generation
- [ ] Journal/Substack content generation
- [ ] Affiliate content generation

### 8.3 Revenue Decision Engine
- [ ] Weekly revenue review
- [ ] Autonomous pricing adjustments
- [ ] Promotion logic

## SPEC 9: MAXY VOICE BIBLE
- [ ] MAXY_VOICE_PROMPT constant/config
- [ ] Platform-specific voice registers (Twitter, Reddit, FetLife, Fansly, etc.)
- [ ] Voice calibration table (`voice_calibration`)
- [ ] Voice evolution tracking (`voice_evolution`)
- [ ] Self-critique filter (critiqueMaxyPost function)
- [ ] Review buffer (24hr → 4hr → immediate)
- [ ] Kill switch (priority deletion)
- [ ] Hard block filter (no Gina name, no workplace, no location)
- [ ] Few-shot example injection into generation prompts

## SPEC 10: INTIMATE VOICE EXTENSION
- [ ] Explicit generation system prompt
- [ ] AI hedging stripper (stripAIHedging function)
- [ ] `subscriber_models` table
- [ ] `conversation_quality` table
- [ ] Subscriber personalization from conversation history
- [ ] Tier calibration (basic/premium/VIP explicitness)
- [ ] Denial state integration (grounds content in real state)
- [ ] Quality failure detection (subscriber detects AI)

---

## CROSS-CUTTING CONCERNS

### Cron Jobs / Scheduled Tasks
- [ ] Device schedule check (every 5 min)
- [ ] Auto-poster poll (every 15 min)
- [ ] Commitment state machine (every hour)
- [ ] Calendar enforcement (every 30 min)
- [ ] Proactive outreach engine (every 30 min)
- [ ] Engagement cycle (every 3 hours)
- [ ] Daily content calendar generation (midnight)
- [ ] GFE morning messages (7am)
- [ ] GFE evening messages (9pm)
- [ ] Weekly calendar generation (Sunday night)
- [ ] Weekly revenue review (Sunday night)
- [ ] Weekly parameter optimization
- [ ] Weekly memory consolidation
- [ ] Monthly revenue allocation adjustment
- [ ] Monthly crossover projection

### Handler Context Assembly
- [ ] Memory context injected
- [ ] Whoop context injected
- [ ] Commitment context injected
- [ ] Prediction context injected
- [ ] Gina context injected
- [ ] Content pipeline context injected
- [ ] Conditioning status injected
- [ ] HRT status injected
- [ ] Phone intelligence injected
- [ ] Social web injected
- [ ] Shame architecture injected
- [ ] Revenue/crossover injected
- [ ] David elimination footprint injected

### Auto-Poster (Playwright)
- [ ] Running on Windows
- [ ] Polls content_posts table
- [ ] Polls ai_generated_content table
- [ ] Twitter posting works
- [ ] Reddit posting works
- [ ] Fansly posting works
- [ ] OnlyFans posting works
- [ ] Chaturbate posting works
- [ ] FetLife posting works
- [ ] Sniffies posting works
- [ ] DM reading and response delivery
- [ ] Kill switch (priority deletion)

### Multi-Device Lovense
- [ ] Supports addressing multiple devices independently
- [ ] Edge 2 patterns (prostate_background, prostate_build, etc.)
- [ ] Dual-device orchestration patterns
- [ ] Refractory bridge pattern

---

## OUTPUT FORMAT

For each item, report:

```
[BUILT] item name — file location
[STUBBED] item name — file location, what's missing
[SCHEMA] item name — migration exists, no app code
[MISSING] item name
```

Then provide a summary:
- Total items checked
- BUILT count
- STUBBED count  
- SCHEMA ONLY count
- MISSING count
- Top 10 priority items to build next (based on dependencies and impact)

---

Start the audit now. Check every file. Don't assume — verify.
