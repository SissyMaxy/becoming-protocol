/**
 * Gina Micro-Exposure Automation (P10.10)
 *
 * Automate tiny Gina-aware exposures that accumulate over time.
 * Checks Gina state (home/mood), selects appropriate low-risk exposures,
 * and feeds results back into gina_seed_log.
 *
 * Tables: gina_seed_log (existing), gina_micro_exposures (new)
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface MicroExposure {
  exposure: string;
  risk: number;
  requires_gina_home: boolean;
}

export type GinaResponse = 'positive' | 'neutral' | 'negative' | 'not_noticed';

export interface ExposureRecord {
  id: string;
  channel: string;
  exposure: string;
  risk: number;
  ginaResponse: GinaResponse | null;
  prescribedAt: string;
  completedAt: string | null;
}

export interface ExposurePrescription {
  channel: string;
  exposure: string;
  risk: number;
  reason: string;
}

// ============================================
// MICRO-EXPOSURE DEFINITIONS
// ============================================

const MICRO_EXPOSURES: Record<string, MicroExposure[]> = {
  scent: [
    { exposure: 'Leave your feminine perfume on the bathroom counter', risk: 1, requires_gina_home: true },
    { exposure: 'Apply scented lotion before bed', risk: 1, requires_gina_home: true },
    { exposure: 'Use feminine deodorant', risk: 1, requires_gina_home: false },
  ],
  touch: [
    { exposure: 'Wear the soft t-shirt she commented on', risk: 1, requires_gina_home: true },
    { exposure: 'Apply hand cream in front of her', risk: 1, requires_gina_home: true },
    { exposure: 'Get a manicure (clear coat)', risk: 2, requires_gina_home: false },
  ],
  visual: [
    { exposure: 'Leave lip balm on your nightstand', risk: 1, requires_gina_home: true },
    { exposure: 'Wear feminine socks at home', risk: 1, requires_gina_home: true },
    { exposure: 'Leave a feminine accessory visible in your space', risk: 2, requires_gina_home: true },
  ],
  conversation: [
    { exposure: 'Mention a skincare product casually', risk: 1, requires_gina_home: true },
    { exposure: "Ask Gina's opinion on a scent", risk: 2, requires_gina_home: true },
    { exposure: "Mention you've been doing yoga", risk: 1, requires_gina_home: true },
  ],
};

const EXPOSURE_CHANNELS = Object.keys(MICRO_EXPOSURES);

// ============================================
// GINA STATE HELPERS
// ============================================

interface GinaState {
  isHome: boolean;
  mood: string | null;
}

async function getGinaState(userId: string): Promise<GinaState> {
  try {
    const { data } = await supabase
      .from('gina_state')
      .select('is_home, mood')
      .eq('user_id', userId)
      .single();

    return {
      isHome: data?.is_home ?? false,
      mood: data?.mood ?? null,
    };
  } catch {
    return { isHome: false, mood: null };
  }
}

/**
 * Count positive seeds for a channel (from gina_seed_log).
 */
async function getPositiveSeedCount(userId: string, channel: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('gina_seed_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('channel', channel)
      .eq('gina_response', 'positive');

    if (error || count == null) return 0;
    return count;
  } catch {
    return 0;
  }
}

/**
 * Get completed exposures for a channel to avoid repeats.
 */
async function getCompletedExposures(userId: string, channel: string): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('gina_micro_exposures')
      .select('exposure')
      .eq('user_id', userId)
      .eq('channel', channel)
      .not('completed_at', 'is', null);

    if (!data) return new Set();
    return new Set(data.map((r: any) => r.exposure));
  } catch {
    return new Set();
  }
}

/**
 * Get the last exposure date for any channel.
 */
