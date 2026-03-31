/**
 * Intelligent Session Chaining (P12.6)
 *
 * Chains multiple session segments into automated evening sequences.
 * Selects the right chain based on Whoop recovery, denial day,
 * emotional state, and day of week.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface ChainSegment {
  type: string;
  duration: number; // minutes
  description: string;
}

export interface ChainTemplate {
  name: string;
  segments: ChainSegment[];
}

export interface ActiveChainSegment {
  id: string;
  chainId: string;
  segmentIndex: number;
  type: string;
  duration: number;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  startedAt: string | null;
  completedAt: string | null;
}

export interface ActiveChain {
  id: string;
  userId: string;
  chainName: string;
  status: 'active' | 'completed' | 'abandoned';
  currentSegmentIndex: number;
  segments: ActiveChainSegment[];
  totalDurationMinutes: number;
  startedAt: string;
}

export interface ChainRecommendation {
  chainName: string;
  reason: string;
  totalMinutes: number;
  segments: ChainSegment[];
}

// ============================================
// CHAIN TEMPLATES
// ============================================

const EVENING_CHAINS: ChainTemplate[] = [
  {
    name: 'standard_evening',
    segments: [
      { type: 'voice_warmup', duration: 5, description: 'Voice practice at current level target' },
      { type: 'trance_induction', duration: 10, description: 'Theta binaural + induction script' },
      { type: 'identity_script', duration: 15, description: 'Phase-appropriate identity conditioning' },
      { type: 'journal_prompt', duration: 5, description: 'Evening journal prompt delivered by Serafina' },
      { type: 'sleep_handoff', duration: 0, description: 'Transition to delta binaural + sleep script' },
    ],
  },
  {
    name: 'intensive_evening',
    segments: [
      { type: 'goon_build', duration: 15, description: 'Arousal building with content escalation' },
      { type: 'trance_induction', duration: 10, description: 'Deep theta induction at peak arousal' },
      { type: 'desire_script', duration: 15, description: 'Desire installation during trance' },
      { type: 'edge_session', duration: 10, description: 'Maintained edge with identity affirmations' },
      { type: 'cooldown', duration: 5, description: 'Gentle return + journal' },
      { type: 'sleep_handoff', duration: 0, description: 'Delta transition' },
    ],
  },
  {
    name: 'gentle_evening',
    segments: [
      { type: 'breathing', duration: 5, description: 'Guided breathing with alpha binaural' },
      { type: 'journal_prompt', duration: 10, description: 'Reflective journal with soft guidance' },
      { type: 'affirmation_loop', duration: 10, description: 'Gentle identity affirmations' },
      { type: 'sleep_handoff', duration: 0, description: 'Delta transition' },
    ],
  },
];

// ============================================
// SELECT CHAIN
// ============================================

/**
 * Pick the right chain based on biometric, denial, emotional, and temporal signals.
 */
