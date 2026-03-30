/**
 * Journal Entry Processor
 *
 * After an identity journal entry is submitted, this module:
 * 1. Detects identity signals via keyword patterns (no LLM — cost control)
 * 2. Determines emotional tone from vocabulary
 * 3. Extracts memories if content is significant
 * 4. Updates the entry with signals + tone
 * 5. Calculates consecutive-day streak
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface IdentitySignals {
  feminine_pronouns: boolean;
  name_usage: boolean;
  embodied_language: boolean;
  desire_expression: boolean;
  emotional_depth: boolean;
  signal_count: number;
}

export type EmotionalTone =
  | 'vulnerable'
  | 'confident'
  | 'resistant'
  | 'reflective'
  | 'joyful';

export interface JournalStats {
  totalEntries: number;
  currentStreak: number;
  categoryDistribution: Record<string, number>;
  avgWordCount: number;
}

// ============================================
// KEYWORD PATTERNS
// ============================================

const FEMININE_PRONOUN_PATTERNS = [
  /\bi\s+am\s+(?:a\s+)?(?:she|her|woman|girl|lady)\b/i,
  /\bshe\/her\b/i,
  /\bmyself\b.*\b(?:she|her|herself|woman|girl)\b/i,
  /\b(?:as|like)\s+(?:a\s+)?(?:woman|girl|lady)\b/i,
  /\bherself\b/i,
  /\bshe\b.*\b(?:meaning\s+me|that's\s+me|which\s+is\s+me)\b/i,
];

const NAME_USAGE_PATTERNS = [
  /\bmaxy\b/i,
  /\bi(?:'m|\s+am)\s+maxy\b/i,
  /\bmaxy(?:'s|\s+is)\s+(?:my|the)\b/i,
];

const EMBODIED_KEYWORDS = [
  'felt', 'body', 'skin', 'wore', 'looked', 'touched', 'sensation',
  'curves', 'soft', 'smooth', 'hair', 'lips', 'dress', 'heels',
  'makeup', 'mirror', 'reflection', 'physical', 'breath', 'heartbeat',
  'goosebumps', 'tingled', 'warm', 'flushed',
];

const DESIRE_KEYWORDS = [
  'want', 'need', 'wish', 'crave', 'dream', 'long for', 'ache',
  'desire', 'yearn', 'hope', 'hungry', 'desperate', 'reach for',
];

const EMOTIONAL_VOCABULARY = [
  'afraid', 'alive', 'anxious', 'beautiful', 'brave', 'broken',
  'calm', 'conflicted', 'confused', 'content', 'crying', 'deeply',
  'desperate', 'elated', 'empty', 'excited', 'exposed', 'free',
  'frightened', 'fulfilled', 'grateful', 'grief', 'guilty', 'happy',
  'helpless', 'hopeful', 'hurt', 'inadequate', 'insecure', 'inspired',
  'intimate', 'joyful', 'lonely', 'lost', 'loved', 'melancholy',
  'nervous', 'overwhelmed', 'painful', 'peaceful', 'proud', 'raw',
  'relieved', 'sad', 'safe', 'scared', 'shame', 'shattered',
  'small', 'strong', 'tears', 'tender', 'terrified', 'thrilled',
  'torn', 'trembling', 'uncertain', 'uncomfortable', 'validated',
  'vulnerable', 'warm', 'whole', 'wounded',
];

// Tone detection keyword groups
const TONE_KEYWORDS: Record<EmotionalTone, string[]> = {
  vulnerable: [
    'afraid', 'scared', 'exposed', 'raw', 'crying', 'tears', 'small',
    'helpless', 'uncertain', 'insecure', 'shame', 'hurt', 'painful',
    'lonely', 'lost', 'broken', 'wounded', 'trembling', 'terrified',
  ],
  confident: [
    'strong', 'proud', 'powerful', 'certain', 'know', 'decided', 'sure',
    'capable', 'ready', 'bold', 'brave', 'unapologetic', 'clear',
    'alive', 'thrilled', 'elated', 'inspired',
  ],
  resistant: [
    'can\'t', 'won\'t', 'refuse', 'no', 'stop', 'enough', 'tired',
    'angry', 'frustrated', 'annoyed', 'pushing back', 'don\'t want',
    'hate', 'unfair', 'forced', 'pressure',
  ],
  reflective: [
    'realize', 'notice', 'pattern', 'understand', 'looking back',
    'used to', 'changed', 'shifted', 'wonder', 'think about',
    'remember', 'consider', 'reflect', 'interesting', 'curious',
  ],
  joyful: [
    'happy', 'joy', 'beautiful', 'love', 'grateful', 'wonderful',
    'amazing', 'peaceful', 'content', 'warm', 'light', 'free',
    'excited', 'fulfilled', 'bliss', 'glow', 'smile',
  ],
};

// ============================================
// SIGNAL DETECTION
// ============================================

function detectIdentitySignals(text: string): IdentitySignals {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const wordCount = words.length;

  const feminine_pronouns = FEMININE_PRONOUN_PATTERNS.some((p) => p.test(text));
  const name_usage = NAME_USAGE_PATTERNS.some((p) => p.test(text));
  const embodied_language = EMBODIED_KEYWORDS.some((kw) => lower.includes(kw));
  const desire_expression = DESIRE_KEYWORDS.some((kw) => lower.includes(kw));

  // Emotional depth: 100+ words AND uses emotional vocabulary
  const emotionalWordCount = EMOTIONAL_VOCABULARY.filter((w) => lower.includes(w)).length;
  const emotional_depth = wordCount >= 100 && emotionalWordCount >= 2;

  const signal_count = [
    feminine_pronouns,
    name_usage,
    embodied_language,
    desire_expression,
    emotional_depth,
  ].filter(Boolean).length;

  return {
    feminine_pronouns,
    name_usage,
    embodied_language,
    desire_expression,
    emotional_depth,
    signal_count,
  };
}

function detectEmotionalTone(text: string): EmotionalTone {
  const lower = text.toLowerCase();

  const scores: Record<EmotionalTone, number> = {
    vulnerable: 0,
    confident: 0,
    resistant: 0,
    reflective: 0,
    joyful: 0,
  };

  for (const [tone, keywords] of Object.entries(TONE_KEYWORDS) as [EmotionalTone, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[tone]++;
    }
  }

  // Find highest score
  let maxTone: EmotionalTone = 'reflective'; // default
  let maxScore = 0;
  for (const [tone, score] of Object.entries(scores) as [EmotionalTone, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxTone = tone;
    }
  }

  return maxTone;
}

// ============================================
// STREAK CALCULATION
// ============================================

async function calculateStreak(userId: string): Promise<number> {
  try {
    // Get distinct dates of entries, ordered descending
    const { data } = await supabase
      .from('identity_journal')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(90); // 90 days max streak check

    if (!data || data.length === 0) return 1; // This entry is day 1

    // Extract unique dates
    const dates = [...new Set(
      data.map((r) => new Date(r.created_at).toISOString().split('T')[0])
    )].sort().reverse();

    // Count consecutive days from today
    let streak = 0;
    const now = new Date();

    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(now);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];

      if (dates[i] === expectedStr) {
        streak++;
      } else {
        break;
      }
    }

    return Math.max(streak, 1);
  } catch (err) {
    console.error('[JournalProcessor] calculateStreak failed:', err);
    return 1;
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Process a journal entry after submission.
 * Detects identity signals, emotional tone, updates the entry, calculates streak.
 */
