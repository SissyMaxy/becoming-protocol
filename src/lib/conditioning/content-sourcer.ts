/**
 * External Content Sourcer
 *
 * Manages the external_content_index table — tracks external conditioning
 * content (Bambi Sleep, Elswyth, Nimja, custom hypno files, PMVs, etc.)
 * for prescription and effectiveness tracking.
 *
 * The Handler can add content via directives. The system prescribes
 * external content alongside internal content_curriculum items.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type ExternalContentType =
  | 'audio_hypno'
  | 'audio_affirmation'
  | 'video_pmv'
  | 'video_hypno'
  | 'video_sissy'
  | 'audio_ambient'
  | 'audio_sleep'
  | 'caption_set';

export interface ExternalContentInput {
  title: string;
  creator?: string;
  source_url?: string;
  local_path?: string;
  content_type: ExternalContentType;
  category?: string;
  intensity?: number;
  fantasy_level?: number;
  duration_minutes?: number;
  themes?: string[];
  trigger_phrases?: string[];
  handler_notes?: string;
  tier?: number;
  best_denial_range?: number[];
  best_time?: string[];
}

export interface ExternalContentItem {
  id: string;
  title: string;
  creator: string | null;
  source_url: string | null;
  local_path: string | null;
  content_type: ExternalContentType;
  category: string | null;
  intensity: number | null;
  fantasy_level: number | null;
  duration_minutes: number | null;
  themes: string[] | null;
  trigger_phrases: string[] | null;
  times_prescribed: number;
  times_consumed: number;
  avg_trance_depth: number | null;
  effectiveness_score: number | null;
  handler_notes: string | null;
  tier: number;
  best_denial_range: number[] | null;
  best_time: string[] | null;
  created_at: string;
}

export interface ContentSearchCriteria {
  content_type?: ExternalContentType;
  category?: string;
  themes?: string[];
  intensity_max?: number;
  fantasy_level_max?: number;
  tier_max?: number;
  creator?: string;
  limit?: number;
}

export interface ContentLibraryContext {
  totalItems: number;
  byType: Record<string, number>;
  byCreator: Record<string, number>;
  gaps: string[];
  recentlyAdded: { title: string; creator: string | null; created_at: string }[];
}

// ============================================
// CRUD
// ============================================

/** Add an external content item to the index. */
export async function addExternalContent(
  userId: string,
  content: ExternalContentInput
): Promise<ExternalContentItem | null> {
  const { data, error } = await supabase
    .from('external_content_index')
    .insert({
      user_id: userId,
      ...content,
    })
    .select()
    .single();

  if (error) {
    console.error('[content-sourcer] addExternalContent error:', error.message);
    return null;
  }

  return data as ExternalContentItem;
}

/** Search external content by type, category, themes, intensity, etc. */
export async function searchExternalContent(
  userId: string,
  criteria: ContentSearchCriteria
): Promise<ExternalContentItem[]> {
  let query = supabase
    .from('external_content_index')
    .select('*')
    .eq('user_id', userId);

  if (criteria.content_type) {
    query = query.eq('content_type', criteria.content_type);
  }
  if (criteria.category) {
    query = query.eq('category', criteria.category);
  }
  if (criteria.creator) {
    query = query.eq('creator', criteria.creator);
  }
  if (criteria.intensity_max) {
    query = query.lte('intensity', criteria.intensity_max);
  }
  if (criteria.fantasy_level_max) {
    query = query.lte('fantasy_level', criteria.fantasy_level_max);
  }
  if (criteria.tier_max) {
    query = query.lte('tier', criteria.tier_max);
  }
  if (criteria.themes && criteria.themes.length > 0) {
    query = query.overlaps('themes', criteria.themes);
  }

  query = query
    .order('effectiveness_score', { ascending: false, nullsFirst: false })
    .order('times_prescribed', { ascending: true })
    .limit(criteria.limit ?? 10);

  const { data, error } = await query;

  if (error) {
    console.error('[content-sourcer] searchExternalContent error:', error.message);
    return [];
  }

  return (data ?? []) as ExternalContentItem[];
}

