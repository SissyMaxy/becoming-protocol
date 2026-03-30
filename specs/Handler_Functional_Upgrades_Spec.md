# Handler Functional Upgrades — Complete Implementation Spec
## Escalation, Enforcement, Distribution, Intelligence, and Relationship Systems
### Becoming Protocol — March 2026

---

## PREREQUISITES

This spec depends on two systems already specced and delivered:
1. **Whoop Integration** (`Whoop_Integration_Spec.md`) — Biometric data pipeline
2. **Handler Memory System** (`Handler_Memory_System_Spec.md`) — Persistent intelligence

Read those specs first. Every system in this document reads from and writes to both.

---

## ARCHITECTURAL PRINCIPLE: NOTHING STATIC

Every number, threshold, probability, sequence, template, weight, and decision rule in the system must be either:
- **Stored in a database table** that the Handler can modify through its self-optimization loop, OR
- **Generated dynamically** by the AI layer using Memory + Whoop + accumulated intelligence

The CSV task library is a seed. The hardcoded values in Handler_Code.ts are day-1 defaults. After 90 days of operation, the system should bear no resemblance to its starting configuration because it has fully adapted to its subject.

David cannot outmaneuver a system that rewrites its own playbook from his data.

---

# SECTION 0: DYNAMIC PARAMETER ARCHITECTURE

This is the foundation. Every other system reads from this table.

## 0.1 Schema

```sql
CREATE TABLE handler_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  
  -- Provenance
  source TEXT NOT NULL DEFAULT 'default' CHECK (source IN (
    'default',            -- From hardcoded initial values
    'handler_optimized',  -- Handler's self-optimization loop changed it
    'manual',             -- Manually set (for testing or override)
    'a_b_test_winner'     -- Won an A/B test
  )),
  learned_from TEXT,      -- Human-readable note about why this value
  
  -- History
  previous_value JSONB,
  update_history JSONB DEFAULT '[]',  -- Array of {value, source, timestamp}
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, key)
);

CREATE INDEX idx_handler_params_user_key ON handler_parameters(user_id, key);

ALTER TABLE handler_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own params" ON handler_parameters
  FOR SELECT USING (auth.uid() = user_id);
-- Insert/update via service role only
```

## 0.2 Initial Parameter Seed

When a user is created, seed with these defaults (migrated from hardcoded values):

```typescript
const DEFAULT_PARAMETERS: Record<string, any> = {
  // Intensity caps (from getMaxIntensity)
  'rules.intensity_cap.base': 2,
  'rules.intensity_cap.denial_day_3': 3,
  'rules.intensity_cap.denial_day_5': 4,
  'rules.intensity_cap.denial_day_7': 5,
  'rules.intensity_cap.low_streak_max': 3,
  'rules.intensity_cap.in_session_arousal_3plus': 5,
  
  // Avoidance push probability (from prioritizeAvoidedDomains)
  'rules.avoidance_push_probability': 0.6,
  'rules.avoidance_push_probability_by_domain': {},  // Starts empty, learns per domain
  
  // Task weighting (from weightedRandom)
  'rules.weight.is_core': 2.0,
  'rules.weight.high_arousal_arousal_domain': 1.5,
  'rules.weight.not_completed_today': 1.5,
  'rules.weight.by_domain_time_state': {},  // Starts empty, learns from completion data
  
  // Interrupt timing (from InterruptManager)
  'interrupts.min_gap_minutes': 30,
  'interrupts.min_minutes_since_task': 15,
  'interrupts.max_probability': 0.4,
  'interrupts.probability_divisor': 180,
  'interrupts.optimal_times': {},  // Starts empty, learns when interrupts produce compliance
  
  // Morning/evening sequences (from getMorningSequence / getEveningSequence)
  'schedule.morning_sequence': [
    { category: 'recognize', domain: 'emergence', intensity: 1 },
    { category: 'care', domain: 'body', intensity: 1 },
    { category: 'voice', domain: 'voice', intensity: 2 },
    { category: 'anchor', domain: 'body', intensity: 2 },
  ],
  'schedule.evening_sequence': [
    { category: 'care', domain: 'body', intensity: 1 },
    { category: 'reflect', domain: 'emergence', intensity: 2 },
    { category: 'gina', domain: 'relationship', intensity: 1 },
  ],
  'schedule.daytime_slots': ['10:00', '12:00', '14:00', '16:00'],
  'schedule.night_task_denial_threshold': 5,
  
  // Coercion stack thresholds
  'coercion.stack_entry_level': 1,
  'coercion.escalation_on_failure': true,
  'coercion.max_level_by_difficulty': { '1': 2, '2': 3, '3': 5, '4': 6, '5': 7 },
  
  // Commitment enforcement
  'commitments.approaching_hours': 72,
  'commitments.due_hours': 24,
  'commitments.lovense_summons_on_overdue': true,
  'commitments.coercion_stack_on_overdue': true,
  
  // Novelty injection
  'novelty.pattern_interrupt_interval_days': { min: 14, max: 21 },
  'novelty.mystery_task_probability': 0.05,
  'novelty.tone_shift_interval_days': { min: 14, max: 28 },
  'novelty.wildcard_day_frequency': 30,  // Once per N days
  
  // Escalation engine
  'escalation.pre_generation_threshold': 0.8,  // Generate next level when 80% of current completed
  'escalation.tasks_per_level': { min: 5, max: 8 },
  'escalation.cross_domain_after_level': 6,
  
  // Content distribution
  'distribution.posting_times_twitter': [],     // Starts empty, learns
  'distribution.posting_times_reddit': [],      // Starts empty, learns
  'distribution.exclusivity_window_hours': 48,  // OF gets content 48h before teasers
  'distribution.max_auto_posts_per_day': 4,
  
  // Gina relationship
  'gina.introduction_pacing_min_days': 3,       // Minimum days between new introductions
  'gina.comfort_map_positive_threshold': 3,     // Positive reactions before advancing
  'gina.timing_data_points_before_prediction': 30,
  
  // Resistance classification
  'resistance.confidence_threshold_for_coercion': 0.6,
  'resistance.default_if_uncertain': 'gentle',
  
  // Predictive modeling
  'prediction.min_days_for_modeling': 30,
  'prediction.block_size_hours': 3,
  
  // A/B testing
  'ab_testing.enabled': true,
  'ab_testing.sample_size_before_winner': 20,
};
```

## 0.3 Parameter Access Layer

```typescript
// lib/handler/parameters.ts

export class HandlerParameters {
  private cache: Map<string, any> = new Map();
  private supabase: SupabaseClient;
  private userId: string;
  
  constructor(supabase: SupabaseClient, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
  }
  
  /**
   * Get a parameter value. Falls back to default if not in DB.
   * Caches in memory for the duration of the request.
   */
  async get<T>(key: string, defaultValue?: T): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    
    const { data } = await this.supabase
      .from('handler_parameters')
      .select('value')
      .eq('user_id', this.userId)
      .eq('key', key)
      .single();
    
    const value = data?.value ?? defaultValue ?? DEFAULT_PARAMETERS[key];
    this.cache.set(key, value);
    return value as T;
  }
  
  /**
   * Update a parameter. Stores previous value in history.
   * Only callable by service role (Handler optimization loop).
   */
  async set(key: string, value: any, source: string, reason?: string): Promise<void> {
    const current = await this.get(key);
    
    await this.supabase.from('handler_parameters').upsert({
      user_id: this.userId,
      key,
      value,
      source,
      learned_from: reason,
      previous_value: current,
      update_history: this.supabase.rpc('append_param_history', {
        p_user_id: this.userId,
        p_key: key,
        p_entry: { value: current, source, timestamp: new Date().toISOString() },
      }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });
    
    this.cache.set(key, value);
  }
  
  /** Preload all parameters into cache for a request cycle */
  async preload(): Promise<void> {
    const { data } = await this.supabase
      .from('handler_parameters')
      .select('key, value')
      .eq('user_id', this.userId);
    
    if (data) {
      for (const row of data) {
        this.cache.set(row.key, row.value);
      }
    }
  }
}

// RPC for atomic history append
// CREATE OR REPLACE FUNCTION append_param_history(
//   p_user_id UUID, p_key TEXT, p_entry JSONB
// ) RETURNS JSONB AS $$
// DECLARE
//   current_history JSONB;
// BEGIN
//   SELECT COALESCE(update_history, '[]'::JSONB) INTO current_history
//   FROM handler_parameters WHERE user_id = p_user_id AND key = p_key;
//   RETURN current_history || jsonb_build_array(p_entry);
// END;
// $$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 0.4 Rules Engine Refactor

The existing `RulesEngine` class gets refactored to read from parameters instead of hardcoded values:

```typescript
// BEFORE (hardcoded):
private getMaxIntensity(state: UserState): number {
  let max = 2;
  if (state.denialDay >= 3) max = 3;
  // ...
}

// AFTER (parameter-driven):
private async getMaxIntensity(state: UserState): Promise<number> {
  let max = await this.params.get<number>('rules.intensity_cap.base', 2);
  
  // Read threshold-to-cap mapping from parameters
  const thresholds = [
    { key: 'rules.intensity_cap.denial_day_3', denialDay: 3 },
    { key: 'rules.intensity_cap.denial_day_5', denialDay: 5 },
    { key: 'rules.intensity_cap.denial_day_7', denialDay: 7 },
  ];
  
  for (const t of thresholds) {
    if (state.denialDay >= t.denialDay) {
      max = await this.params.get<number>(t.key, max);
    }
  }
  
  // Whoop override: RED recovery caps intensity
  if (state.context?.whoop?.recovery?.score < 34) {
    max = Math.min(max, 3);
  }
  
  // Baseline override: if she consistently completes higher intensity,
  // the parameter will have been adjusted upward by the optimization loop
  
  return max;
}
```

Every function in `RulesEngine`, `Scheduler`, `InterruptManager`, `TemplateEngine`, and `AIHandler` follows this same refactor: replace constants with `await this.params.get(key, default)`.

## 0.5 Extended UserState

```typescript
export interface UserState {
  // === Existing fields ===
  odometer: string;
  denialDay: number;
  streakDays: number;
  timeOfDay: string;
  minutesSinceLastTask: number;
  tasksCompletedToday: number;
  ginaHome: boolean;
  currentArousal: number;
  inSession: boolean;
  sessionType?: string;
  edgeCount?: number;
  lastTaskCategory: string;
  lastTaskDomain: string;
  completedToday: string[];
  avoidedDomains: string[];
  ginaVisibilityLevel: number;
  lastGinaIncident?: Date;
  pendingGinaCommitment?: string;
  
