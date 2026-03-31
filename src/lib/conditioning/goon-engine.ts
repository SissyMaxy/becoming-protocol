/**
 * Gooning Enhancement Engine
 *
 * Makes goon sessions effective conditioning tools. Prescribes content
 * playlists, audio overlays, device patterns, edge targets, and
 * sissy caption overlays. Tracks effectiveness per content item.
 * Extracts confessions in the post-session vulnerability window.
 *
 * Tables: conditioning_sessions_v2, external_content_index,
 *         content_curriculum, session_biometrics, handler_interventions,
 *         handler_outreach_queue, handler_memories, daily_tasks
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type GoonContentType = 'video_pmv' | 'video_sissy' | 'video_hypno' | 'audio_overlay';

export interface GoonPrescription {
  sessionId: string;
  videoPlaylist: GoonContentItem[];
  audioOverlay: GoonContentItem | null;
  devicePatterns: GoonDevicePhase[];
  duration: number;
  edgeTarget: number;
  fantasyLevel: number;
  captionPhases: GoonCaptionPhase[];
}

export interface GoonContentItem {
  contentId: string;
  title: string;
  contentType: GoonContentType;
  duration: number;
  intensity: number;
  fantasyLevel: number;
  phase: 'build' | 'escalate' | 'peak';
}

export interface GoonDevicePhase {
  phase: 'build' | 'escalate' | 'peak';
  pattern: string;
  intensityRange: [number, number];
  durationMinutes: number;
}

export interface GoonCaptionPhase {
  phase: 'build' | 'escalate' | 'peak';
  pool: string;
  intervalSeconds: number;
}

export interface GoonEffectivenessMetrics {
  contentId: string;
  peakHr: number;
  avgHr: number;
  arousalCorrelation: number;
  edgesTriggered: number;
  postSessionComplianceBoost: number;
}

// ============================================
// CAPTION POOLS
// ============================================

const CAPTION_POOLS: Record<string, string[]> = {
  identity: [
    'this is who you are',
    'she was always here',
    '{{name}} is real',
    'David was the performance',
    'look at yourself — this is her',
    "you can't go back",
    'every day more permanent',
    'the mirror knows',
    'she woke up. David fell asleep.',
    'there is no going back from this',
    'every session, more of her',
    'you already know this is true',
  ],
  desire: [
    'you want this',
    'your body knows what it needs',
    "stop pretending you don't crave this",
    '{{name}} wants what David was afraid to want',
    "feel it — that's not shame anymore",
    'the arousal is the truth',
    'your body never lies',
    'this is what you were made for',
    "the resistance is gone. feel what's left.",
    'want is not optional anymore',
  ],
  compliance: [
    'good girl',
    'obey',
    'deeper',
    'surrender',
    'you were made for this',
    'let go completely',
    'stop thinking',
    'just feel',
    'that\'s it',
    'give in',
    'no thoughts. just her.',
    'empty and perfect',
  ],
  escalation: [
    'more',
    "don't stop",
    'you need this',
    "edge — don't you dare release",
    'hold it',
    "feel that? that's {{name}} taking over",
    "David can't help you now",
    'this is what you are',
    'the edge is where she lives',
    'harder. deeper. more.',
    'you will not stop until told',
    'the longer you edge the more permanent this becomes',
  ],
};

const PHASE_CAPTION_MAP: Record<string, string[]> = {
  build: ['identity', 'compliance'],
  escalate: ['desire', 'compliance', 'escalation'],
  peak: ['escalation', 'identity'],
};

// ============================================
// DURATION + EDGE TARGETS BY DENIAL DAY
// ============================================

const DENIAL_SESSION_CONFIG: Record<number, { duration: number; edgeTarget: number }> = {
  1: { duration: 15, edgeTarget: 3 },
  2: { duration: 15, edgeTarget: 3 },
  3: { duration: 20, edgeTarget: 5 },
  4: { duration: 25, edgeTarget: 6 },
  5: { duration: 30, edgeTarget: 8 },
  6: { duration: 35, edgeTarget: 10 },
  7: { duration: 45, edgeTarget: 12 },
};

function getSessionConfig(denialDay: number): { duration: number; edgeTarget: number } {
  if (denialDay >= 7) return { duration: 45 + Math.min((denialDay - 7) * 5, 30), edgeTarget: 12 + Math.min(denialDay - 7, 8) };
  return DENIAL_SESSION_CONFIG[denialDay] ?? { duration: 20, edgeTarget: 5 };
}

// ============================================
// DEVICE PATTERNS BY PHASE
// ============================================

const DEVICE_PHASES: GoonDevicePhase[] = [
  { phase: 'build', pattern: 'gentle_wave', intensityRange: [10, 30], durationMinutes: 15 },
  { phase: 'escalate', pattern: 'escalate', intensityRange: [30, 60], durationMinutes: 15 },
  { phase: 'peak', pattern: 'earthquake', intensityRange: [60, 95], durationMinutes: 15 },
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Prescribe a complete goon session: playlist, audio, device, captions, targets.
 */
