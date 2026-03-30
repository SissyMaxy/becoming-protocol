/**
 * Post-Release Bridge — P5.4
 *
 * Detects release from Whoop biometrics and user_state, triggers the
 * post-release sequence (state reset, morning reframe flag, impact tracking),
 * and builds Handler context for post-release awareness.
 */

import { supabase } from '../supabase';
import { recordIntervention } from './impact-tracking';

// ============================================
// TYPES
// ============================================

export interface ReleaseDetection {
  detected: boolean;
  timestamp?: string;
  evidence: string;
}

export interface PostReleaseContext {
  daysSinceLastRelease: number | null;
  postReleaseActive: boolean;
  morningReframePending: boolean;
  lastReleaseTimestamp: string | null;
  recentReleaseCount7d: number;
}

// ============================================
// DETECT RELEASE FROM WHOOP
// ============================================

/**
 * Query whoop_metrics for HR patterns indicating orgasm: sudden HR spike >140
 * followed by rapid drop within 5 minutes. Also check user_state.last_release.
 */
export async function detectReleaseFromWhoop(userId: string): Promise<ReleaseDetection> {
  try {
    const [whoopResult, stateResult] = await Promise.allSettled([
      // Look for HR spike patterns in the last 2 hours
      supabase
        .from('whoop_metrics')
        .select('avg_hr, max_heart_rate, recorded_at, date')
        .eq('user_id', userId)
        .gte('recorded_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('recorded_at', { ascending: false })
        .limit(10),
      supabase
        .from('user_state')
        .select('last_release, denial_day')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const whoopData =
      whoopResult.status === 'fulfilled' ? whoopResult.value.data : null;
    const stateData =
      stateResult.status === 'fulfilled' ? stateResult.value.data : null;

    // Check 1: Whoop HR spike pattern
    if (whoopData && whoopData.length >= 2) {
      for (let i = 0; i < whoopData.length - 1; i++) {
        const current = whoopData[i];
        const previous = whoopData[i + 1];

        const currentMax = current.max_heart_rate ?? current.avg_hr ?? 0;
        const previousMax = previous.max_heart_rate ?? previous.avg_hr ?? 0;

        // Spike >140 followed by rapid drop (at least 30bpm decrease)
        if (previousMax > 140 && currentMax < previousMax - 30) {
          const timeDiff =
            new Date(previous.recorded_at).getTime() -
            new Date(current.recorded_at).getTime();
          const minutesDiff = Math.abs(timeDiff) / 60000;

          if (minutesDiff <= 5) {
            return {
              detected: true,
              timestamp: previous.recorded_at,
              evidence: `HR spike to ${previousMax}bpm then dropped to ${currentMax}bpm within ${minutesDiff.toFixed(1)}min`,
            };
          }
        }
      }
    }

    // Check 2: user_state.last_release updated in the last 2 hours
    if (stateData?.last_release) {
      const lastRelease = new Date(stateData.last_release);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      if (lastRelease > twoHoursAgo) {
        return {
          detected: true,
          timestamp: stateData.last_release,
          evidence: `user_state.last_release updated at ${lastRelease.toISOString()}, denial_day was ${stateData.denial_day ?? 'unknown'}`,
        };
      }
    }

    return {
      detected: false,
      evidence: 'No HR spike pattern or recent release timestamp found',
    };
  } catch (err) {
    console.error('[post-release-bridge] detectReleaseFromWhoop error:', err);
    return {
      detected: false,
      evidence: 'Detection failed due to error',
    };
  }
}

// ============================================
// TRIGGER POST-RELEASE SEQUENCE
// ============================================

/**
 * When release detected:
 * 1. Update user_state (reset denial day, record release)
 * 2. Flag for morning reframe (set post_release_reframe_pending)
 * 3. Record in conditioning impact tracking as behavioral event
 */
export async function triggerPostReleaseSequence(userId: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // 1. Update user_state: reset denial day, record release timestamp
    const { error: stateError } = await supabase
      .from('user_state')
      .update({
        denial_day: 0,
        last_release: now,
        post_release_reframe_pending: true,
        updated_at: now,
      })
      .eq('user_id', userId);

    if (stateError) {
      console.error('[post-release-bridge] Failed to update user_state:', stateError.message);
      return false;
    }

    // 2. Record in impact tracking as a behavioral event (fire-and-forget)
    recordIntervention(userId, {
      intervention_type: 'reframe',
      intervention_detail: 'Post-release sequence triggered — denial day reset, morning reframe queued',
    }).catch(() => {});

    // 3. Log to orgasm_log if not already logged (idempotent check)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentOrgasm } = await supabase
      .from('orgasm_log')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', twoMinAgo)
      .limit(1)
      .maybeSingle();

    if (!recentOrgasm) {
      await supabase.from('orgasm_log').insert({
        user_id: userId,
        release_type: 'detected',
        context: 'whoop_biometric',
        planned: false,
        state_before: 'unknown',
        days_since_last: 0,
        notes: 'Auto-detected from biometric data',
      });
    }

    return true;
  } catch (err) {
    console.error('[post-release-bridge] triggerPostReleaseSequence error:', err);
    return false;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Handler context showing: days since last release, whether post-release
 * protocol is active, morning reframe pending. If release was recent (<24h),
 * Handler should reference it.
 */
export async function buildPostReleaseContext(userId: string): Promise<string> {
  try {
    const [stateResult, recentReleasesResult] = await Promise.allSettled([
      supabase
        .from('user_state')
        .select('last_release, denial_day, post_release_reframe_pending')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('orgasm_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    const state =
      stateResult.status === 'fulfilled' ? stateResult.value.data : null;
    const recentCount =
      recentReleasesResult.status === 'fulfilled'
        ? recentReleasesResult.value.count ?? 0
        : 0;

    if (!state) return '';

    const parts: string[] = [];

    const daysSince = state.last_release
      ? Math.floor(
          (Date.now() - new Date(state.last_release).getTime()) / 86400000,
        )
      : null;

    const isRecent = daysSince !== null && daysSince < 1;
    const reframePending = state.post_release_reframe_pending === true;

    if (isRecent || reframePending || recentCount > 2) {
      parts.push(
        `POST-RELEASE BRIDGE: denial day ${state.denial_day ?? 0}, last release ${daysSince !== null ? `${daysSince}d ago` : 'unknown'}, 7d releases: ${recentCount}`,
      );

      if (isRecent) {
        const hoursAgo = state.last_release
          ? Math.round(
              (Date.now() - new Date(state.last_release).getTime()) / 3600000,
            )
          : 0;
        parts.push(
          `  RECENT RELEASE: ${hoursAgo}h ago — Handler should reference without judgment, neurochemistry framing`,
        );
      }

      if (reframePending) {
        parts.push(
          '  MORNING REFRAME: pending — lead with survival evidence, prescribe anchoring task',
        );
      }

      if (recentCount > 2) {
        parts.push(
          `  PATTERN: ${recentCount} releases in 7 days — elevated frequency, adjust conditioning intensity`,
        );
      }
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[post-release-bridge] buildPostReleaseContext error:', err);
    return '';
  }
}