export async function processJournalEntry(userId: string, entryId: string): Promise<void> {
  try {
    // Fetch the entry
    const { data: entry, error: fetchErr } = await supabase
      .from('identity_journal')
      .select('entry_text, word_count')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !entry) {
      console.error('[JournalProcessor] Entry not found:', entryId, fetchErr);
      return;
    }

    const text = entry.entry_text || '';
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    // Detect signals and tone
    const signals = detectIdentitySignals(text);
    const emotionalTone = detectEmotionalTone(text);

    // Calculate streak
    const consecutiveDays = await calculateStreak(userId);

    // Determine if significant enough for memory extraction
    const isSignificant = wordCount > 50 && signals.signal_count >= 1;

    // Update the entry
    const { error: updateErr } = await supabase
      .from('identity_journal')
      .update({
        identity_signals: signals,
        emotional_tone: emotionalTone,
        word_count: wordCount,
        consecutive_days: consecutiveDays,
      })
      .eq('id', entryId)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[JournalProcessor] Update failed:', updateErr);
    }

    // Extract memory if significant
    if (isSignificant) {
      await extractMemory(userId, text, signals, emotionalTone);
    }
  } catch (err) {
    console.error('[JournalProcessor] processJournalEntry failed:', err);
  }
}

/**
 * Extract a memory from a significant journal entry.
 * Stores a condensed version in handler_memories for Handler context.
 */
async function extractMemory(
  userId: string,
  text: string,
  signals: IdentitySignals,
  tone: EmotionalTone,
): Promise<void> {
  try {
    // Build a compact memory summary
    const signalLabels: string[] = [];
    if (signals.feminine_pronouns) signalLabels.push('fem-pronouns');
    if (signals.name_usage) signalLabels.push('name-usage');
    if (signals.embodied_language) signalLabels.push('embodied');
    if (signals.desire_expression) signalLabels.push('desire');
    if (signals.emotional_depth) signalLabels.push('deep-emotional');

    // Take first 200 chars as preview
    const preview = text.length > 200 ? text.substring(0, 200) + '...' : text;
    const content = `Journal entry (${tone}, signals: ${signalLabels.join('+')}): ${preview}`;

    const { error } = await supabase.from('handler_memories').insert({
      user_id: userId,
      memory_type: 'observation',
      content,
      source: 'identity_journal',
      importance: Math.min(signals.signal_count + 1, 5),
    });

    if (error) {
      // handler_memories table might not exist or have different schema — non-fatal
      console.warn('[JournalProcessor] Memory extraction skipped:', error.message);
    }
  } catch (err) {
    console.warn('[JournalProcessor] extractMemory failed:', err);
  }
}

/**
 * Get aggregate journal stats for a user.
 */
export async function getJournalStats(userId: string): Promise<JournalStats> {
  try {
    const { data, error } = await supabase
      .from('identity_journal')
      .select('prompt_category, word_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return { totalEntries: 0, currentStreak: 0, categoryDistribution: {}, avgWordCount: 0 };
    }

    const totalEntries = data.length;

    // Category distribution
    const categoryDistribution: Record<string, number> = {};
    let totalWords = 0;
    for (const entry of data) {
      const cat = entry.prompt_category || 'unknown';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
      totalWords += entry.word_count || 0;
    }

    const avgWordCount = Math.round(totalWords / totalEntries);

    // Streak — use dates from data
    const dates = [...new Set(
      data.map((r) => new Date(r.created_at).toISOString().split('T')[0])
    )].sort().reverse();

    let currentStreak = 0;
    const now = new Date();
    for (let i = 0; i < dates.length; i++) {
      const expected = new Date(now);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];
      if (dates[i] === expectedStr) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { totalEntries, currentStreak, categoryDistribution, avgWordCount };
  } catch (err) {
    console.error('[JournalProcessor] getJournalStats failed:', err);
    return { totalEntries: 0, currentStreak: 0, categoryDistribution: {}, avgWordCount: 0 };
  }
}