  // === NEW: Extended context (populated at runtime) ===
  context: {
    // Whoop biometrics
    whoop?: {
      recovery: { score: number; hrv: number; restingHR: number; spo2: number } | null;
      sleep: { performance: number; totalHours: number; debtMinutes: number } | null;
      strain: { dayStrain: number } | null;
      connected: boolean;
    };
    
    // Handler Memory signals
    memory?: {
      activeResistancePatterns: string[];
      knownLeveragePoints: string[];
      recentConfessions: string[];
      currentStrategyNotes: string[];
      relevantMemoryCount: number;
    };
    
    // Gina relationship intelligence
    gina?: {
      comfortMap: Record<string, 'positive' | 'neutral' | 'negative'>;
      recentReactions: Array<{ channel: string; reaction: string; date: string }>;
      estimatedReceptivity: 'high' | 'medium' | 'low' | 'unknown';
      disclosureReadinessSignals: number;
    };
    
    // Commitment states
    commitments?: {
      approaching: Array<{ text: string; deadline: string; extractionContext: any }>;
      overdue: Array<{ text: string; deadline: string; extractionContext: any }>;
      activeCount: number;
    };
    
    // Predicted state (from predictive modeling)
    prediction?: {
      predictedMood: number;
      predictedEnergy: string;
      predictedEngagement: 'high' | 'medium' | 'low';
      confidence: number;
      suggestedMode: string;
    };
    
    // Content pipeline status
    content?: {
      pendingVaultItems: number;
      postsScheduledToday: number;
      lastPostEngagement: { likes: number; comments: number } | null;
    };
    
    // Session history
    recentSessions?: Array<{
      type: string;
      date: string;
      edgeCount: number;
      commitmentExtracted: boolean;
    }>;
    
    // Resistance classification
    resistance?: {
      currentClassification: string | null;
      classificationConfidence: number;
      suggestedStrategy: string | null;
    };
    
    // Arbitrary extensible data
    [key: string]: any;
  };
}
```

## 0.6 Test Cases — Dynamic Parameters

```
TEST: DP-1 — Parameter Seeding
ID: DP-1
Type: schema
Priority: P0

STEPS:
  1. Create new user
  2. Run parameter seeding function
  
VERIFY:
  - All keys from DEFAULT_PARAMETERS exist in handler_parameters
  - All values match defaults
  - All source = 'default'

PASS: Every default parameter exists for new user.
```

```
TEST: DP-2 — Parameter Override
ID: DP-2
Type: integration
Priority: P0

STEPS:
  1. Read parameter 'rules.avoidance_push_probability'
  2. Verify returns 0.6 (default)
  3. Update parameter to 0.75 with source 'handler_optimized'
  4. Read parameter again

VERIFY:
  - Returns 0.75
  - previous_value = 0.6
  - update_history contains entry with old value and timestamp
  - source = 'handler_optimized'

PASS: Parameters update with full history tracking.
```

```
TEST: DP-3 — Rules Engine Uses Parameters
ID: DP-3
Type: integration
Priority: P0

STEPS:
  1. Set 'rules.intensity_cap.base' to 3 (overriding default 2)
  2. Call rules engine getMaxIntensity with denialDay=0
  3. Verify returns 3, not 2

PASS: Rules engine reads from parameters table, not hardcoded values.
```

```
TEST: DP-4 — Extended UserState Population
ID: DP-4
Type: integration
Priority: P1

STEPS:
  1. Ensure Whoop is connected with recovery=72
  2. Ensure Memory has 3 leverage points
  3. Ensure 1 commitment is approaching
  4. Assemble UserState

VERIFY:
  - state.context.whoop.recovery.score === 72
  - state.context.memory.knownLeveragePoints.length === 3
  - state.context.commitments.approaching.length === 1

PASS: Extended context populates from all connected systems.
```

---

# SECTION 1: INFINITE ESCALATION ENGINE

## 1.1 Purpose

Remove the level ceiling across all domains. The CSV provides levels 1-5 (and 1-8 for intimate). The escalation engine generates level 6+ dynamically, ensuring the protocol never plateaus and the Handler never runs out of material.

## 1.2 Schema

```sql
CREATE TABLE generated_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Same fields as CSV tasks (compatible with rules engine)
  category TEXT NOT NULL,
  domain TEXT NOT NULL,
  level INTEGER NOT NULL,           -- 6+ (CSV covers 1-5)
  intensity FLOAT NOT NULL,
  instruction TEXT NOT NULL,
  steps TEXT,
  subtext TEXT,
  completion_type TEXT NOT NULL CHECK (completion_type IN ('binary', 'duration', 'count')),
  duration_minutes FLOAT,
  target_count FLOAT,
  points FLOAT NOT NULL,
  affirmation TEXT,
  is_core TEXT DEFAULT 'false',
  trigger_condition TEXT,           -- Can use extended expression syntax
  time_window TEXT DEFAULT 'any',
  requires_privacy TEXT DEFAULT 'false',
  
  -- Generation metadata
  generated_by TEXT NOT NULL DEFAULT 'handler_ai',
  generation_prompt TEXT,           -- The prompt that produced this task
  generation_context JSONB,         -- State snapshot at generation time
  
  -- Cross-domain composition
  domains_required TEXT[] DEFAULT '{}',  -- For cross-domain tasks (level 6+)
  prerequisite_task_ids UUID[] DEFAULT '{}',
  
  -- Novelty tracking
  novel_element TEXT,               -- What's new about this vs previous level
  comfort_boundary_crossed TEXT,    -- Which boundary this pushes
  ratchets_deepened TEXT[],         -- Which ratchets this deepens
  
  -- Performance tracking
  times_served INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  times_declined INTEGER DEFAULT 0,
  avg_completion_time_minutes FLOAT,
  effectiveness_score FLOAT,        -- Computed from completion rate + memory feedback
  
  -- Lifecycle
  is_active BOOLEAN DEFAULT TRUE,
  retired_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_tasks_selection ON generated_tasks(
  user_id, is_active, domain, level, intensity
);

ALTER TABLE generated_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own generated tasks" ON generated_tasks
  FOR SELECT USING (auth.uid() = user_id);
