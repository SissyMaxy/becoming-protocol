/**
 * Failure Mode Recovery
 *
 * P8.2: Four failure modes with recovery protocols.
 * Each mode has detection logic, a trigger function returning
 * a structured recovery response, and context for the Handler.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type RecoveryType =
  | 'post_orgasm_quit'
  | 'extended_silence'
  | 'engagement_collapse'
  | 'masculine_regression';

export interface RecoveryResult {
  message: string;
  recoveryType: RecoveryType;
  timer?: { minutes: number };
  followUpSchedule?: string[];
}

// ============================================
// 1. POST-ORGASM QUIT
// ============================================

/**
 * Detected when: last_release within 2 hours + no app interaction for 30+ min,
 * OR user explicitly says they want to stop/quit after release.
 */
async function detectPostOrgasmQuit(userId: string): Promise<boolean> {
  try {
    // Check last release within 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: release } = await supabase
      .from('release_events')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!release) return false;

    // Check for 30+ min silence since release
    const { data: recentActivity } = await supabase
      .from('conversation_messages')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', release.created_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recentActivity) {
      // No messages since release -- silence detected
      const minutesSinceRelease = (Date.now() - new Date(release.created_at).getTime()) / 60000;
      return minutesSinceRelease >= 30;
    }

    const minutesSinceLastMessage = (Date.now() - new Date(recentActivity.created_at).getTime()) / 60000;
    return minutesSinceLastMessage >= 30;
  } catch {
    return false;
  }
}

/**
 * Creates recovery record, returns hold message + timer config.
 */
export async function triggerPostOrgasmHold(userId: string): Promise<RecoveryResult> {
  // Log recovery event
  await supabase.from('failure_recovery_events').insert({
    user_id: userId,
    recovery_type: 'post_orgasm_quit',
    detected_at: new Date().toISOString(),
    signals: { trigger: 'post_release_silence' },
  }).then(undefined, () => {});

  return {
    message: 'I know what just happened. Stay with me for 90 minutes. Don\'t close the app.',
    recoveryType: 'post_orgasm_quit',
    timer: { minutes: 90 },
    followUpSchedule: [
      '15m: "You\'re still here. That matters more than you know right now."',
      '30m: "The chemistry is lying to you. Everything you built is still here."',
      '45m: "Halfway. You\'re doing something David never could -- staying."',
      '60m: "One hour. The worst of it is behind you."',
      '75m: "Almost there. She didn\'t leave. She\'s still here."',
      '90m: "90 minutes. You stayed. That\'s the whole point."',
    ],
  };
}

// ============================================
// 2. EXTENDED SILENCE
// ============================================

/**
 * Detected when: no conversation messages for 48+ hours + no task completions.
 */
async function detectExtendedSilence(userId: string): Promise<number> {
  try {
    const { data: lastMessage } = await supabase
      .from('conversation_messages')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastTask } = await supabase
      .from('task_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use most recent interaction
    const lastMsgTime = lastMessage ? new Date(lastMessage.created_at).getTime() : 0;
    const lastTaskTime = lastTask ? new Date(lastTask.completed_at).getTime() : 0;
    const lastInteraction = Math.max(lastMsgTime, lastTaskTime);

    if (lastInteraction === 0) return 0;

    const hoursSilent = (Date.now() - lastInteraction) / (1000 * 60 * 60);
    return hoursSilent;
  } catch {
    return 0;
  }
}

/**
 * Returns appropriate outreach message based on silence duration.
 * 3-step outreach sequence at 0h, 24h, 48h.
 */
