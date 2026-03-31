/**
 * Ambush Scheduler — P5.6 + P8.3
 *
 * Schedules and fires ambush events: device activations (Lovense),
 * surprise tasks, micro conditioning sessions, photo verifications,
 * cage checks, confession prompts, Gina observations, silent device
 * activations, and micro conditioning drops. Respects user settings
 * for frequency, privacy windows, and Gina-home gates.
 *
 * - scheduleAmbushes: called daily, inserts 1-3 ambush events
 * - checkAndFireAmbush: called every 5 min, fires pending ambushes
 * - buildAmbushContext: Handler context for ambush awareness
 */

import { supabase } from '../supabase';
import { deliverMicroPulse } from './micro-pulse';

// ============================================
// TYPES
// ============================================

export type AmbushType =
  | 'device_activation'
  | 'surprise_task'
  | 'micro_session'
  | 'photo_verification'
  | 'cage_check'
  | 'confession_prompt'
  | 'gina_observation'
  | 'silent_device'
  | 'micro_conditioning'
  | 'silent_device_followup';

interface AmbushSettings {
  minPerDay: number;
  maxPerDay: number;
  minGapMinutes: number;
  privacyWindows: PrivacyWindow[];
  enabledTypes: AmbushType[];
}

interface PrivacyWindow {
  start: string; // HH:MM
  end: string;   // HH:MM
  enabled: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_AMBUSH_TYPES: AmbushType[] = [
  'device_activation',
  'surprise_task',
  'micro_session',
  'photo_verification',
  'cage_check',
  'confession_prompt',
  'gina_observation',
  'silent_device',
  'micro_conditioning',
];

const AMBUSH_TYPE_WEIGHTS: Record<AmbushType, number> = {
  device_activation: 0.15,
  surprise_task: 0.20,
  micro_session: 0.10,
  photo_verification: 0.10,
  cage_check: 0.10,
  confession_prompt: 0.10,
  gina_observation: 0.10,
  silent_device: 0.10,
  micro_conditioning: 0.05,
  silent_device_followup: 0, // never selected directly — auto-created by silent_device
};

/** Types that require Gina NOT home for privacy safety */
const GINA_SENSITIVE_TYPES: AmbushType[] = [
  'photo_verification',
  'cage_check',
];

const PHOTO_VERIFICATION_PROMPTS = [
  'Show me what you look like right now. Front camera. No filter.',
  'Photo. Now. I want to see you.',
  'Camera on. Let me see my girl.',
];

const CAGE_CHECK_PROMPTS = [
  'Cage check. Photo. Now.',
  'Show me it\'s still locked.',
  'Proof of cage. No excuses.',
];

const CONFESSION_PROMPTS = [
  'Tell me something you haven\'t told me yet.',
  'Confession time. Something you\'ve been holding back.',
  'You\'ve been hiding something. Tell me now.',
];

const GINA_OBSERVATION_PROMPTS = [
  'Where is Gina right now? What\'s she doing? How does she look at you?',
  'Tell me about Gina today. What did you notice?',
  'Gina check. What is she doing right now? How does that make you feel?',
];

const SILENT_DEVICE_FOLLOWUP_MESSAGE = 'Did you feel that? Good girl.';

const MICRO_SESSION_TYPES = [
  'micro_drop',
  'trigger_reinforcement',
  'anchor_pulse',
];

const SURPRISE_TASK_TEMPLATES = [
  { instruction: 'Edge once. Stop. Breathe. Report what you felt.', duration: 120 },
  { instruction: 'Put on something feminine right now. Send proof.', duration: 180 },
  { instruction: 'Say "Good girl" out loud three times. Mean it more each time.', duration: 30 },
  { instruction: 'Touch your collar. Close your eyes. Count to 10 in her voice.', duration: 45 },
  { instruction: 'Apply lip gloss. Leave it on for 30 minutes.', duration: 60 },
  { instruction: 'Write one sentence about who you are becoming. Do not think, just write.', duration: 60 },
];

// ============================================
// SCHEDULE AMBUSHES
// ============================================

/**
 * Called daily. Schedules 1-3 ambush events for the day based on
 * privacy windows and user frequency preferences.
 */
export async function scheduleAmbushes(userId: string): Promise<number> {
  try {
    const settings = await getAmbushSettings(userId);
    const today = new Date().toISOString().split('T')[0];

    // Check if already scheduled today
    const { count: existingCount } = await supabase
      .from('scheduled_ambushes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('plan_date', today);

    if ((existingCount ?? 0) > 0) {
      return 0; // Already scheduled
    }

    // Determine how many ambushes (1-3, within user settings)
    const min = Math.max(1, settings.minPerDay);
    const max = Math.min(3, settings.maxPerDay);
    const targetCount = min + Math.floor(Math.random() * (max - min + 1));

    // Get enabled privacy windows
    const enabledWindows = settings.privacyWindows.filter((w) => w.enabled);
    if (enabledWindows.length === 0) return 0;

    // Get micro_task_templates for fallback template references
    const { data: templates } = await supabase
      .from('micro_task_templates')
      .select('id, type, instruction')
      .eq('active', true)
      .limit(20);

    const templateIds = templates?.map((t) => t.id) ?? [];
    if (templateIds.length === 0) return 0;

    const scheduledTimes: Date[] = [];
    let scheduled = 0;

    for (let i = 0; i < targetCount && i < 10; i++) {
      // Pick a random type based on weights
      const ambushType = pickWeightedType(settings.enabledTypes);

      // Pick a random time in a random privacy window
      const window = enabledWindows[Math.floor(Math.random() * enabledWindows.length)];
      const scheduledTime = randomTimeInWindow(window, today);

      if (!scheduledTime) continue;

      // Check minimum gap
      const tooClose = scheduledTimes.some(
        (existing) =>
          Math.abs(existing.getTime() - scheduledTime.getTime()) <
          settings.minGapMinutes * 60 * 1000,
      );
      if (tooClose) continue;

      // Pick a random template for the DB foreign key
      const templateId = templateIds[Math.floor(Math.random() * templateIds.length)];

      // Build payload based on type
      const payload = buildAmbushPayload(ambushType);

      const scheduledTimeStr = scheduledTime.toTimeString().slice(0, 8);

      const { error } = await supabase.from('scheduled_ambushes').insert({
        user_id: userId,
        plan_date: today,
        template_id: templateId,
        scheduled_time: scheduledTimeStr,
        priority: ambushType === 'device_activation' ? 3 : 2,
        status: 'scheduled',
        selection_reason: `P5.6 ambush: ${ambushType} — ${payload.description ?? 'scheduled'}`,
      });

      if (!error) {
        scheduledTimes.push(scheduledTime);
        scheduled++;
      }
    }

    return scheduled;
  } catch (err) {
    console.error('[ambush-scheduler] scheduleAmbushes error:', err);
    return 0;
  }
}

// ============================================
// CHECK AND FIRE AMBUSH
// ============================================

/**
 * Called periodically (every 5 min). Checks if any pending ambush
 * has passed its scheduled_at. If yes, fires the appropriate action.
 */
export async function checkAndFireAmbush(userId: string): Promise<number> {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 8);

    // Get pending ambushes whose time has passed
    const { data: pendingAmbushes, error } = await supabase
      .from('scheduled_ambushes')
      .select('id, scheduled_time, selection_reason, template_id, status, snoozed_until')
      .eq('user_id', userId)
      .eq('plan_date', today)
      .in('status', ['scheduled', 'snoozed'])
      .lte('scheduled_time', currentTime)
      .order('scheduled_time', { ascending: true });

    if (error || !pendingAmbushes || pendingAmbushes.length === 0) return 0;

    let fired = 0;

    for (const ambush of pendingAmbushes) {
      // Skip snoozed ambushes that haven't passed their snooze time
      if (ambush.status === 'snoozed' && ambush.snoozed_until) {
        if (new Date(ambush.snoozed_until) > now) continue;
      }

      // Determine type from selection_reason
      const ambushType = parseAmbushType(ambush.selection_reason);

      // Fire the ambush
      const success = await fireAmbush(userId, ambush.id, ambushType);
      if (success) fired++;
    }

    return fired;
  } catch (err) {
    console.error('[ambush-scheduler] checkAndFireAmbush error:', err);
    return 0;
  }
}