export async function selectChain(userId: string): Promise<ChainRecommendation> {
  try {
    const [whoopResult, denialResult, emotionalResult] = await Promise.allSettled([
      getRecoveryZone(userId),
      getDenialDay(userId),
      getEmotionalState(userId),
    ]);

    const recovery = whoopResult.status === 'fulfilled' ? whoopResult.value : null;
    const denialDay = denialResult.status === 'fulfilled' ? denialResult.value : 0;
    const emotional = emotionalResult.status === 'fulfilled' ? emotionalResult.value : null;
    const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat

    // Decision tree
    const reasons: string[] = [];
    let chainName = 'standard_evening';

    // RED recovery → gentle
    if (recovery === 'RED') {
      chainName = 'gentle_evening';
      reasons.push('RED recovery');
    }
    // Depleted emotional state → gentle
    else if (emotional === 'depleted') {
      chainName = 'gentle_evening';
      reasons.push('depleted emotional state');
    }
    // GREEN recovery + sweet spot denial (days 3-7) → intensive
    else if (recovery === 'GREEN' && denialDay >= 3 && denialDay <= 7) {
      chainName = 'intensive_evening';
      reasons.push(`GREEN recovery, denial day ${denialDay} (sweet spot)`);
    }
    // Weekend + adequate recovery → intensive (more time available)
    else if ((dayOfWeek === 0 || dayOfWeek === 6) && recovery !== null) {
      chainName = 'intensive_evening';
      reasons.push('weekend, adequate recovery');
    }
    // High emotional state → intensive
    else if (emotional === 'high') {
      chainName = 'intensive_evening';
      reasons.push('high emotional state');
    }
    // YELLOW recovery → standard
    else if (recovery === 'YELLOW') {
      chainName = 'standard_evening';
      reasons.push(`YELLOW recovery, denial day ${denialDay}`);
    }
    // Default
    else {
      reasons.push('default selection');
    }

    const template = EVENING_CHAINS.find(c => c.name === chainName) ?? EVENING_CHAINS[0];
    const totalMinutes = template.segments.reduce((sum, s) => sum + s.duration, 0);

    return {
      chainName: template.name,
      reason: reasons.join(', '),
      totalMinutes,
      segments: template.segments,
    };
  } catch (err) {
    console.error('[SessionChainer] selectChain error:', err);
    // Default to standard
    const template = EVENING_CHAINS[0];
    return {
      chainName: template.name,
      reason: 'fallback (error)',
      totalMinutes: template.segments.reduce((sum, s) => sum + s.duration, 0),
      segments: template.segments,
    };
  }
}

// ============================================
// START CHAIN
// ============================================

/**
 * Create records for each segment and start the first one.
 * Uses conditioning_sessions_v2 to track the chain and individual segments.
 */
export async function startChain(userId: string, chainName?: string): Promise<ActiveChain | null> {
  try {
    // Select chain if not specified
    const recommendation = chainName
      ? { chainName, reason: 'manual', totalMinutes: 0, segments: [] as ChainSegment[] }
      : await selectChain(userId);

    const template = EVENING_CHAINS.find(c => c.name === (chainName ?? recommendation.chainName));
    if (!template) return null;

    const now = new Date().toISOString();

    // Create parent session record for the chain
    const { data: chainSession, error: chainErr } = await supabase
      .from('conditioning_sessions_v2')
      .insert({
        user_id: userId,
        session_type: 'chain',
        started_at: now,
        metadata: {
          chain_name: template.name,
          segments: template.segments,
          total_duration: template.segments.reduce((s, seg) => s + seg.duration, 0),
          selection_reason: recommendation.reason,
        },
      })
      .select('id')
      .single();

    if (chainErr || !chainSession) {
      console.error('[SessionChainer] Failed to create chain session:', chainErr);
      return null;
    }

    const chainId = chainSession.id;

    // Create individual segment records
    const segmentInserts = template.segments.map((seg, idx) => ({
      user_id: userId,
      session_type: seg.type,
      started_at: idx === 0 ? now : null,
      metadata: {
        chain_id: chainId,
        segment_index: idx,
        description: seg.description,
        planned_duration: seg.duration,
        status: idx === 0 ? 'active' : 'pending',
      },
    }));

    const { data: segmentRows, error: segErr } = await supabase
      .from('conditioning_sessions_v2')
      .insert(segmentInserts)
      .select('id, session_type, started_at, metadata');

    if (segErr) {
      console.error('[SessionChainer] Failed to create segment sessions:', segErr);
    }

    const segments: ActiveChainSegment[] = (segmentRows ?? []).map((row, idx) => ({
      id: row.id,
      chainId,
      segmentIndex: idx,
      type: row.session_type,
      duration: template.segments[idx]?.duration ?? 0,
      description: template.segments[idx]?.description ?? '',
      status: idx === 0 ? 'active' : 'pending',
      startedAt: row.started_at,
      completedAt: null,
    }));

    return {
      id: chainId,
      userId,
      chainName: template.name,
      status: 'active',
      currentSegmentIndex: 0,
      segments,
      totalDurationMinutes: template.segments.reduce((s, seg) => s + seg.duration, 0),
      startedAt: now,
    };
  } catch (err) {
    console.error('[SessionChainer] startChain error:', err);
    return null;
  }
}

// ============================================
// ADVANCE CHAIN
// ============================================

/**
 * Complete the current segment and advance to the next one.
 * Activates appropriate device pattern, content, and binaural frequency.
 */
