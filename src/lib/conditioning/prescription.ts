/**
 * Session Prescription Engine
 *
 * Determines what conditioning content to serve based on context,
 * denial state, streak, and arousal level. Manages tier access
 * and content variety through least-prescribed ordering.
 */

import { supabase } from '../supabase';

export type SessionContext = 'evening' | 'sleep' | 'morning' | 'background' | 'goon' | 'edge';

export interface SessionPrescription {
  sessionType: string;
  context: SessionContext;
  tier: number;
  contentIds: string[];
  duration_minutes: number;
  intensity: number;
  notes: string;
}

interface ContentCriteria {
  mediaType?: string;
  category?: string;
  maxTier: number;
  sessionContext?: SessionContext;
  fantasyLevel?: number;
  intensity?: number;
  preferCustom?: boolean;
  limit?: number;
}

interface ContentRow {
  id: string;
  title: string;
  media_type: string;
  category: string;
  tier: number;
  duration_minutes: number;
  intensity: number;
  times_prescribed: number;
  source: string;
}

/**
 * Prescribe a conditioning session based on context and user state.
 */
export async function prescribeSession(
  userId: string,
  context: SessionContext
): Promise<SessionPrescription | null> {
  try {
    // Fetch user state
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, streak_days, current_arousal')
      .eq('user_id', userId)
      .maybeSingle();

    const denialDay = state?.denial_day ?? 0;
    const streakDays = state?.streak_days ?? 0;
    const arousal = state?.current_arousal ?? 0;

    // Calculate tier access
    let tier = 1;
    if (denialDay >= 7) tier = 4;
    else if (streakDays >= 7 || denialDay >= 5) tier = 3;
    else if (streakDays >= 3) tier = 2;

    // Determine session type and parameters by context
    const { sessionType, duration, intensity, category, mediaType } = resolveSessionParams(
      context, tier, denialDay, arousal
    );

    // Select content
    const content = await selectContent(userId, {
      mediaType,
      category,
      maxTier: tier,
      sessionContext: context,
      intensity,
      preferCustom: context === 'evening' || context === 'goon',
      limit: context === 'sleep' ? 5 : 3,
    });

    return {
      sessionType,
      context,
      tier,
      contentIds: content.map(c => c.id),
      duration_minutes: duration,
      intensity,
      notes: buildPrescriptionNotes(context, tier, denialDay, streakDays, arousal),
    };
  } catch (err) {
    console.error('[prescription] prescribeSession exception:', err);
    return null;
  }
}

function resolveSessionParams(
  context: SessionContext,
  tier: number,
  denialDay: number,
  arousal: number
): { sessionType: string; duration: number; intensity: number; category: string; mediaType?: string } {
  switch (context) {
    case 'sleep':
      return {
        sessionType: 'sleep_conditioning',
        duration: 360,
        intensity: Math.min(tier, 3),
        category: 'sleep_audio',
        mediaType: 'audio',
      };
    case 'morning':
      return {
        sessionType: 'morning_reinforcement',
        duration: 10,
        intensity: Math.min(tier, 2),
        category: 'affirmation',
      };
    case 'evening':
      return {
        sessionType: 'evening_session',
        duration: 20 + tier * 5,
        intensity: tier,
        category: 'identity_installation',
      };
    case 'background':
      return {
        sessionType: 'ambient_conditioning',
        duration: 60,
        intensity: 1,
        category: 'subliminal',
        mediaType: 'audio',
      };
    case 'goon':
      return {
        sessionType: 'goon_session',
        duration: 30 + denialDay * 5,
        intensity: tier,
        category: 'arousal_binding',
      };
    case 'edge':
      return {
        sessionType: 'edge_session',
        duration: 15 + Math.min(denialDay * 3, 30),
        intensity: Math.min(tier + (arousal > 7 ? 1 : 0), 4),
        category: 'edge_content',
      };
    default:
      return {
        sessionType: 'general',
        duration: 15,
        intensity: 1,
        category: 'general',
      };
  }
}

function buildPrescriptionNotes(
  context: SessionContext,
  tier: number,
  denialDay: number,
  streakDays: number,
  arousal: number
): string {
  const parts: string[] = [];
  parts.push(`Tier ${tier} access.`);
  if (denialDay > 0) parts.push(`Denial day ${denialDay}.`);
  if (streakDays > 0) parts.push(`Streak: ${streakDays} days.`);
  if (arousal > 7) parts.push('High arousal — leverage for deeper conditioning.');
  if (context === 'sleep') parts.push('Subliminal volume. Full duration processing.');
  if (context === 'goon') parts.push('Extended arousal binding. No release permitted.');
  if (context === 'edge') parts.push('Edge maintenance. Arousal ceiling enforcement.');
  return parts.join(' ');
}

/**
 * Select content from content_curriculum matching criteria.
 * Orders by times_prescribed ASC for variety.
 * Prefers custom_handler content when preferCustom is set.
 */
export async function selectContent(
  userId: string,
  criteria: ContentCriteria
): Promise<ContentRow[]> {
  try {
    let query = supabase
      .from('content_curriculum')
      .select('id, title, media_type, category, tier, duration_minutes, intensity, times_prescribed, source')
      .eq('user_id', userId)
      .lte('tier', criteria.maxTier);

    if (criteria.mediaType) {
      query = query.eq('media_type', criteria.mediaType);
    }
    if (criteria.category) {
      query = query.eq('category', criteria.category);
    }
    if (criteria.sessionContext) {
      query = query.contains('session_contexts', [criteria.sessionContext]);
    }
    if (criteria.fantasyLevel !== undefined) {
      query = query.lte('fantasy_level', criteria.fantasyLevel);
    }
    if (criteria.intensity !== undefined) {
      query = query.lte('intensity', criteria.intensity);
    }

    // Order by least prescribed for variety
    query = query.order('times_prescribed', { ascending: true });

    // Prefer custom handler content
    if (criteria.preferCustom) {
      query = query.order('source', { ascending: false }); // 'custom_handler' sorts after 'default'
    }

    query = query.limit(criteria.limit ?? 3);

    const { data, error } = await query;

    if (error) {
      console.error('[prescription] selectContent error:', error.message);
      return [];
    }

    // Increment times_prescribed for selected content
    if (data?.length) {
      const ids = data.map(c => c.id);
      for (const id of ids) {
        await supabase.rpc('increment_field', {
          table_name: 'content_curriculum',
          row_id: id,
          field_name: 'times_prescribed',
          increment_by: 1,
        }).then(({ error: rpcErr }) => {
          // Fall back to read-then-write if RPC doesn't exist
          if (rpcErr) {
            const row = data.find(c => c.id === id);
            if (row) {
              supabase
                .from('content_curriculum')
                .update({ times_prescribed: (row.times_prescribed ?? 0) + 1 })
                .eq('id', id)
                .then(() => {});
            }
          }
        });
      }
    }

    return (data ?? []) as ContentRow[];
  } catch (err) {
    console.error('[prescription] selectContent exception:', err);
    return [];
  }
}
