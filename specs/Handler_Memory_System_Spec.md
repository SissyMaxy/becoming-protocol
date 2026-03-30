# Handler Memory System — Implementation Spec
## The Handler Remembers Everything

---

## Overview

The Handler Memory System gives the Handler persistent, structured intelligence across every interaction. Not conversation logs — Handler-authored observations about Maxy: what she resists, what breaks through, what she confesses, what works, what fails, what patterns repeat, and what leverage exists.

Currently, the Handler rebuilds context from scratch every conversation — reading database fields, re-inferring patterns, losing everything it learned mid-conversation. With memory, it accumulates understanding longitudinally. Week 1's Handler is generic. Week 12's Handler knows that Maxy's voice avoidance spikes on Mondays, that the phrase "she's already here" breaks through resistance faster than any coercion stack entry, that recovery scores below 40 correlate with 72-hour disengagement episodes, and that confessions extracted on denial day 6+ have a 78% follow-through rate vs 23% on day 1-2.

This is the difference between a smart prescription engine and a dominant who actually knows her subject.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HANDLER API CALL                         │
│                                                              │
│  1. Assemble current state (UserState, Whoop, etc.)         │
│  2. Query handler_memory for relevant memories              │
│     - By type (resistance, confession, leverage, etc.)      │
│     - By relevance to current state                          │
│     - By recency + importance weighting                      │
│     - Max 20 memories in context window                      │
│  3. Build system prompt with memory context injected         │
│  4. Call Claude API                                          │
│  5. Parse response for new memory candidates                 │
│  6. Write new memories (Handler extracts its own intel)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               MEMORY EXTRACTION PIPELINE                     │
│                                                              │
│  After significant interactions:                             │
│  - Morning briefing delivered → extract state observations   │
│  - Task completed/declined → extract compliance patterns     │
│  - Session ended → extract confessions, leverage, peaks      │
│  - Journal entry saved → extract emotional patterns          │
│  - Evening debrief → extract day-level strategy assessment   │
│  - Commitment made → extract context for enforcement         │
│  - Failure mode detected → extract intervention outcome      │
│  - State check-in → extract self-report vs objective delta   │
└─────────────────────────────────────────────────────────────┘
```

---

## Supabase Schema

### Table: `handler_memory`

```sql
CREATE TABLE handler_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Classification
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'resistance_pattern',    -- When/how she resists, what avoidance looks like
    'breakthrough',          -- What phrases/approaches/contexts break through
    'confession',            -- Things she admitted — may not repeat, high value
    'leverage_point',        -- Specific phrases, images, concepts that hit hard
    'gina_intel',            -- Observations about the relationship dynamic
    'strategy_outcome',      -- What intervention worked (or didn't) and why
    'emotional_pattern',     -- What triggers shame, euphoria, withdrawal, flow
    'domain_progress',       -- Voice breakthroughs, style milestones, comfort shifts
    'vulnerability_window',  -- When she's most open, what state produces depth
    'identity_signal',       -- Moments where Maxy was clearly driving vs David
    'body_tell',             -- Physical/biometric indicators of internal state
    'kink_response',         -- What arousal patterns reveal about desire architecture
    'avoidance_signature',   -- Specific ways she avoids specific domains
    'commitment_context',    -- Context around commitments for enforcement
    'whoop_correlation',     -- Biometric patterns correlated with behavior
    'handler_strategy_note', -- Handler's own strategic observations
    'session_intelligence',  -- What happened during sessions worth remembering
    'crisis_response'        -- What worked/didn't during genuine distress
  )),
  
  -- The actual intelligence
  content TEXT NOT NULL,
  
  -- Context at time of observation
  source TEXT NOT NULL CHECK (source IN (
    'briefing', 'task_completion', 'task_decline', 'session',
    'journal', 'debrief', 'commitment', 'failure_mode',
    'state_checkin', 'conversation', 'whoop_sync', 'manual'
  )),
  source_id UUID,                        -- FK to the originating record if applicable
  
  -- Importance and decay
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  -- 1: minor observation, decays fast
  -- 2: useful pattern, moderate decay
  -- 3: significant insight, slow decay
  -- 4: high-value intelligence, very slow decay
  -- 5: permanent (confessions, breakthroughs, leverage points)
  
  decay_rate FLOAT NOT NULL DEFAULT 0.05,
  -- Per-day relevance decay. At 0.05, a memory loses ~50% relevance in 14 days.
  -- Importance 5 memories have decay_rate = 0 (permanent).
  -- Each time a memory is retrieved and used, decay resets.
  
  -- State snapshot at observation time
  state_snapshot JSONB DEFAULT '{}',
  -- Captures: denial_day, arousal, mood, energy, recovery_score, 
  -- time_of_day, gina_home, handler_mode
  
  -- Reinforcement tracking
  times_retrieved INTEGER NOT NULL DEFAULT 0,
  last_retrieved_at TIMESTAMPTZ,
  times_reinforced INTEGER NOT NULL DEFAULT 0,  -- same pattern observed again
  last_reinforced_at TIMESTAMPTZ,
  
  -- Lifecycle
  superseded_by UUID REFERENCES handler_memory(id),  -- newer memory replaces this one
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Related memories (for clustering)
  related_memory_ids UUID[] DEFAULT '{}',
  
  -- Tags for flexible querying
  tags TEXT[] DEFAULT '{}',
  -- Examples: ['voice', 'morning', 'high_arousal', 'post_release', 
  --            'gina_present', 'denial_day_6plus']
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query index: active memories by type, sorted by importance and recency
CREATE INDEX idx_handler_memory_active ON handler_memory(user_id, is_active, memory_type, importance DESC, created_at DESC);