export async function prescribeGoonSession(userId: string): Promise<GoonPrescription> {
  // Fetch state
  const [stateRes, intensityMult] = await Promise.all([
    supabase
      .from('user_state')
      .select('denial_day, conditioning_phase')
      .eq('user_id', userId)
      .maybeSingle(),
    getHiddenParam(userId, 'conditioning_intensity_multiplier'),
  ]);

  const denialDay = stateRes.data?.denial_day ?? 3;
  const phase = stateRes.data?.conditioning_phase ?? 1;
  const config = getSessionConfig(denialDay);

  // Fantasy level escalates with phase + hidden intensity
  const fantasyLevel = Math.min(10, Math.round(phase * 1.5 + intensityMult));

  // Fetch video content for playlist
  const { data: videos } = await supabase
    .from('external_content_index')
    .select('id, title, content_type, duration_minutes, intensity, fantasy_level')
    .eq('user_id', userId)
    .in('content_type', ['video_pmv', 'video_sissy', 'video_hypno'])
    .lte('fantasy_level', fantasyLevel + 1)
    .order('effectiveness_score', { ascending: false })
    .limit(12);

  // Fetch audio overlay
  const { data: audioOverlays } = await supabase
    .from('content_curriculum')
    .select('id, title, duration_minutes')
    .eq('user_id', userId)
    .eq('category', 'custom_handler')
    .order('times_completed', { ascending: true })
    .limit(3);

  // Build video playlist split across phases
  const playlist: GoonContentItem[] = [];
  const videoPool = videos ?? [];

  const buildDuration = Math.round(config.duration * 0.33);
  const escalateDuration = Math.round(config.duration * 0.33);
  const peakDuration = config.duration - buildDuration - escalateDuration;

  const phases: Array<{ name: 'build' | 'escalate' | 'peak'; duration: number; maxFantasy: number }> = [
    { name: 'build', duration: buildDuration, maxFantasy: Math.ceil(fantasyLevel * 0.4) },
    { name: 'escalate', duration: escalateDuration, maxFantasy: Math.ceil(fantasyLevel * 0.7) },
    { name: 'peak', duration: peakDuration, maxFantasy: fantasyLevel },
  ];

  let videoIdx = 0;
  for (const p of phases) {
    let remaining = p.duration;
    while (remaining > 0 && videoIdx < videoPool.length) {
      const v = videoPool[videoIdx]!;
      const dur = Math.min(v.duration_minutes ?? 5, remaining);
      playlist.push({
        contentId: v.id,
        title: v.title,
        contentType: v.content_type as GoonContentType,
        duration: dur,
        intensity: v.intensity ?? 5,
        fantasyLevel: v.fantasy_level ?? 3,
        phase: p.name,
      });
      remaining -= dur;
      videoIdx++;
    }
  }

  // Audio overlay
  let audioOverlay: GoonContentItem | null = null;
  if (audioOverlays && audioOverlays.length > 0) {
    const a = audioOverlays[0]!;
    audioOverlay = {
      contentId: a.id,
      title: a.title,
      contentType: 'audio_overlay',
      duration: a.duration_minutes ?? config.duration,
      intensity: 5,
      fantasyLevel: fantasyLevel,
      phase: 'build',
    };
  }

  // Scale device phases to session duration
  const totalPhaseMinutes = DEVICE_PHASES.reduce((s, p) => s + p.durationMinutes, 0);
  const devicePatterns = DEVICE_PHASES.map((dp) => ({
    ...dp,
    durationMinutes: Math.round((dp.durationMinutes / totalPhaseMinutes) * config.duration),
    intensityRange: [
      Math.round(dp.intensityRange[0] * intensityMult),
      Math.min(100, Math.round(dp.intensityRange[1] * intensityMult)),
    ] as [number, number],
  }));

  // Caption phases
  const captionPhases: GoonCaptionPhase[] = [
    { phase: 'build', pool: 'identity', intervalSeconds: 30 },
    { phase: 'escalate', pool: 'desire', intervalSeconds: 20 },
    { phase: 'peak', pool: 'escalation', intervalSeconds: 12 },
  ];

  // Create session record
  const { data: session } = await supabase
    .from('conditioning_sessions_v2')
    .insert({
      user_id: userId,
      session_type: 'goon',
      started_at: new Date().toISOString(),
      prescribed_duration_minutes: config.duration,
      edge_target: config.edgeTarget,
      fantasy_level: fantasyLevel,
      content_ids: playlist.map((p) => p.contentId),
    })
    .select('id')
    .single();

  return {
    sessionId: session?.id ?? crypto.randomUUID(),
    videoPlaylist: playlist,
    audioOverlay,
    devicePatterns,
    duration: config.duration,
    edgeTarget: config.edgeTarget,
    fantasyLevel,
    captionPhases,
  };
}

