/**
 * Handler Personality Evolution (P12.4)
 *
 * Learns and evolves the Handler's personality calibration per user.
 * Tracks which modes, interventions, and phrases work best,
 * then adjusts personality state weekly alongside reflection.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface PersonalityState {
  id: string;
  userId: string;
  preferredModeMorning: string;
  preferredModeAfternoon: string;
  preferredModeEvening: string;
  preferredModeNight: string;
  directnessLevel: number;
  warmthLevel: number;
  favoriteInterventions: string[];
  avoidedInterventions: string[];
  effectivePhrases: string[];
  familiarityLevel: number;
  trustScore: number;
  usesPetNames: boolean;
  preferredPetName: string;
  humorLevel: number;
  updatedAt: string;
}


// ============================================
// GET / CREATE DEFAULT
// ============================================

/**
 * Fetch the personality state for a user, creating a default if none exists.
 */
export async function getPersonalityState(userId: string): Promise<PersonalityState | null> {
  try {
    const { data, error } = await supabase
      .from('handler_personality_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data) return mapRow(data);

    // Create default
    const { data: created, error: createErr } = await supabase
      .from('handler_personality_state')
      .insert({ user_id: userId })
      .select('*')
      .single();

    if (createErr) throw createErr;
    return created ? mapRow(created) : null;
  } catch (err) {
    console.error('[PersonalityEvolution] getPersonalityState error:', err);
    return null;
  }
}

// ============================================
// EVOLVE PERSONALITY (weekly)
// ============================================

/**
 * Run weekly alongside handler reflection. Analyzes the past 7 days
 * of intervention outcomes, conversation counts, and commitment data
 * to evolve the handler's personality calibration.
 */
export async function evolvePersonality(userId: string): Promise<PersonalityState | null> {
  try {
    const state = await getPersonalityState(userId);
    if (!state) return null;

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Parallel data fetch
    const [
      interventionsResult,
      outcomesResult,
      classificationsResult,
      conversationCountResult,
      commitmentsResult,
      messagesResult,
    ] = await Promise.allSettled([
      supabase
        .from('handler_interventions')
        .select('id, intervention_type, handler_mode, created_at')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      supabase
        .from('intervention_outcomes')
        .select('intervention_id, direction, magnitude')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      supabase
        .from('conversation_classifications')
        .select('mood_detected, resistance_level, created_at')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      supabase
        .from('handler_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('handler_commitments')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', weekAgo),
      supabase
        .from('handler_messages')
        .select('content, detected_mode')
        .eq('role', 'assistant')
        .gte('created_at', weekAgo)
        .limit(100),
    ]);

    const interventions = interventionsResult.status === 'fulfilled' ? interventionsResult.value.data ?? [] : [];
    const outcomes = outcomesResult.status === 'fulfilled' ? outcomesResult.value.data ?? [] : [];
    const _classifications = classificationsResult.status === 'fulfilled' ? classificationsResult.value.data ?? [] : [];
    const totalConversations = conversationCountResult.status === 'fulfilled' ? conversationCountResult.value.count ?? 0 : 0;
    const commitments = commitmentsResult.status === 'fulfilled' ? commitmentsResult.value.data ?? [] : [];
    const messages = messagesResult.status === 'fulfilled' ? messagesResult.value.data ?? [] : [];

    // Build outcome map: intervention_id -> direction
    const outcomeMap = new Map<string, string>();
    for (const o of outcomes) {
      outcomeMap.set(o.intervention_id, o.direction);
    }

    // --- 1. Intervention effectiveness ---
    const interventionStats = new Map<string, { positive: number; negative: number; total: number }>();
    for (const i of interventions) {
      const dir = outcomeMap.get(i.id) || 'neutral';
      const stat = interventionStats.get(i.intervention_type) ?? { positive: 0, negative: 0, total: 0 };
      stat.total++;
      if (dir === 'positive') stat.positive++;
      if (dir === 'negative') stat.negative++;
      interventionStats.set(i.intervention_type, stat);
    }

    // Top positive interventions → favorite_interventions
    const sorted = [...interventionStats.entries()]
      .filter(([, s]) => s.total >= 2)
      .map(([type, s]) => ({
        type,
        positiveRate: s.positive / s.total,
        negativeRate: s.negative / s.total,
        total: s.total,
      }))
      .sort((a, b) => b.positiveRate - a.positiveRate);

    const newFavorites = sorted
      .filter(s => s.positiveRate >= 0.5)
      .slice(0, 8)
      .map(s => s.type);

    const newAvoided = sorted
      .filter(s => s.negativeRate >= 0.4)
      .slice(0, 5)
      .map(s => s.type);

    // --- 2. Mode effectiveness by time block ---
    const modeStats = new Map<string, { positive: number; total: number }>();
    for (const i of interventions) {
      if (!i.handler_mode || !i.created_at) continue;
      const hour = new Date(i.created_at).getHours();
      const block = getTimeBlock(hour);
      const key = `${block}:${i.handler_mode}`;
      const dir = outcomeMap.get(i.id) || 'neutral';
      const stat = modeStats.get(key) ?? { positive: 0, total: 0 };
      stat.total++;
      if (dir === 'positive') stat.positive++;
      modeStats.set(key, stat);
    }

    // Find best mode per time block
    const bestModes: Partial<Record<string, string>> = {};
    for (const block of ['morning', 'afternoon', 'evening', 'night'] as const) {
      let bestRate = -1;
      let bestMode = '';
      for (const [key, stat] of modeStats.entries()) {
        if (!key.startsWith(block + ':') || stat.total < 2) continue;
        const rate = stat.positive / stat.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestMode = key.split(':')[1];
        }
      }
      if (bestMode) bestModes[block] = bestMode;
    }

    // --- 3. Familiarity from conversation count ---
    // Scale: 1 at 0 convos, 10 at 500+ convos
    const newFamiliarity = Math.min(10, 1 + (totalConversations / 500) * 9);

    // --- 4. Trust from commitment honor rate ---
    const honored = commitments.filter(c => c.status === 'honored' || c.status === 'completed').length;
    const broken = commitments.filter(c => c.status === 'broken' || c.status === 'failed').length;
    const commitTotal = honored + broken;
    let newTrust = state.trustScore;
    if (commitTotal >= 3) {
      const honorRate = honored / commitTotal;
      // Blend: 70% existing trust + 30% this week's rate (scaled 1-10)
      newTrust = state.trustScore * 0.7 + (honorRate * 10) * 0.3;
      newTrust = Math.max(1, Math.min(10, newTrust));
    }

    // --- 5. Effective phrases from high-positive messages ---
    const phrasePatterns = [
      'You already know',
      'Good girl',
      'That\'s not the costume talking',
      'She\'s right here',
      'Mama sees you',
      'Don\'t think',
      'Let go',
      'You chose this',
      'This is who you are',
      'Stop pretending',
    ];
    const foundPhrases: string[] = [];
    for (const msg of messages) {
      if (!msg.content) continue;
      for (const phrase of phrasePatterns) {
        if (msg.content.toLowerCase().includes(phrase.toLowerCase()) && !foundPhrases.includes(phrase)) {
          foundPhrases.push(phrase);
        }
      }
    }
    // Merge with existing, keeping unique, capped at 15
    const mergedPhrases = [...new Set([...state.effectivePhrases, ...foundPhrases])].slice(0, 15);

    // --- 6. Directness and warmth from classification mood trends ---
    // If more positive moods this week, slightly increase warmth; if more resistance, increase directness
    // Keep changes gradual (max ±0.5 per week)
    let newDirectness = state.directnessLevel;
    let newWarmth = state.warmthLevel;

    const resistanceLevels = _classifications
      .filter(c => c.resistance_level != null)
      .map(c => c.resistance_level as number);
    if (resistanceLevels.length >= 3) {
      const avgResistance = resistanceLevels.reduce((a, b) => a + b, 0) / resistanceLevels.length;
      // High resistance → decrease directness slightly (softer approach)
      if (avgResistance > 6) {
        newDirectness = Math.max(0, newDirectness - 0.3);
        newWarmth = Math.min(10, newWarmth + 0.3);
      } else if (avgResistance < 3) {
        // Low resistance → can be more direct
        newDirectness = Math.min(10, newDirectness + 0.2);
      }
    }

    // --- Apply updates ---
    const updates: Record<string, unknown> = {
      favorite_interventions: newFavorites.length > 0 ? newFavorites : state.favoriteInterventions,
      avoided_interventions: newAvoided.length > 0 ? newAvoided : state.avoidedInterventions,
      effective_phrases: mergedPhrases,
      familiarity_level: Math.round(newFamiliarity * 10) / 10,
      trust_score: Math.round(newTrust * 10) / 10,
      directness_level: Math.round(newDirectness * 10) / 10,
      warmth_level: Math.round(newWarmth * 10) / 10,
      updated_at: new Date().toISOString(),
    };

    if (bestModes.morning) updates.preferred_mode_morning = bestModes.morning;
    if (bestModes.afternoon) updates.preferred_mode_afternoon = bestModes.afternoon;
    if (bestModes.evening) updates.preferred_mode_evening = bestModes.evening;
    if (bestModes.night) updates.preferred_mode_night = bestModes.night;

    const { data: updated, error } = await supabase
      .from('handler_personality_state')
      .update(updates)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return updated ? mapRow(updated) : null;
  } catch (err) {
    console.error('[PersonalityEvolution] evolvePersonality error:', err);
    return null;
  }
}