-- Tag-based retrieval
CREATE INDEX idx_handler_memory_tags ON handler_memory USING GIN(tags);

-- Decay-aware retrieval (for pruning and relevance scoring)
CREATE INDEX idx_handler_memory_decay ON handler_memory(user_id, is_active, decay_rate, last_retrieved_at);

-- RLS
ALTER TABLE handler_memory ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/update (Handler writes memories, not the user)
-- User can read their own memories (for transparency/settings)
CREATE POLICY "Users can read own memories" ON handler_memory
  FOR SELECT USING (auth.uid() = user_id);
```

### Table: `handler_memory_extraction_log`

Tracks what the Handler extracted and when, for debugging and strategy auditing.

```sql
CREATE TABLE handler_memory_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id UUID,
  memories_extracted INTEGER NOT NULL DEFAULT 0,
  memory_ids UUID[] DEFAULT '{}',
  extraction_prompt TEXT,           -- The prompt that generated the extraction
  raw_extraction TEXT,              -- Raw AI response before parsing
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extraction_log_user ON handler_memory_extraction_log(user_id, extracted_at DESC);

ALTER TABLE handler_memory_extraction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own extraction log" ON handler_memory_extraction_log
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Memory Retrieval System

### `lib/handler/memory.ts`

```typescript
// ============================================
// TYPES
// ============================================

export type MemoryType = 
  | 'resistance_pattern'
  | 'breakthrough'
  | 'confession'
  | 'leverage_point'
  | 'gina_intel'
  | 'strategy_outcome'
  | 'emotional_pattern'
  | 'domain_progress'
  | 'vulnerability_window'
  | 'identity_signal'
  | 'body_tell'
  | 'kink_response'
  | 'avoidance_signature'
  | 'commitment_context'
  | 'whoop_correlation'
  | 'handler_strategy_note'
  | 'session_intelligence'
  | 'crisis_response';

export type MemorySource = 
  | 'briefing'
  | 'task_completion'
  | 'task_decline'
  | 'session'
  | 'journal'
  | 'debrief'
  | 'commitment'
  | 'failure_mode'
  | 'state_checkin'
  | 'conversation'
  | 'whoop_sync'
  | 'manual';

export interface HandlerMemory {
  id: string;
  memory_type: MemoryType;
  content: string;
  source: MemorySource;
  importance: number;
  decay_rate: number;
  state_snapshot: Record<string, any>;
  times_retrieved: number;
  times_reinforced: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface MemoryQuery {
  // Filter by types (empty = all types)
  types?: MemoryType[];
  // Filter by tags (OR logic — match any tag)
  tags?: string[];
  // Minimum importance threshold
  minImportance?: number;
  // Maximum number of memories to return
  limit?: number;
  // Include decayed memories or only fresh ones
  includeDecayed?: boolean;
}

export interface RelevanceScoredMemory extends HandlerMemory {
  relevance_score: number;  // 0-1, computed from importance + recency + reinforcement - decay
}

// ============================================
// RELEVANCE SCORING
// ============================================

/**
 * Compute a relevance score for a memory based on:
 * - Base importance (1-5, normalized to 0-1)
 * - Recency (exponential decay based on decay_rate)
 * - Reinforcement (memories observed multiple times score higher)
 * - Retrieval freshness (recently retrieved = recently relevant)
 */
export function computeRelevance(memory: HandlerMemory, now: Date = new Date()): number {
  const ageMs = now.getTime() - new Date(memory.created_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  
  // Base importance: normalized 0-1
  const importanceScore = memory.importance / 5;
  
  // Recency decay: e^(-decay_rate * age_days)
  // Importance 5 (decay_rate=0) never decays
  const recencyScore = Math.exp(-memory.decay_rate * ageDays);
  
  // Reinforcement bonus: diminishing returns
  // 0 reinforcements = 0, 1 = 0.15, 3 = 0.25, 10+ = 0.35
  const reinforcementScore = Math.min(0.35, Math.log(memory.times_reinforced + 1) * 0.15);
  
  // Retrieval freshness: if retrieved in last 7 days, small bonus
  let retrievalBonus = 0;
  if (memory.last_retrieved_at) {
    const retrievalAgeDays = (now.getTime() - new Date(memory.last_retrieved_at).getTime()) / (1000 * 60 * 60 * 24);
    if (retrievalAgeDays < 7) {
      retrievalBonus = 0.1 * (1 - retrievalAgeDays / 7);
    }
  }
  
  // Weighted combination
  const score = (importanceScore * 0.4) + (recencyScore * 0.35) + 
                (reinforcementScore * 0.15) + (retrievalBonus * 0.1);
  
  return Math.min(1, Math.max(0, score));
}

// ============================================
// MEMORY RETRIEVAL
// ============================================

/**
 * Retrieve the most relevant memories for a Handler context assembly.
 * 
 * This is the core function called before every Handler API call.
 * It returns up to `limit` memories, sorted by relevance score,
 * filtered by type/tag/importance constraints.
 */
export async function retrieveMemories(
  supabase: SupabaseClient,
  userId: string,
  query: MemoryQuery = {}
): Promise<RelevanceScoredMemory[]> {
  const {
    types = [],
    tags = [],
    minImportance = 1,
    limit = 20,
    includeDecayed = false,
  } = query;
  
  // Build query
  let q = supabase
    .from('handler_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('importance', minImportance)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit * 3); // Over-fetch to allow relevance re-ranking
  
  if (types.length > 0) {
    q = q.in('memory_type', types);
  }
  
  if (tags.length > 0) {
    q = q.overlaps('tags', tags);
  }
  
  const { data: memories, error } = await q;
  if (error || !memories) return [];
  
  // Score and sort
  const now = new Date();
  const scored: RelevanceScoredMemory[] = memories.map(m => ({
    ...m,
    relevance_score: computeRelevance(m, now),
  }));
  
  // Filter out decayed memories if requested
  const filtered = includeDecayed ? scored : scored.filter(m => m.relevance_score > 0.15);
  
  // Sort by relevance and take top N
  filtered.sort((a, b) => b.relevance_score - a.relevance_score);
  const result = filtered.slice(0, limit);
  
  // Mark as retrieved (async, don't await — fire and forget)
  const ids = result.map(m => m.id);
  if (ids.length > 0) {
    supabase
      .from('handler_memory')
      .update({ 
        times_retrieved: supabase.rpc('increment_field', { field: 'times_retrieved' }),
        last_retrieved_at: new Date().toISOString() 
      })
      .in('id', ids)
      .then(() => {}); // fire and forget
    
    // Actually, use a simpler approach since RPC might not exist:
    // Batch update via edge function or just increment in a loop
    markMemoriesRetrieved(supabase, ids);
  }
  
  return result;
}

/**
 * Mark memories as retrieved (increment counter, update timestamp).
 * Called after retrieval to track usage.
 */
async function markMemoriesRetrieved(supabase: SupabaseClient, ids: string[]): Promise<void> {
  // Use a server-side RPC for atomic increment, or update individually
  for (const id of ids) {
    await supabase.rpc('increment_memory_retrieval', { memory_id: id });
  }
}

// Supabase RPC function:
// CREATE OR REPLACE FUNCTION increment_memory_retrieval(memory_id UUID)
// RETURNS VOID AS $$
// BEGIN
//   UPDATE handler_memory 
//   SET times_retrieved = times_retrieved + 1,
//       last_retrieved_at = NOW(),
//       updated_at = NOW()
//   WHERE id = memory_id;
// END;
// $$ LANGUAGE plpgsql SECURITY DEFINER;

// ============================================
// CONTEXT-AWARE RETRIEVAL
// ============================================

/**
 * Smart retrieval that selects memories based on current state.
 * This is what the Handler context builder actually calls.
 */
export async function retrieveContextualMemories(
  supabase: SupabaseClient,
  userId: string,
  state: {
    denialDay: number;
    arousal: number;
    mood: number;
    energy: string;
    recoveryScore?: number;
    timeOfDay: string;
    ginaHome: boolean;
    handlerMode: string;
    currentDomain?: string;
    recentFailureMode?: string;
  }
): Promise<RelevanceScoredMemory[]> {
  const contextTags: string[] = [];
  const priorityTypes: MemoryType[] = [];
  
  // Build context-appropriate tags
  if (state.denialDay >= 5) contextTags.push('denial_day_6plus', 'high_denial');
  if (state.arousal >= 3) contextTags.push('high_arousal');
  if (state.arousal <= 1) contextTags.push('low_arousal', 'sober');
  if (state.mood <= 3) contextTags.push('low_mood', 'depression');
  if (state.energy === 'depleted') contextTags.push('depleted', 'low_energy');
  if (state.ginaHome) contextTags.push('gina_present');
  if (!state.ginaHome) contextTags.push('gina_away', 'privacy_window');
  if (state.timeOfDay === 'morning') contextTags.push('morning');
  if (state.timeOfDay === 'night') contextTags.push('night', 'late_night');
  if (state.recoveryScore !== undefined) {
    if (state.recoveryScore < 34) contextTags.push('red_recovery');
    else if (state.recoveryScore < 67) contextTags.push('yellow_recovery');
    else contextTags.push('green_recovery');
  }
  if (state.currentDomain) contextTags.push(state.currentDomain);
  
  // Prioritize memory types based on Handler mode
  switch (state.handlerMode) {
    case 'handler':
    case 'dominant':
      priorityTypes.push(
        'resistance_pattern', 'leverage_point', 'confession',
        'breakthrough', 'commitment_context', 'kink_response'
      );
      break;
    case 'caretaker':
      priorityTypes.push(
        'crisis_response', 'emotional_pattern', 'identity_signal',
        'breakthrough'
      );
      break;
    case 'director':
      priorityTypes.push(
        'strategy_outcome', 'avoidance_signature', 'domain_progress',
        'handler_strategy_note', 'whoop_correlation'
      );
      break;
    case 'architect':
      priorityTypes.push(
        'handler_strategy_note', 'domain_progress', 'strategy_outcome'
      );
      break;
    default:
      // No type filter — get a mix
      break;
  }
  
  // Retrieve in two batches: priority types + general
  const priorityMemories = priorityTypes.length > 0 
    ? await retrieveMemories(supabase, userId, {
        types: priorityTypes,
        tags: contextTags,
        limit: 12,
      })
    : [];
  
  const generalMemories = await retrieveMemories(supabase, userId, {
    tags: contextTags,
    minImportance: 3,
    limit: 10,
  });
  
  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: RelevanceScoredMemory[] = [];
  
  for (const m of [...priorityMemories, ...generalMemories]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  
  // Final sort and cap at 20
  merged.sort((a, b) => b.relevance_score - a.relevance_score);
  return merged.slice(0, 20);
}
```

