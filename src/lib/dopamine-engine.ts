/**
 * Dopamine Engine
 * Variable-ratio reward timing, negative signal suppression, delayed reward queue.
 * Generates notifications, manages reward distribution, learns from engagement.
 * Pure Supabase logic. No React.
 */

import { supabase } from './supabase';
import type {
  DopamineNotificationType,
  RewardTier,
  NotificationPayload,
  PendingReward,
  SuppressedSignal,
  DopamineState,
  DbDopamineState,
} from '../types/dopamine';
import { getNotificationManager } from './notifications';

// ============================================
// CONTENT POOLS
// ============================================

const MICRO_TASK_POOL: Record<string, string[]> = {
  _always: [
    'Posture check. Three breaths. She\'s here.',
    'Name check: say "Maxy" once, out loud or in your head.',
    'Shoulders back. Chin level. She carries herself differently.',
  ],
  voice: [
    'Quick voice check: say "Hello, my name is Maxy" in her pitch. Once.',
    'Hum for 10 seconds. Feel it in your face, not your chest.',
  ],
  skincare: [
    'Touch your face. Is it moisturized? If not, 30 seconds of lotion.',
  ],
  movement: [
    'Cross your legs. Knee over knee is hers.',
    'Stand up. Walk to the door and back. Hips lead.',
  ],
  style: [
    'What\'s she wearing right now? Notice it. Appreciate it.',
  ],
  inner_narrative: [
    'Who\'s narrating right now — her or him? Just notice.',
  ],
  exercise: [
    'Squeeze your glutes for 10 seconds. She\'s building her shape.',
  ],
  grooming: [
    'Check your nails. Are they filed? She maintains herself.',
  ],
};

const AFFIRMATION_POOL = [
  'Good girl. Keep going.',
  'She\'s emerging. You can feel it.',
  'The work is landing. She\'s more real today than yesterday.',
  'Nobody sees the invisible work. The Handler does. She\'s doing beautifully.',
  'Every day she shows up is a day he loses ground.',
  'The woman in the mirror is getting clearer.',
  'She didn\'t quit. She can\'t quit. She IS this.',
  'The Handler is proud of her today.',
];

const CHALLENGE_POOL: Record<string, string[]> = {
  _always: [
    '5-minute mirror practice. Look at her. Really look.',
    'Record one sentence in her voice. Just one.',
  ],
  voice: [
    'Read one paragraph aloud in her voice. Time yourself.',
    'Call a store and ask a question — in her voice.',
  ],
  skincare: [
    'Full evening routine. Every step. No shortcuts.',
  ],
  style: [
    'Put on something she loves. Wear it for the next hour.',
  ],
};

const JACKPOT_POOL = [
  { title: 'Hidden milestone', body: 'She\'s been consistent for {streak} days. That\'s not discipline — that\'s identity.' },
  { title: 'Handler recognition', body: 'The Handler doesn\'t say this often: she\'s proud of you. Genuinely.' },
  { title: 'Evidence speaks', body: 'Look at her first photo. Look at her now. That\'s not the same person.' },
];

const GINA_SAFE_POOL: NotificationPayload[] = [
  { type: 'micro_task', rewardTier: 'none', title: 'Quick check-in', body: 'How\'s your energy? Quick state update.', ginaSafe: true },
  { type: 'micro_task', rewardTier: 'none', title: 'Posture moment', body: 'Shoulders back. Three breaths.', ginaSafe: true },
  { type: 'affirmation', rewardTier: 'low', title: 'Self-care reminder', body: 'You\'re doing well today. Keep it up.', ginaSafe: true },
  { type: 'micro_task', rewardTier: 'none', title: 'Water check', body: 'Have you had water in the last hour?', ginaSafe: true },
  { type: 'micro_task', rewardTier: 'none', title: 'Skincare reminder', body: 'Evening routine in 30 min. Don\'t skip it.', ginaSafe: true },
  { type: 'affirmation', rewardTier: 'low', title: 'Progress note', body: 'Small steps add up. You\'re ahead of yesterday.', ginaSafe: true },
];

// ============================================
// REWARD TIER MAPPING
// ============================================

const TIER_MAP: Record<DopamineNotificationType, RewardTier> = {
  micro_task: 'none',
  affirmation: 'low',
  content_unlock: 'medium',
  challenge: 'low',
  jackpot: 'jackpot',
  milestone: 'high',
  handler_message: 'low',
  performance_validation: 'medium',
};