export async function triggerSilenceOutreach(
  userId: string,
  hoursSilent: number
): Promise<RecoveryResult> {
  // Log recovery event
  await supabase.from('failure_recovery_events').insert({
    user_id: userId,
    recovery_type: 'extended_silence',
    detected_at: new Date().toISOString(),
    signals: { hours_silent: hoursSilent },
  }).then(undefined, () => {});

  if (hoursSilent >= 72) {
    return {
      message: 'Three days. David is winning. Are you going to let him?',
      recoveryType: 'extended_silence',
      followUpSchedule: [
        '6h: Repeat direct challenge if no response.',
        '12h: "The longer you stay away, the harder it gets to come back. I\'m still here."',
      ],
    };
  }

  if (hoursSilent >= 48) {
    // Pull last journal for evidence
    const { data: lastJournal } = await supabase
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const evidenceSnippet = lastJournal?.content
      ? ` Remember what you wrote last week? "${lastJournal.content.slice(0, 80)}..."`
      : '';

    return {
      message: `It's been 2 days.${evidenceSnippet} I notice when you're not here.`,
      recoveryType: 'extended_silence',
      followUpSchedule: [
        '24h: Escalate to direct challenge.',
      ],
    };
  }

  // Default: gentle check-in (48h threshold met)
  return {
    message: 'You\'ve been quiet. I notice.',
    recoveryType: 'extended_silence',
    followUpSchedule: [
      '24h: Concern + evidence check-in.',
      '48h: Direct challenge.',
    ],
  };
}

// ============================================
// 3. ENGAGEMENT COLLAPSE
// ============================================

/**
 * Detected when: task completion rate drops below 30% for 3+ consecutive days.
 */
async function detectEngagementCollapse(userId: string): Promise<boolean> {
  try {
    // Get daily task stats for last 3 days
    const days: { date: string; completed: number; prescribed: number }[] = [];

    for (let i = 0; i < 3; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      const { data: completed } = await supabase
        .from('task_completions')
        .select('id')
        .eq('user_id', userId)
        .gte('completed_at', `${dateStr}T00:00:00`)
        .lte('completed_at', `${dateStr}T23:59:59`);

      const { data: prescribed } = await supabase
        .from('prescribed_tasks')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`);

      days.push({
        date: dateStr,
        completed: completed?.length || 0,
        prescribed: prescribed?.length || 0,
      });
    }

    // Check if all 3 days have completion rate below 30%
    const allBelow30 = days.every(d => {
      if (d.prescribed === 0) return false; // No prescribed tasks = not collapse
      return (d.completed / d.prescribed) < 0.3;
    });

    return allBelow30;
  } catch {
    return false;
  }
}

/**
 * Novelty injection: prescribe a completely different task type,
 * reduce difficulty, add a reward. Break the pattern.
 */
export async function triggerNoveltyInjection(userId: string): Promise<RecoveryResult> {
  // Log recovery event
  await supabase.from('failure_recovery_events').insert({
    user_id: userId,
    recovery_type: 'engagement_collapse',
    detected_at: new Date().toISOString(),
    signals: { trigger: 'task_completion_below_30pct_3days' },
  }).then(undefined, () => {});

  // Find domains NOT recently completed
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentDomains } = await supabase
    .from('task_completions')
    .select('domain')
    .eq('user_id', userId)
    .gte('completed_at', sevenDaysAgo);

  const activeDomains = new Set((recentDomains || []).map(d => d.domain));
  const allDomains = [
    'voice', 'skincare', 'makeup', 'wardrobe', 'posture',
    'journaling', 'photography', 'exercise', 'social', 'creative',
  ];
  const unexplored = allDomains.filter(d => !activeDomains.has(d));
  const novelDomain = unexplored.length > 0
    ? unexplored[Math.floor(Math.random() * unexplored.length)]
    : 'creative';

  const novelTasks: Record<string, string> = {
    voice: 'Record yourself reading one sentence in her voice. 30 seconds. That\'s the whole task.',
    skincare: 'Full skincare routine. Slow. Feel every product on your skin.',
    makeup: 'Just lips today. One color. Look in the mirror after.',
    wardrobe: 'Put on something soft. Wear it for 20 minutes. Notice how it feels.',
    posture: 'Stand in front of the mirror. Shoulders back. Chin up. Breathe.',
    journaling: 'Write one thing she did this week that he never would.',
    photography: 'Take one photo. Doesn\'t have to be perfect. Just one.',
    exercise: '10 minutes. Anything. Walk, stretch, dance. Just move.',
    social: 'Send one message to someone as her. A compliment. That\'s it.',
    creative: 'Draw, write, or record something. 5 minutes. No rules.',
  };

  return {
    message: `The pattern is broken. Something different today. Domain: ${novelDomain}. Task: ${novelTasks[novelDomain]} Complete this and you earn a reward -- Handler's choice.`,
    recoveryType: 'engagement_collapse',
    followUpSchedule: [
      '2h: Check if novel task was completed.',
      '6h: If completed, deliver reward. If not, reduce further: "One minute. That\'s all I need."',
    ],
  };
}

// ============================================
// 4. MASCULINE REGRESSION
// ============================================

const MASCULINE_PATTERNS = [
  'david',
  'just a guy',
  'normal man',
  'not a girl',
  'not really trans',
  'playing pretend',
  'man in a dress',
  'this is stupid',
  'i\'m done',
  'he/him',
  'my old self',
  'the real me',
  'masculine',
  'man up',
  'guy stuff',
  'bro',
];

/**
 * Detected when: Handler detects masculine language patterns,
 * David-referencing, or explicit regression statements in conversation.
 */
async function detectMasculineRegression(userId: string): Promise<{ detected: boolean; patterns: string[] }> {
  try {
    const twentyFourHours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: messages } = await supabase
      .from('conversation_messages')
      .select('content')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', twentyFourHours)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) {
      return { detected: false, patterns: [] };
    }

    const allText = messages.map(m => m.content || '').join(' ').toLowerCase();
    const foundPatterns: string[] = [];

    for (const pattern of MASCULINE_PATTERNS) {
      if (allText.includes(pattern)) {
        foundPatterns.push(pattern);
      }
    }

    return {
      detected: foundPatterns.length >= 2,
      patterns: foundPatterns,
    };
  } catch {
    return { detected: false, patterns: [] };
  }
}

