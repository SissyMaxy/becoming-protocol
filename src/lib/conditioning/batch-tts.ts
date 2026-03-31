/**
 * Batch TTS Pipeline
 *
 * Generates multiple conditioning audio files from templates.
 * No Claude API call — templates render directly to text,
 * then text goes to ElevenLabs via the existing TTS endpoint.
 *
 * Flow: templates → variable substitution → TTS → storage → content_curriculum
 */

import { supabase } from '../supabase';
import { getAllTemplates, generateFromTemplate } from './script-templates';
import type { ScriptTemplate } from './script-templates';

// ============================================
// TYPES
// ============================================

export interface BatchGenerateResult {
  generated: GeneratedItem[];
  errors: BatchError[];
}

export interface GeneratedItem {
  templateId: string;
  category: string;
  title: string;
  scriptText: string;
  audioUrl: string | null;
  curriculumId: string | null;
  durationEstimate: number;
}

interface BatchError {
  templateId: string;
  category: string;
  error: string;
}

interface CategoryGap {
  category: string;
  currentCount: number;
  needed: number;
}

const ALL_CATEGORIES = [
  'identity', 'feminization', 'surrender', 'chastity',
  'desire_installation', 'dumbification', 'compliance',
  'trigger_installation', 'amnesia', 'resistance_reduction',
  'sleep_induction', 'morning_ritual', 'ambient',
  'trance_deepening', 'shame_inversion', 'arousal_binding',
] as const;

const MIN_AUDIO_PER_CATEGORY = 3;

// ============================================
// BATCH GENERATE
// ============================================

/**
 * Generate multiple audio files from underrepresented categories.
 *
 * 1. Picks N templates from categories with fewest audio items
 * 2. Renders each with user data
 * 3. Calls TTS endpoint for each
 * 4. Creates content_curriculum entries with audio URLs
 */
export async function batchGenerateAudio(
  userId: string,
  count: number
): Promise<BatchGenerateResult> {
  const gaps = await findCategoryGaps(userId);
  const templates = getAllTemplates();
  const result: BatchGenerateResult = { generated: [], errors: [] };

  // Sort gaps by most needed first
  gaps.sort((a, b) => b.needed - a.needed);

  // Build a queue of templates to generate, prioritizing gaps
  const queue: ScriptTemplate[] = [];
  for (const gap of gaps) {
    if (queue.length >= count) break;
    const categoryTemplates = templates.filter(t => t.category === gap.category);
    // Add up to gap.needed templates from this category
    for (let i = 0; i < Math.min(gap.needed, categoryTemplates.length) && queue.length < count; i++) {
      queue.push(categoryTemplates[i]);
    }
  }

  // If we still need more, fill with random underrepresented templates
  if (queue.length < count) {
    const remaining = templates.filter(t => !queue.find(q => q.id === t.id));
    while (queue.length < count && remaining.length > 0) {
      const idx = Math.floor(Math.random() * remaining.length);
      queue.push(remaining.splice(idx, 1)[0]);
    }
  }

  // Generate each
  for (const template of queue) {
    try {
      const { text } = await generateFromTemplate(userId, template.category);
      const title = `${formatCategoryName(template.category)} — Phase ${template.phase} (Template)`;

      // Call TTS endpoint
      let audioUrl: string | null = null;
      let curriculumId: string | null = null;

      try {
        const ttsResponse = await fetch('/api/conditioning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'tts',
            text,
            title,
            category: template.category,
            phase: template.phase,
            intensity: template.intensity,
            userId,
          }),
        });

        if (ttsResponse.ok) {
          const ttsData = await ttsResponse.json();
          audioUrl = ttsData.audioUrl ?? null;
          curriculumId = ttsData.curriculumId ?? null;
        }
      } catch {
        // TTS failed — store as text-only directive for later conversion
      }

      // If TTS didn't create the curriculum entry, create one as text-only
      if (!curriculumId) {
        const { data: entry } = await supabase
          .from('content_curriculum')
          .insert({
            user_id: userId,
            title,
            category: template.category,
            phase: template.phase,
            intensity: template.intensity,
            media_type: audioUrl ? 'audio' : 'script',
            script_text: text,
            audio_url: audioUrl,
            source: 'template',
            duration_minutes: Math.ceil(template.duration_estimate / 60),
            tier: Math.min(template.phase, 4),
          })
          .select('id')
          .single();

        curriculumId = entry?.id ?? null;
      }

      result.generated.push({
        templateId: template.id,
        category: template.category,
        title,
        scriptText: text,
        audioUrl,
        curriculumId,
        durationEstimate: template.duration_estimate,
      });
    } catch (err) {
      result.errors.push({
        templateId: template.id,
        category: template.category,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ============================================
// FILL CONTENT GAPS
// ============================================

/**
 * Analyze content_curriculum for categories with fewer than
 * MIN_AUDIO_PER_CATEGORY audio items. Auto-generates from
 * templates to fill gaps.
 */
export async function fillContentGaps(userId: string): Promise<BatchGenerateResult> {
  const gaps = await findCategoryGaps(userId);
  const totalNeeded = gaps.reduce((sum, g) => sum + g.needed, 0);

  if (totalNeeded === 0) {
    return { generated: [], errors: [] };
  }

  return batchGenerateAudio(userId, totalNeeded);
}

// ============================================
// GAP ANALYSIS
// ============================================

async function findCategoryGaps(userId: string): Promise<CategoryGap[]> {
  const { data: rows } = await supabase
    .from('content_curriculum')
    .select('category')
    .eq('user_id', userId)
    .in('media_type', ['audio', 'script']);

  const counts: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    counts[cat] = 0;
  }
  for (const row of rows ?? []) {
    if (row.category && counts[row.category] !== undefined) {
      counts[row.category]++;
    }
  }

  const gaps: CategoryGap[] = [];
  for (const [category, count] of Object.entries(counts)) {
    if (count < MIN_AUDIO_PER_CATEGORY) {
      gaps.push({
        category,
        currentCount: count,
        needed: MIN_AUDIO_PER_CATEGORY - count,
      });
    }
  }

  return gaps;
}

// ============================================
// HELPERS
// ============================================

function formatCategoryName(category: string): string {
  return category
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build context string showing batch TTS status for Handler prompt.
 */
export async function buildBatchTtsContext(userId: string): Promise<string> {
  const gaps = await findCategoryGaps(userId);

  if (gaps.length === 0) {
    return '### Template Audio Pipeline\nAll categories have sufficient audio content. No gaps detected.';
  }

  const lines: string[] = ['### Template Audio Pipeline'];
  lines.push(`${gaps.length} categories need more audio content:`);
  for (const gap of gaps.sort((a, b) => b.needed - a.needed)) {
    lines.push(`- ${formatCategoryName(gap.category)}: ${gap.currentCount}/${MIN_AUDIO_PER_CATEGORY} (need ${gap.needed} more)`);
  }
  lines.push('');
  lines.push('Use directive: `{"directive":{"action":"batch_tts","value":{"count":N}}}` to generate audio from templates.');

  return lines.join('\n');
}