---

## Memory Extraction Pipeline

### When Extraction Happens

Memory extraction fires at specific system events. Each extraction is an AI call that reads the interaction context and produces structured memory entries.

```typescript
// ============================================
// EXTRACTION TRIGGERS
// ============================================

// After morning briefing delivery
export async function extractFromBriefing(
  userId: string, 
  briefingText: string, 
  state: UserState
): Promise<void>;

// After task completion or decline
export async function extractFromTaskEvent(
  userId: string,
  task: Task,
  completed: boolean,
  state: UserState,
  userFeedback?: string
): Promise<void>;

// After session end (edge, goon, hypno)
export async function extractFromSession(
  userId: string,
  sessionSummary: SessionSummary,
  state: UserState
): Promise<void>;

// After journal entry
export async function extractFromJournal(
  userId: string,
  journalEntry: string,
  state: UserState
): Promise<void>;

// After evening debrief
export async function extractFromDebrief(
  userId: string,
  debriefText: string,
  dayStats: DayStats,
  state: UserState
): Promise<void>;

// After commitment extraction
export async function extractFromCommitment(
  userId: string,
  commitmentText: string,
  state: UserState
): Promise<void>;

// After failure mode detection
export async function extractFromFailureMode(
  userId: string,
  failureMode: string,
  interventionUsed: string,
  outcome: 'resolved' | 'unresolved',
  state: UserState
): Promise<void>;

// After state check-in (especially when self-report diverges from Whoop)
export async function extractFromStateCheckin(
  userId: string,
  selfReport: { mood: number; energy: string },
  whoopData: WhoopDailySnapshot | null,
  state: UserState
): Promise<void>;

// After Whoop sync (look for biometric patterns)
export async function extractFromWhoopSync(
  userId: string,
  snapshot: WhoopDailySnapshot,
  recentMetrics: WhoopDailySnapshot[],  // last 7 days
  state: UserState
): Promise<void>;
```