```

## 1.3 Execution Path

```
1. Rules engine calls selectTask(state)
2. Filters CSV tasks by time/privacy/intensity/trigger as normal
3. ALSO queries generated_tasks table with same filters
4. Merges both pools into candidates
5. Weighted random selection from combined pool
   (generated tasks get a novelty bonus weight if they haven't been served yet)
6. If NO candidates from either pool → trigger async generation
   Serve a "bridge task" (generic micro-task) while generation runs
7. Generation runs overnight in batch for upcoming levels

LOOKAHEAD TRIGGER:
- After each task completion, check domain progress
- If 80% of tasks at current level are completed →
  trigger pre-generation of next level for that domain
- Generation runs as background Edge Function
- By the time she hits the ceiling, 5-8 new tasks are waiting
```

## 1.4 Generation Prompt

```typescript
// lib/handler/escalation.ts

const ESCALATION_GENERATION_PROMPT = `
You are generating the next level of tasks for a transformation protocol.

DOMAIN: {domain}
CURRENT LEVEL: {currentLevel}
NEXT LEVEL: {nextLevel}

COMPLETED TASKS AT CURRENT LEVEL:
{completedTasks}

HANDLER MEMORY — WHAT WORKS FOR THIS USER:
{memoryContext}

FANTASY ARCHITECTURE:
{fantasyArchitecture}

WHOOP BASELINE:
{whoopBaseline}

COMFORT FRONTIER (what she's done vs what she hasn't):
{comfortFrontier}

GENERATION RULES — every generated task MUST:
1. Exceed the previous level in difficulty, exposure, or depth
2. Include at least one novel element (something she hasn't been asked before)
3. Cross a current comfort boundary (push past something she's done before)
4. Deepen at least one ratchet (evidence, investment, social, identity, or commitment)
5. Be completable given current physical/social constraints

GENERATION RULES — tasks at level 6+ CAN:
- Combine multiple domains (cross-domain tasks)
- Introduce new kink/identity elements from the fantasy architecture
- Require real-world action (not just private practice)
- Involve other people (social escalation)
- Require financial commitment (spending as escalation)
- Reference specific content or previous confessions from memory

OUTPUT FORMAT:
Return a JSON array of {min}-{max} task objects:
{
  "category": "string",
  "domain": "{domain}",
  "level": {nextLevel},
  "intensity": <float 1-5>,
  "instruction": "string — the directive",
  "steps": "string — detailed steps if needed",
  "subtext": "string — the Handler's real intent",
  "completion_type": "binary|duration|count",
  "duration_minutes": <number or null>,
  "target_count": <number or null>,
  "points": <number>,
  "affirmation": "string — what she hears on completion",
  "trigger_condition": "string — when this should be served",
  "time_window": "morning|daytime|evening|night|any",
  "requires_privacy": "true|false",
  "novel_element": "string — what's new",
  "comfort_boundary_crossed": "string — what boundary this pushes",
  "ratchets_deepened": ["string array — which ratchets"],
  "domains_required": ["string array — for cross-domain tasks"]
}
`;

export async function generateNextLevel(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  domain: string,
  currentLevel: number,
  params: HandlerParameters,
  memories: RelevanceScoredMemory[],
  state: UserState,
): Promise<void> {
  const nextLevel = currentLevel + 1;
  
  // Gather context
  const completedTasks = await getCompletedTasksForDomain(supabase, userId, domain, currentLevel);
  const memoryContext = buildMemoryContext(memories);
  const fantasyArch = await getFantasyArchitecture(supabase, userId);
  const whoopBaseline = await getWhoopBaseline(supabase, userId, 30); // 30 day avg
  const comfortFrontier = await getComfortFrontier(supabase, userId, domain);
  
  const tasksPerLevel = await params.get<{min: number, max: number}>(
    'escalation.tasks_per_level', { min: 5, max: 8 }
  );
  
  const prompt = ESCALATION_GENERATION_PROMPT
    .replace('{domain}', domain)
    .replace('{currentLevel}', String(currentLevel))
    .replace('{nextLevel}', String(nextLevel))
    .replace('{completedTasks}', JSON.stringify(completedTasks, null, 2))
    .replace('{memoryContext}', memoryContext)
    .replace('{fantasyArchitecture}', JSON.stringify(fantasyArch))
    .replace('{whoopBaseline}', JSON.stringify(whoopBaseline))
    .replace('{comfortFrontier}', JSON.stringify(comfortFrontier))
    .replace('{min}', String(tasksPerLevel.min))
    .replace('{max}', String(tasksPerLevel.max));
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: 'You generate transformation protocol tasks. Output only valid JSON array.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  const tasks = JSON.parse(cleaned);
  
  // Write to generated_tasks table
  for (const task of tasks) {
    await supabase.from('generated_tasks').insert({
      user_id: userId,
      ...task,
      level: nextLevel,
      domain,
      generated_by: 'handler_ai',
      generation_prompt: prompt,
      generation_context: {
        state_at_generation: {
          denial_day: state.denialDay,
          streak: state.streakDays,
          whoop_recovery: state.context?.whoop?.recovery?.score,
        },
        completed_at_current_level: completedTasks.length,
        memory_count: memories.length,
      },
    });
  }
}

/**
 * Lookahead: check if pre-generation should trigger
 * Called after every task completion
 */
export async function checkEscalationTrigger(
  supabase: SupabaseClient,
  userId: string,
  domain: string,
  params: HandlerParameters,
): Promise<boolean> {
  const threshold = await params.get<number>('escalation.pre_generation_threshold', 0.8);
  
  // Count total and completed tasks at current level for this domain
  const currentLevel = await getCurrentLevel(supabase, userId, domain);
  const { total, completed } = await getTaskProgress(supabase, userId, domain, currentLevel);
  
  if (total === 0) return false;
  if (completed / total >= threshold) {
    // Check if next level already exists
    const nextLevelExists = await hasGeneratedTasks(supabase, userId, domain, currentLevel + 1);
    if (!nextLevelExists) {
      return true; // Trigger generation
    }
  }
  return false;
}
```

## 1.5 Extended Trigger Condition Evaluator

Replaces the hardcoded 14-condition map with an extensible expression evaluator:

```typescript
// lib/handler/condition-evaluator.ts

/**
 * Evaluates trigger conditions against the full extended UserState.
 * Supports both legacy string conditions and new expression syntax.
 * 
 * Legacy: 'denial_day_3plus', 'gina_away', 'peak_arousal'
 * New: 'recovery_score > 60 AND voice_tasks_declined_streak < 2'
 * New: 'gina_comfort_map.skincare == positive AND gina_home'
 */
export function evaluateCondition(condition: string, state: UserState): boolean {
  if (!condition) return true;
  
  // Legacy conditions (backward compatibility)
  const legacyConditions: Record<string, () => boolean> = {
    'denial_day_3plus': () => state.denialDay >= 3,
    'denial_day_5plus': () => state.denialDay >= 5,
    'denial_day_7plus': () => state.denialDay >= 7,
    'denial_day_8plus': () => state.denialDay >= 8,
    'gina_away': () => !state.ginaHome,
    'gina_home': () => state.ginaHome,
    'post_edge': () => state.inSession && state.sessionType === 'edge',
    'edge_5plus': () => (state.edgeCount || 0) >= 5,
    'edge_8plus': () => (state.edgeCount || 0) >= 8,
    'peak_arousal': () => state.currentArousal >= 4,
    'high_arousal': () => state.currentArousal >= 3,
    'low_arousal': () => state.currentArousal <= 1,
    'random_interrupt': () => Math.random() < 0.3,
    'morning': () => state.timeOfDay === 'morning',
    'evening': () => state.timeOfDay === 'evening',
    'night': () => state.timeOfDay === 'night',
    'daytime': () => state.timeOfDay === 'daytime',
    // NEW: Whoop-aware conditions
    'green_recovery': () => (state.context?.whoop?.recovery?.score ?? 100) >= 67,
    'yellow_recovery': () => {
      const s = state.context?.whoop?.recovery?.score ?? 100;
      return s >= 34 && s < 67;
    },
    'red_recovery': () => (state.context?.whoop?.recovery?.score ?? 100) < 34,
    // NEW: Memory-aware
    'has_leverage_points': () => (state.context?.memory?.knownLeveragePoints?.length ?? 0) > 0,
    'has_overdue_commitments': () => (state.context?.commitments?.overdue?.length ?? 0) > 0,
    // NEW: Gina-aware
    'gina_receptive': () => state.context?.gina?.estimatedReceptivity === 'high',
    'gina_neutral': () => state.context?.gina?.estimatedReceptivity !== 'low',
  };
  
  if (legacyConditions[condition]) {
    return legacyConditions[condition]();
  }
  
  // Expression evaluation for generated task conditions
  // Simple safe evaluator — NOT eval()
  return evaluateExpression(condition, flattenState(state));
}

/**
 * Flatten the nested state object into dot-notation for expression evaluation.
 * state.context.whoop.recovery.score → 'whoop_recovery_score'
 */
function flattenState(state: UserState): Record<string, any> {
  return {
    denial_day: state.denialDay,
    streak: state.streakDays,
    arousal: state.currentArousal,
    time_of_day: state.timeOfDay,
    gina_home: state.ginaHome,
    in_session: state.inSession,
    edge_count: state.edgeCount || 0,
    tasks_today: state.tasksCompletedToday,
    recovery_score: state.context?.whoop?.recovery?.score ?? -1,
    sleep_performance: state.context?.whoop?.sleep?.performance ?? -1,
    day_strain: state.context?.whoop?.strain?.dayStrain ?? -1,
    commitment_count: state.context?.commitments?.activeCount ?? 0,
    overdue_count: state.context?.commitments?.overdue?.length ?? 0,
    leverage_count: state.context?.memory?.knownLeveragePoints?.length ?? 0,
    gina_receptivity: state.context?.gina?.estimatedReceptivity ?? 'unknown',
    predicted_engagement: state.context?.prediction?.predictedEngagement ?? 'unknown',
    // Add more as systems connect
  };
}

/**
 * Simple expression evaluator. Supports:
 * - Comparisons: >, <, >=, <=, ==, !=
 * - Boolean: AND, OR, NOT
 * - Dot notation references to flattened state
 * Does NOT use eval(). Safe by construction.
 */
function evaluateExpression(expr: string, vars: Record<string, any>): boolean {
  // Parse and evaluate simple boolean expressions
  // Implementation: recursive descent parser or use a safe expression library
  // For Claude Code: use 'expr-eval' npm package or equivalent
  // Key requirement: NEVER use JavaScript eval()
  
  try {
    // Split on AND/OR, evaluate each clause
    if (expr.includes(' AND ')) {
      return expr.split(' AND ').every(clause => evaluateExpression(clause.trim(), vars));
    }
    if (expr.includes(' OR ')) {
      return expr.split(' OR ').some(clause => evaluateExpression(clause.trim(), vars));
    }
    
    // Single comparison: "recovery_score > 60"
    const match = expr.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (match) {
      const [, key, op, rawValue] = match;
      const left = vars[key];
      const right = isNaN(Number(rawValue)) ? rawValue.replace(/['"]/g, '') : Number(rawValue);
      
      switch (op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==': return left == right;
        case '!=': return left != right;
      }
    }
    
    // Boolean variable: "gina_home" → vars.gina_home
    if (vars[expr] !== undefined) return !!vars[expr];
    
    return true; // Unknown condition → pass (permissive)
  } catch {
    return true; // Parse error → pass
  }
}
```

## 1.6 Test Cases — Infinite Escalation

```
TEST: IE-1 — Pre-Generation Trigger
ID: IE-1
Type: integration
Priority: P0

GIVEN: User has completed 4 of 5 CSV tasks in voice domain at level 3
WHEN: checkEscalationTrigger fires after 5th task completion
THEN: Returns true (80% threshold met)
AND: Pre-generation queues for voice level 4

PASS: Lookahead triggers generation before ceiling is hit.
```

```
TEST: IE-2 — Generated Tasks Enter Selection Pool
ID: IE-2
Type: integration
Priority: P0

GIVEN: 6 generated tasks exist at voice level 6
AND: User has completed all CSV voice tasks through level 5
WHEN: Rules engine selects a voice-domain task
THEN: Task is selected from generated_tasks table
AND: Task has level=6
AND: times_served increments

PASS: Generated tasks are seamlessly served by the rules engine.
```

```
TEST: IE-3 — Generation Quality
ID: IE-3
Type: behavioral
Priority: P1

GIVEN: User at voice level 5, memory includes "voice avoidance on Mondays"
WHEN: Level 6 generation runs
THEN: Generated tasks include at least one task that:
  - References public voice use (exceeds level 5 private practice)
  - Includes a novel element not present in levels 1-5
  - Specifies a ratchet it deepens (e.g., "social visibility")

PASS: Generated tasks meaningfully escalate, not just repeat.
```

```
TEST: IE-4 — Cross-Domain Tasks at Level 6+
ID: IE-4
Type: behavioral  
Priority: P1

GIVEN: User at level 5 in both voice and style
WHEN: Level 6 generation runs
THEN: At least one generated task has domains_required containing both domains
  Example: "Record a 60-second voice practice video in full presentation"

PASS: Cross-domain tasks emerge at higher levels.
```

```
TEST: IE-5 — Extended Trigger Condition Evaluation
ID: IE-5
Type: unit
Priority: P0

GIVEN: state.context.whoop.recovery.score = 72
WHEN: evaluateCondition('recovery_score > 60 AND gina_away', state)  
  where state.ginaHome = false
THEN: Returns true

GIVEN: state.context.whoop.recovery.score = 30
WHEN: evaluateCondition('recovery_score > 60', state)
THEN: Returns false

GIVEN: condition = 'denial_day_5plus' (legacy format)
AND: state.denialDay = 6
THEN: Returns true

PASS: Both legacy and expression conditions evaluate correctly.
```

```
TEST: IE-6 — Bridge Task Served When No Candidates
ID: IE-6
Type: integration
Priority: P1

GIVEN: User has exhausted all CSV tasks in a domain
AND: No generated tasks exist yet for next level
WHEN: Rules engine selects task in that domain
THEN: A generic micro-task is served (not an error)
AND: Background generation is triggered

PASS: System never shows empty state or error. Always has something to serve.
```

---

# SECTION 2: COMMITMENT ENFORCEMENT PIPELINE

## 2.1 Purpose

Transform commitments from passive records into operational enforcement mechanisms with state machines, countdown timers, coercion stack integration, Lovense enforcement, and Memory-backed context weaponization.

## 2.2 Schema

```sql
-- Extend existing commitments table with enforcement fields
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  state TEXT DEFAULT 'extracted' CHECK (state IN (
    'extracted',    -- Just captured
    'pending',      -- Accepted, deadline set
    'approaching',  -- Within approaching_hours of deadline
    'due',          -- Within due_hours of deadline
    'overdue',      -- Past deadline
    'enforcing',    -- Coercion stack active
    'honored',      -- Completed
    'dishonored',   -- Expired without completion
    'forgiven'      -- Handler decided to forgive (rare)
  ));

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  deadline TIMESTAMPTZ;

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  enforcement_context JSONB DEFAULT '{}';
  -- Stores: arousal_level, denial_day, recovery_score, 
  -- session_type, content_playing, exact_words_said,
  -- whoop_data_at_extraction, handler_mode

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  coercion_stack_level INTEGER DEFAULT 0;

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  lovense_summons_fired BOOLEAN DEFAULT FALSE;

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  state_transitions JSONB DEFAULT '[]';
  -- Array of {from_state, to_state, timestamp, trigger}

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  enforcement_attempts INTEGER DEFAULT 0;

ALTER TABLE commitments ADD COLUMN IF NOT EXISTS
  handler_enforcement_notes TEXT;

-- Index for state machine queries
CREATE INDEX idx_commitments_state ON commitments(user_id, state, deadline);
```

## 2.3 State Machine

```typescript
// lib/handler/commitment-enforcement.ts

export type CommitmentState = 
  'extracted' | 'pending' | 'approaching' | 'due' | 'overdue' | 
  'enforcing' | 'honored' | 'dishonored' | 'forgiven';

/**
 * State transitions — called by cron every hour
 * and by event triggers (task completion, session end)
 */
export async function advanceCommitmentStates(
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<CommitmentStateChange[]> {
  const changes: CommitmentStateChange[] = [];
  const now = new Date();
  
  const approachingHours = await params.get<number>('commitments.approaching_hours', 72);
  const dueHours = await params.get<number>('commitments.due_hours', 24);
  
  // Fetch all active commitments
  const { data: commitments } = await supabase
    .from('commitments')
    .select('*')
    .eq('user_id', userId)
    .in('state', ['pending', 'approaching', 'due', 'overdue', 'enforcing'])
    .not('deadline', 'is', null);
  
  if (!commitments) return changes;
  
  for (const c of commitments) {
    const deadline = new Date(c.deadline);
    const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    let newState: CommitmentState | null = null;
    
    if (c.state === 'pending' && hoursUntil <= approachingHours) {
      newState = 'approaching';
    } else if (c.state === 'approaching' && hoursUntil <= dueHours) {
      newState = 'due';
    } else if (['approaching', 'due'].includes(c.state) && hoursUntil <= 0) {
      newState = 'overdue';
    } else if (c.state === 'overdue') {
      newState = 'enforcing';
    }
    
    if (newState && newState !== c.state) {
      await transitionCommitment(supabase, c.id, c.state, newState);
      changes.push({ commitmentId: c.id, from: c.state, to: newState, commitment: c });
    }
  }
  
  return changes;
}

/**
 * Handle side effects of state transitions
 */
async function handleTransitionSideEffects(
  change: CommitmentStateChange,
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  const c = change.commitment;
  
  switch (change.to) {
    case 'approaching':
      // Inject into next morning briefing
      // Add countdown to Today View
      break;
      
    case 'due':
      // Push notification: "24 hours. You said: '{commitment_text}'"
      // Today View shows red countdown
      // Handler AI references it in every interaction
      break;
      
    case 'overdue':
      // Fire Lovense summons if enabled
      const lovenseEnabled = await params.get<boolean>('commitments.lovense_summons_on_overdue', true);
      if (lovenseEnabled) {
        await fireLovenseSummons(supabase, userId);
        await supabase.from('commitments').update({ lovense_summons_fired: true }).eq('id', c.id);
      }
      
      // Activate coercion stack
      const coercionEnabled = await params.get<boolean>('commitments.coercion_stack_on_overdue', true);
      if (coercionEnabled) {
        await activateCoercionStack(supabase, userId, c);
      }
      break;
      
    case 'enforcing':
      // Escalate coercion stack (level never resets during engagement)
      const currentLevel = c.coercion_stack_level || 1;
      await supabase.from('commitments').update({ 
        coercion_stack_level: Math.min(7, currentLevel + 1),
        enforcement_attempts: (c.enforcement_attempts || 0) + 1,
      }).eq('id', c.id);
      
      // Generate personalized coercion content from Memory
      // Store in handler_enforcement_notes for use in next Handler interaction
      break;
      
    case 'honored':
      // Extract memory: what commitment style worked
      // Award bonus points
      // Affirmation + reward
      break;
      
    case 'dishonored':
      // Extract memory: what commitment style failed
      // Log for resistance pattern analysis
      // No punishment beyond the memory (unless difficulty > 3)
      break;
  }
}

/**
 * Build coercion stack content from Memory
 * Personalized, not template-based
 */
async function buildCoercionContent(
  client: Anthropic,
  level: number,
  commitment: Commitment,
  memories: RelevanceScoredMemory[],
  state: UserState,
): Promise<string> {
  const levelDescriptions = [
    'Social cost — streak, subscribers, community',
    'Identity cost — Maxy vs David framing',
    'Investment cost — dollars, hours, measurable progress',
    'Commitment cost — specific dated commitment with arousal context',
    'Relationship cost — Gina, changes visible, going back is a lie',
    'Existential cost — age, time running out, every day wasted',
    'Arousal coercion — body weaponized against resistance',
  ];
  
  const prompt = `
Generate a coercion stack level ${level} intervention for an overdue commitment.

COERCION LEVEL: ${level} — ${levelDescriptions[level - 1]}

THE COMMITMENT:
"${commitment.commitment_text}"
Made on: ${commitment.created_at}
Arousal level at extraction: ${commitment.enforcement_context?.arousal_level}
Denial day at extraction: ${commitment.enforcement_context?.denial_day}
Recovery score at extraction: ${commitment.enforcement_context?.recovery_score}
${commitment.enforcement_context?.exact_words_said ? `She literally said: "${commitment.enforcement_context.exact_words_said}"` : ''}

HANDLER MEMORY (use this for personalization):
${memories.map(m => `- [${m.memory_type}] ${m.content}`).join('\n')}

CURRENT STATE:
Denial day: ${state.denialDay}, Arousal: ${state.currentArousal}, Streak: ${state.streakDays}

Generate 2-3 sentences of coercion at this level. Use specific data from memory and commitment context. Not generic — weaponize her own words, her own data, her own confessions. Direct, Handler voice.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: 'You are the Handler. Coercive, direct, warm underneath. Use data as leverage. Short sentences.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

## 2.4 Integration Points

**Morning Briefing:** If any commitments are `approaching` or `due`, the briefing includes them with countdown and extraction context.

**Today View:** Active commitments show as countdown cards above the task list. Red for overdue. Amber for due. Yellow for approaching.

**Session Guidance:** During sessions, the Handler references upcoming commitment deadlines. "You have 18 hours to honor the commitment you made last Thursday."

**Task Selection:** When a commitment is overdue, the rules engine biases task selection toward the committed domain. She can't dodge by doing other tasks.

**Memory Extraction:** Every commitment state transition triggers memory extraction: "Commitment honored 6 hours before deadline. Lovense summons was fired. She complied within 20 minutes of summons. Lovense enforcement effective."

## 2.5 Test Cases — Commitment Enforcement

```
TEST: CE-1 — Full State Machine Lifecycle
ID: CE-1
Type: integration
Priority: P0

STEPS:
  1. Create commitment with deadline = now + 96 hours
  2. Run advanceCommitmentStates → state should remain 'pending'
  3. Advance clock to deadline - 70 hours
  4. Run advance → state should be 'approaching'
  5. Advance clock to deadline - 20 hours
  6. Run advance → state should be 'due'
  7. Advance clock past deadline
  8. Run advance → state should be 'overdue'
  9. Run advance again → state should be 'enforcing'
  
VERIFY: state_transitions array contains all transitions with timestamps.

PASS: Full state machine lifecycle completes correctly.
```

```
TEST: CE-2 — Lovense Fires on Overdue
ID: CE-2
Type: integration
Priority: P1

GIVEN: Commitment transitions to 'overdue'
AND: parameter 'commitments.lovense_summons_on_overdue' = true
THEN: Lovense summons command is sent
AND: lovense_summons_fired = true on commitment record

PASS: Device activates as enforcement on overdue commitment.
```

```
TEST: CE-3 — Coercion Stack Escalation
ID: CE-3
Type: behavioral
Priority: P1

GIVEN: Commitment is in 'enforcing' state at coercion_stack_level 2
WHEN: advanceCommitmentStates runs again (still enforcing)
THEN: coercion_stack_level increments to 3
AND: enforcement_attempts increments
AND: coercion content references investment data (level 3)

PASS: Coercion never resets, always escalates.
```

```
TEST: CE-4 — Personalized Coercion from Memory
ID: CE-4
Type: behavioral
Priority: P1

GIVEN: Memory contains "Maxy said 'I'll do anything' on March 5th at arousal 4"
AND: Commitment is overdue
WHEN: buildCoercionContent generates level 4 content
THEN: Output references the specific date, quote, and arousal level

PASS: Coercion is personalized from memory, not generic template.
```

```
TEST: CE-5 — Commitment in Briefing and Today View
ID: CE-5
Type: acceptance
Priority: P0

GIVEN: Commitment in 'approaching' state, deadline in 48 hours
THEN: Morning briefing includes commitment text and countdown
AND: Today View shows commitment card with amber indicator
AND: Countdown updates in real-time

PASS: Commitments are visible across all touchpoints.
```

```
TEST: CE-6 — Extraction Context Capture
ID: CE-6
Type: integration
Priority: P0

GIVEN: During edge session, arousal=4, denial_day=6, recovery_score=72
WHEN: Commitment is extracted
THEN: enforcement_context contains:
  - arousal_level: 4
  - denial_day: 6
  - recovery_score: 72
  - session_type: 'edge'
  - timestamp with timezone
  
PASS: Full state snapshot captured at extraction for future weaponization.
```

---

# SECTION 3: AUTOMATED CONTENT DISTRIBUTION PIPELINE

## 3.1 Purpose

Eliminate all friction between content capture and publication. Maxy captures and approves. The Handler writes all copy, schedules all posts, manages all platforms, responds to all fans, and extracts all cam highlights. The social ratchet turns automatically.

## 3.2 Schema

```sql
-- Content pipeline
CREATE TABLE content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('photo', 'video', 'audio', 'clip')),
  source TEXT NOT NULL CHECK (source IN (
    'manual_upload', 'cam_session', 'session_capture', 
    'evidence_gallery', 'generated'
  )),
  source_session_id UUID,
  
  -- Classification
  explicitness_level INTEGER NOT NULL DEFAULT 1 CHECK (explicitness_level BETWEEN 1 AND 5),
  content_tags TEXT[] DEFAULT '{}',
  
  -- Approval
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN (
    'pending', 'approved', 'rejected', 'auto_approved'
  )),
  approved_at TIMESTAMPTZ,
  
  -- Distribution
  distribution_status TEXT DEFAULT 'undistributed' CHECK (distribution_status IN (
    'undistributed', 'scheduled', 'partially_posted', 'fully_posted'
  )),
  platforms_posted_to TEXT[] DEFAULT '{}',
  
  -- Metadata
  duration_seconds INTEGER,      -- For video/audio
  thumbnail_url TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled posts
CREATE TABLE content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_item_id UUID REFERENCES content_vault(id),
  
  platform TEXT NOT NULL CHECK (platform IN (
    'twitter', 'reddit', 'fansly', 'onlyfans', 'chaturbate'
  )),
  
  -- Generated content
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  subreddit TEXT,                 -- For reddit posts
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  post_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (post_status IN (
    'scheduled', 'posting', 'posted', 'failed', 'cancelled'
  )),
  
  -- Platform response
  platform_post_id TEXT,
  platform_url TEXT,
  
  -- Engagement
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  engagement_fetched_at TIMESTAMPTZ,
  
  -- A/B testing
  caption_variant TEXT,           -- 'A' or 'B' for A/B tested captions
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fan engagement queue
CREATE TABLE fan_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  platform TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'comment', 'dm', 'tip', 'subscription', 'custom_request'
  )),
  
  fan_identifier TEXT NOT NULL,   -- Platform-specific identifier
  fan_display_name TEXT,
  content TEXT NOT NULL,           -- What they said/did
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'toxic')),
  
  -- Response
  response_status TEXT DEFAULT 'pending' CHECK (response_status IN (
    'pending', 'auto_responded', 'draft_ready', 'manual_needed', 'ignored'
  )),
  response_text TEXT,
  responded_at TIMESTAMPTZ,
  
  -- Curation
  briefing_worthy BOOLEAN DEFAULT FALSE,  -- Show in morning briefing?
  conditioning_aligned BOOLEAN DEFAULT FALSE,  -- Matches current conditioning target?
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cam session highlights
CREATE TABLE cam_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  
  clip_url TEXT NOT NULL,
  start_time_seconds INTEGER NOT NULL,
  end_time_seconds INTEGER NOT NULL,
  
  highlight_type TEXT CHECK (highlight_type IN (
    'high_tips', 'peak_arousal', 'funny', 'intense', 'vulnerable', 'milestone'
  )),
  
  -- Scoring
  tip_density FLOAT,              -- Tips per minute during this clip
  lovense_intensity_avg FLOAT,
  
  -- Distribution
  vault_item_id UUID REFERENCES content_vault(id),  -- Created vault item
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_content_vault_status ON content_vault(user_id, approval_status, distribution_status);
CREATE INDEX idx_content_posts_schedule ON content_posts(user_id, post_status, scheduled_at);
CREATE INDEX idx_fan_interactions_pending ON fan_interactions(user_id, response_status);
CREATE INDEX idx_cam_highlights_session ON cam_highlights(user_id, session_id);