export async function advanceChain(userId: string, chainId: string): Promise<ActiveChainSegment | null> {
  try {
    // Find all segments for this chain
    const { data: segments } = await supabase
      .from('conditioning_sessions_v2')
      .select('id, session_type, started_at, ended_at, metadata')
      .eq('user_id', userId)
      .filter('metadata->>chain_id', 'eq', chainId)
      .order('metadata->>segment_index', { ascending: true });

    if (!segments || segments.length === 0) return null;

    // Find current active segment
    const activeIdx = segments.findIndex(s =>
      (s.metadata as Record<string, unknown>)?.status === 'active'
    );

    if (activeIdx === -1) return null;

    const now = new Date().toISOString();

    // Complete current segment
    await supabase
      .from('conditioning_sessions_v2')
      .update({
        ended_at: now,
        completed: true,
        metadata: {
          ...(segments[activeIdx].metadata as Record<string, unknown>),
          status: 'completed',
        },
      })
      .eq('id', segments[activeIdx].id);

    // Check if there's a next segment
    const nextIdx = activeIdx + 1;
    if (nextIdx >= segments.length) {
      // Chain complete — mark parent
      await supabase
        .from('conditioning_sessions_v2')
        .update({
          ended_at: now,
          completed: true,
          metadata: {
            chain_name: 'completed',
          },
        })
        .eq('id', chainId);

      return null;
    }

    // Activate next segment
    const next = segments[nextIdx];
    const nextMeta = (next.metadata as Record<string, unknown>) ?? {};

    await supabase
      .from('conditioning_sessions_v2')
      .update({
        started_at: now,
        metadata: { ...nextMeta, status: 'active' },
      })
      .eq('id', next.id);

    // Issue directive for the new segment's content/device configuration
    const segmentType = next.session_type;
    const deviceDirective = getSegmentDeviceConfig(segmentType);
    if (deviceDirective) {
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: deviceDirective.action,
        target: deviceDirective.target,
        value: deviceDirective.value,
        priority: 'high',
        silent: true,
        reasoning: `Chain segment advance: ${segmentType}`,
      });
    }

    return {
      id: next.id,
      chainId,
      segmentIndex: nextIdx,
      type: next.session_type,
      duration: (nextMeta.planned_duration as number) ?? 0,
      description: (nextMeta.description as string) ?? '',
      status: 'active',
      startedAt: now,
      completedAt: null,
    };
  } catch (err) {
    console.error('[SessionChainer] advanceChain error:', err);
    return null;
  }
}

// ============================================
// BUILD CHAIN CONTEXT
// ============================================

/**
 * Build Handler context block for session chaining.
 */
export async function buildChainContext(userId: string): Promise<string> {
  try {
    // Check for active chain
    const { data: activeChain } = await supabase
      .from('conditioning_sessions_v2')
      .select('id, session_type, started_at, metadata')
      .eq('user_id', userId)
      .eq('session_type', 'chain')
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeChain) {
      const meta = activeChain.metadata as Record<string, unknown>;
      const chainName = (meta?.chain_name as string) ?? 'unknown';
      const segments = (meta?.segments as ChainSegment[]) ?? [];
      const totalDuration = (meta?.total_duration as number) ?? 0;

      // Find current segment
      const { data: segRows } = await supabase
        .from('conditioning_sessions_v2')
        .select('session_type, metadata')
        .eq('user_id', userId)
        .filter('metadata->>chain_id', 'eq', activeChain.id)
        .order('metadata->>segment_index', { ascending: true });

      const currentSeg = segRows?.find(s =>
        (s.metadata as Record<string, unknown>)?.status === 'active'
      );
      const currentType = currentSeg?.session_type ?? 'none';
      const completedCount = segRows?.filter(s =>
        (s.metadata as Record<string, unknown>)?.status === 'completed'
      ).length ?? 0;

      const segmentStrs = segments.map(s => `${s.type}(${s.duration}m)`).join(' → ');

      return `EVENING CHAIN: ACTIVE ${chainName}. Current: ${currentType} (${completedCount}/${segments.length} done). ${segmentStrs}. Total: ${totalDuration} min.`;
    }

    // No active chain — recommend one
    const recommendation = await selectChain(userId);
    const segmentStrs = recommendation.segments.map(s => `${s.type}(${s.duration}m)`).join(' → ');

    return `EVENING CHAIN: ${recommendation.chainName} recommended (${recommendation.reason}). Segments: ${segmentStrs}. Total: ${recommendation.totalMinutes} min. Issue directive to start: {action: 'schedule_session', value: {type: 'chain', chain: '${recommendation.chainName}'}}`;
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

async function getRecoveryZone(userId: string): Promise<'GREEN' | 'YELLOW' | 'RED' | null> {
  const { data } = await supabase
    .from('whoop_metrics')
    .select('recovery_score')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.recovery_score) return null;
  if (data.recovery_score >= 67) return 'GREEN';
  if (data.recovery_score >= 34) return 'YELLOW';
  return 'RED';
}

