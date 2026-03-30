/**
 * Journal Handler Context
 *
 * Builds a compact context block for the Handler AI, summarizing
 * the user's identity journal activity: streak, tone trends, latest entry.
 */

import { supabase } from '../supabase';

/**
 * Build journal context for Handler system prompt.
 * Returns empty string if no journal entries exist.
 */
export async function buildJournalContext(userId: string): Promise<string> {
  try {
    // Fetch recent entries (last 10) for tone + preview
    const { data: entries, error } = await supabase
      .from('identity_journal')
      .select('entry_text, emotional_tone, identity_signals, word_count, consecutive_days, prompt_category, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !entries || entries.length === 0) return '';

    const total = entries.length; // We'll get true count separately
    const latest = entries[0];
    const streak = latest.consecutive_days || 0;

    // Get true total count
    const { count } = await supabase
      .from('identity_journal')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const totalEntries = count || total;

    // Recent emotional tones (last 5)
    const recentTones = entries
      .slice(0, 5)
      .map((e) => e.emotional_tone)
      .filter(Boolean);

    // Latest entry preview (first 120 chars)
    const preview = latest.entry_text
      ? latest.entry_text.length > 120
        ? latest.entry_text.substring(0, 120) + '...'
        : latest.entry_text
      : '';

    // Identity signal summary from recent entries
    const signalEntries = entries.filter(
      (e) => e.identity_signals && (e.identity_signals as Record<string, unknown>).signal_count
    );
    const avgSignals = signalEntries.length > 0
      ? (signalEntries.reduce(
          (sum, e) => sum + ((e.identity_signals as Record<string, number>).signal_count || 0),
          0,
        ) / signalEntries.length).toFixed(1)
      : '0';

    const parts = [
      `JOURNAL: ${totalEntries} entries, ${streak}-day streak, avg ${avgSignals} identity signals/entry`,
    ];

    if (recentTones.length > 0) {
      parts.push(`  recent tones: ${recentTones.join(', ')}`);
    }

    if (preview) {
      parts.push(`  latest: "${preview}"`);
    }

    parts.push('  [Reference journal entries when relevant. Acknowledge consistency. Note tone shifts.]');

    return parts.join('\n');
  } catch (err) {
    console.error('[JournalContext] buildJournalContext failed:', err);
    return '';
  }
}