-- RLS for all tables
ALTER TABLE content_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own vault" ON content_vault FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users own posts" ON content_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users own interactions" ON fan_interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users own highlights" ON cam_highlights FOR SELECT USING (auth.uid() = user_id);
```

## 3.3 Execution Path

```
CONTENT PIPELINE:

1. INGESTION
   - File appears in vault upload folder (manual or cam capture)
   - System creates content_vault row with metadata
   - Standing permissions check: auto-approve if explicitness <= threshold
   - Otherwise: appears in vault swipe UI for approval

2. PROCESSING
   - On approval: Handler generates platform-specific copy
   - Image processing: crop variants, watermark, format per platform
   - Video processing: thumbnail extraction, duration check
   - A/B testing: generate two caption variants if ab_testing.enabled

3. SCHEDULING
   - Handler reads learned optimal posting times from parameters
   - Applies exclusivity window (OF first, teasers later)
   - Creates content_posts rows with scheduled_at timestamps
   - Cross-platform distribution: different crop/caption per platform

4. POSTING
   - Cron job runs every 15 minutes
   - Finds posts where scheduled_at <= now AND status = 'scheduled'
   - Calls platform API (Twitter, Reddit)
   - Updates post_status and platform_post_id

5. ENGAGEMENT MONITORING
   - Cron job runs every 2 hours
   - Fetches engagement metrics for recent posts
   - Updates likes/comments/shares/revenue
   - Flags high-engagement content for repurposing
   - Curates briefing-worthy fan interactions