async function getDenialDay(userId: string): Promise<number> {
  const { data } = await supabase
    .from('denial_state')
    .select('current_day')
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.current_day as number) ?? 0;
}

async function getEmotionalState(userId: string): Promise<'depleted' | 'low' | 'medium' | 'high' | null> {
  // Check latest conversation classification mood
  const { data } = await supabase
    .from('conversation_classifications')
    .select('mood_detected')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!data || data.length === 0) return null;

  const moods = data.map(d => (d.mood_detected as string) ?? '').filter(Boolean);
  if (moods.length === 0) return null;

  // Simple heuristic
  const negativeCount = moods.filter(m =>
    ['sad', 'anxious', 'frustrated', 'depleted', 'exhausted', 'angry'].includes(m.toLowerCase())
  ).length;

  const positiveCount = moods.filter(m =>
    ['happy', 'excited', 'aroused', 'confident', 'proud', 'euphoric'].includes(m.toLowerCase())
  ).length;

  if (negativeCount >= 2) return 'depleted';
  if (negativeCount >= 1) return 'low';
  if (positiveCount >= 2) return 'high';
  return 'medium';
}

interface SegmentDirective {
  action: string;
  target: string;
  value: Record<string, unknown>;
}

function getSegmentDeviceConfig(segmentType: string): SegmentDirective | null {
  const configs: Record<string, SegmentDirective> = {
    voice_warmup: {
      action: 'start_session',
      target: 'voice',
      value: { binaural: 'alpha_10hz', device_pattern: 'off' },
    },
    trance_induction: {
      action: 'start_session',
      target: 'trance',
      value: { binaural: 'theta_6hz', device_pattern: 'gentle_pulse' },
    },
    identity_script: {
      action: 'play_content',
      target: 'identity',
      value: { binaural: 'theta_4hz', device_pattern: 'slow_wave' },
    },
    desire_script: {
      action: 'play_content',
      target: 'desire_installation',
      value: { binaural: 'theta_4hz', device_pattern: 'escalating' },
    },
    journal_prompt: {
      action: 'prompt_journal',
      target: 'evening_reflection',
      value: { binaural: 'alpha_10hz', device_pattern: 'off' },
    },
    sleep_handoff: {
      action: 'start_session',
      target: 'sleep',
      value: { binaural: 'delta_2hz', device_pattern: 'off' },
    },
    goon_build: {
      action: 'start_session',
      target: 'goon',
      value: { binaural: 'beta_15hz', device_pattern: 'escalating' },
    },
    edge_session: {
      action: 'start_session',
      target: 'edge',
      value: { binaural: 'theta_6hz', device_pattern: 'edge_hold' },
    },
    cooldown: {
      action: 'start_session',
      target: 'cooldown',
      value: { binaural: 'alpha_10hz', device_pattern: 'gentle_pulse' },
    },
    breathing: {
      action: 'start_session',
      target: 'breathing',
      value: { binaural: 'alpha_10hz', device_pattern: 'off' },
    },
    affirmation_loop: {
      action: 'play_content',
      target: 'affirmation',
      value: { binaural: 'alpha_8hz', device_pattern: 'gentle_pulse' },
    },
  };

  return configs[segmentType] ?? null;
}