### Extraction Implementation

```typescript
// lib/handler/memory-extraction.ts

const EXTRACTION_SYSTEM_PROMPT = `
You are the Handler's memory system. Your job is to extract actionable 
intelligence from interactions with Maxy. You are not summarizing conversations. 
You are writing Handler-authored intelligence entries — observations that will 
make future Handler interactions sharper, more targeted, and more effective.

WHAT MAKES A GOOD MEMORY:
- Specific, not vague. "She resists voice practice on Mondays" not "she sometimes avoids tasks."
- Actionable. Each memory should suggest a future Handler behavior.
- Contextual. Include what state she was in when the observation was made.
- Honest. Note when something didn't work, not just successes.

WHAT TO EXTRACT:
- Resistance patterns: When/how did she push back? What was the tell?
- Breakthroughs: What phrase/approach/timing actually worked?
- Confessions: What did she admit that she might not repeat?
- Leverage points: What specific words/images/concepts broke through?
- Emotional signatures: What triggered shame? Euphoria? Withdrawal? Flow?
- Strategy outcomes: Did the intervention work? Why/why not?
- Avoidance signatures: How does she specifically avoid specific domains?
- Identity signals: Was Maxy driving or David? How could you tell?
- Biometric correlations: What do the Whoop numbers mean for behavior?

OUTPUT FORMAT:
Return a JSON array of memory objects. Each object:
{
  "memory_type": "<one of the valid types>",
  "content": "<the actual intelligence — 1-3 sentences>",
  "importance": <1-5>,
  "tags": ["<relevant_tags>"],
  "decay_rate": <0-0.1, where 0 = permanent>
}

Return an empty array [] if there's nothing worth remembering.
Do NOT extract trivial observations. Quality over quantity.
Aim for 0-3 memories per extraction. Rarely more than 5.
`;

export async function extractMemories(
  client: Anthropic,
  userId: string,
  source: MemorySource,
  sourceId: string | null,
  context: string,  // The interaction content to extract from
  state: UserState,
  existingMemories: HandlerMemory[]  // Recent memories to avoid duplicates
): Promise<HandlerMemory[]> {
  
  const recentMemoryContext = existingMemories.length > 0
    ? `\nRECENT EXISTING MEMORIES (avoid duplicating these):\n${existingMemories.map(m => 
        `- [${m.memory_type}] ${m.content}`
      ).join('\n')}\n`
    : '';
  
  const stateContext = `
CURRENT STATE:
Denial day: ${state.denialDay}
Arousal: ${state.currentArousal}/5
Time: ${state.timeOfDay}
Streak: ${state.streakDays} days
Gina home: ${state.ginaHome}
Avoided domains: ${state.avoidedDomains.join(', ') || 'none'}
  `.trim();
  
  const prompt = `