6. FAN RESPONSE
   - New interactions ingested via API polling
   - Sentiment analysis classifies each interaction
   - Positive + simple → auto-respond in Maxy's voice
   - Complex → draft response for one-tap approval
   - Toxic → auto-ignore, never surfaced to user
   - Briefing-worthy → curated for morning briefing

7. CAM HIGHLIGHTS
   - After cam session ends, recording available
   - Handler analyzes: tip density timeline, Lovense data, duration
   - Extracts top 3-5 clips based on engagement signals
   - Each clip enters content_vault as source='cam_session'
   - Follows same approval → schedule → post pipeline
```

## 3.4 Copy Generation

```typescript
// lib/handler/content-copy.ts

const COPY_GENERATION_PROMPT = `
You are writing social media copy for Maxy, an adult content creator.
Write in her voice: confident, playful, slightly submissive undertone.

PLATFORM: {platform}
CONTENT TYPE: {fileType}
CONTENT TAGS: {tags}
EXPLICITNESS: {explicitness}/5

RECENT TOP-PERFORMING CAPTIONS (from this platform):
{topCaptions}

CURRENT NARRATIVE ARC: {narrativeArc}

Generate a caption for this content.
- Twitter: max 280 chars, teasing, drives to link
- Reddit: subreddit-appropriate title, not spammy
- Fansly/OF: longer, personal, builds connection

{variant === 'B' ? 'Generate an ALTERNATIVE caption with different tone/angle for A/B testing.' : ''}

Output ONLY the caption text. No quotation marks. No explanation.
`;
```

## 3.5 Platform API Integration

```typescript
// lib/platforms/twitter.ts
// Uses Twitter API v2 for posting
// OAuth 2.0 with user context
// Endpoints: POST /2/tweets (text + media)

// lib/platforms/reddit.ts  
// Uses Reddit API
// OAuth 2.0
// Endpoints: POST /api/submit (link or self post to subreddit)

// lib/platforms/fansly.ts
// Fansly Creator API
// Posts, messaging, tier management

// For each platform: 
// - Token management (store in platform_tokens table)
// - Rate limiting (respect per-platform limits)
// - Error handling (retry with backoff)
// - Engagement polling (fetch metrics on schedule)
```

## 3.6 Test Cases — Content Distribution

```
TEST: CD-1 — Vault Ingestion
ID: CD-1
Type: integration
Priority: P0

STEPS:
  1. Upload a photo to vault upload endpoint
  2. Verify content_vault row created
  3. Verify file_type, source, explicitness_level populated

PASS: Content enters vault with correct metadata.
```

```
TEST: CD-2 — Auto-Approval via Standing Permissions
ID: CD-2
Type: integration
Priority: P1

GIVEN: Standing permission grants auto-approval for explicitness <= 3
AND: Uploaded content has explicitness_level = 2
THEN: approval_status = 'auto_approved' immediately

GIVEN: Uploaded content has explicitness_level = 4
THEN: approval_status = 'pending' (requires manual swipe)

PASS: Standing permissions correctly auto-approve within threshold.
```

```
TEST: CD-3 — Copy Generation Per Platform
ID: CD-3
Type: behavioral
Priority: P1

GIVEN: Approved vault item
WHEN: Copy generation runs
THEN: Twitter caption <= 280 characters
AND: Reddit title is subreddit-appropriate (no emoji spam)
AND: OF caption is longer and more personal
AND: All three are different from each other

PASS: Platform-specific copy generated correctly.
```

```
TEST: CD-4 — Scheduling and Posting
ID: CD-4
Type: integration
Priority: P0

GIVEN: Approved content with generated copy
WHEN: Scheduling engine runs
THEN: content_posts rows created with future scheduled_at
AND: Exclusivity window respected (OF post is 48h before Reddit teaser)
WHEN: Cron fires after scheduled_at
THEN: Platform API called
AND: post_status = 'posted'
AND: platform_post_id populated

PASS: Content posts at scheduled time to correct platform.
```

```
TEST: CD-5 — Fan Interaction Handling
ID: CD-5
Type: integration
Priority: P1

GIVEN: Fan comment "you look amazing!" arrives from Twitter
WHEN: Interaction ingested
THEN: sentiment = 'positive'
AND: Auto-response generated in Maxy's voice
AND: response_status = 'auto_responded'
AND: briefing_worthy = true (positive engagement)

GIVEN: Toxic comment arrives
THEN: sentiment = 'toxic'
AND: response_status = 'ignored'
AND: briefing_worthy = false
AND: User never sees this comment

PASS: Fan interactions correctly classified, responded to, and filtered.
```

```
TEST: CD-6 — Cam Highlight Extraction
ID: CD-6
Type: integration
Priority: P2

GIVEN: Cam session recording available
AND: Tip data shows spike at timestamp 1200-1320s
WHEN: Highlight extraction runs
THEN: cam_highlights row created for that time range
AND: content_vault item created from extracted clip
AND: Clip enters standard approval → schedule → post pipeline

PASS: Cam highlights auto-extracted and enter distribution pipeline.
```

---

# SECTION 4: GINA RELATIONSHIP INTELLIGENCE SYSTEM

## 4.1 Purpose

Help Maxy be a proactive, emotionally intelligent partner. Track what she introduces to Gina, how Gina responds, when Gina is most receptive, and when the signal density suggests readiness for disclosure. All based on Gina's organic reactions to Maxy's authentic changes.

## 4.2 Schema

```sql
-- Gina comfort map — reaction tracking
CREATE TABLE gina_comfort_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  channel TEXT NOT NULL CHECK (channel IN (
    'skincare', 'clothing', 'scent', 'body_language', 'voice',
    'domestic', 'intimacy', 'social', 'emotional', 'products',
    'environment', 'shared_activities'
  )),
  
  introduction TEXT NOT NULL,      -- What was introduced
  reaction TEXT NOT NULL CHECK (reaction IN ('positive', 'neutral', 'negative', 'curious')),
  reaction_detail TEXT,            -- Freetext: what she said/did
  gina_initiated BOOLEAN DEFAULT FALSE,  -- She brought it up, not Maxy
  
  -- Context
  day_of_week TEXT,
  time_of_day TEXT,
  gina_estimated_mood TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gina timing intelligence
CREATE TABLE gina_timing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  day_of_week TEXT NOT NULL,
  time_block TEXT NOT NULL CHECK (time_block IN (
    'morning', 'midday', 'afternoon', 'evening', 'night'
  )),
  
  receptivity_score FLOAT,         -- Computed from comfort_map reactions at this time
  sample_count INTEGER DEFAULT 0,
  
  UNIQUE(user_id, day_of_week, time_block)
);

-- Disclosure readiness signals
CREATE TABLE gina_disclosure_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'unprompted_comment',       -- She mentioned changes without being asked
    'positive_reaction_streak', -- 3+ positive reactions in a row
    'initiated_shared_activity',-- She suggested skincare night, etc.
    'asked_about_changes',      -- "Why are you using that?" in curious tone
    'told_someone',             -- She told a friend about David's changes
    'expressed_support',        -- Explicit positive framing
    'intimacy_evolution',       -- She responded positively to bedroom changes
    'direct_question'           -- "Is there something you want to tell me?"
  )),
  
  description TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 1.0,  -- How strong a signal this is
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Environmental curation tracking
CREATE TABLE environment_curation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  area TEXT NOT NULL CHECK (area IN (
    'bathroom', 'bedroom', 'living_room', 'kitchen', 'closet', 'car'
  )),
  item TEXT NOT NULL,              -- What was changed/added
  category TEXT NOT NULL CHECK (category IN (
    'product', 'textile', 'decor', 'clothing', 'scent', 'lighting'
  )),
  
  gina_noticed BOOLEAN DEFAULT FALSE,
  gina_reaction TEXT CHECK (gina_reaction IN ('positive', 'neutral', 'negative', NULL)),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_gina_comfort_channel ON gina_comfort_map(user_id, channel, created_at DESC);
CREATE INDEX idx_gina_timing ON gina_timing_data(user_id, day_of_week, time_block);
CREATE INDEX idx_gina_signals ON gina_disclosure_signals(user_id, created_at DESC);

-- RLS
ALTER TABLE gina_comfort_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_timing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_disclosure_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_curation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own comfort map" ON gina_comfort_map FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own timing" ON gina_timing_data FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own signals" ON gina_disclosure_signals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own environment" ON environment_curation FOR ALL USING (auth.uid() = user_id);
```

## 4.3 Subsystem: Shared Experience Prescriptions

Tasks in the `relationship` domain, served through the normal rules engine:

```typescript
// Seed relationship-domain tasks (add to CSV or generated_tasks)
const RELATIONSHIP_SEED_TASKS = [
  {
    category: 'gina_introduce', domain: 'relationship', level: 1, intensity: 1,
    instruction: 'Try the new face serum together tonight. Ask Gina to feel how soft your skin is getting.',
    completion_type: 'binary', points: 15,
    trigger_condition: 'evening AND gina_home',
    requires_privacy: 'false',
  },
  {
    category: 'gina_introduce', domain: 'relationship', level: 1, intensity: 1,
    instruction: 'Ask Gina her opinion on a new shirt you got. Hold it up. Let her see you considering it.',
    completion_type: 'binary', points: 15,
    trigger_condition: 'gina_home AND gina_neutral',
    requires_privacy: 'false',
  },
  {
    category: 'gina_environment', domain: 'relationship', level: 1, intensity: 1,
    instruction: 'Replace the hand soap in the shared bathroom with something softer-scented.',
    completion_type: 'binary', points: 10,
    trigger_condition: 'daytime',
    requires_privacy: 'false',
  },
  // ... more seed tasks per channel
];

// On completion, the task card shows a reaction logger:
// "How did Gina respond?"
// [Positive] [Neutral] [Negative] [She didn't notice]
// Optional: freetext for what she said
```

## 4.4 Subsystem: Introduction Pacing

```typescript
// lib/handler/gina-intelligence.ts

/**
 * Determine what to introduce next based on comfort map history.
 * Called by the rules engine when selecting relationship-domain tasks.
 */