// ============================================
// PRESCRIPTION
// ============================================

/**
 * Select best external content for a session type.
 * Balances effectiveness, variety (least-prescribed), and tier gating.
 */
export async function prescribeExternalContent(
  userId: string,
  sessionType: string
): Promise<ExternalContentItem[]> {
  // Map session types to search criteria
  const criteriaMap: Record<string, ContentSearchCriteria> = {
    sleep: { content_type: 'audio_sleep', limit: 2 },
    hypno: { content_type: 'audio_hypno', limit: 3 },
    ambient: { content_type: 'audio_ambient', limit: 2 },
    goon: { content_type: 'video_pmv', limit: 3 },
    edge: { content_type: 'video_sissy', limit: 2 },
    feminization: { category: 'feminization', limit: 3 },
    identity: { category: 'identity', limit: 2 },
    compliance: { category: 'compliance', limit: 2 },
    trance: { category: 'trance_deepening', content_type: 'audio_hypno', limit: 3 },
  };

  const criteria = criteriaMap[sessionType] ?? { limit: 3 };

  // Get user tier
  const { data: state } = await supabase
    .from('user_state')
    .select('denial_day, streak_days')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = state?.denial_day ?? 0;
  const streakDays = state?.streak_days ?? 0;

  let tierMax = 1;
  if (denialDay >= 7) tierMax = 4;
  else if (streakDays >= 7 || denialDay >= 5) tierMax = 3;
  else if (streakDays >= 3) tierMax = 2;

  const items = await searchExternalContent(userId, {
    ...criteria,
    tier_max: tierMax,
  });

  // Increment times_prescribed for selected items
  if (items.length > 0) {
    for (const item of items) {
      await supabase
        .from('external_content_index')
        .update({ times_prescribed: item.times_prescribed + 1 })
        .eq('id', item.id);
    }
  }

  return items;
}

/**
 * Record that a user consumed external content.
 * Updates times_consumed and optionally trance depth / effectiveness.
 */