async function getLastExposureDate(userId: string): Promise<Date | null> {
  try {
    const { data } = await supabase
      .from('gina_micro_exposures')
      .select('prescribed_at')
      .eq('user_id', userId)
      .order('prescribed_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) return null;
    return new Date(data.prescribed_at);
  } catch {
    return null;
  }
}

// ============================================
// CORE ENGINE
// ============================================

/**
 * Prescribe a micro-exposure based on Gina state and channel progress.
 * Never prescribes risk 2+ if the channel has no positive seeds yet.
 */
export async function prescribeMicroExposure(
  userId: string,
): Promise<ExposurePrescription | null> {
  try {
    const ginaState = await getGinaState(userId);

    // Gather channel data in parallel
    const channelData = await Promise.all(
      EXPOSURE_CHANNELS.map(async (channel) => {
        const [positiveSeeds, completed] = await Promise.all([
          getPositiveSeedCount(userId, channel),
          getCompletedExposures(userId, channel),
        ]);
        return { channel, positiveSeeds, completed };
      }),
    );

    // Sort channels by fewest completed exposures (prioritize underexposed channels)
    channelData.sort((a, b) => a.completed.size - b.completed.size);

    for (const { channel, positiveSeeds, completed } of channelData) {
      const exposures = MICRO_EXPOSURES[channel];
      if (!exposures) continue;

      for (const exp of exposures) {
        // Skip already completed
        if (completed.has(exp.exposure)) continue;

        // Skip if requires Gina home but she's not
        if (exp.requires_gina_home && !ginaState.isHome) continue;

        // Skip risk 2+ if no positive seeds in this channel
        if (exp.risk >= 2 && positiveSeeds === 0) continue;

        // Skip if Gina mood is negative and risk > 1
        if (ginaState.mood === 'negative' && exp.risk > 1) continue;

        // Found a valid exposure
        const reason = ginaState.isHome
          ? `Gina is home. Channel '${channel}' has ${positiveSeeds} positive seeds.`
          : `Gina not home. Safe for non-home exposure in '${channel}'.`;

        // Record the prescription
        await supabase.from('gina_micro_exposures').insert({
          user_id: userId,
          channel,
          exposure: exp.exposure,
          risk: exp.risk,
          prescribed_at: new Date().toISOString(),
        });

        return {
          channel,
          exposure: exp.exposure,
          risk: exp.risk,
          reason,
        };
      }
    }

    return null; // No valid exposure found
  } catch {
    return null;
  }
}

/**
 * Record the result of a micro-exposure.
 * Feeds the response back into gina_seed_log.
 */
export async function recordExposureResult(
  userId: string,
  exposureId: string,
  ginaResponse: GinaResponse,
): Promise<void> {
  try {
    // Update the micro-exposure record
    const { data: exposure } = await supabase
      .from('gina_micro_exposures')
      .update({
        gina_response: ginaResponse,
        completed_at: new Date().toISOString(),
      })
      .eq('id', exposureId)
      .eq('user_id', userId)
      .select('channel, exposure')
      .single();

    if (!exposure) return;

    // Feed into gina_seed_log
    await supabase.from('gina_seed_log').insert({
      user_id: userId,
      channel: exposure.channel,
      seed_type: 'micro_exposure',
      description: exposure.exposure,
      gina_response: ginaResponse,
    });
  } catch {
    // Non-critical — silently fail
  }
}

/**
 * Get recent exposure history for context.
 */
async function getRecentExposures(userId: string, limit: number = 5): Promise<ExposureRecord[]> {
  try {
    const { data } = await supabase
      .from('gina_micro_exposures')
      .select('*')
      .eq('user_id', userId)
      .order('prescribed_at', { ascending: false })
      .limit(limit);

    if (!data) return [];

    return data.map((row: any) => ({
      id: row.id,
      channel: row.channel,
      exposure: row.exposure,
      risk: row.risk,
      ginaResponse: row.gina_response,
      prescribedAt: row.prescribed_at,
      completedAt: row.completed_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Handler context block for Gina micro-exposures.
 */
export async function buildGinaMicroExposureContext(userId: string): Promise<string> {
  try {
    const [ginaState, recent, nextExposure, lastDate] = await Promise.all([
      getGinaState(userId),
      getRecentExposures(userId, 3),
      prescribeMicroExposure(userId).catch(() => null),
      getLastExposureDate(userId),
    ]);

    const parts: string[] = [];

    // Current opportunity
    if (nextExposure) {
      const daysSinceLast = lastDate
        ? Math.floor((Date.now() - lastDate.getTime()) / 86400000)
        : null;
      const lastStr = daysSinceLast !== null ? `Last exposure: ${daysSinceLast}d ago.` : 'No prior exposures.';

      parts.push(
        `MICRO-EXPOSURE: ${nextExposure.reason} Recommended: ${nextExposure.exposure} (risk: ${nextExposure.risk}). ${lastStr}`,
      );
    } else if (ginaState.isHome) {
      parts.push('MICRO-EXPOSURE: Gina home but no valid exposure available (all completed or mood unsafe).');
    }

    // Recent history
    if (recent.length > 0) {
      const historyLines = recent.map((r) => {
        const response = r.ginaResponse || 'pending';
        return `  ${r.channel}: "${r.exposure}" -> ${response}`;
      });
      parts.push(`  recent: ${historyLines.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  } catch {
    return '';
  }
}