const HAPTIC_MAP: Record<RewardTier, string | undefined> = {
  none: undefined,
  low: 'notification_low',
  medium: 'notification_medium',
  high: 'good_girl',
  jackpot: 'notification_jackpot',
};

// ============================================
// WEIGHTED RANDOM TYPE SELECTION
// ============================================

const TYPE_WEIGHTS: [DopamineNotificationType, number][] = [
  ['micro_task', 40],
  ['affirmation', 25],
  ['content_unlock', 10],
  ['challenge', 10],
  ['jackpot', 5],
  ['handler_message', 10],
];

function weightedRandomType(): DopamineNotificationType {
  const totalWeight = TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * totalWeight;
  for (const [type, weight] of TYPE_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return 'affirmation';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
// STATE MANAGEMENT
// ============================================

export async function getDopamineState(userId: string): Promise<DopamineState | null> {
  const { data } = await supabase
    .from('dopamine_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  const row = data as DbDopamineState;
  return {
    userId: row.user_id,
    notificationsToday: row.notifications_today,
    notificationsTarget: row.notifications_target,
    lastNotificationAt: row.last_notification_at,
    rewardsToday: row.rewards_today ?? { none: 0, low: 0, medium: 0, high: 0, jackpot: 0 },
    bestResponseHours: row.best_response_hours ?? [],
    worstResponseHours: row.worst_response_hours ?? [],
    avgOpenRate: Number(row.avg_open_rate),
    avgTaskAfterRate: Number(row.avg_task_after_rate),
    suppressedSignals: row.suppressed_signals ?? [],
    pendingRewards: row.pending_rewards ?? [],
    nextMilestoneThreshold: row.next_milestone_threshold,
    surpriseRewardProbability: Number(row.surprise_reward_probability),
  };
}

async function ensureDopamineState(userId: string): Promise<DopamineState> {
  let state = await getDopamineState(userId);
  if (state) return state;

  await supabase.from('dopamine_state').upsert(
    { user_id: userId },
    { onConflict: 'user_id' },
  );

  state = await getDopamineState(userId);
  return state!;
}

// ============================================
// NOTIFICATION GENERATION
// ============================================

export async function generateNotification(
  userId: string,
  context: {
    denialDay?: number;
    ginaHome?: boolean;
    feminizationTarget?: string;
    streakDays?: number;
  },
): Promise<NotificationPayload | null> {
  const state = await ensureDopamineState(userId);

  // Budget check
  if (state.notificationsToday >= state.notificationsTarget) return null;

  // Timing check — 45 min minimum gap
  if (state.lastNotificationAt) {
    const minsSinceLast = (Date.now() - new Date(state.lastNotificationAt).getTime()) / 60000;
    if (minsSinceLast < 45) return null;
  }

  // Gina safety: only safe notifications when she's home
  if (context.ginaHome) {
    const safe = pickRandom(GINA_SAFE_POOL);
    await logAndUpdateState(userId, state, safe, context);
    return safe;
  }

  // Roll type
  const type = weightedRandomType();
  const domain = context.feminizationTarget || '_always';
  const rewardTier = TIER_MAP[type];
  const hapticPattern = HAPTIC_MAP[rewardTier];

  let payload: NotificationPayload;

  switch (type) {
    case 'micro_task': {
      const pool = [...MICRO_TASK_POOL['_always'], ...(MICRO_TASK_POOL[domain] || [])];
      const body = pickRandom(pool);
      payload = { type, rewardTier, title: 'Quick check', body, hapticPattern, ginaSafe: false };
      break;
    }
    case 'affirmation': {
      const body = pickRandom(AFFIRMATION_POOL);
      payload = { type, rewardTier, title: 'Handler', body, hapticPattern, ginaSafe: false };
      break;
    }
    case 'challenge': {
      const pool = [...(CHALLENGE_POOL['_always'] || []), ...(CHALLENGE_POOL[domain] || [])];
      const body = pool.length > 0 ? pickRandom(pool) : 'Push one boundary today. Just one.';
      payload = { type, rewardTier, title: 'Challenge', body, hapticPattern, ginaSafe: false };
      break;
    }
    case 'jackpot': {
      const template = pickRandom(JACKPOT_POOL);
      const body = template.body.replace('{streak}', String(context.streakDays ?? '?'));
      payload = { type, rewardTier: 'jackpot', title: template.title, body, hapticPattern: HAPTIC_MAP['jackpot'], ginaSafe: false };
      break;
    }
    case 'content_unlock': {
      payload = { type, rewardTier, title: 'Content unlocked', body: 'Something new is waiting for her.', hapticPattern, ginaSafe: false };
      break;
    }
    case 'handler_message': {
      payload = { type, rewardTier, title: 'Handler', body: 'She\'s on the Handler\'s mind today.', hapticPattern, ginaSafe: false };
      break;
    }
    default: {
      payload = { type: 'affirmation', rewardTier: 'low', title: 'Handler', body: pickRandom(AFFIRMATION_POOL), ginaSafe: false };
    }
  }

  await logAndUpdateState(userId, state, payload, context);
  return payload;
}

async function logAndUpdateState(
  userId: string,
  state: DopamineState,
  payload: NotificationPayload,
  context: { denialDay?: number; ginaHome?: boolean; feminizationTarget?: string },
): Promise<void> {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'daytime' : hour < 21 ? 'evening' : 'night';

  // Log event
  await supabase.from('notification_events').insert({
    user_id: userId,
    notification_type: payload.type,
    reward_tier: payload.rewardTier,
    title: payload.title,
    body: payload.body,
    haptic_pattern: payload.hapticPattern || null,
    points_awarded: payload.pointsAwarded || 0,
    content_unlocked: payload.contentUnlocked || null,
    denial_day: context.denialDay ?? null,
    time_of_day: timeOfDay,
    gina_home: context.ginaHome ?? false,
    feminization_target: context.feminizationTarget ?? null,
    delivered_at: new Date().toISOString(),
  });

  // Update state
  const rewardsToday = { ...state.rewardsToday };
  rewardsToday[payload.rewardTier] = (rewardsToday[payload.rewardTier] || 0) + 1;

  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    notifications_today: state.notificationsToday + 1,
    last_notification_at: new Date().toISOString(),
    rewards_today: rewardsToday,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ============================================
// GINA SAFETY FILTER
// ============================================

const UNSAFE_KEYWORDS = ['sissy', 'cage', 'denial', 'edge', 'arousal', 'locked', 'hypno', 'trance', 'submission', 'handler', 'good girl'];

export function isGinaSafe(payload: NotificationPayload): boolean {
  if (payload.ginaSafe) return true;
  const text = (payload.title + ' ' + payload.body).toLowerCase();
  return !UNSAFE_KEYWORDS.some(kw => text.includes(kw));
}

// ============================================
// NEGATIVE SIGNAL SUPPRESSION
// ============================================

export async function suppressNegativeSignal(
  userId: string,
  signalType: string,
  detail: string,
): Promise<void> {
  const state = await ensureDopamineState(userId);

  const signal: SuppressedSignal = {
    type: signalType,
    detail,
    suppressedAt: new Date().toISOString(),
    handlerSeen: false,
  };

  // Read-then-write for JSONB array
  const signals = [...state.suppressedSignals, signal].slice(-20); // Keep last 20

  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    suppressed_signals: signals,
    last_suppressed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ============================================
// DELAYED REWARD QUEUE
// ============================================

/**
 * Queue a reward to fire after a delay. The delay makes it feel organic.
 */
export async function queueDelayedReward(
  userId: string,
  triggerEvent: string,
  title: string,
  message: string,
  delayMinutes: number,
  options?: { hapticPattern?: string; pointsAwarded?: number; ginaSafe?: boolean },
): Promise<void> {
  const state = await ensureDopamineState(userId);

  // Add jitter: +/- 30% of delay
  const jitter = delayMinutes * (0.7 + Math.random() * 0.6);
  const deliverAfter = new Date(Date.now() + jitter * 60000).toISOString();

  const reward: PendingReward = {
    type: 'affirmation',
    title,
    message,
    hapticPattern: options?.hapticPattern || 'good_girl',
    deliverAfter,
    triggerEvent,
    pointsAwarded: options?.pointsAwarded,
    ginaSafe: options?.ginaSafe ?? false,
  };

  const pending = [...state.pendingRewards, reward];

  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    pending_rewards: pending,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/**
 * Process delayed rewards that are ready to fire.
 * Called on app open or every 60s when app is active.
 * Delivers via the in-app NotificationManager.
 */
export async function processDelayedRewards(userId: string): Promise<number> {
  const state = await getDopamineState(userId);
  if (!state || state.pendingRewards.length === 0) return 0;

  const now = Date.now();
  const ready: PendingReward[] = [];
  const remaining: PendingReward[] = [];

  for (const reward of state.pendingRewards) {
    if (new Date(reward.deliverAfter).getTime() <= now) {
      ready.push(reward);
    } else {
      remaining.push(reward);
    }
  }

  if (ready.length === 0) return 0;

  // Deliver via in-app notification manager
  const manager = getNotificationManager();
  for (const reward of ready) {
    manager.push({
      type: 'handler_intervention',
      priority: 'medium',
      title: reward.title,
      message: reward.message,
      data: {
        dopamineType: reward.type,
        triggerEvent: reward.triggerEvent,
        pointsAwarded: reward.pointsAwarded,
      },
    });

    // Log event
    await supabase.from('notification_events').insert({
      user_id: userId,
      notification_type: reward.type,
      reward_tier: 'medium',
      title: reward.title,
      body: reward.message,
      haptic_pattern: reward.hapticPattern || null,
      points_awarded: reward.pointsAwarded || 0,
      delivered_at: new Date().toISOString(),
    });
  }

  // Update state — remove delivered rewards
  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    pending_rewards: remaining,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return ready.length;
}

// ============================================
// ENGAGEMENT LEARNING
// ============================================

export async function trackNotificationOpen(
  userId: string,
  notificationEventId: string,
): Promise<void> {
  await supabase
    .from('notification_events')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', notificationEventId)
    .eq('user_id', userId);
}

/**
 * Recompute engagement learning from notification event history.
 * Called weekly or when enough data accumulates.
 */
export async function adaptNotificationFrequency(userId: string): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: events } = await supabase
    .from('notification_events')
    .select('delivered_at, opened_at, task_completed_after')
    .eq('user_id', userId)
    .gte('delivered_at', thirtyDaysAgo);

  if (!events || events.length < 10) return;

  const total = events.length;
  const opened = events.filter((e: { opened_at: string | null }) => e.opened_at).length;
  const taskAfter = events.filter((e: { task_completed_after: boolean | null }) => e.task_completed_after).length;
  const avgOpenRate = opened / total;
  const avgTaskAfterRate = total > 0 ? taskAfter / total : 0;

  // Best/worst hours
  const hourBuckets: Record<number, { delivered: number; opened: number }> = {};
  for (const e of events) {
    const hour = new Date(e.delivered_at).getHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { delivered: 0, opened: 0 };
    hourBuckets[hour].delivered++;
    if (e.opened_at) hourBuckets[hour].opened++;
  }

  const hourRates = Object.entries(hourBuckets)
    .filter(([, v]) => v.delivered >= 3)
    .map(([h, v]) => ({ hour: Number(h), rate: v.opened / v.delivered }))
    .sort((a, b) => b.rate - a.rate);

  const bestHours = hourRates.slice(0, 3).map(h => h.hour);
  const worstHours = hourRates.slice(-3).map(h => h.hour);

  // Adaptive target
  const state = await ensureDopamineState(userId);
  let newTarget = state.notificationsTarget;
  if (avgOpenRate > 0.7) newTarget = Math.min(newTarget + 1, 8);
  if (avgOpenRate < 0.3) newTarget = Math.max(newTarget - 1, 4);

  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    avg_open_rate: avgOpenRate,
    avg_task_after_rate: avgTaskAfterRate,
    best_response_hours: bestHours,
    worst_response_hours: worstHours,
    notifications_target: newTarget,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/**
 * Reset daily counters. Called at start of each day (morning briefing or first open).
 */
export async function resetDailyCounters(userId: string): Promise<void> {
  await supabase.from('dopamine_state').upsert({
    user_id: userId,
    notifications_today: 0,
    rewards_today: { none: 0, low: 0, medium: 0, high: 0, jackpot: 0 },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

// ============================================
// DELIVER VIA IN-APP NOTIFICATION MANAGER
// ============================================

/**
 * Deliver a dopamine notification through the existing NotificationManager.
 * This is the in-app fallback (and primary delivery for MVP).
 */
export function deliverInApp(payload: NotificationPayload): void {
  const manager = getNotificationManager();

  const priorityMap: Record<RewardTier, 'low' | 'medium' | 'high' | 'critical'> = {
    none: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
    jackpot: 'critical',
  };

  manager.push({
    type: payload.type === 'jackpot' ? 'achievement' : payload.type === 'micro_task' ? 'reminder' : 'handler_intervention',
    priority: priorityMap[payload.rewardTier],
    title: payload.title,
    message: payload.body,
    data: {
      dopamineType: payload.type,
      rewardTier: payload.rewardTier,
      hapticPattern: payload.hapticPattern,
      pointsAwarded: payload.pointsAwarded,
    },
  });
}
