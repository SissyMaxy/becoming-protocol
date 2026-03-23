/**
 * Handler Memory System
 *
 * Long-term memory for the conversational Handler.
 * 18 memory types with relevance scoring, extraction, and retrieval.
 *
 * Relevance = importance(40%) + recency(35%) + reinforcement(15%) + retrieval_freshness(10%)
 */

import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────

export type MemoryType =
  | 'preference'
  | 'fantasy'
  | 'fear'
  | 'boundary'
  | 'trigger'
  | 'vulnerability'
  | 'pattern'
  | 'relationship'
  | 'confession'
  | 'commitment_history'
  | 'resistance_pattern'
  | 'compliance_pattern'
  | 'sexual_response'
  | 'emotional_state'
  | 'identity_shift'
  | 'gina_context'
  | 'body_change'
  | 'life_event';

export const MEMORY_TYPES: MemoryType[] = [
  'preference', 'fantasy', 'fear', 'boundary', 'trigger', 'vulnerability',
  'pattern', 'relationship', 'confession', 'commitment_history',
  'resistance_pattern', 'compliance_pattern', 'sexual_response',
  'emotional_state', 'identity_shift', 'gina_context', 'body_change', 'life_event',
];

export interface HandlerMemory {
  id: string;
  userId: string;
  memoryType: MemoryType;
  content: string;
  context: Record<string, unknown>;
  sourceType: string | null;
  sourceId: string | null;
  importance: number;
  decayRate: number;
  reinforcementCount: number;
  lastReinforcedAt: string;
  lastRetrievedAt: string | null;
  retrievalCount: number;
  isActive: boolean;
  createdAt: string;
  relevanceScore?: number;
}

// ── Relevance Scoring ────────────────────────────────────────────────

/**
 * Calculate relevance score for a memory.
 * importance(40%) + recency(35%) + reinforcement(15%) + retrieval_freshness(10%)
 */
export function calculateRelevance(memory: {
  importance: number;
  decayRate: number;
  lastReinforcedAt: string;
  reinforcementCount: number;
  lastRetrievedAt: string | null;
  createdAt: string;
}): number {
  const now = Date.now();

  // Importance: normalized to 0-1 (importance is 1-5)
  const importanceScore = memory.importance / 5;

  // Recency: exponential decay based on time since last reinforcement
  const hoursSinceReinforced = (now - new Date(memory.lastReinforcedAt).getTime()) / 3600000;
  const recencyScore = Math.exp(-memory.decayRate * hoursSinceReinforced / 24); // decay per day

  // Reinforcement: logarithmic scaling (diminishing returns)
  const reinforcementScore = Math.min(1, Math.log2(memory.reinforcementCount + 1) / 5);

  // Retrieval freshness: how recently was this memory retrieved
  // Higher score if NOT recently retrieved (novel recall is better)
  let retrievalFreshnessScore = 1;
  if (memory.lastRetrievedAt) {
    const hoursSinceRetrieved = (now - new Date(memory.lastRetrievedAt).getTime()) / 3600000;
    retrievalFreshnessScore = Math.min(1, hoursSinceRetrieved / 168); // peaks after 1 week
  }

  return (
    importanceScore * 0.40 +
    recencyScore * 0.35 +
    reinforcementScore * 0.15 +
    retrievalFreshnessScore * 0.10
  );
}

// ── Memory Storage ───────────────────────────────────────────────────

export async function storeMemory(
  userId: string,
  memoryType: MemoryType,
  content: string,
  options: {
    importance?: number;
    context?: Record<string, unknown>;
    sourceType?: string;
    sourceId?: string;
  } = {},
): Promise<string | null> {
  const importance = options.importance ?? 3;
  const decayRate = importance === 5 ? 0 : 0.05;

  const { data, error } = await supabase
    .from('handler_memory')
    .insert({
      user_id: userId,
      memory_type: memoryType,
      content,
      context: options.context ?? {},
      source_type: options.sourceType,
      source_id: options.sourceId,
      importance,
      decay_rate: decayRate,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Memory] Store error:', error.message);
    return null;
  }

  return data.id;
}

/**
 * Reinforce an existing memory (increases relevance).
 */