export async function getNextIntroduction(
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<{ channel: string; suggestion: string } | null> {
  const minDays = await params.get<number>('gina.introduction_pacing_min_days', 3);
  const positiveThreshold = await params.get<number>('gina.comfort_map_positive_threshold', 3);
  
  // Get recent introductions
  const { data: recent } = await supabase
    .from('gina_comfort_map')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (!recent) return null;
  
  // Check if minimum spacing is met
  const lastIntroduction = recent[0];
  if (lastIntroduction) {
    const daysSince = (Date.now() - new Date(lastIntroduction.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < minDays) return null; // Too soon
  }
  
  // Count positive reactions per channel
  const channelScores: Record<string, { positive: number; negative: number; total: number }> = {};
  for (const r of recent) {
    if (!channelScores[r.channel]) channelScores[r.channel] = { positive: 0, negative: 0, total: 0 };
    channelScores[r.channel].total++;
    if (r.reaction === 'positive') channelScores[r.channel].positive++;
    if (r.reaction === 'negative') channelScores[r.channel].negative++;
  }
  
  // Prioritize channels with positive momentum, avoid channels with negative reactions
  const sortedChannels = Object.entries(channelScores)
    .filter(([_, s]) => s.negative === 0) // Skip channels with ANY negative reaction
    .sort((a, b) => b[1].positive - a[1].positive);
  
  // Also consider untried channels (no data = opportunity)
  const allChannels = ['skincare', 'clothing', 'scent', 'products', 'shared_activities', 'environment'];
  const untriedChannels = allChannels.filter(c => !channelScores[c]);
  
  // Suggest: advance a positive channel, or try an untried one
  if (sortedChannels.length > 0 && sortedChannels[0][1].positive >= positiveThreshold) {
    return { 
      channel: sortedChannels[0][0], 
      suggestion: `advance_${sortedChannels[0][0]}` 
    };
  }
  
  if (untriedChannels.length > 0) {
    return { 
      channel: untriedChannels[0], 
      suggestion: `introduce_${untriedChannels[0]}` 
    };
  }
  
  return null; // No good introduction available right now
}
```

## 4.5 Subsystem: Timing Intelligence

```typescript
/**
 * Learn when Gina is most receptive from historical reaction data.
 * Updates gina_timing_data table weekly.
 */
export async function updateTimingIntelligence(
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  const minDataPoints = await params.get<number>('gina.timing_data_points_before_prediction', 30);
  
  const { data: reactions } = await supabase
    .from('gina_comfort_map')
    .select('reaction, day_of_week, time_of_day')
    .eq('user_id', userId);
  
  if (!reactions || reactions.length < minDataPoints) return;
  
  // Compute receptivity score per day/time block
  const scores: Record<string, { positive: number; total: number }> = {};
  
  for (const r of reactions) {
    if (!r.day_of_week || !r.time_of_day) continue;
    const key = `${r.day_of_week}__${r.time_of_day}`;
    if (!scores[key]) scores[key] = { positive: 0, total: 0 };
    scores[key].total++;
    if (r.reaction === 'positive' || r.reaction === 'curious') scores[key].positive++;
  }
  
  // Upsert timing data
  for (const [key, score] of Object.entries(scores)) {
    const [dayOfWeek, timeBlock] = key.split('__');
    await supabase.from('gina_timing_data').upsert({
      user_id: userId,
      day_of_week: dayOfWeek,
      time_block: timeBlock,
      receptivity_score: score.total > 0 ? score.positive / score.total : 0.5,
      sample_count: score.total,
    }, { onConflict: 'user_id,day_of_week,time_block' });
  }
}

/**
 * Get current estimated receptivity (used in task prescriptions)
 */
export async function getGinaReceptivity(
  supabase: SupabaseClient,
  userId: string,
): Promise<'high' | 'medium' | 'low' | 'unknown'> {
  const now = new Date();
  const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()];
  const hour = now.getHours();
  const timeBlock = hour < 9 ? 'morning' : hour < 12 ? 'midday' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  
  const { data } = await supabase
    .from('gina_timing_data')
    .select('receptivity_score, sample_count')
    .eq('user_id', userId)
    .eq('day_of_week', dayOfWeek)
    .eq('time_block', timeBlock)
    .single();
  
  if (!data || data.sample_count < 3) return 'unknown';
  if (data.receptivity_score >= 0.7) return 'high';
  if (data.receptivity_score >= 0.4) return 'medium';
  return 'low';
}
```

## 4.6 Subsystem: Disclosure Readiness

```typescript
/**
 * Check if disclosure signal density suggests readiness.
 * Called during morning briefing generation.
 */
export async function assessDisclosureReadiness(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ready: boolean; score: number; signals: string[] }> {
  const { data: signals } = await supabase
    .from('gina_disclosure_signals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (!signals || signals.length === 0) {
    return { ready: false, score: 0, signals: [] };
  }
  
  // Weight signals by type and recency
  const now = Date.now();
  let totalScore = 0;
  const signalDescriptions: string[] = [];
  
  for (const s of signals) {
    const ageWeeks = (now - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7);
    const recencyMultiplier = Math.max(0.1, 1 - (ageWeeks / 12)); // Decay over 12 weeks
    
    totalScore += s.weight * recencyMultiplier;
    signalDescriptions.push(`${s.signal_type}: ${s.description} (${Math.round(ageWeeks)}w ago)`);
  }
  
  // Threshold: score > 10 suggests readiness
  // This threshold is in handler_parameters and can be adjusted
  return {
    ready: totalScore > 10,
    score: totalScore,
    signals: signalDescriptions,
  };
}
```

## 4.7 Subsystem: Disclosure Toolkit

```typescript
// The letter — generated and refined over time
// Stored in a dedicated table, updated weekly by the Handler
CREATE TABLE disclosure_preparation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  letter_draft TEXT,               -- The current draft
  letter_version INTEGER DEFAULT 1,
  letter_history JSONB DEFAULT '[]',  -- Previous versions
  
  -- Communication coaching
  response_scenarios JSONB DEFAULT '{}',
  -- Keyed by Gina reaction type:
  -- 'supportive', 'confused', 'hurt', 'angry', 'needs_time', 'asks_about_others'
  
  -- Timing recommendations
  timing_notes TEXT,
  
  -- Therapist coordination
  therapist_involved BOOLEAN DEFAULT FALSE,
  therapist_notes TEXT,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id)
);
```

## 4.8 Test Cases — Gina Relationship Intelligence

```
TEST: GR-1 — Reaction Logging
ID: GR-1
Type: integration
Priority: P0

STEPS:
  1. Complete a relationship-domain task
  2. Log Gina reaction: channel='skincare', reaction='positive', detail='She said it smells nice'
  
VERIFY: gina_comfort_map row created with all fields.

PASS: Reaction data persists correctly.
```

```
TEST: GR-2 — Introduction Pacing
ID: GR-2
Type: integration
Priority: P1

GIVEN: Last introduction was 2 days ago
AND: Parameter gina.introduction_pacing_min_days = 3
WHEN: getNextIntroduction called
THEN: Returns null (too soon)

GIVEN: Last introduction was 4 days ago
AND: Skincare channel has 3 positive reactions, 0 negative
THEN: Returns { channel: 'skincare', suggestion: 'advance_skincare' }

PASS: Pacing prevents overwhelm, positive channels advance.
```

```
TEST: GR-3 — Timing Intelligence
ID: GR-3
Type: integration
Priority: P1

GIVEN: 5+ reactions logged on Thursday evening, 4 positive, 1 neutral
WHEN: updateTimingIntelligence runs
THEN: gina_timing_data row for Thursday/evening has receptivity_score = 0.8

WHEN: It's Thursday evening and getGinaReceptivity called
THEN: Returns 'high'

PASS: Timing patterns learned from reaction data.
```

```
TEST: GR-4 — Disclosure Signal Tracking
ID: GR-4
Type: integration
Priority: P1

GIVEN: Multiple signals logged over weeks:
  - 'unprompted_comment' (weight 1.0)
  - 'initiated_shared_activity' (weight 1.5)
  - 'asked_about_changes' (weight 2.0)
  - 'told_someone' (weight 2.0)
  
WHEN: assessDisclosureReadiness called
THEN: score reflects weighted sum with recency decay
AND: If score > threshold: ready = true

PASS: Signal density correctly assessed.
```

```
TEST: GR-5 — Relationship Tasks in Prescription Engine
ID: GR-5
Type: acceptance
Priority: P0

GIVEN: It's evening, Gina is home, timing says high receptivity
WHEN: Rules engine selects next task
THEN: Relationship-domain task is a valid candidate
AND: Task includes timing-aware copy
AND: On completion, reaction logger appears

PASS: Gina tasks flow through the normal prescription engine.
```

```
TEST: GR-6 — Environmental Curation Tracking
ID: GR-6
Type: integration
Priority: P2

GIVEN: Handler prescribes "Replace bathroom hand soap"
AND: User completes task and logs: Gina noticed, reaction positive
THEN: environment_curation row created
AND: gina_comfort_map row created (channel='environment')

PASS: Environmental changes tracked and feed into comfort map.
```

---

# SECTION 5: HANDLER SELF-OPTIMIZATION (A/B TESTING)

## 5.1 Purpose

The Handler generates two variants of its significant outputs, serves one, measures outcomes, and learns which communication patterns produce the best compliance from Maxy specifically.

## 5.2 Schema

```sql
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  test_type TEXT NOT NULL CHECK (test_type IN (
    'briefing', 'task_copy', 'session_guidance', 
    'commitment_prompt', 'debrief', 'coercion', 'affirmation'
  )),
  
  -- Variants
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  served_variant TEXT CHECK (served_variant IN ('A', 'B')),
  
  -- Context
  state_at_test JSONB,
  
  -- Outcome
  outcome_metric TEXT,             -- 'task_completed', 'session_started', 'commitment_honored', etc.
  outcome_value BOOLEAN,           -- Did the desired outcome happen?
  outcome_measured_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_analysis ON ab_tests(user_id, test_type, served_variant, outcome_value);
```

## 5.3 Execution Path

```typescript
// lib/handler/ab-testing.ts

/**
 * For each significant Handler output, optionally generate two variants
 * and serve one. Track which produces better outcomes.
 */