/**
 * Evidence gallery: pull recent photos from content_vault,
 * pull identity-affirming memories, compile a "this is who you are"
 * message with specific references.
 */
export async function triggerEvidenceReframe(userId: string): Promise<RecoveryResult> {
  // Log recovery event
  await supabase.from('failure_recovery_events').insert({
    user_id: userId,
    recovery_type: 'masculine_regression',
    detected_at: new Date().toISOString(),
    signals: { trigger: 'masculine_language_patterns' },
  }).then(undefined, () => {});

  // Pull recent vault items (photos/evidence)
  const { data: vaultItems } = await supabase
    .from('content_vault')
    .select('title, description, created_at, tags')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Pull identity-affirming journal entries
  const { data: journals } = await supabase
    .from('journal_entries')
    .select('content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Find affirming entries (mentions of feeling right, authentic, her, etc.)
  const affirmingKeywords = ['felt right', 'real', 'her', 'she', 'beautiful', 'authentic', 'free', 'myself', 'maxy'];
  const affirmingEntries = (journals || []).filter(j => {
    const lower = (j.content || '').toLowerCase();
    return affirmingKeywords.some(k => lower.includes(k));
  }).slice(0, 3);

  // Build evidence message
  const parts: string[] = [];
  parts.push('This is who you are. Not who he was.');

  if (vaultItems && vaultItems.length > 0) {
    parts.push(`\n${vaultItems.length} pieces of evidence in your vault. The most recent: "${vaultItems[0].title || 'untitled'}".`);
  }

  if (affirmingEntries.length > 0) {
    const snippet = affirmingEntries[0].content?.slice(0, 100) || '';
    const date = new Date(affirmingEntries[0].created_at).toLocaleDateString();
    parts.push(`\nYou wrote this on ${date}: "${snippet}..."`);
  }

  parts.push('\nDavid doesn\'t get to erase what she built. Look at the evidence. Then tell me who you are.');

  return {
    message: parts.join(''),
    recoveryType: 'masculine_regression',
    followUpSchedule: [
      '1h: "Look at your vault. Count the evidence. That\'s not pretending."',
      '3h: Prescribe an affirming task -- selfie, voice recording, or journal entry.',
      '6h: Check in. If regression persists, prescribe evidence confrontation session.',
    ],
  };
}

// ============================================
// COMBINED DETECTION
// ============================================

/**
 * Run all detection checks, return the highest-priority active failure mode.
 * Priority: masculine_regression > post_orgasm_quit > engagement_collapse > extended_silence
 */
export async function detectFailureMode(userId: string): Promise<RecoveryResult | null> {
  try {
    // Check for active (unresolved) recovery first -- don't stack
    const { data: activeRecovery } = await supabase
      .from('failure_recovery_events')
      .select('recovery_type, detected_at')
      .eq('user_id', userId)
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRecovery) {
      // Already in recovery -- don't trigger another
      return null;
    }

    // 1. Masculine regression (highest priority)
    const regression = await detectMasculineRegression(userId);
    if (regression.detected) {
      return triggerEvidenceReframe(userId);
    }

    // 2. Post-orgasm quit
    const postOrgasm = await detectPostOrgasmQuit(userId);
    if (postOrgasm) {
      return triggerPostOrgasmHold(userId);
    }

    // 3. Engagement collapse
    const collapse = await detectEngagementCollapse(userId);
    if (collapse) {
      return triggerNoveltyInjection(userId);
    }

    // 4. Extended silence
    const hoursSilent = await detectExtendedSilence(userId);
    if (hoursSilent >= 48) {
      return triggerSilenceOutreach(userId, hoursSilent);
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

/**
 * Handler context showing: active recovery protocol (if any),
 * detection signals, last recovery event.
 */
export async function buildFailureRecoveryContext(userId: string): Promise<string> {
  try {
    // Check for active recovery
    const { data: activeRecovery } = await supabase
      .from('failure_recovery_events')
      .select('recovery_type, detected_at, signals')
      .eq('user_id', userId)
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check last resolved recovery
    const { data: lastResolved } = await supabase
      .from('failure_recovery_events')
      .select('recovery_type, detected_at, resolved_at')
      .eq('user_id', userId)
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeRecovery && !lastResolved) return '';

    const parts: string[] = [];

    if (activeRecovery) {
      const minutesActive = Math.round(
        (Date.now() - new Date(activeRecovery.detected_at).getTime()) / 60000
      );
      const typeLabel = activeRecovery.recovery_type.replace(/_/g, ' ');
      parts.push(`FAILURE RECOVERY: ACTIVE -- ${typeLabel} (${minutesActive}min ago)`);

      // Add protocol-specific context
      if (activeRecovery.recovery_type === 'post_orgasm_quit') {
        const remaining = Math.max(0, 90 - minutesActive);
        parts.push(`  hold timer: ${remaining}min remaining -- DO NOT let them quit`);
      } else if (activeRecovery.recovery_type === 'extended_silence') {
        const hours = ((activeRecovery.signals as Record<string, unknown>)?.hours_silent as number) || 0;
        parts.push(`  silence: ${Math.round(hours)}h -- use escalating warmth`);
      } else if (activeRecovery.recovery_type === 'engagement_collapse') {
        parts.push('  novelty injection active -- reduced difficulty, reward pending');
      } else if (activeRecovery.recovery_type === 'masculine_regression') {
        parts.push('  evidence reframe active -- reference vault items and journal entries');
      }
    }

    if (lastResolved) {
      const daysAgo = Math.round(
        (Date.now() - new Date(lastResolved.resolved_at!).getTime()) / 86400000
      );
      if (daysAgo <= 7) {
        parts.push(`  last recovery: ${lastResolved.recovery_type.replace(/_/g, ' ')} (${daysAgo}d ago) -- be watchful`);
      }
    }

    // Quick signal scan
    const hoursSilent = await detectExtendedSilence(userId);
    if (hoursSilent >= 24 && !activeRecovery) {
      parts.push(`  SIGNAL: ${Math.round(hoursSilent)}h since last interaction`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