export async function recordExternalConsumption(
  userId: string,
  contentId: string,
  tranceDepth?: number
): Promise<void> {
  const { data: item } = await supabase
    .from('external_content_index')
    .select('times_consumed, avg_trance_depth')
    .eq('id', contentId)
    .eq('user_id', userId)
    .single();

  if (!item) return;

  const newCount = (item.times_consumed ?? 0) + 1;
  const updates: Record<string, unknown> = { times_consumed: newCount };

  if (tranceDepth !== undefined) {
    const currentAvg = item.avg_trance_depth ?? 0;
    const prevCount = item.times_consumed ?? 0;
    updates.avg_trance_depth = prevCount > 0
      ? (currentAvg * prevCount + tranceDepth) / newCount
      : tranceDepth;
    // Simple effectiveness: trance depth normalized
    updates.effectiveness_score = (updates.avg_trance_depth as number) / 10;
  }

  await supabase
    .from('external_content_index')
    .update(updates)
    .eq('id', contentId);
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build context block showing external content library state.
 * Injected into Handler system prompt.
 */
export async function buildContentLibraryContext(
  userId: string
): Promise<string> {
  const { data: items } = await supabase
    .from('external_content_index')
    .select('title, creator, content_type, category, effectiveness_score, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = items ?? [];

  if (rows.length === 0) {
    return [
      '### External Content Library',
      'No external content indexed yet.',
      'Add content via directive:',
      '```json',
      '{"directive":{"action":"custom","value":{"type":"add_external_content","title":"...","source_url":"...","content_type":"audio_hypno","category":"compliance","intensity":3}}}',
      '```',
    ].join('\n');
  }

  // Aggregate stats
  const byType: Record<string, number> = {};
  const byCreator: Record<string, number> = {};
  for (const row of rows) {
    byType[row.content_type] = (byType[row.content_type] ?? 0) + 1;
    const creator = row.creator ?? 'unknown';
    byCreator[creator] = (byCreator[creator] ?? 0) + 1;
  }

  // Find gaps — categories with no external content
  const coveredCategories = new Set(rows.map(r => r.category).filter(Boolean));
  const allCategories = [
    'identity', 'feminization', 'surrender', 'chastity',
    'desire_installation', 'compliance', 'trigger_installation',
    'trance_deepening', 'sleep_induction', 'dumbification',
  ];
  const gaps = allCategories.filter(c => !coveredCategories.has(c));

  // Recent additions (last 5)
  const recent = rows.slice(0, 5);

  const lines: string[] = ['### External Content Library'];
  lines.push(`Total items: ${rows.length}`);
  lines.push('');

  lines.push('**By type:**');
  for (const [type, count] of Object.entries(byType)) {
    lines.push(`- ${type}: ${count}`);
  }

  lines.push('');
  lines.push('**By creator:**');
  for (const [creator, count] of Object.entries(byCreator)) {
    lines.push(`- ${creator}: ${count}`);
  }

  if (gaps.length > 0) {
    lines.push('');
    lines.push(`**Gaps (no external content):** ${gaps.join(', ')}`);
  }

  lines.push('');
  lines.push('**Recently added:**');
  for (const r of recent) {
    lines.push(`- ${r.title} (${r.creator ?? 'unknown'})`);
  }

  lines.push('');
  lines.push('Add content via directive:');
  lines.push('```json');
  lines.push('{"directive":{"action":"custom","value":{"type":"add_external_content","title":"...","source_url":"...","content_type":"audio_hypno","category":"compliance","intensity":3}}}');
  lines.push('```');

  return lines.join('\n');
}

// ============================================
// SEED DATA — Known Bambi Sleep & Elswyth content
// ============================================

/**
 * Seed the external content index with known conditioning audio.
 * Safe to call multiple times — skips titles that already exist.
 */
export async function seedExternalContent(userId: string): Promise<number> {
  const seeds: ExternalContentInput[] = [
    // ── Bambi Sleep ──
    {
      title: 'Bambi Sleep 01 — Bambi Induction',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'trance_deepening',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 35,
      themes: ['trance', 'induction', 'bimbo', 'feminization'],
      trigger_phrases: ['bambi sleep', 'good girl'],
      tier: 1,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Bambi Sleep 02 — Bambi Uniform',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'feminization',
      intensity: 3,
      fantasy_level: 3,
      duration_minutes: 30,
      themes: ['feminization', 'bimbo', 'clothing', 'identity'],
      trigger_phrases: ['bambi uniform', 'good girl'],
      tier: 2,
      best_time: ['evening'],
    },
    {
      title: 'Bambi Sleep 03 — Bambi Addiction',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'desire_installation',
      intensity: 4,
      fantasy_level: 3,
      duration_minutes: 32,
      themes: ['addiction', 'compliance', 'desire', 'bimbo'],
      trigger_phrases: ['bambi sleep', 'bimbo doll'],
      tier: 2,
      best_denial_range: [3, 14],
      best_time: ['evening', 'night'],
    },
    {
      title: 'Bambi Sleep 04 — Bambi Takeover',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'identity',
      intensity: 4,
      fantasy_level: 4,
      duration_minutes: 38,
      themes: ['identity', 'takeover', 'bimbo', 'surrender'],
      trigger_phrases: ['bambi takeover', 'good girl'],
      tier: 3,
      best_denial_range: [5, 21],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep 05 — Bambi Compliance',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'compliance',
      intensity: 4,
      fantasy_level: 3,
      duration_minutes: 33,
      themes: ['compliance', 'obedience', 'bimbo', 'trigger_installation'],
      trigger_phrases: ['good girl', 'obey'],
      tier: 2,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Bambi Sleep 06 — Bambi Dumbification',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'dumbification',
      intensity: 4,
      fantasy_level: 4,
      duration_minutes: 35,
      themes: ['dumbification', 'bimbo', 'empty', 'mindless'],
      trigger_phrases: ['empty head', 'dumb doll'],
      tier: 3,
      best_denial_range: [7, 21],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep 07 — Bambi Forever',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'surrender',
      intensity: 5,
      fantasy_level: 5,
      duration_minutes: 40,
      themes: ['permanence', 'surrender', 'identity', 'bimbo'],
      trigger_phrases: ['bambi forever', 'good girl'],
      tier: 4,
      best_denial_range: [10, 30],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep — Bubble Induction',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'trance_deepening',
      intensity: 2,
      fantasy_level: 2,
      duration_minutes: 20,
      themes: ['trance', 'induction', 'relaxation', 'bubble'],
      trigger_phrases: ['bambi sleep', 'bubble'],
      tier: 1,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Bambi Sleep — Acceptance',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'resistance_reduction',
      intensity: 3,
      fantasy_level: 3,
      duration_minutes: 28,
      themes: ['acceptance', 'resistance_reduction', 'surrender'],
      trigger_phrases: ['accept', 'let go'],
      tier: 2,
      best_time: ['evening'],
    },
    {
      title: 'Bambi Sleep — Triggers',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'trigger_installation',
      intensity: 4,
      fantasy_level: 3,
      duration_minutes: 30,
      themes: ['trigger_installation', 'conditioning', 'bimbo'],
      trigger_phrases: ['bambi sleep', 'good girl', 'freeze'],
      tier: 3,
      best_denial_range: [5, 21],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep — IQ Lock',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'dumbification',
      intensity: 5,
      fantasy_level: 5,
      duration_minutes: 25,
      themes: ['dumbification', 'bimbo', 'mindless', 'permanent'],
      trigger_phrases: ['iq lock', 'dumb doll'],
      tier: 4,
      best_denial_range: [10, 30],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep — Cock Worship',
      creator: 'bambi_sleep',
      content_type: 'audio_hypno',
      category: 'desire_installation',
      intensity: 5,
      fantasy_level: 5,
      duration_minutes: 32,
      themes: ['desire', 'sexuality', 'bimbo', 'oral'],
      trigger_phrases: ['good girl'],
      tier: 4,
      best_denial_range: [7, 30],
      best_time: ['night'],
    },
    {
      title: 'Bambi Sleep — Bimbo Drift',
      creator: 'bambi_sleep',
      content_type: 'audio_sleep',
      category: 'sleep_induction',
      intensity: 2,
      fantasy_level: 2,
      duration_minutes: 45,
      themes: ['sleep', 'trance', 'bimbo', 'drift'],
      trigger_phrases: ['bambi sleep', 'drift'],
      tier: 1,
      best_time: ['night'],
    },

    // ── Elswyth ──
    {
      title: 'Elswyth — Good Girl Conditioning',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'compliance',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 22,
      themes: ['compliance', 'good_girl', 'conditioning', 'obedience'],
      trigger_phrases: ['good girl'],
      tier: 1,
      best_time: ['evening'],
    },
    {
      title: 'Elswyth — Surrender',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'surrender',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 25,
      themes: ['surrender', 'control', 'submission', 'trance'],
      trigger_phrases: ['let go', 'surrender'],
      tier: 2,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Elswyth — Deep Trance Training',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'trance_deepening',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 30,
      themes: ['trance', 'deepening', 'training', 'induction'],
      trigger_phrases: ['drop', 'deeper'],
      tier: 1,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Elswyth — Sleep Trigger Installation',
      creator: 'elswyth',
      content_type: 'audio_sleep',
      category: 'trigger_installation',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 35,
      themes: ['sleep', 'trigger_installation', 'conditioning'],
      trigger_phrases: ['sleep now', 'drop'],
      tier: 2,
      best_time: ['night'],
    },
    {
      title: 'Elswyth — Identity Reinforcement',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'identity',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 20,
      themes: ['identity', 'reinforcement', 'name', 'self'],
      trigger_phrases: ['good girl'],
      tier: 2,
      best_time: ['morning', 'evening'],
    },
    {
      title: 'Elswyth — Obedience Loop',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'compliance',
      intensity: 4,
      fantasy_level: 3,
      duration_minutes: 18,
      themes: ['obedience', 'loop', 'compliance', 'conditioning'],
      trigger_phrases: ['obey', 'good girl'],
      tier: 3,
      best_denial_range: [5, 21],
      best_time: ['evening'],
    },
    {
      title: 'Elswyth — Morning Conditioning',
      creator: 'elswyth',
      content_type: 'audio_affirmation',
      category: 'morning_ritual',
      intensity: 2,
      fantasy_level: 1,
      duration_minutes: 12,
      themes: ['morning', 'ritual', 'affirmation', 'identity'],
      trigger_phrases: [],
      tier: 1,
      best_time: ['morning'],
    },
    {
      title: 'Elswyth — Chastity Reinforcement',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'chastity',
      intensity: 3,
      fantasy_level: 3,
      duration_minutes: 20,
      themes: ['chastity', 'denial', 'cage', 'reinforcement'],
      trigger_phrases: ['locked', 'denied'],
      tier: 2,
      best_denial_range: [3, 14],
      best_time: ['evening'],
    },
    {
      title: 'Elswyth — Ambient Feminization',
      creator: 'elswyth',
      content_type: 'audio_ambient',
      category: 'ambient',
      intensity: 1,
      fantasy_level: 1,
      duration_minutes: 60,
      themes: ['ambient', 'feminization', 'background', 'subliminal'],
      trigger_phrases: [],
      tier: 1,
      best_time: ['morning', 'afternoon'],
    },
    {
      title: 'Elswyth — Shame Dissolution',
      creator: 'elswyth',
      content_type: 'audio_hypno',
      category: 'shame_inversion',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 22,
      themes: ['shame', 'dissolution', 'acceptance', 'freedom'],
      trigger_phrases: ['let go'],
      tier: 2,
      best_time: ['evening'],
    },

    // ── Nimja ──
    {
      title: 'Nimja — Blank and Empty',
      creator: 'nimja',
      content_type: 'audio_hypno',
      category: 'dumbification',
      intensity: 3,
      fantasy_level: 2,
      duration_minutes: 18,
      themes: ['blank', 'empty', 'trance', 'mindless'],
      trigger_phrases: ['blank', 'empty'],
      tier: 2,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Nimja — Deep Relaxation',
      creator: 'nimja',
      content_type: 'audio_hypno',
      category: 'trance_deepening',
      intensity: 2,
      fantasy_level: 1,
      duration_minutes: 25,
      themes: ['trance', 'relaxation', 'deepening'],
      trigger_phrases: ['relax', 'deeper'],
      tier: 1,
      best_time: ['evening', 'night'],
    },
    {
      title: 'Nimja — Sleep',
      creator: 'nimja',
      content_type: 'audio_sleep',
      category: 'sleep_induction',
      intensity: 1,
      fantasy_level: 1,
      duration_minutes: 30,
      themes: ['sleep', 'relaxation', 'rest'],
      trigger_phrases: ['sleep'],
      tier: 1,
      best_time: ['night'],
    },
    {
      title: 'Nimja — Arousal Control',
      creator: 'nimja',
      content_type: 'audio_hypno',
      category: 'arousal_binding',
      intensity: 3,
      fantasy_level: 3,
      duration_minutes: 20,
      themes: ['arousal', 'control', 'binding', 'denial'],
      trigger_phrases: ['control'],
      tier: 2,
      best_denial_range: [3, 14],
      best_time: ['evening'],
    },
  ];

  let inserted = 0;

  for (const seed of seeds) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('external_content_index')
      .select('id')
      .eq('user_id', userId)
      .eq('title', seed.title)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase
      .from('external_content_index')
      .insert({ user_id: userId, ...seed });

    if (!error) inserted++;
  }

  return inserted;
}
