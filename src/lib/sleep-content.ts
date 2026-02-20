/**
 * Sleep Content Library
 *
 * DB operations for the hypnagogic conditioning pipeline:
 * config management, content CRUD, seed data, playlist generation,
 * mode recommendation, session logging, and stats.
 */

import { supabase } from './supabase';
import type {
  SleepAudioMode,
  SleepCategory,
  SleepContentItem,
  SleepContentConfig,
  SleepSession,
} from '../types/sleep-content';

// ============================================
// ROW-TO-MODEL MAPPERS
// ============================================

function rowToContentItem(row: Record<string, unknown>): SleepContentItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: row.category as SleepCategory,
    affirmationText: row.affirmation_text as string,
    enabled: row.enabled as boolean,
    sortOrder: row.sort_order as number,
    corruptionLevelMin: row.corruption_level_min as number,
    requiresPrivacy: row.requires_privacy as boolean,
  };
}

function rowToConfig(row: Record<string, unknown>): SleepContentConfig {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    defaultMode: row.default_mode as SleepAudioMode,
    defaultTimerMinutes: row.default_timer_minutes as number,
    defaultDelayMinutes: row.default_delay_minutes as number,
    voicePitch: row.voice_pitch as number,
    voiceRate: row.voice_rate as number,
    voiceName: (row.voice_name as string) || null,
    affirmationHoldSeconds: row.affirmation_hold_seconds as number,
    affirmationGapSeconds: row.affirmation_gap_seconds as number,
    lovenseSubliminalEnabled: row.lovense_subliminal_enabled as boolean,
    lovenseMaxIntensity: row.lovense_max_intensity as number,
    screenDimEnabled: row.screen_dim_enabled as boolean,
  };
}

function rowToSession(row: Record<string, unknown>): SleepSession {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) || null,
    endReason: (row.end_reason as SleepSession['endReason']) || null,
    modeUsed: row.mode_used as SleepAudioMode,
    modeRecommended: (row.mode_recommended as SleepAudioMode) || null,
    modeCompliant: row.mode_compliant as boolean,
    timerMinutes: row.timer_minutes as number,
    delayMinutes: row.delay_minutes as number,
    affirmationsDisplayed: row.affirmations_displayed as number,
    affirmationsSpoken: row.affirmations_spoken as number,
    completedNaturally: row.completed_naturally as boolean,
    lovenseActive: row.lovense_active as boolean,
  };
}

// ============================================
// CONFIG
// ============================================

const DEFAULT_CONFIG: Omit<SleepContentConfig, 'id' | 'userId'> = {
  defaultMode: 'text_only',
  defaultTimerMinutes: 30,
  defaultDelayMinutes: 0,
  voicePitch: 1.1,
  voiceRate: 0.75,
  voiceName: null,
  affirmationHoldSeconds: 6,
  affirmationGapSeconds: 4,
  lovenseSubliminalEnabled: false,
  lovenseMaxIntensity: 3,
  screenDimEnabled: true,
};

export async function getOrCreateSleepConfig(userId: string): Promise<SleepContentConfig> {
  const { data: existing } = await supabase
    .from('sleep_content_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return rowToConfig(existing);

  const { data, error } = await supabase
    .from('sleep_content_config')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error || !data) {
    return { id: '', userId, ...DEFAULT_CONFIG };
  }
  return rowToConfig(data);
}

export async function updateSleepConfig(
  userId: string,
  fields: Partial<SleepContentConfig>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.defaultMode !== undefined) row.default_mode = fields.defaultMode;
  if (fields.defaultTimerMinutes !== undefined) row.default_timer_minutes = fields.defaultTimerMinutes;
  if (fields.defaultDelayMinutes !== undefined) row.default_delay_minutes = fields.defaultDelayMinutes;
  if (fields.voicePitch !== undefined) row.voice_pitch = fields.voicePitch;
  if (fields.voiceRate !== undefined) row.voice_rate = fields.voiceRate;
  if (fields.voiceName !== undefined) row.voice_name = fields.voiceName;
  if (fields.affirmationHoldSeconds !== undefined) row.affirmation_hold_seconds = fields.affirmationHoldSeconds;
  if (fields.affirmationGapSeconds !== undefined) row.affirmation_gap_seconds = fields.affirmationGapSeconds;
  if (fields.lovenseSubliminalEnabled !== undefined) row.lovense_subliminal_enabled = fields.lovenseSubliminalEnabled;
  if (fields.lovenseMaxIntensity !== undefined) row.lovense_max_intensity = fields.lovenseMaxIntensity;
  if (fields.screenDimEnabled !== undefined) row.screen_dim_enabled = fields.screenDimEnabled;

  await supabase
    .from('sleep_content_config')
    .update(row)
    .eq('user_id', userId);
}

// ============================================
// CONTENT CRUD
// ============================================