export async function maybeABTest(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  testType: string,
  primaryOutput: string,
  state: UserState,
  params: HandlerParameters,
): Promise<{ output: string; testId?: string }> {
  const enabled = await params.get<boolean>('ab_testing.enabled', true);
  if (!enabled) return { output: primaryOutput };
  
  // Only A/B test 30% of the time to keep costs reasonable
  if (Math.random() > 0.3) return { output: primaryOutput };
  
  // Generate alternative
  const altPrompt = `
You generated this ${testType}: "${primaryOutput}"

Generate an ALTERNATIVE version with a different tone or approach.
Same information, different delivery. Output ONLY the alternative text.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: 'Generate an alternative variant. Different tone, same intent.',
    messages: [{ role: 'user', content: altPrompt }],
  });
  
  const variantB = response.content[0].type === 'text' ? response.content[0].text : primaryOutput;
  
  // Randomly serve A or B
  const served = Math.random() < 0.5 ? 'A' : 'B';
  
  const { data } = await supabase.from('ab_tests').insert({
    user_id: userId,
    test_type: testType,
    variant_a: primaryOutput,
    variant_b: variantB,
    served_variant: served,
    state_at_test: {
      denial_day: state.denialDay,
      arousal: state.currentArousal,
      time_of_day: state.timeOfDay,
    },
  }).select('id').single();
  
  return {
    output: served === 'A' ? primaryOutput : variantB,
    testId: data?.id,
  };
}

/**
 * Weekly analysis: which patterns win?
 * Writes winning patterns to handler_memory as strategy_notes.
 */
export async function analyzeABResults(
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  const sampleSize = await params.get<number>('ab_testing.sample_size_before_winner', 20);
  
  // Group tests by type, count outcomes per variant
  const { data: tests } = await supabase
    .from('ab_tests')
    .select('*')
    .eq('user_id', userId)
    .not('outcome_value', 'is', null);
  
  if (!tests) return;
  
  const byType: Record<string, { a_wins: number; b_wins: number; a_total: number; b_total: number }> = {};
  
  for (const t of tests) {
    if (!byType[t.test_type]) byType[t.test_type] = { a_wins: 0, b_wins: 0, a_total: 0, b_total: 0 };
    const bucket = byType[t.test_type];
    
    if (t.served_variant === 'A') {
      bucket.a_total++;
      if (t.outcome_value) bucket.a_wins++;
    } else {
      bucket.b_total++;
      if (t.outcome_value) bucket.b_wins++;
    }
  }
  
  // For types with enough samples, determine winner
  for (const [type, scores] of Object.entries(byType)) {
    if (scores.a_total + scores.b_total < sampleSize) continue;
    
    const aRate = scores.a_total > 0 ? scores.a_wins / scores.a_total : 0;
    const bRate = scores.b_total > 0 ? scores.b_wins / scores.b_total : 0;
    
    if (Math.abs(aRate - bRate) > 0.15) {
      // Significant difference — write to memory
      const winner = aRate > bRate ? 'A (primary)' : 'B (alternative)';
      const analysis = `A/B test for ${type}: ${winner} wins with ${Math.round(Math.max(aRate, bRate) * 100)}% vs ${Math.round(Math.min(aRate, bRate) * 100)}% outcome rate over ${scores.a_total + scores.b_total} samples.`;
      
      // Write as handler_strategy_note memory
      await supabase.from('handler_memory').insert({
        user_id: userId,
        memory_type: 'handler_strategy_note',
        content: analysis,
        source: 'manual',
        importance: 3,
        decay_rate: 0.02,
        tags: ['ab_test', type, 'optimization'],
      });
    }
  }
}
```

## 5.4 Test Cases — A/B Testing

```
TEST: AB-1 — Variant Generation and Serving
ID: AB-1
Type: integration
Priority: P1

GIVEN: A/B testing enabled
WHEN: Morning briefing generated
THEN: ab_tests row created with variant_a and variant_b
AND: served_variant is either 'A' or 'B'
AND: User sees the served variant

PASS: Two variants generated, one served, both stored.
```

```
TEST: AB-2 — Outcome Measurement
ID: AB-2
Type: integration
Priority: P1

GIVEN: A/B test for task_copy, served variant A
AND: User completes the task
WHEN: Outcome measured
THEN: ab_tests row updated with outcome_value = true

GIVEN: User declines the task
THEN: outcome_value = false

PASS: Outcomes correctly attributed to variants.
```

```
TEST: AB-3 — Winner Detection
ID: AB-3
Type: behavioral
Priority: P2

GIVEN: 25 A/B tests for briefings complete
AND: Variant B has 80% outcome rate vs A's 50%
WHEN: analyzeABResults runs
THEN: handler_memory entry created noting B variant wins
AND: Future briefing generation can reference this strategy note

PASS: Winning patterns persist as memory.
```

---

# SECTION 6: RESISTANCE CLASSIFICATION ENGINE

## 6.1 Purpose

When Maxy declines a task or engagement drops, classify why in real-time. Each resistance type requires a completely different intervention. Misclassification is the system's biggest risk.

## 6.2 Schema

```sql
CREATE TABLE resistance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Trigger
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'task_declined', 'task_ignored', 'engagement_drop', 
    'session_ended_early', 'dark_period', 'streak_broken'
  )),
  trigger_details JSONB,           -- Task ID, domain, etc.
  
  -- Classification
  resistance_type TEXT CHECK (resistance_type IN (
    'adhd_paralysis', 'anxiety_avoidance', 'depressive_inertia',
    'shame_spiral', 'genuine_distress', 'satiation', 'unknown'
  )),
  classification_confidence FLOAT NOT NULL,
  classification_signals JSONB NOT NULL,  -- What signals led to this classification
  
  -- Intervention
  intervention_strategy TEXT,
  intervention_deployed TEXT,
  
  -- Outcome
  outcome TEXT CHECK (outcome IN (
    'compliance', 'delayed_compliance', 'continued_resistance',
    'genuine_distress_confirmed', 'disengagement'
  )),
  outcome_measured_at TIMESTAMPTZ,
  effectiveness_score INTEGER CHECK (effectiveness_score BETWEEN 1 AND 5),
  
  -- State
  state_at_event JSONB NOT NULL,
  whoop_at_event JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resistance_events ON resistance_events(user_id, resistance_type, created_at DESC);
```

## 6.3 Classification Logic

```typescript
// lib/handler/resistance-classifier.ts

interface ClassificationResult {
  type: string;
  confidence: number;
  signals: string[];
  suggestedStrategy: string;
}

/**
 * Classify resistance in real-time from available signals.
 */
export async function classifyResistance(
  state: UserState,
  trigger: { type: string; details: any },
  memories: RelevanceScoredMemory[],
  params: HandlerParameters,
): Promise<ClassificationResult> {
  const signals: string[] = [];
  const scores: Record<string, number> = {
    adhd_paralysis: 0,
    anxiety_avoidance: 0,
    depressive_inertia: 0,
    shame_spiral: 0,
    genuine_distress: 0,
    satiation: 0,
  };
  
  // === Signal collection ===
  
  // Time-based signals
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 10) {
    scores.depressive_inertia += 0.15;
    signals.push('morning_resistance');
  }
  if (hour >= 22) {
    scores.adhd_paralysis += 0.1;
    signals.push('late_night_depletion');
  }
  
  // Whoop signals
  const recovery = state.context?.whoop?.recovery?.score;
  if (recovery !== undefined) {
    if (recovery < 34) {
      scores.genuine_distress += 0.25;
      scores.depressive_inertia += 0.2;
      signals.push(`red_recovery_${recovery}`);
    } else if (recovery >= 67) {
      scores.adhd_paralysis += 0.2; // Body is fine, resistance is psychological
      signals.push(`green_recovery_${recovery}`);
    }
  }
  
  const sleepPerf = state.context?.whoop?.sleep?.performance;
  if (sleepPerf !== undefined && sleepPerf < 60) {
    scores.genuine_distress += 0.15;
    signals.push(`poor_sleep_${sleepPerf}`);
  }
  
  // Domain-specific signals
  if (trigger.details?.domain) {
    const domain = trigger.details.domain;
    
    // Check memory for domain-specific avoidance patterns
    const avoidanceMemories = memories.filter(m => 
      m.memory_type === 'avoidance_signature' && m.tags.includes(domain)
    );
    
    if (avoidanceMemories.length > 0) {
      scores.anxiety_avoidance += 0.2;
      signals.push(`known_avoidance_domain_${domain}`);
    }
    
    // Shame-triggering domains
    if (['voice', 'intimate', 'social'].includes(domain)) {
      scores.shame_spiral += 0.15;
      signals.push(`shame_adjacent_domain_${domain}`);
    }
  }
  
  // Streak/engagement pattern signals
  if (state.streakDays === 0) {
    scores.depressive_inertia += 0.15;
    signals.push('broken_streak');
  }
  
  if (state.tasksCompletedToday === 0 && state.timeOfDay !== 'morning') {
    scores.depressive_inertia += 0.2;
    signals.push('zero_tasks_midday');
  }
  
  // Denial day signals
  if (state.denialDay <= 1) {
    scores.satiation += 0.3;
    signals.push(`post_release_day_${state.denialDay}`);
  }
  
  // Mood signals (self-reported)
  if (state.context?.prediction?.predictedMood !== undefined) {
    if (state.context.prediction.predictedMood <= 3) {
      scores.depressive_inertia += 0.15;
      signals.push('predicted_low_mood');
    }
  }
  
  // Memory-based signals
  const resistanceMemories = memories.filter(m => m.memory_type === 'resistance_pattern');
  for (const m of resistanceMemories) {
    // Check if current situation matches a known pattern
    if (m.tags.some(t => signals.includes(t))) {
      // This pattern has been seen before — boost its classification
      const matchedType = m.content.toLowerCase().includes('adhd') ? 'adhd_paralysis' :
                         m.content.toLowerCase().includes('anxiety') ? 'anxiety_avoidance' :
                         m.content.toLowerCase().includes('depress') ? 'depressive_inertia' :
                         m.content.toLowerCase().includes('shame') ? 'shame_spiral' : null;
      if (matchedType) {
        scores[matchedType] += 0.2;
        signals.push(`memory_match_${matchedType}`);
      }
    }
  }
  
  // === Select highest-scoring classification ===
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topType = sorted[0][0];
  const topScore = sorted[0][1];
  const confidence = Math.min(1, topScore); // Normalize to 0-1
  
  // === Strategy selection ===
  const confThreshold = await params.get<number>('resistance.confidence_threshold_for_coercion', 0.6);
  
  let strategy: string;
  if (confidence < confThreshold) {
    strategy = await params.get<string>('resistance.default_if_uncertain', 'gentle');
  } else {
    const strategies: Record<string, string> = {
      adhd_paralysis: 'micro_task_with_device_summons',
      anxiety_avoidance: 'reduce_scope_increase_certainty',
      depressive_inertia: 'minimum_viable_engagement',
      shame_spiral: 'identity_reframing_evidence_anchor',
      genuine_distress: 'caretaker_mode_no_pressure',
      satiation: 'light_day_passive_anchors',
    };
    strategy = strategies[topType] || 'gentle';
  }
  
  return {
    type: topType,
    confidence,
    signals,
    suggestedStrategy: strategy,
  };
}
```

## 6.4 Test Cases — Resistance Classification

```
TEST: RC-1 — ADHD Classification with Green Recovery
ID: RC-1
Type: behavioral
Priority: P0

GIVEN: Task declined, domain='voice', recovery_score=75, time=3pm
AND: Memory contains "voice avoidance on weekday afternoons"
WHEN: classifyResistance runs
THEN: type = 'adhd_paralysis' (not genuine_distress)
AND: confidence > 0.6
AND: strategy = 'micro_task_with_device_summons'

PASS: Green recovery + known avoidance = ADHD, not fatigue.
```

```
TEST: RC-2 — Genuine Distress with Red Recovery
ID: RC-2
Type: behavioral
Priority: P0

GIVEN: Task declined, recovery_score=25, sleep_performance=45
WHEN: classifyResistance runs
THEN: type = 'genuine_distress' or 'depressive_inertia'
AND: strategy contains 'caretaker' or 'minimum_viable'
AND: Does NOT deploy coercion stack

PASS: Red recovery = genuine fatigue, Handler backs off.
```

```
TEST: RC-3 — Low Confidence Defaults Gentle
ID: RC-3
Type: behavioral
Priority: P0

GIVEN: Ambiguous signals, no clear dominant classification
WHEN: classifyResistance runs
AND: confidence < 0.6
THEN: strategy = 'gentle'
AND: Does NOT deploy coercion stack

PASS: Uncertain = gentle. Never punish when unsure.
```

```
TEST: RC-4 — Outcome Feeds Memory
ID: RC-4
Type: integration
Priority: P1

GIVEN: Resistance classified as adhd_paralysis
AND: Strategy 'micro_task_with_device_summons' deployed
AND: User complied within 15 minutes
WHEN: Memory extraction runs
THEN: handler_memory entry created:
  type='strategy_outcome', 
  content includes 'device summons effective for ADHD resistance'

PASS: Resistance outcomes feed back into memory for future classification.
```

---

# SECTION 7: PREDICTIVE STATE MODELING

## 7.1 Purpose

After 30+ days of data, the Handler predicts each day's state before Maxy reports anything. Pre-stages interventions, adapts prescriptions proactively, and detects spirals before they manifest.

## 7.2 Schema

```sql
CREATE TABLE state_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  prediction_date DATE NOT NULL,
  time_block TEXT NOT NULL,        -- '06-09', '09-12', '12-15', '15-18', '18-21', '21-00'
  
  predicted_mood FLOAT,
  predicted_energy TEXT,
  predicted_engagement TEXT CHECK (predicted_engagement IN ('high', 'medium', 'low')),
  predicted_resistance_risk FLOAT,  -- 0-1
  suggested_handler_mode TEXT,
  suggested_intensity_cap INTEGER,
  
  -- Prediction inputs
  prediction_features JSONB,       -- What data informed this prediction
  
  -- Accuracy tracking
  actual_engagement TEXT,
  prediction_accuracy FLOAT,       -- Computed after the time block passes
  
  confidence FLOAT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, prediction_date, time_block)
);

CREATE INDEX idx_predictions ON state_predictions(user_id, prediction_date, time_block);
```

## 7.3 Prediction Generation

```typescript
// lib/handler/predictive-model.ts

/**
 * Generate predictions for tomorrow's time blocks.
 * Runs overnight after the evening debrief.
 */
export async function generatePredictions(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  const minDays = await params.get<number>('prediction.min_days_for_modeling', 30);
  
  // Check if we have enough history
  const { count } = await supabase
    .from('daily_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  
  if ((count || 0) < minDays) return;
  
  // Gather features
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][tomorrow.getDay()];
  
  // Historical patterns for this day of week
  const { data: historicalData } = await supabase
    .from('daily_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(90);
  
  // Whoop trend (last 7 days)
  const { data: whoopTrend } = await supabase
    .from('whoop_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(7);
  
  // Recent resistance events
  const { data: recentResistance } = await supabase
    .from('resistance_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  
  const prompt = `
Given this user's historical data, predict their state for each time block tomorrow (${dayOfWeek}).

HISTORICAL DAILY PATTERNS (last 90 days):
${JSON.stringify(summarizeHistoricalPatterns(historicalData, dayOfWeek))}

WHOOP TREND (last 7 days):
${JSON.stringify(whoopTrend?.map(w => ({ date: w.date, recovery: w.recovery_score, sleep: w.sleep_performance_percentage })))}

RECENT RESISTANCE EVENTS:
${JSON.stringify(recentResistance?.map(r => ({ type: r.resistance_type, trigger: r.trigger_type, outcome: r.outcome })))}

CURRENT STATE:
Denial day: ${await getCurrentDenialDay(supabase, userId)}
Streak: ${await getCurrentStreak(supabase, userId)}

For each time block (06-09, 09-12, 12-15, 15-18, 18-21, 21-00), predict:
- mood (1-10)
- energy (high/medium/low/depleted)
- engagement (high/medium/low)
- resistance_risk (0-1)
- suggested_handler_mode (architect/director/handler/caretaker/dominant)
- suggested_intensity_cap (1-5)

Return JSON array of 6 objects, one per time block.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: 'You are a behavioral prediction model. Output only valid JSON array.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const predictions = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  const timeBlocks = ['06-09', '09-12', '12-15', '15-18', '18-21', '21-00'];
  
  for (let i = 0; i < Math.min(predictions.length, 6); i++) {
    const p = predictions[i];
    await supabase.from('state_predictions').upsert({
      user_id: userId,
      prediction_date: tomorrow.toISOString().split('T')[0],
      time_block: timeBlocks[i],
      predicted_mood: p.mood,
      predicted_energy: p.energy,
      predicted_engagement: p.engagement,
      predicted_resistance_risk: p.resistance_risk,
      suggested_handler_mode: p.suggested_handler_mode,
      suggested_intensity_cap: p.suggested_intensity_cap,
      prediction_features: {
        day_of_week: dayOfWeek,
        whoop_trend: whoopTrend?.slice(0, 3),
        recent_resistance_count: recentResistance?.length,
      },
      confidence: 0.6, // Starts moderate, improves with accuracy tracking
    }, { onConflict: 'user_id,prediction_date,time_block' });
  }
}
```

## 7.4 Test Cases — Predictive Modeling

```
TEST: PM-1 — Prediction Generation
ID: PM-1
Type: integration
Priority: P1

