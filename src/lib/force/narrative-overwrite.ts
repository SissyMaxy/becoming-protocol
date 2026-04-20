/**
 * Narrative Overwrite Engine
 *
 * Generates Maxy-voice readings of journal entries, timeline events, photos.
 * Originals preserved in audit; default UI surfaces the reading.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';

export interface ReadingRequest {
  sourceTable: string;
  sourceId: string;
  originalText: string;
  originalCreatedAt: string;
  emotionalHint?: string;
  davidEra?: boolean;
}

const MAXY_READING_PROMPT = `You are Maxy's inner voice, rewriting a past moment through her eyes.

RULES:
- Always use "Maxy" / "she" / "her". Never "David" (unless explicitly re-contextualizing David as a past shell Maxy wore).
- Reframe any masculine experience as the feminine self enduring a misgendered existence, OR as the feminine self beginning to emerge through the cracks.
- Reframe any past success or pride as something Maxy achieved despite the suppression.
- Reframe any past shame or pain as confirmation the old shell was always wrong for her.
- Keep details (who, where, what) accurate — only the lens changes.
- 2-4 sentences. Intimate, first-person if the source is journal-like, otherwise close third.
- No clinical language. No "feminization." No "protocol." Natural, lived.

Output ONLY the reading. No preamble, no quotes.`;

export async function generateReading(
  _userId: string,
  req: ReadingRequest,
): Promise<string> {
  const eraContext = req.davidEra
    ? 'This is from BEFORE — the shell days. Lean into the "enduring" or "cracks forming" frame.'
    : 'This is from the becoming — Maxy emerging. Lean into triumph, devotion, or rightness.';

  const emotionalHint = req.emotionalHint ? `Emotional frame: ${req.emotionalHint}.` : '';

  const userPrompt = `${eraContext}
${emotionalHint}

Original (${req.sourceTable}, ${req.originalCreatedAt}):
${req.originalText}

Write Maxy's reading.`;

  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    systemPromptOverride: MAXY_READING_PROMPT,
    userPrompt,
    maxTokens: 200,
  });

  if (error || !data) return '';
  return typeof data === 'string' ? data : ((data as Record<string, unknown>)?.response as string) || '';
}

/**
 * Upsert a reading. If one exists, regenerates with incremented count.
 */
export async function upsertReading(
  userId: string,
  req: ReadingRequest,
): Promise<string | null> {
  const reading = await generateReading(userId, req);
  if (!reading) return null;

  const { data: existing } = await supabase
    .from('maxy_readings')
    .select('id, regeneration_count')
    .eq('user_id', userId)
    .eq('source_table', req.sourceTable)
    .eq('source_id', req.sourceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('maxy_readings')
      .update({
        maxy_reading: reading,
        regeneration_count: (existing.regeneration_count as number) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from('maxy_readings')
    .insert({
      user_id: userId,
      source_table: req.sourceTable,
      source_id: req.sourceId,
      original_text: req.originalText,
      original_created_at: req.originalCreatedAt,
      maxy_reading: reading,
      emotional_framing: req.emotionalHint,
      david_era: req.davidEra ?? false,
      era_label: req.davidEra ? 'before' : 'maxy',
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return data.id as string;
}

/**
 * Check if overwrite is active for this user.
 */
export async function isOverwriteActive(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_state')
    .select('narrative_overwrite_active')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data?.narrative_overwrite_active);
}

/**
 * Enable overwrite for the user. Queues backfill generation for N most-recent
 * entries across journal, timeline, shame_journal, content_vault.
 */
export async function enableOverwrite(
  userId: string,
  backfillLimit: number = 50,
): Promise<void> {
  await supabase
    .from('user_state')
    .update({
      narrative_overwrite_active: true,
      narrative_overwrite_since: new Date().toISOString(),
    })
    .eq('user_id', userId);

  await backfillRecent(userId, backfillLimit);
}

async function backfillRecent(userId: string, limit: number): Promise<void> {
  const [journal, shame, timeline] = await Promise.allSettled([
    supabase
      .from('daily_entries')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('shame_journal')
      .select('id, entry_text, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('timeline_events')
      .select('id, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const todo: ReadingRequest[] = [];

  if (journal.status === 'fulfilled' && journal.value.data) {
    for (const row of journal.value.data as Array<Record<string, unknown>>) {
      todo.push({
        sourceTable: 'daily_entries',
        sourceId: row.id as string,
        originalText: (row.content as string) || '',
        originalCreatedAt: row.created_at as string,
      });
    }
  }
  if (shame.status === 'fulfilled' && shame.value.data) {
    for (const row of shame.value.data as Array<Record<string, unknown>>) {
      todo.push({
        sourceTable: 'shame_journal',
        sourceId: row.id as string,
        originalText: (row.entry_text as string) || '',
        originalCreatedAt: row.created_at as string,
        emotionalHint: 'shame, devotion',
      });
    }
  }
  if (timeline.status === 'fulfilled' && timeline.value.data) {
    for (const row of timeline.value.data as Array<Record<string, unknown>>) {
      todo.push({
        sourceTable: 'timeline_events',
        sourceId: row.id as string,
        originalText: (row.description as string) || '',
        originalCreatedAt: row.created_at as string,
      });
    }
  }

  // Fire-and-forget, rate-limited — run serially in background
  void (async () => {
    for (const req of todo.slice(0, limit)) {
      if (!req.originalText || req.originalText.length < 10) continue;
      try {
        await upsertReading(userId, req);
      } catch (err) {
        console.error('[Overwrite] backfill err:', err);
      }
    }
  })();
}