export async function reinforceMemory(memoryId: string): Promise<void> {
  await supabase
    .from('handler_memory')
    .update({
      reinforcement_count: supabase.rpc('increment_field', { row_id: memoryId, field: 'reinforcement_count' }),
      last_reinforced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoryId);

  // Fallback: direct increment
  const { data } = await supabase
    .from('handler_memory')
    .select('reinforcement_count')
    .eq('id', memoryId)
    .single();

  if (data) {
    await supabase
      .from('handler_memory')
      .update({
        reinforcement_count: data.reinforcement_count + 1,
        last_reinforced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId);
  }
}

// ── Memory Retrieval ─────────────────────────────────────────────────

/**
 * Retrieve contextually relevant memories, scored and ranked.
 * Returns top N memories by relevance score.
 */
export async function retrieveContextualMemories(
  userId: string,
  options: {
    types?: MemoryType[];
    limit?: number;
    minImportance?: number;
    contextHints?: string[];
  } = {},
): Promise<HandlerMemory[]> {
  const limit = options.limit ?? 20;
  const minImportance = options.minImportance ?? 1;

  let query = supabase
    .from('handler_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('importance', minImportance)
    .order('importance', { ascending: false })
    .order('last_reinforced_at', { ascending: false })
    .limit(100); // Fetch more than needed, then score and filter

  if (options.types && options.types.length > 0) {
    query = query.in('memory_type', options.types);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('[Memory] Retrieval error:', error?.message);
    return [];
  }

  // Score and rank
  const scored: HandlerMemory[] = data.map(row => {
    const memory: HandlerMemory = {
      id: row.id,
      userId: row.user_id,
      memoryType: row.memory_type as MemoryType,
      content: row.content,
      context: row.context || {},
      sourceType: row.source_type,
      sourceId: row.source_id,
      importance: row.importance,
      decayRate: row.decay_rate,
      reinforcementCount: row.reinforcement_count,
      lastReinforcedAt: row.last_reinforced_at,
      lastRetrievedAt: row.last_retrieved_at,
      retrievalCount: row.retrieval_count,
      isActive: row.is_active,
      createdAt: row.created_at,
    };

    memory.relevanceScore = calculateRelevance({
      importance: memory.importance,
      decayRate: memory.decayRate,
      lastReinforcedAt: memory.lastReinforcedAt,
      reinforcementCount: memory.reinforcementCount,
      lastRetrievedAt: memory.lastRetrievedAt,
      createdAt: memory.createdAt,
    });

    return memory;
  });

  // Sort by relevance score descending
  scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  // Take top N
  const selected = scored.slice(0, limit);

  // Mark as retrieved (fire-and-forget)
  const selectedIds = selected.map(m => m.id);
  if (selectedIds.length > 0) {
    supabase
      .from('handler_memory')
      .update({
        last_retrieved_at: new Date().toISOString(),
        // retrieval_count incremented per-row below
      })
      .in('id', selectedIds)
      .then(() => {
        // Increment retrieval count for each
        for (const id of selectedIds) {
          supabase
            .from('handler_memory')
            .select('retrieval_count')
            .eq('id', id)
            .single()
            .then(({ data: mem }) => {
              if (mem) {
                supabase
                  .from('handler_memory')
                  .update({
                    retrieval_count: mem.retrieval_count + 1,
                    last_retrieved_at: new Date().toISOString(),
                  })
                  .eq('id', id)
                  .then(() => {});
              }
            });
        }
      });
  }

  return selected;
}

// ── Memory Context Builder (for Handler prompt) ──────────────────────

/**
 * Build a memory context block for injection into the Handler system prompt.
 */
export async function buildMemoryContextBlock(userId: string): Promise<string> {
  const memories = await retrieveContextualMemories(userId, {
    limit: 25,
    minImportance: 2,
  });

  if (memories.length === 0) return '';

  // Group by type
  const grouped: Record<string, HandlerMemory[]> = {};
  for (const m of memories) {
    if (!grouped[m.memoryType]) grouped[m.memoryType] = [];
    grouped[m.memoryType].push(m);
  }

  const lines: string[] = ['## Long-Term Memory'];

  for (const [type, mems] of Object.entries(grouped)) {
    const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`\n### ${label}`);
    for (const m of mems) {
      const importance = m.importance >= 4 ? ' [HIGH]' : '';
      lines.push(`- ${m.content}${importance}`);
    }
  }

  return lines.join('\n');
}

// ── Memory Extraction Pipeline ───────────────────────────────────────

/**
 * Extract memories from a completed conversation.
 * Called after conversation ends or at significant moments.
 */
export async function extractMemoriesFromConversation(
  userId: string,
  conversationId: string,
): Promise<number> {
  // Check if already extracted
  const { count } = await supabase
    .from('handler_memory_extraction_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', 'conversation')
    .eq('source_id', conversationId);

  if ((count || 0) > 0) return 0;

  // Get conversation messages
  const { data: messages } = await supabase
    .from('handler_messages')
    .select('role, content, handler_signals')
    .eq('conversation_id', conversationId)
    .order('message_index', { ascending: true });

  if (!messages || messages.length === 0) return 0;

  // Get conversation metadata
  const { data: convo } = await supabase
    .from('handler_conversations')
    .select('commitments_extracted, confessions_captured, resistance_events')
    .eq('id', conversationId)
    .single();

  let extracted = 0;

  // Extract confessions as memories
  if (convo?.confessions_captured) {
    for (const confession of convo.confessions_captured as string[]) {
      await storeMemory(userId, 'confession', confession, {
        importance: 4,
        sourceType: 'conversation',
        sourceId: conversationId,
      });
      extracted++;
    }
  }

  // Extract commitment history
  if (convo?.commitments_extracted) {
    for (const commitment of convo.commitments_extracted as Record<string, unknown>[]) {
      const text = typeof commitment === 'string' ? commitment : (commitment.text as string || JSON.stringify(commitment));
      await storeMemory(userId, 'commitment_history', text, {
        importance: 3,
        sourceType: 'conversation',
        sourceId: conversationId,
        context: typeof commitment === 'object' ? commitment : {},
      });
      extracted++;
    }
  }

  // Extract resistance patterns
  if (convo?.resistance_events) {
    for (const event of convo.resistance_events as Record<string, unknown>[]) {
      await storeMemory(userId, 'resistance_pattern', JSON.stringify(event), {
        importance: 3,
        sourceType: 'conversation',
        sourceId: conversationId,
        context: event,
      });
      extracted++;
    }
  }

  // Scan user messages for identity shifts, emotional states, preferences
  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const content = msg.content as string;
    if (!content || content.length < 20) continue;

    // Simple keyword-based extraction (can be enhanced with AI later)
    if (/\b(i am|i'm|i feel like|i identify as|i want to be)\b/i.test(content) && content.length > 40) {
      await storeMemory(userId, 'identity_shift', content.substring(0, 500), {
        importance: 3,
        sourceType: 'conversation',
        sourceId: conversationId,
      });
      extracted++;
    }

    if (/\b(i('m| am) (scared|afraid|worried|nervous|anxious))\b/i.test(content)) {
      await storeMemory(userId, 'fear', content.substring(0, 500), {
        importance: 3,
        sourceType: 'conversation',
        sourceId: conversationId,
      });
      extracted++;
    }

    if (/\b(i (love|like|prefer|enjoy|want))\b/i.test(content) && content.length > 30) {
      await storeMemory(userId, 'preference', content.substring(0, 500), {
        importance: 2,
        sourceType: 'conversation',
        sourceId: conversationId,
      });
      extracted++;
    }

    if (/\b(gina|wife|partner|she)\b/i.test(content) && content.length > 30) {
      await storeMemory(userId, 'gina_context', content.substring(0, 500), {
        importance: 3,
        sourceType: 'conversation',
        sourceId: conversationId,
      });
      extracted++;
    }
  }

  // Log extraction
  await supabase.from('handler_memory_extraction_log').insert({
    user_id: userId,
    source_type: 'conversation',
    source_id: conversationId,
    memories_extracted: extracted,
  });

  return extracted;
}

/**
 * Extract memories from a completed task.
 */
export async function extractMemoriesFromTask(
  userId: string,
  taskCompletion: {
    id: string;
    category: string;
    domain?: string;
    notes?: string;
    resistanceLevel?: number;
  },
): Promise<number> {
  // Check if already extracted
  const { count } = await supabase
    .from('handler_memory_extraction_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', 'task_completion')
    .eq('source_id', taskCompletion.id);

  if ((count || 0) > 0) return 0;

  let extracted = 0;

  // High resistance = resistance pattern
  if (taskCompletion.resistanceLevel && taskCompletion.resistanceLevel >= 4) {
    await storeMemory(userId, 'resistance_pattern',
      `High resistance (${taskCompletion.resistanceLevel}/5) on ${taskCompletion.category} task in ${taskCompletion.domain || 'unknown'} domain`,
      {
        importance: 3,
        sourceType: 'task_completion',
        sourceId: taskCompletion.id,
        context: taskCompletion,
      });
    extracted++;
  }

  // Completion with notes = potential preference/pattern
  if (taskCompletion.notes && taskCompletion.notes.length > 20) {
    await storeMemory(userId, 'pattern',
      `After ${taskCompletion.category} task: "${taskCompletion.notes}"`,
      {
        importance: 2,
        sourceType: 'task_completion',
        sourceId: taskCompletion.id,
      });
    extracted++;
  }

  // Log extraction
  await supabase.from('handler_memory_extraction_log').insert({
    user_id: userId,
    source_type: 'task_completion',
    source_id: taskCompletion.id,
    memories_extracted: extracted,
  });

  return extracted;
}

// ── Weekly Consolidation ─────────────────────────────────────────────

/**
 * Consolidate old, low-importance memories.
 * Merges similar memories, deactivates decayed ones.
 */
export async function consolidateMemories(userId: string): Promise<{
  deactivated: number;
  merged: number;
}> {
  let deactivated = 0;
  let merged = 0;

  // Deactivate memories that have decayed below threshold
  const { data: allMemories } = await supabase
    .from('handler_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('importance', 5); // Never deactivate permanent memories

  if (!allMemories) return { deactivated, merged };

  for (const row of allMemories) {
    const relevance = calculateRelevance({
      importance: row.importance,
      decayRate: row.decay_rate,
      lastReinforcedAt: row.last_reinforced_at,
      reinforcementCount: row.reinforcement_count,
      lastRetrievedAt: row.last_retrieved_at,
      createdAt: row.created_at,
    });

    // Deactivate if relevance dropped below 0.1
    if (relevance < 0.1) {
      await supabase
        .from('handler_memory')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      deactivated++;
    }
  }

  return { deactivated, merged };
}