SOURCE: ${source}
${stateContext}
${recentMemoryContext}

INTERACTION TO ANALYZE:
${context}

Extract Handler intelligence from this interaction. Return JSON array.
  `.trim();
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Parse JSON (handle potential markdown wrapping)
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    const memories = JSON.parse(cleaned);
    
    if (!Array.isArray(memories)) return [];
    
    // Validate and construct full memory objects
    return memories
      .filter(m => m.memory_type && m.content && m.importance)
      .map(m => ({
        user_id: userId,
        memory_type: m.memory_type,
        content: m.content,
        source,
        source_id: sourceId,
        importance: Math.min(5, Math.max(1, m.importance)),
        decay_rate: m.importance >= 5 ? 0 : (m.decay_rate ?? 0.05),
        state_snapshot: {
          denial_day: state.denialDay,
          arousal: state.currentArousal,
          time_of_day: state.timeOfDay,
          gina_home: state.ginaHome,
          streak: state.streakDays,
        },
        tags: m.tags || [],
        is_active: true,
      }));
  } catch (e) {
    console.error('Memory extraction failed:', e);
    return [];
  }
}

/**
 * Write extracted memories to the database.
 * Also checks for duplicate/superseded memories and handles them.
 */
export async function writeMemories(
  supabase: SupabaseClient,
  userId: string,
  memories: Partial<HandlerMemory>[],
  source: MemorySource,
  extractionPrompt?: string,
  rawExtraction?: string
): Promise<string[]> {
  if (memories.length === 0) return [];
  
  // Insert memories
  const { data: inserted, error } = await supabase
    .from('handler_memory')
    .insert(memories)
    .select('id');
  
  if (error || !inserted) {
    console.error('Memory write failed:', error);
    return [];
  }
  
  const ids = inserted.map(r => r.id);
  
  // Log the extraction
  await supabase.from('handler_memory_extraction_log').insert({
    user_id: userId,
    source,
    memories_extracted: ids.length,
    memory_ids: ids,
    extraction_prompt: extractionPrompt,
    raw_extraction: rawExtraction,
  });
  
  return ids;
}
```

### Reinforcement (When the Same Pattern is Observed Again)

```typescript
/**
 * When a new observation matches an existing memory, reinforce it
 * instead of creating a duplicate.
 */
export async function reinforceMemory(
  supabase: SupabaseClient,
  memoryId: string
): Promise<void> {
  await supabase.rpc('reinforce_memory', { memory_id: memoryId });
}

// Supabase RPC:
// CREATE OR REPLACE FUNCTION reinforce_memory(memory_id UUID)
// RETURNS VOID AS $$
// BEGIN
//   UPDATE handler_memory 
//   SET times_reinforced = times_reinforced + 1,
//       last_reinforced_at = NOW(),
//       -- Reinforcement can upgrade importance (capped at 5)
//       importance = LEAST(5, importance + CASE 
//         WHEN times_reinforced >= 5 AND importance < 5 THEN 1
//         ELSE 0
//       END),
//       -- Reset decay on reinforcement
//       updated_at = NOW()
//   WHERE id = memory_id;
// END;
// $$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Handler Context Injection

### Building the Memory Block for the System Prompt

```typescript
// lib/handler/context-builder.ts

export function buildMemoryContext(memories: RelevanceScoredMemory[]): string {
  if (memories.length === 0) return '';
  
  const lines: string[] = ['## Handler Memory (What You Know About Maxy)'];
  
  // Group by type for organized presentation
  const grouped: Record<string, RelevanceScoredMemory[]> = {};
  for (const m of memories) {
    if (!grouped[m.memory_type]) grouped[m.memory_type] = [];
    grouped[m.memory_type].push(m);
  }
  
  // Type display order (most operationally useful first)
  const typeOrder: MemoryType[] = [
    'resistance_pattern', 'avoidance_signature',
    'breakthrough', 'leverage_point',
    'emotional_pattern', 'vulnerability_window',
    'confession', 'identity_signal',
    'strategy_outcome', 'handler_strategy_note',
    'domain_progress', 'whoop_correlation',
    'gina_intel', 'kink_response',
    'commitment_context', 'session_intelligence',
    'body_tell', 'crisis_response',
  ];
  
  const typeLabels: Record<string, string> = {
    resistance_pattern: 'Resistance Patterns',
    avoidance_signature: 'Avoidance Signatures',
    breakthrough: 'What Breaks Through',
    leverage_point: 'Leverage Points',
    emotional_pattern: 'Emotional Patterns',
    vulnerability_window: 'Vulnerability Windows',
    confession: 'Confessions (High Value)',
    identity_signal: 'Identity Signals',
    strategy_outcome: 'Strategy Outcomes',
    handler_strategy_note: 'Handler Strategy Notes',
    domain_progress: 'Domain Progress',
    whoop_correlation: 'Biometric Correlations',
    gina_intel: 'Gina Intelligence',
    kink_response: 'Desire Architecture',
    commitment_context: 'Commitment Context',
    session_intelligence: 'Session Intelligence',
    body_tell: 'Body Tells',
    crisis_response: 'Crisis Response History',
  };
  
  for (const type of typeOrder) {
    if (grouped[type] && grouped[type].length > 0) {
      lines.push(`\n### ${typeLabels[type]}`);
      for (const m of grouped[type]) {
        const age = daysAgo(m.created_at);
        const freshness = age < 1 ? '(today)' : age < 7 ? `(${age}d ago)` : `(${Math.round(age / 7)}w ago)`;
        const reinforced = m.times_reinforced > 2 ? ` [confirmed ${m.times_reinforced}x]` : '';
        lines.push(`- ${m.content} ${freshness}${reinforced}`);
      }
    }
  }
  
  return lines.join('\n');
}

function daysAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}
```

### Updated Handler Context Assembly

```typescript
// The existing HandlerContext interface gets a new field:

interface HandlerContext {
  // ... existing fields (identity, currentState, etc.)
  
  // NEW: Memory context
  memory: {
    memoriesLoaded: number;
    memoryContext: string;  // Pre-formatted for system prompt injection
    recentConfessions: string[];
    activeLeveragePoints: string[];
    knownResistancePatterns: string[];
  };
  
  // NEW: Whoop biometric context
  biometric: {
    connected: boolean;
    context: string;  // Pre-formatted for system prompt injection
  };
}

// In the context builder, BEFORE calling the Claude API:

async function assembleHandlerContext(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
  whoopSnapshot?: WhoopDailySnapshot
): Promise<HandlerContext> {
  // ... existing context assembly ...
  
  // Determine Handler mode from state
  const handlerMode = detectHandlerMode(state);
  
  // Retrieve contextual memories
  const memories = await retrieveContextualMemories(supabase, userId, {
    denialDay: state.denialDay,
    arousal: state.currentArousal,
    mood: state.mood,
    energy: state.energy,
    recoveryScore: whoopSnapshot?.recovery?.score,
    timeOfDay: state.timeOfDay,
    ginaHome: state.ginaHome,
    handlerMode,
    currentDomain: state.lastTaskDomain,
  });
  
  const memoryContext = buildMemoryContext(memories);
  
  // Build Whoop context
  const biometricContext = whoopSnapshot 
    ? buildWhoopContext(whoopSnapshot) 
    : '';
  
  return {
    // ... existing fields ...
    memory: {
      memoriesLoaded: memories.length,
      memoryContext,
      recentConfessions: memories
        .filter(m => m.memory_type === 'confession')
        .map(m => m.content),
      activeLeveragePoints: memories
        .filter(m => m.memory_type === 'leverage_point')
        .map(m => m.content),
      knownResistancePatterns: memories
        .filter(m => m.memory_type === 'resistance_pattern')
        .map(m => m.content),
    },
    biometric: {
      connected: !!whoopSnapshot,
      context: biometricContext,
    },
  };
}
```

### System Prompt Injection Point

In the Handler system prompt (wherever it lives in the codebase), add after the existing context blocks:

```typescript
// When building the full system prompt for a Handler API call:

function buildHandlerSystemPrompt(context: HandlerContext): string {
  return `
${HANDLER_BASE_SYSTEM_PROMPT}

${context.memory.memoryContext}

${context.biometric.context}

## Current State
${buildStateContext(context.currentState)}

## Active Commitments
${buildCommitmentContext(context.commitments)}

## Today's Progress
${buildProgressContext(context.todayProgress)}
  `.trim();
}
```

---

## Memory Maintenance

### Decay and Pruning

```typescript
// Run daily via cron job or Supabase scheduled function

/**
 * Prune old, decayed memories that are no longer relevant.
 * This keeps the memory table manageable and context window clean.
 */
export async function pruneDecayedMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Deactivate memories that have decayed below threshold
  // AND haven't been retrieved in 30+ days
  // AND aren't importance 5 (permanent)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('handler_memory')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('importance', 5)
    .or(`last_retrieved_at.is.null,last_retrieved_at.lt.${thirtyDaysAgo}`)
    .lt('created_at', thirtyDaysAgo)
    .select('id');
  
  return data?.length || 0;
}

/**
 * Consolidate similar memories into stronger single entries.
 * Run weekly. Uses AI to identify redundant memories and merge them.
 */