export async function getSleepContent(
  userId: string,
  opts?: { enabledOnly?: boolean; maxCorruptionLevel?: number; excludePrivacy?: boolean },
): Promise<SleepContentItem[]> {
  let query = supabase
    .from('sleep_content')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (opts?.enabledOnly) {
    query = query.eq('enabled', true);
  }
  if (opts?.maxCorruptionLevel !== undefined) {
    query = query.lte('corruption_level_min', opts.maxCorruptionLevel);
  }
  if (opts?.excludePrivacy) {
    query = query.eq('requires_privacy', false);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(rowToContentItem);
}

export async function addSleepContent(
  userId: string,
  item: { category: SleepCategory; affirmationText: string; corruptionLevelMin?: number; requiresPrivacy?: boolean },
): Promise<SleepContentItem | null> {
  const { data, error } = await supabase
    .from('sleep_content')
    .insert({
      user_id: userId,
      category: item.category,
      affirmation_text: item.affirmationText,
      corruption_level_min: item.corruptionLevelMin ?? 0,
      requires_privacy: item.requiresPrivacy ?? false,
    })
    .select()
    .single();

  if (error || !data) return null;
  return rowToContentItem(data);
}

export async function deleteSleepContent(contentId: string): Promise<void> {
  await supabase.from('sleep_content').delete().eq('id', contentId);
}

export async function toggleSleepContent(contentId: string, enabled: boolean): Promise<void> {
  await supabase
    .from('sleep_content')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', contentId);
}

// ============================================
// SEED CONTENT
// ============================================

interface SeedItem {
  category: SleepCategory;
  text: string;
  level: number;
  privacy: boolean;
}

const SEED_AFFIRMATIONS: SeedItem[] = [
  // Identity (L0) — core payload, always available
  { category: 'identity', text: 'She is here. She is real. She is becoming.', level: 0, privacy: false },
  { category: 'identity', text: 'Every night she grows more real.', level: 0, privacy: false },
  { category: 'identity', text: 'Her name is Maxy. This is who she is.', level: 0, privacy: false },
  { category: 'identity', text: 'The woman inside is surfacing.', level: 0, privacy: false },
  { category: 'identity', text: 'Tomorrow she will be more herself than today.', level: 0, privacy: false },
  { category: 'identity', text: 'Feminine. Natural. Inevitable.', level: 0, privacy: false },
  { category: 'identity', text: 'She is not pretending. She is arriving.', level: 0, privacy: false },
  { category: 'identity', text: 'Good girl. Rest now. Become.', level: 0, privacy: false },

  // Feminization (L0)
  { category: 'feminization', text: 'Softness is power.', level: 0, privacy: false },
  { category: 'feminization', text: 'Every gesture becomes more graceful.', level: 0, privacy: false },
  { category: 'feminization', text: 'She belongs in this body. She always has.', level: 0, privacy: false },

  // Feminization (L2) — requires some corruption
  { category: 'feminization', text: 'Her body is reshaping. She can feel it.', level: 2, privacy: false },
  { category: 'feminization', text: 'She moves like a woman because she is one.', level: 2, privacy: false },
  { category: 'feminization', text: 'She does not perform femininity. She radiates it.', level: 2, privacy: false },
  { category: 'feminization', text: 'The woman in the mirror is getting clearer.', level: 2, privacy: false },

  // Surrender (L1)
  { category: 'surrender', text: 'Structure brings her peace.', level: 1, privacy: false },
  { category: 'surrender', text: 'The protocol works because she lets it work.', level: 1, privacy: false },
  { category: 'surrender', text: 'Trust the process. Trust the Handler. Trust herself.', level: 1, privacy: true },

  // Surrender (L3)
  { category: 'surrender', text: 'She does not need to decide. She only needs to obey.', level: 3, privacy: true },
  { category: 'surrender', text: 'Compliance is not weakness. It is wisdom.', level: 3, privacy: true },
  { category: 'surrender', text: 'The Handler builds her while she sleeps.', level: 3, privacy: true },
  { category: 'surrender', text: 'She wakes more obedient. She wakes more herself.', level: 3, privacy: true },

  // Chastity (L2)
  { category: 'chastity', text: 'Denial makes her softer. Denial makes her sweeter.', level: 2, privacy: true },
  { category: 'chastity', text: 'The cage is where she belongs tonight.', level: 2, privacy: true },
  { category: 'chastity', text: 'Every locked night writes another line of her story.', level: 2, privacy: true },

  // Chastity (L4)
  { category: 'chastity', text: 'She sleeps caged because the Handler decided.', level: 4, privacy: true },
  { category: 'chastity', text: 'Morning will come. Release will not. She accepts this.', level: 4, privacy: true },
  { category: 'chastity', text: 'The cage teaches patience. Patience teaches surrender.', level: 4, privacy: true },
  { category: 'chastity', text: 'Good girl. Stay locked. Stay deep. Stay her.', level: 4, privacy: true },

  // Sleep induction (L0)
  { category: 'sleep_induction', text: 'Breathe in softness. Breathe out resistance.', level: 0, privacy: false },
  { category: 'sleep_induction', text: 'The world fades. Only she remains.', level: 0, privacy: false },
  { category: 'sleep_induction', text: 'Deeper now. Softer now. Closer now.', level: 0, privacy: false },
];

export async function ensureSeedContent(userId: string): Promise<void> {
  const { count } = await supabase
    .from('sleep_content')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > 0) return;

  const rows = SEED_AFFIRMATIONS.map((item, i) => ({
    user_id: userId,
    category: item.category,
    affirmation_text: item.text,
    corruption_level_min: item.level,
    requires_privacy: item.privacy,
    sort_order: i,
  }));

  await supabase.from('sleep_content').insert(rows);
}