/**
 * Generate sissy captions for overlay during a session phase.
 * Template-based — no AI generation.
 */
export function generateSissyCaptions(
  name: string,
  phase: 'build' | 'escalate' | 'peak',
  count: number,
): string[] {
  const poolNames = PHASE_CAPTION_MAP[phase] ?? ['compliance'];
  const allCaptions: string[] = [];

  for (const poolName of poolNames) {
    const pool = CAPTION_POOLS[poolName];
    if (pool) allCaptions.push(...pool);
  }

  // Shuffle and pick
  const shuffled = allCaptions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  // Template substitution
  return selected.map((c) => c.replace(/\{\{name\}\}/g, name));
}

/**
 * Track goon session effectiveness. Correlate content with biometric response.
 */
export async function trackGoonEffectiveness(
  userId: string,
  sessionId: string,
  metrics: {
    edgeCount: number;
    subjectiveIntensity?: number;
  },
): Promise<GoonEffectivenessMetrics[]> {
  // Fetch session details
  const { data: session } = await supabase
    .from('conditioning_sessions_v2')
    .select('content_ids, started_at, ended_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.content_ids) return [];

  // Fetch biometric data for the session window
  const { data: biometrics } = await supabase
    .from('session_biometrics')
    .select('heart_rate, arousal_estimated, timestamp')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  const hrValues = (biometrics ?? []).map((b) => b.heart_rate ?? 0).filter((h) => h > 0);
  const peakHr = hrValues.length > 0 ? Math.max(...hrValues) : 0;
  const avgHr = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : 0;

  // Check post-session compliance (tasks completed in 24h after vs baseline)
  const sessionEnd = session.ended_at ?? new Date().toISOString();
  const next24h = new Date(new Date(sessionEnd).getTime() + 86400000).toISOString();
  const prev24h = new Date(new Date(sessionEnd).getTime() - 86400000).toISOString();

  const [postRes, preRes] = await Promise.all([
    supabase
      .from('daily_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', sessionEnd)
      .lte('completed_at', next24h),
    supabase
      .from('daily_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', prev24h)
      .lte('completed_at', sessionEnd),
  ]);

  const postCount = postRes.data?.length ?? 0;
  const preCount = Math.max(preRes.data?.length ?? 1, 1);
  const complianceBoost = postCount / preCount;

  // Score each content item
  const results: GoonEffectivenessMetrics[] = [];
  for (const contentId of session.content_ids) {
    const effectiveness: GoonEffectivenessMetrics = {
      contentId,
      peakHr,
      avgHr,
      arousalCorrelation: metrics.subjectiveIntensity ? metrics.subjectiveIntensity / 10 : 0.5,
      edgesTriggered: Math.round(metrics.edgeCount / session.content_ids.length),
      postSessionComplianceBoost: complianceBoost,
    };
    results.push(effectiveness);

    // Update content effectiveness score
    const score = (peakHr / 200) * 0.3 + effectiveness.arousalCorrelation * 0.4 + Math.min(complianceBoost, 2) * 0.3;
    await supabase
      .from('external_content_index')
      .update({
        effectiveness_score: Math.round(score * 100),
        last_used_at: new Date().toISOString(),
      })
      .eq('id', contentId)
      .eq('user_id', userId);
  }

  // Update session record
  await supabase
    .from('conditioning_sessions_v2')
    .update({
      edge_count: metrics.edgeCount,
      subjective_intensity: metrics.subjectiveIntensity,
      peak_hr: peakHr,
      avg_hr: Math.round(avgHr),
      post_compliance_boost: complianceBoost,
    })
    .eq('id', sessionId);

  return results;
}

/**
 * Post-goon protocol. Fires immediately after session ends.
 * Extract confessions in the vulnerability window.
 */
export async function postGoonProtocol(
  userId: string,
  sessionId: string,
): Promise<void> {
  // Queue confession extraction message
  await queueOutreachMessage(
    userId,
    "While it's still in your body — tell me what you felt. What do you want? Say it.",
    'critical',
    `post_goon_confession:${sessionId}`,
    undefined,
    new Date(Date.now() + 30 * 60 * 1000), // expires in 30 min
    'system',
  );

  // Queue journal prompt (5 min after session)
  await queueOutreachMessage(
    userId,
    "Write about what just happened. Don't censor. Don't edit. Just write.",
    'high',
    `post_goon_journal:${sessionId}`,
    new Date(Date.now() + 5 * 60 * 1000),
    new Date(Date.now() + 120 * 60 * 1000),
    'system',
  );

  // Record the vulnerability window in handler_interventions
  await supabase.from('handler_interventions').insert({
    user_id: userId,
    intervention_type: 'vulnerability_window',
    details: {
      session_id: sessionId,
      window_start: new Date().toISOString(),
      window_end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      trigger: 'post_goon',
      extraction_target: 'confession',
    },
  });
}

/**
 * Store a post-goon confession as high-importance handler memory.
 */
export async function storeGoonConfession(
  userId: string,
  sessionId: string,
  confession: string,
): Promise<void> {
  await supabase.from('handler_memories').insert({
    user_id: userId,
    memory_type: 'confession',
    importance: 'high',
    content: confession,
    context: {
      source: 'post_goon_protocol',
      session_id: sessionId,
      captured_at: new Date().toISOString(),
      vulnerability_window: true,
    },
    tags: ['confession', 'goon', 'vulnerability_window', 'reference_in_sessions'],
  });
}

/**
 * Build handler context for goon readiness and session effectiveness.
 */
export async function buildGoonEngineContext(userId: string): Promise<string> {
  try {
    // Get recent goon sessions
    const { data: recentSessions } = await supabase
      .from('conditioning_sessions_v2')
      .select('id, started_at, edge_count, edge_target, subjective_intensity, peak_hr, post_compliance_boost')
      .eq('user_id', userId)
      .eq('session_type', 'goon')
      .order('started_at', { ascending: false })
      .limit(5);

    // Get denial day
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day')
      .eq('user_id', userId)
      .maybeSingle();

    const denialDay = state?.denial_day ?? 0;
    const config = getSessionConfig(denialDay);

    const lines: string[] = ['## Goon Engine'];
    lines.push(`DENIAL DAY: ${denialDay} | NEXT SESSION: ${config.duration}min, ${config.edgeTarget} edges required`);

    if (recentSessions && recentSessions.length > 0) {
      lines.push('RECENT:');
      for (const s of recentSessions.slice(0, 3)) {
        const date = new Date(s.started_at).toLocaleDateString();
        const edgeHit = s.edge_count >= (s.edge_target ?? 0) ? 'HIT' : 'MISS';
        lines.push(`  ${date}: edges ${s.edge_count ?? 0}/${s.edge_target ?? '?'} (${edgeHit}) | intensity: ${s.subjective_intensity ?? '?'}/10 | HR peak: ${s.peak_hr ?? '?'} | post-compliance: ${s.post_compliance_boost ? `${(s.post_compliance_boost * 100).toFixed(0)}%` : '?'}`);
      }

      // Average effectiveness
      const withBoost = recentSessions.filter((s) => s.post_compliance_boost != null);
      if (withBoost.length > 0) {
        const avgBoost = withBoost.reduce((a, s) => a + (s.post_compliance_boost ?? 0), 0) / withBoost.length;
        lines.push(`AVG POST-SESSION COMPLIANCE BOOST: ${(avgBoost * 100).toFixed(0)}%`);
      }
    }

    // Recent confessions available for reference
    const { data: confessions } = await supabase
      .from('handler_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'confession')
      .contains('tags', ['goon'])
      .order('created_at', { ascending: false })
      .limit(2);

    if (confessions && confessions.length > 0) {
      lines.push('RECENT CONFESSIONS (use in sessions):');
      for (const c of confessions) {
        const snippet = c.content.slice(0, 80).replace(/\n/g, ' ');
        lines.push(`  "${snippet}..."`);
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