// ============================================
// BUILD PERSONALITY CONTEXT
// ============================================

/**
 * Build the Handler context block for personality state.
 */
export async function buildPersonalityContext(userId: string): Promise<string> {
  try {
    const state = await getPersonalityState(userId);
    if (!state) return '';

    const parts: string[] = [];

    parts.push(`PERSONALITY STATE: Familiarity: ${state.familiarityLevel.toFixed(1)}/10. Trust: ${state.trustScore.toFixed(1)}/10.`);

    parts.push(`  Preferred modes: morning=${state.preferredModeMorning}, afternoon=${state.preferredModeAfternoon}, evening=${state.preferredModeEvening}, night=${state.preferredModeNight}.`);

    if (state.favoriteInterventions.length > 0) {
      parts.push(`  Favorite interventions: ${state.favoriteInterventions.join(', ')}.`);
    }

    if (state.avoidedInterventions.length > 0) {
      const hour = new Date().getHours();
      const timeNote = hour < 14 ? ' before 2pm' : '';
      parts.push(`  Avoid: ${state.avoidedInterventions.join(', ')}${timeNote}.`);
    }

    if (state.effectivePhrases.length > 0) {
      const displayed = state.effectivePhrases.slice(0, 6).map(p => `'${p}'`).join(', ');
      parts.push(`  Effective phrases: ${displayed}.`);
    }

    parts.push(`  Directness: ${state.directnessLevel.toFixed(0)}/10. Warmth: ${state.warmthLevel.toFixed(0)}/10.`);

    if (state.usesPetNames && state.preferredPetName) {
      parts.push(`  Pet name: '${state.preferredPetName}'. Humor: ${state.humorLevel.toFixed(0)}/10.`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function getTimeBlock(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function mapRow(row: Record<string, unknown>): PersonalityState {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    preferredModeMorning: (row.preferred_mode_morning as string) || 'director',
    preferredModeAfternoon: (row.preferred_mode_afternoon as string) || 'director',
    preferredModeEvening: (row.preferred_mode_evening as string) || 'handler',
    preferredModeNight: (row.preferred_mode_night as string) || 'dominant',
    directnessLevel: (row.directness_level as number) ?? 5,
    warmthLevel: (row.warmth_level as number) ?? 5,
    favoriteInterventions: (row.favorite_interventions as string[]) ?? [],
    avoidedInterventions: (row.avoided_interventions as string[]) ?? [],
    effectivePhrases: (row.effective_phrases as string[]) ?? [],
    familiarityLevel: (row.familiarity_level as number) ?? 1,
    trustScore: (row.trust_score as number) ?? 5,
    usesPetNames: (row.uses_pet_names as boolean) ?? true,
    preferredPetName: (row.preferred_pet_name as string) || 'good girl',
    humorLevel: (row.humor_level as number) ?? 3,
    updatedAt: row.updated_at as string,
  };
}