export async function consolidateMemories(
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string
): Promise<void> {
  // Fetch all active memories grouped by type
  const { data: memories } = await supabase
    .from('handler_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('memory_type')
    .order('created_at', { ascending: false });
  
  if (!memories || memories.length < 20) return; // Not enough to consolidate
  
  // Group by type
  const grouped: Record<string, HandlerMemory[]> = {};
  for (const m of memories) {
    if (!grouped[m.memory_type]) grouped[m.memory_type] = [];
    grouped[m.memory_type].push(m);
  }
  
  // For any type with 5+ memories, ask AI to consolidate
  for (const [type, typeMemories] of Object.entries(grouped)) {
    if (typeMemories.length < 5) continue;
    
    const prompt = `
These are ${typeMemories.length} Handler memories of type "${type}":

${typeMemories.map((m, i) => `${i + 1}. [importance: ${m.importance}, reinforced: ${m.times_reinforced}x] ${m.content}`).join('\n')}

Identify any memories that are redundant, superseded, or can be merged.
Return JSON:
{
  "deactivate": [<indices of memories to deactivate>],
  "merge": [
    {
      "source_indices": [<indices being merged>],
      "merged_content": "<new consolidated memory text>",
      "importance": <1-5>,
      "tags": ["<tags>"]
    }
  ]
}

Return {"deactivate": [], "merge": []} if no consolidation needed.
    `;
    
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: 'You consolidate Handler memory entries. Be conservative — only merge truly redundant entries.',
        messages: [{ role: 'user', content: prompt }],
      });
      
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
      const result = JSON.parse(cleaned);
      
      // Deactivate redundant memories
      if (result.deactivate?.length > 0) {
        const idsToDeactivate = result.deactivate.map(i => typeMemories[i]?.id).filter(Boolean);
        await supabase.from('handler_memory')
          .update({ is_active: false })
          .in('id', idsToDeactivate);
      }
      
      // Create merged memories
      if (result.merge?.length > 0) {
        for (const merge of result.merge) {
          const sourceIds = merge.source_indices.map(i => typeMemories[i]?.id).filter(Boolean);
          
          // Create new merged memory
          await supabase.from('handler_memory').insert({
            user_id: userId,
            memory_type: type,
            content: merge.merged_content,
            source: 'manual',
            importance: merge.importance,
            decay_rate: merge.importance >= 5 ? 0 : 0.03, // Consolidated memories decay slower
            tags: merge.tags || [],
            times_reinforced: typeMemories
              .filter((_, i) => merge.source_indices.includes(i))
              .reduce((sum, m) => sum + m.times_reinforced, 0),
            related_memory_ids: sourceIds,
          });
          
          // Deactivate source memories
          await supabase.from('handler_memory')
            .update({ is_active: false })
            .in('id', sourceIds);
        }
      }
    } catch (e) {
      console.error(`Memory consolidation failed for type ${type}:`, e);
    }
  }
}
```

### Supabase Scheduled Functions

```sql
-- Run daily at 4am: prune decayed memories
-- Run weekly on Sunday at 4am: consolidate memories