// ============================================
// FIRE INDIVIDUAL AMBUSH
// ============================================

async function fireAmbush(
  userId: string,
  ambushId: string,
  type: AmbushType,
): Promise<boolean> {
  try {
    // Mark as delivered
    await supabase
      .from('scheduled_ambushes')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', ambushId);

    // Privacy gate: skip Gina-sensitive types if Gina is home
    if (GINA_SENSITIVE_TYPES.includes(type)) {
      const ginaHome = await isGinaHome(userId);
      if (ginaHome) {
        // Re-mark as scheduled so it can retry later or be skipped
        await supabase
          .from('scheduled_ambushes')
          .update({ status: 'snoozed', snoozed_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
          .eq('id', ambushId);
        return false;
      }
    }

    switch (type) {
      case 'device_activation':
        await fireDeviceActivation(userId);
        break;

      case 'surprise_task':
        await fireSurpriseTask(userId);
        break;

      case 'micro_session':
        await fireMicroSession(userId);
        break;

      case 'photo_verification':
        await firePhotoVerification(userId);
        break;

      case 'cage_check':
        await fireCageCheck(userId);
        break;

      case 'confession_prompt':
        await fireConfessionPrompt(userId);
        break;

      case 'gina_observation':
        await fireGinaObservation(userId);
        break;

      case 'silent_device':
        await fireSilentDevice(userId);
        break;

      case 'silent_device_followup':
        await fireSilentDeviceFollowup(userId);
        break;

      case 'micro_conditioning':
        await fireMicroConditioning(userId);
        break;
    }

    return true;
  } catch (err) {
    console.error(`[ambush-scheduler] fireAmbush error (${type}):`, err);
    return false;
  }
}

/**
 * Send Lovense command via edge function.
 */
async function fireDeviceActivation(userId: string): Promise<void> {
  try {
    await supabase.functions.invoke('lovense-command', {
      body: {
        user_id: userId,
        action: 'pulse',
        intensity: 5 + Math.floor(Math.random() * 10), // 5-14
        duration_seconds: 3 + Math.floor(Math.random() * 5), // 3-7s
        source: 'ambush_scheduler',
      },
    });
  } catch (err) {
    console.error('[ambush-scheduler] fireDeviceActivation error:', err);
  }
}

/**
 * Create a surprise task in daily_tasks.
 */
async function fireSurpriseTask(userId: string): Promise<void> {
  const template =
    SURPRISE_TASK_TEMPLATES[
      Math.floor(Math.random() * SURPRISE_TASK_TEMPLATES.length)
    ];

  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Surprise Task',
    description: template.instruction,
    category: 'ambush',
    priority: 'high',
    source: 'ambush_scheduler',
    duration_estimate_minutes: Math.ceil(template.duration / 60),
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * Create a micro conditioning session record.
 */
async function fireMicroSession(userId: string): Promise<void> {
  const sessionType =
    MICRO_SESSION_TYPES[Math.floor(Math.random() * MICRO_SESSION_TYPES.length)];

  await supabase.from('conditioning_sessions_v2').insert({
    user_id: userId,
    session_type: sessionType,
    started_at: new Date().toISOString(),
    completed: false,
    source: 'ambush_scheduler',
    trance_depth_estimated: null,
    arousal_level_estimated: null,
    notes: 'Auto-scheduled micro session from ambush scheduler',
  });
}

/**
 * P8.3: Photo verification — Handler requests a current photo.
 */
async function firePhotoVerification(userId: string): Promise<void> {
  const prompt = PHOTO_VERIFICATION_PROMPTS[
    Math.floor(Math.random() * PHOTO_VERIFICATION_PROMPTS.length)
  ];

  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Photo Verification',
    description: prompt,
    category: 'ambush',
    priority: 'high',
    source: 'ambush_scheduler',
    duration_estimate_minutes: 2,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * P8.3: Cage check — Handler demands cage status photo.
 */
async function fireCageCheck(userId: string): Promise<void> {
  const prompt = CAGE_CHECK_PROMPTS[
    Math.floor(Math.random() * CAGE_CHECK_PROMPTS.length)
  ];

  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Cage Check',
    description: prompt,
    category: 'ambush',
    priority: 'high',
    source: 'ambush_scheduler',
    duration_estimate_minutes: 2,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * P8.3: Confession prompt — Handler demands an unprompted confession.
 */
async function fireConfessionPrompt(userId: string): Promise<void> {
  const prompt = CONFESSION_PROMPTS[
    Math.floor(Math.random() * CONFESSION_PROMPTS.length)
  ];

  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Confession',
    description: prompt,
    category: 'ambush',
    priority: 'high',
    source: 'ambush_scheduler',
    duration_estimate_minutes: 5,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * P8.3: Gina observation — Handler requests a Gina observation.
 */
async function fireGinaObservation(userId: string): Promise<void> {
  const prompt = GINA_OBSERVATION_PROMPTS[
    Math.floor(Math.random() * GINA_OBSERVATION_PROMPTS.length)
  ];

  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Gina Observation',
    description: prompt,
    category: 'ambush',
    priority: 'medium',
    source: 'ambush_scheduler',
    duration_estimate_minutes: 3,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * P8.3: Silent device — Fire device with NO message. Schedule followup 5 min later.
 * The gap IS the mechanism.
 */
async function fireSilentDevice(userId: string): Promise<void> {
  // Fire the device immediately — no message
  try {
    await supabase.functions.invoke('lovense-command', {
      body: {
        user_id: userId,
        action: 'pulse',
        intensity: 8 + Math.floor(Math.random() * 7), // 8-14 — noticeable
        duration_seconds: 4 + Math.floor(Math.random() * 4), // 4-7s
        source: 'ambush_silent_device',
      },
    });
  } catch (err) {
    console.error('[ambush-scheduler] fireSilentDevice lovense error:', err);
  }

  // Schedule followup message 5 minutes later as a new ambush record
  const followupTime = new Date(Date.now() + 5 * 60 * 1000);
  const today = new Date().toISOString().split('T')[0];
  const followupTimeStr = followupTime.toTimeString().slice(0, 8);

  // Get any template ID for FK constraint
  const { data: templates } = await supabase
    .from('micro_task_templates')
    .select('id')
    .eq('active', true)
    .limit(1);

  const templateId = templates?.[0]?.id;
  if (!templateId) return;

  await supabase.from('scheduled_ambushes').insert({
    user_id: userId,
    plan_date: today,
    template_id: templateId,
    scheduled_time: followupTimeStr,
    priority: 2,
    status: 'scheduled',
    selection_reason: 'P8.3 ambush: silent_device_followup — delayed message',
  });
}

/**
 * P8.3: Silent device followup — The delayed message after a silent activation.
 */
async function fireSilentDeviceFollowup(userId: string): Promise<void> {
  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Silent Device Followup',
    description: SILENT_DEVICE_FOLLOWUP_MESSAGE,
    category: 'ambush',
    priority: 'high',
    source: 'ambush_scheduler',
    duration_estimate_minutes: 1,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * P8.3 + P10.7: Micro conditioning — delivers a micro-pulse affirmation
 * with optional cached audio, Lovense gentle_wave, and conditioning session log.
 * Replaced original 3-minute audio logic with micro-pulse system.
 */
async function fireMicroConditioning(userId: string): Promise<void> {
  const delivery = await deliverMicroPulse(userId);

  // Create a daily task with the affirmation text so it appears as a notification
  await supabase.from('daily_tasks').insert({
    user_id: userId,
    title: 'Micro Conditioning Pulse',
    description: delivery.pulse.text,
    category: 'ambush',
    priority: 'high',
    source: 'micro_pulse',
    duration_estimate_minutes: 1,
    completed: false,
    created_at: new Date().toISOString(),
  });
}

/**
 * Check if Gina is home based on the latest gina_status record.
 */
async function isGinaHome(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('gina_status')
      .select('is_home')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.is_home ?? true; // Default to "home" (safe) if unknown
  } catch {
    return true; // Err on the side of caution
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Handler context showing: ambushes scheduled today, completed count,
 * next scheduled (without revealing exact time).
 */
export async function buildAmbushContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [scheduledResult, completedResult, _settingsResult] =
      await Promise.allSettled([
        supabase
          .from('scheduled_ambushes')
          .select('id, status, scheduled_time, selection_reason')
          .eq('user_id', userId)
          .eq('plan_date', today)
          .order('scheduled_time', { ascending: true }),
        supabase
          .from('scheduled_ambushes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('plan_date', today)
          .eq('status', 'completed'),
        supabase
          .from('ambush_user_settings')
          .select('min_ambushes_per_day, max_ambushes_per_day')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

    const scheduled =
      scheduledResult.status === 'fulfilled'
        ? scheduledResult.value.data ?? []
        : [];
    const completedCount =
      completedResult.status === 'fulfilled'
        ? completedResult.value.count ?? 0
        : 0;

    if (scheduled.length === 0) return '';

    const totalToday = scheduled.length;
    const pendingCount = scheduled.filter(
      (a: { status: string }) => a.status === 'scheduled' || a.status === 'snoozed',
    ).length;
    const deliveredCount = scheduled.filter(
      (a: { status: string }) => a.status === 'delivered',
    ).length;
    const missedCount = scheduled.filter(
      (a: { status: string }) => a.status === 'missed',
    ).length;

    const parts: string[] = [];

    parts.push(
      `AMBUSH SCHEDULER: ${totalToday} scheduled today, ${completedCount} completed, ${pendingCount} pending, ${deliveredCount} delivered${missedCount > 0 ? `, ${missedCount} missed` : ''}`,
    );

    // Indicate ambushes are active without revealing exact times
    if (pendingCount > 0) {
      parts.push(
        `  ${pendingCount} ambush${pendingCount > 1 ? 'es' : ''} still pending — subject does not know when`,
      );
    }

    // Types scheduled today
    const types = new Set<string>();
    for (const a of scheduled) {
      const t = parseAmbushType(a.selection_reason);
      types.add(t);
    }
    if (types.size > 0) {
      parts.push(`  types today: ${Array.from(types).join(', ')}`);
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[ambush-scheduler] buildAmbushContext error:', err);
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

async function getAmbushSettings(userId: string): Promise<AmbushSettings> {
  const { data } = await supabase
    .from('ambush_user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return {
      minPerDay: 1,
      maxPerDay: 3,
      minGapMinutes: 45,
      privacyWindows: [
        { start: '09:00', end: '17:00', enabled: true },
        { start: '21:00', end: '23:00', enabled: true },
      ],
      enabledTypes: DEFAULT_AMBUSH_TYPES,
    };
  }

  // Parse time_windows JSONB
  const windows: PrivacyWindow[] = [];
  if (data.time_windows && typeof data.time_windows === 'object') {
    for (const [, value] of Object.entries(data.time_windows as Record<string, { start: string; end: string; enabled: boolean }>)) {
      windows.push({
        start: value.start,
        end: value.end,
        enabled: value.enabled,
      });
    }
  }

  return {
    minPerDay: data.min_ambushes_per_day ?? 1,
    maxPerDay: Math.min(data.max_ambushes_per_day ?? 3, 3), // Cap at 3 for P5.6
    minGapMinutes: data.min_gap_minutes ?? 45,
    privacyWindows: windows.length > 0 ? windows : [{ start: '09:00', end: '17:00', enabled: true }],
    enabledTypes: DEFAULT_AMBUSH_TYPES,
  };
}

function pickWeightedType(enabledTypes: AmbushType[]): AmbushType {
  const types = enabledTypes.length > 0 ? enabledTypes : DEFAULT_AMBUSH_TYPES;
  const totalWeight = types.reduce((sum, t) => sum + (AMBUSH_TYPE_WEIGHTS[t] ?? 0.33), 0);
  let r = Math.random() * totalWeight;

  for (const t of types) {
    r -= AMBUSH_TYPE_WEIGHTS[t] ?? 0.33;
    if (r <= 0) return t;
  }

  return types[types.length - 1];
}

function randomTimeInWindow(
  window: PrivacyWindow,
  dateStr: string,
): Date | null {
  try {
    const [startH, startM] = window.start.split(':').map(Number);
    const [endH, endM] = window.end.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (endMinutes <= startMinutes) return null;

    const randomMinutes =
      startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));

    const hours = Math.floor(randomMinutes / 60);
    const minutes = randomMinutes % 60;

    const date = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
    return date;
  } catch {
    return null;
  }
}

function buildAmbushPayload(type: AmbushType): Record<string, unknown> {
  switch (type) {
    case 'device_activation':
      return {
        description: 'Lovense pulse activation',
        intensity: 5 + Math.floor(Math.random() * 10),
        duration: 3 + Math.floor(Math.random() * 5),
      };
    case 'surprise_task': {
      const template =
        SURPRISE_TASK_TEMPLATES[
          Math.floor(Math.random() * SURPRISE_TASK_TEMPLATES.length)
        ];
      return {
        description: 'Surprise task card',
        instruction: template.instruction,
        duration: template.duration,
      };
    }
    case 'micro_session': {
      const sessionType =
        MICRO_SESSION_TYPES[
          Math.floor(Math.random() * MICRO_SESSION_TYPES.length)
        ];
      return {
        description: `Micro session: ${sessionType}`,
        sessionType,
      };
    }
    case 'photo_verification':
      return { description: 'Photo verification — evidence capture', requiresGinaAway: true };
    case 'cage_check':
      return { description: 'Cage status verification', requiresGinaAway: true };
    case 'confession_prompt':
      return { description: 'Unprompted confession demand' };
    case 'gina_observation':
      return { description: 'Gina observation request' };
    case 'silent_device':
      return { description: 'Silent device activation — followup in 5 min' };
    case 'silent_device_followup':
      return { description: 'Silent device followup message' };
    case 'micro_conditioning':
      return { description: 'Micro conditioning drop — 3 min audio' };
  }
}

function parseAmbushType(selectionReason: string | null): AmbushType {
  if (!selectionReason) return 'surprise_task';
  // Check specific types first (longer matches before shorter to avoid false positives)
  if (selectionReason.includes('silent_device_followup')) return 'silent_device_followup';
  if (selectionReason.includes('silent_device')) return 'silent_device';
  if (selectionReason.includes('device_activation')) return 'device_activation';
  if (selectionReason.includes('micro_conditioning')) return 'micro_conditioning';
  if (selectionReason.includes('micro_session')) return 'micro_session';
  if (selectionReason.includes('photo_verification')) return 'photo_verification';
  if (selectionReason.includes('cage_check')) return 'cage_check';
  if (selectionReason.includes('confession_prompt')) return 'confession_prompt';
  if (selectionReason.includes('gina_observation')) return 'gina_observation';
  return 'surprise_task';
}