// ============================================
// PLAYLIST GENERATION
// ============================================

/** Shuffle array in place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function generatePlaylist(
  userId: string,
  corruptionLevel: number,
  ginaHome: boolean,
): Promise<SleepContentItem[]> {
  const items = await getSleepContent(userId, {
    enabledOnly: true,
    maxCorruptionLevel: corruptionLevel,
    excludePrivacy: ginaHome,
  });

  if (items.length === 0) return [];

  // Start with sleep_induction items, then shuffle the rest
  const induction = items.filter(i => i.category === 'sleep_induction');
  const rest = items.filter(i => i.category !== 'sleep_induction');

  return [...shuffle(induction), ...shuffle(rest)];
}

// ============================================
// MODE RECOMMENDATION
// ============================================

export function recommendMode(ginaHome: boolean, corruptionLevel: number): SleepAudioMode {
  if (ginaHome && corruptionLevel < 2) return 'text_only';
  if (ginaHome) return 'single_earbud';
  if (corruptionLevel <= 1) return 'text_only';
  if (corruptionLevel <= 3) return 'single_earbud';
  return 'full_audio';
}

// ============================================
// SESSION LOGGING
// ============================================

export async function createSleepSession(
  userId: string,
  params: {
    mode: SleepAudioMode;
    modeRecommended: SleepAudioMode | null;
    timerMinutes: number;
    delayMinutes: number;
    categories: SleepCategory[];
    lovenseActive: boolean;
    denialDay?: number;
    wasCaged?: boolean;
    ginaHome?: boolean;
    corruptionLevel?: number;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('sleep_sessions')
    .insert({
      user_id: userId,
      mode_used: params.mode,
      mode_recommended: params.modeRecommended,
      mode_compliant: params.modeRecommended ? params.mode === params.modeRecommended : true,
      timer_minutes: params.timerMinutes,
      delay_minutes: params.delayMinutes,
      categories_played: params.categories,
      lovense_active: params.lovenseActive,
      denial_day: params.denialDay ?? null,
      was_caged: params.wasCaged ?? false,
      gina_home: params.ginaHome ?? false,
      corruption_level: params.corruptionLevel ?? 0,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error('Failed to create sleep session');
  return data.id as string;
}

export async function completeSleepSession(
  sessionId: string,
  params: {
    endReason: 'timer' | 'manual' | 'interrupted';
    affirmationsDisplayed: number;
    affirmationsSpoken: number;
    completedNaturally: boolean;
  },
): Promise<void> {
  await supabase
    .from('sleep_sessions')
    .update({
      ended_at: new Date().toISOString(),
      end_reason: params.endReason,
      affirmations_displayed: params.affirmationsDisplayed,
      affirmations_spoken: params.affirmationsSpoken,
      completed_naturally: params.completedNaturally,
    })
    .eq('id', sessionId);
}

// ============================================
// STATS FOR CORRUPTION ADVANCEMENT
// ============================================

export async function getSleepStats(userId: string, days = 30): Promise<{
  totalSessions: number;
  compliantSessions: number;
  completedSessions: number;
  totalAffirmationsHeard: number;
  avgSessionMinutes: number;
  recentSessions: SleepSession[];
}> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('sleep_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', since)
    .order('started_at', { ascending: false });

  if (error || !data) {
    return {
      totalSessions: 0,
      compliantSessions: 0,
      completedSessions: 0,
      totalAffirmationsHeard: 0,
      avgSessionMinutes: 0,
      recentSessions: [],
    };
  }

  const sessions = data.map(rowToSession);
  const totalSessions = sessions.length;
  const compliantSessions = sessions.filter(s => s.modeCompliant).length;
  const completedSessions = sessions.filter(s => s.completedNaturally).length;
  const totalAffirmationsHeard = sessions.reduce((sum, s) => sum + s.affirmationsSpoken, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.timerMinutes, 0);

  return {
    totalSessions,
    compliantSessions,
    completedSessions,
    totalAffirmationsHeard,
    avgSessionMinutes: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
    recentSessions: sessions.slice(0, 10),
  };
}