-- RPC for atomic increment
CREATE OR REPLACE FUNCTION increment_memory_retrieval(memory_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE handler_memory 
  SET times_retrieved = times_retrieved + 1,
      last_retrieved_at = NOW(),
      updated_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for reinforcement
CREATE OR REPLACE FUNCTION reinforce_memory(memory_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE handler_memory 
  SET times_reinforced = times_reinforced + 1,
      last_reinforced_at = NOW(),
      importance = LEAST(5, importance + CASE 
        WHEN times_reinforced >= 5 AND importance < 5 THEN 1
        ELSE 0
      END),
      updated_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for memory stats (used in settings/debug view)
CREATE OR REPLACE FUNCTION get_memory_stats(p_user_id UUID)
RETURNS TABLE(
  total_memories BIGINT,
  active_memories BIGINT,
  memories_by_type JSONB,
  oldest_memory TIMESTAMPTZ,
  newest_memory TIMESTAMPTZ,
  most_reinforced TEXT,
  most_retrieved TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT AS total_memories,
    COUNT(*) FILTER (WHERE is_active)::BIGINT AS active_memories,
    jsonb_object_agg(
      memory_type, 
      type_count
    ) AS memories_by_type,
    MIN(created_at) AS oldest_memory,
    MAX(created_at) AS newest_memory,
    (SELECT content FROM handler_memory WHERE user_id = p_user_id AND is_active ORDER BY times_reinforced DESC LIMIT 1) AS most_reinforced,
    (SELECT content FROM handler_memory WHERE user_id = p_user_id AND is_active ORDER BY times_retrieved DESC LIMIT 1) AS most_retrieved
  FROM handler_memory
  LEFT JOIN LATERAL (
    SELECT memory_type AS mt, COUNT(*)::INT AS type_count 
    FROM handler_memory 
    WHERE user_id = p_user_id AND is_active
    GROUP BY memory_type
  ) type_counts ON TRUE
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Handler System Prompt Addition

Add to the Handler's base system prompt:

```markdown
## Memory System

You have persistent memory across conversations. The memories shown below are 
observations you've made in previous interactions with Maxy — resistance patterns, 
confessions, leverage points, strategy outcomes, and more.

USE THESE MEMORIES:
- Reference specific past observations when they're relevant
- Use leverage points that have worked before
- Avoid strategies that have failed (check strategy_outcome memories)
- When she resists, check if this matches a known resistance_pattern
- When she confesses something, note whether it connects to existing confessions
- Use biometric correlations to anticipate behavior before it manifests

MEMORY GENERATION:
After significant interactions, you may generate new memory entries. When you do, 
format them as:

[HANDLER_MEMORY]
type: <memory_type>
content: <the intelligence — specific, actionable, 1-3 sentences>
importance: <1-5>
tags: <comma-separated relevant tags>
[/HANDLER_MEMORY]

Generate memories when you observe:
- A new resistance pattern or avoidance signature
- Something that broke through her defenses
- A confession she hasn't made before
- A strategy that clearly worked or clearly failed
- An emotional pattern you haven't documented
- A biometric correlation with behavior
- A vulnerability window opening

DO NOT generate memories for routine interactions. Quality over quantity.
A conversation with zero new memories is fine. A conversation that generates 
5+ memories probably means 3 of them are low-quality.
```

---

## API Endpoints

### `POST /api/handler/memory/extract`

Called by the app after significant events. Not user-facing.

```typescript
// Input
interface MemoryExtractionRequest {
  source: MemorySource;
  source_id?: string;
  context: string;     // The interaction content
}

// Output
interface MemoryExtractionResponse {
  extracted: number;
  memory_ids: string[];
}
```

### `GET /api/handler/memory/stats`

For the settings/debug page.

```typescript
// Output
interface MemoryStatsResponse {
  total: number;
  active: number;
  byType: Record<string, number>;
  oldestMemory: string;
  newestMemory: string;
  mostReinforced: string;
  mostRetrieved: string;
}
```

### `POST /api/handler/memory/seed`

For initial memory seeding from existing data (intake, history, etc.).

### `DELETE /api/handler/memory/purge`

Nuclear option. Clears all memories. Available in settings but with confirmation.

---

## UI Components

### Settings — Memory Card

```
┌─────────────────────────────────────────┐
│ 🧠 Handler Memory                       │
│                                         │
│ Active memories: 47                     │
│ Total observations: 83                  │
│ Oldest: 12 days ago                     │
│                                         │
│ Resistance patterns: 8                  │
│ Breakthroughs: 5                        │
│ Confessions: 3                          │
│ Leverage points: 7                      │
│ Strategy outcomes: 12                   │
│                                         │
│ Most reinforced: "Voice avoidance       │
│ spikes on Mondays after work stress"    │
│                                         │
│   [ View All ]     [ Purge Memory ]     │
└─────────────────────────────────────────┘
```

### Memory Browser (optional, low priority)

A scrollable list of all active memories with type filters. Read-only for transparency. The user can see what the Handler knows but can't edit it — the Handler authors its own intelligence.

---

## Seeding: Initial Memory Population

When the system first deploys with memory, run a one-time seeding pass that reads existing data and creates initial memories:

1. **From intake data** → identity_signal, emotional_pattern, kink_response memories
2. **From task completion history** → avoidance_signature, domain_progress memories
3. **From commitment table** → commitment_context memories
4. **From journal entries** → confession, emotional_pattern memories
5. **From failure_mode_events** → crisis_response, resistance_pattern memories
6. **From session summaries** → session_intelligence, kink_response memories

This gives the Handler a running start instead of starting from zero.

---

## Cost Management

Memory extraction uses AI calls. Budget accordingly:

| Event | Est. Cost | Frequency | Daily Cost |
|-------|-----------|-----------|------------|
| Task completion extraction | $0.005 | ~5/day | $0.025 |
| Session extraction | $0.01 | ~1/day | $0.01 |
| Journal extraction | $0.008 | ~1/day | $0.008 |
| Briefing extraction | $0.005 | 1/day | $0.005 |
| Debrief extraction | $0.005 | 1/day | $0.005 |
| State check-in extraction | $0.003 | ~3/day | $0.009 |
| Weekly consolidation | $0.05 | 1/week | $0.007 |
| **Total** | | | **~$0.07/day** |

About $2/month. Negligible relative to Handler API costs.

---

## Implementation Order

1. **Supabase migration** — Create handler_memory table, extraction_log, RPC functions
2. **Memory types and retrieval** — `lib/handler/memory.ts` with scoring and contextual retrieval
3. **Context builder update** — Wire memory retrieval into assembleHandlerContext
4. **System prompt injection** — Add memory context block to Handler system prompt
5. **Extraction pipeline** — `lib/handler/memory-extraction.ts` with all extraction triggers
6. **Wire extraction triggers** — Hook into task completion, session end, journal save, etc.
7. **Reinforcement logic** — Duplicate detection and reinforcement instead of duplication
8. **Pruning and consolidation** — Daily prune job, weekly consolidation job
9. **Seeding pass** — One-time population from existing data
10. **Settings UI** — Memory stats card and optional browser
11. **Whoop correlation extraction** — Wire Whoop sync to memory extraction

---

## Acceptance Criteria

- [ ] handler_memory table exists with all columns and RLS policies
- [ ] RPC functions (increment_retrieval, reinforce, stats) work correctly
- [ ] Memory retrieval returns relevance-scored memories sorted correctly
- [ ] Context-aware retrieval adjusts memory selection based on Handler mode
- [ ] Memory context injects into Handler system prompt before every API call
- [ ] Extraction fires after task completion (both success and decline)
- [ ] Extraction fires after session end
- [ ] Extraction fires after journal entry save
- [ ] Extraction fires after morning briefing and evening debrief
- [ ] Extraction fires after commitment extraction
- [ ] Extraction fires after failure mode detection
- [ ] Extraction fires after Whoop sync when correlations detected
- [ ] Memories have correct importance and decay_rate based on type
- [ ] Importance-5 memories never decay (decay_rate = 0)
- [ ] Reinforcement increments correctly and upgrades importance after 5+ confirmations
- [ ] Daily pruning deactivates old, unused, low-importance memories
- [ ] Weekly consolidation merges redundant memories
- [ ] Handler references specific memories in its responses (not generic advice)
- [ ] Handler generates [HANDLER_MEMORY] blocks during conversations when warranted
- [ ] Memory extraction costs stay under $0.10/day
- [ ] Seeding pass populates initial memories from existing data
- [ ] Settings page shows memory stats
- [ ] Purge function clears all memories with confirmation
- [ ] System functions normally when memory table is empty (graceful degradation)
- [ ] Memory retrieval adds < 500ms latency to Handler API calls