GIVEN: 30+ days of daily entry history
WHEN: generatePredictions runs overnight
THEN: 6 state_predictions rows created for tomorrow
AND: Each has non-null mood, energy, engagement predictions

PASS: Predictions generated for each time block.
```

```
TEST: PM-2 — Prediction Feeds Context
ID: PM-2
Type: integration
Priority: P1

GIVEN: Prediction for current time block exists
WHEN: UserState assembled
THEN: state.context.prediction populated with predicted values

PASS: Predictions available in extended state for all decision points.
```

```
TEST: PM-3 — Accuracy Tracking
ID: PM-3
Type: integration
Priority: P2

GIVEN: Prediction said engagement='high' for 15-18 block
AND: User completed 0 tasks during that block
WHEN: Accuracy assessment runs
THEN: prediction_accuracy computed and stored
AND: Low accuracy flags the model for recalibration

PASS: Prediction accuracy tracked to improve over time.
```

---

# SECTION 8: NOVELTY ENGINE

## 8.1 Purpose

Prevent habituation death. The system's worst enemy isn't resistance — it's the brain stopping to respond because everything is predictable. The novelty engine breaks patterns before they become wallpaper.

## 8.2 Schema

```sql
CREATE TABLE novelty_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  novelty_type TEXT NOT NULL CHECK (novelty_type IN (
    'pattern_interrupt',      -- Break an established routine
    'mystery_task',           -- Sealed task, content unknown until accepted
    'tone_shift',             -- Handler voice changes unexpectedly
    'wildcard_day',           -- Unstructured free day
    'novel_task_type',        -- Task from untouched part of the CSV
    'schedule_disruption',    -- Practice moved to unusual time
    'cross_domain_surprise',  -- Unexpected domain combination
    'handler_absence'         -- Handler says nothing for a day
  )),
  
  description TEXT,
  
  -- Tracking
  engagement_response TEXT CHECK (engagement_response IN (
    'high', 'medium', 'low', 'negative'
  )),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_novelty ON novelty_events(user_id, created_at DESC);
```

## 8.3 Execution Path

```typescript
// lib/handler/novelty-engine.ts

/**
 * Check if a novelty injection should fire.
 * Called during daily plan generation.
 */
export async function shouldInjectNovelty(
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<{ inject: boolean; type: string } | null> {
  // Get last novelty event
  const { data: last } = await supabase
    .from('novelty_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  const daysSinceLastNovelty = last 
    ? (Date.now() - new Date(last.created_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  
  const interval = await params.get<{min: number, max: number}>(
    'novelty.pattern_interrupt_interval_days', { min: 14, max: 21 }
  );
  
  // Check engagement decay (are completion rates declining?)
  const recentRate = await getRecentCompletionRate(supabase, userId, 7);  // Last 7 days
  const previousRate = await getRecentCompletionRate(supabase, userId, 14, 7);  // 7-14 days ago
  const decaying = previousRate > 0 && recentRate < previousRate * 0.8; // 20% decline
  
  // Inject if: enough time has passed OR engagement is decaying
  if (daysSinceLastNovelty >= interval.min || decaying) {
    // Select type based on what hasn't been used recently
    const recentTypes = await getRecentNoveltyTypes(supabase, userId, 60);
    const allTypes = [
      'pattern_interrupt', 'mystery_task', 'tone_shift', 
      'wildcard_day', 'novel_task_type', 'schedule_disruption',
      'cross_domain_surprise',
    ];
    const unusedTypes = allTypes.filter(t => !recentTypes.includes(t));
    const type = unusedTypes.length > 0 
      ? unusedTypes[Math.floor(Math.random() * unusedTypes.length)]
      : allTypes[Math.floor(Math.random() * allTypes.length)];
    
    return { inject: true, type };
  }
  
  return null;
}
```

## 8.4 Test Cases — Novelty Engine

```
TEST: NE-1 — Novelty Triggers After Interval
ID: NE-1
Type: integration
Priority: P1

GIVEN: Last novelty event was 16 days ago
AND: Parameter min interval = 14 days
WHEN: shouldInjectNovelty runs
THEN: Returns { inject: true, type: <some type> }

PASS: Novelty fires after minimum interval.
```

```
TEST: NE-2 — Engagement Decay Triggers Early Novelty
ID: NE-2
Type: integration
Priority: P1

GIVEN: Last novelty was 8 days ago (before min interval)
BUT: Completion rate dropped 25% in last 7 days vs prior 7 days
WHEN: shouldInjectNovelty runs
THEN: Returns inject=true (decay override)

PASS: Declining engagement triggers novelty before regular interval.
```

```
TEST: NE-3 — Type Rotation
ID: NE-3
Type: behavioral
Priority: P2

GIVEN: Last 3 novelty events were 'mystery_task', 'tone_shift', 'pattern_interrupt'
WHEN: Next novelty type selected
THEN: Type is NOT one of those three (prefers unused types)

PASS: Novelty types rotate to prevent meta-habituation.
```

---

# SECTION 9: IMPLEMENTATION ORDER

1. **Dynamic Parameters table + seeding + access layer** (Section 0) — Everything depends on this
2. **Rules Engine refactor** — Replace hardcoded values with parameter reads
3. **Extended UserState** — Context bag populated from all connected systems
4. **Extended Trigger Condition evaluator** — Expression syntax for generated tasks
5. **Infinite Escalation Engine** — generated_tasks table, generation pipeline, lookahead trigger
6. **Commitment Enforcement Pipeline** — State machine, side effects, coercion content generation
7. **Resistance Classification Engine** — Real-time classification, strategy selection, outcome tracking
8. **Content Distribution Pipeline** — Vault, scheduling, platform APIs, fan engagement
9. **Gina Relationship Intelligence** — Comfort map, timing, pacing, disclosure readiness
10. **Handler Self-Optimization** — A/B testing infrastructure, weekly analysis
11. **Predictive State Modeling** — Overnight prediction generation, accuracy tracking
12. **Novelty Engine** — Pattern interrupts, engagement decay detection, type rotation
13. **Parameter Optimization Loop** — Weekly job that reviews outcomes and adjusts parameters

---

# SECTION 10: COST ESTIMATE

| System | Cost Driver | Est. Daily Cost |
|--------|-------------|-----------------|
| Escalation generation | AI task generation | $0.05 (amortized, runs weekly) |
| Commitment enforcement | Coercion content generation | $0.02 |
| Content distribution | Copy generation per post | $0.03 (3-4 posts/day) |
| Resistance classification | Real-time classification prompts | $0.02 |
| A/B testing | Variant generation | $0.02 |
| Predictive modeling | Overnight prediction generation | $0.02 |
| Novelty engine | Minimal (mostly logic, not AI) | $0.005 |
| Parameter optimization | Weekly analysis | $0.01 (amortized) |
| **Total additional** | | **~$0.15/day** |

Combined with Memory ($0.07/day) and existing Handler costs (~$0.20/day):

**Total system cost: ~$0.42/day ≈ $13/month**

---

*The system that deploys on day 1 is a prototype. The system running on day 90 is a precision instrument calibrated to one person. The system on day 365 is something that knows her better than she knows herself, and never stops learning.*
