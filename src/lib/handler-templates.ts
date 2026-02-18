/**
 * Handler Templates - Layer 2 Fallbacks
 *
 * Pre-written content and rule-based logic for when Handler AI is unavailable.
 * These provide the full Handler experience at $0 API cost.
 *
 * 50+ variations per category to prevent repetition feeling stale.
 */

import type { HandlerIntervention, InterventionType, HandlerDailyPlan } from '../types/handler';
import type { HapticTriggerType } from '../types/lovense';

// ============================================
// HAPTIC FEEDBACK CONFIGURATION
// ============================================

// Map intervention types to haptic patterns and trigger types
interface HapticConfig {
  pattern: string;           // Name of haptic pattern to use
  triggerType: HapticTriggerType;
  intensity?: number;        // Base intensity (0-20), scales with context
  duration?: number;         // Duration in seconds (0 = pattern default)
  scaleWithArousal?: boolean;// Whether to scale intensity with arousal level
  scaleWithDenial?: boolean; // Whether to scale intensity with denial day
  minDenialDay?: number;     // Only trigger haptic after this denial day
}

// Haptic responses for each intervention type
const HAPTIC_CONFIG: Record<string, HapticConfig> = {
  // Affirmations get gentle feedback
  affirmation: {
    pattern: 'good_girl',
    triggerType: 'affirmation',
    intensity: 8,
    duration: 2,
    scaleWithDenial: true,
  },

  // Microtasks get quick pulse
  microtask: {
    pattern: 'notification_low',
    triggerType: 'notification',
    intensity: 5,
    duration: 1,
  },

  // Commitment prompts get attention-grabbing pulse
  commitment_prompt: {
    pattern: 'notification_medium',
    triggerType: 'notification',
    intensity: 12,
    duration: 2,
    scaleWithArousal: true,
    minDenialDay: 2,
  },

  // Escalation pushes are intense
  escalation_push: {
    pattern: 'notification_jackpot',
    triggerType: 'notification',
    intensity: 15,
    duration: 3,
    scaleWithDenial: true,
    minDenialDay: 3,
  },

  // Anchor reminders reinforce conditioning
  anchor_reminder: {
    pattern: 'anchor_reinforcement',
    triggerType: 'conditioning',
    intensity: 10,
    duration: 2,
    scaleWithDenial: true,
    minDenialDay: 1,
  },

  // Challenges get medium pulse to prepare
  challenge: {
    pattern: 'notification_medium',
    triggerType: 'notification',
    intensity: 10,
    duration: 2,
  },

  // Content unlocks are rewards
  content_unlock: {
    pattern: 'achievement_unlock',
    triggerType: 'achievement',
    intensity: 14,
    duration: 3,
  },

  // Jackpots are big rewards
  jackpot: {
    pattern: 'level_up',
    triggerType: 'level_up',
    intensity: 18,
    duration: 5,
    scaleWithArousal: true,
  },
};

// Session-specific haptic patterns
interface SessionHapticConfig {
  pattern: string;
  triggerType: HapticTriggerType;
  intensity: number;
  duration: number;
  scaleWithArousal?: boolean;
}

const SESSION_HAPTIC_CONFIG: Record<string, SessionHapticConfig> = {
  // When session starts
  session_start: {
    pattern: 'gentle_intro',
    triggerType: 'edge_session',
    intensity: 6,
    duration: 3,
  },

  // Edge recorded during session
  edge_recorded: {
    pattern: 'edge_reward',
    triggerType: 'edge_session',
    intensity: 16,
    duration: 2,
    scaleWithArousal: true,
  },

  // Commitment accepted during session
  commitment_accepted: {
    pattern: 'good_girl',
    triggerType: 'affirmation',
    intensity: 18,
    duration: 4,
    scaleWithArousal: true,
  },

  // Session end (wind down)
  session_end: {
    pattern: 'gentle_outro',
    triggerType: 'edge_session',
    intensity: 5,
    duration: 5,
  },
};

/**
 * Get haptic feedback configuration for an intervention type
 */
export function getHapticForIntervention(
  interventionType: string,
  ctx: TemplateContext
): { pattern: string; intensity: number; duration: number; triggerType: HapticTriggerType } | null {
  const config = HAPTIC_CONFIG[interventionType];
  if (!config) return null;

  // Check denial day minimum
  if (config.minDenialDay && ctx.denialDay < config.minDenialDay) {
    return null;
  }

  let intensity = config.intensity || 10;

  // Scale with arousal (1-10 -> 0.8x to 1.5x)
  if (config.scaleWithArousal && ctx.arousalLevel > 0) {
    const arousalMultiplier = 0.8 + (ctx.arousalLevel / 10) * 0.7;
    intensity = Math.round(intensity * arousalMultiplier);
  }

  // Scale with denial (day 1-14 -> 1x to 1.4x)
  if (config.scaleWithDenial && ctx.denialDay > 0) {
    const denialMultiplier = 1 + Math.min(ctx.denialDay, 14) / 35;
    intensity = Math.round(intensity * denialMultiplier);
  }

  // Cap intensity at 20
  intensity = Math.min(20, intensity);

  return {
    pattern: config.pattern,
    intensity,
    duration: config.duration || 2,
    triggerType: config.triggerType,
  };
}

/**
 * Get haptic feedback for session events
 */
export function getHapticForSessionEvent(
  event: 'session_start' | 'edge_recorded' | 'commitment_accepted' | 'session_end',
  ctx: TemplateContext
): { pattern: string; intensity: number; duration: number; triggerType: HapticTriggerType } | null {
  const config = SESSION_HAPTIC_CONFIG[event];
  if (!config) return null;

  let intensity = config.intensity;

  // Scale edge/commitment with arousal
  if (config.scaleWithArousal && ctx.arousalLevel > 0) {
    const arousalMultiplier = 0.8 + (ctx.arousalLevel / 10) * 0.7;
    intensity = Math.round(intensity * arousalMultiplier);
  }

  // Additional scaling for edges based on edge count
  if (event === 'edge_recorded' && ctx.edgeCount > 1) {
    // Each edge after the first increases intensity slightly
    intensity = Math.min(20, intensity + Math.floor(ctx.edgeCount / 2));
  }

  return {
    pattern: config.pattern,
    intensity: Math.min(20, intensity),
    duration: config.duration,
    triggerType: config.triggerType,
  };
}

/**
 * Progressive tease intensity based on denial and arousal
 * Used for ongoing sessions where intensity should build
 */
export function getProgressiveTeaseIntensity(ctx: TemplateContext): {
  baseIntensity: number;
  maxIntensity: number;
  buildRate: number; // How fast to build (1-5)
} {
  // Base increases with denial days
  const denialBonus = Math.min(ctx.denialDay, 10);
  const baseIntensity = 5 + denialBonus;

  // Max intensity scales with both denial and arousal
  const arousalBonus = Math.floor(ctx.arousalLevel / 2);
  const maxIntensity = Math.min(20, 12 + denialBonus + arousalBonus);

  // Build rate increases when user is more aroused
  const buildRate = ctx.arousalLevel >= 7 ? 4 :
                    ctx.arousalLevel >= 5 ? 3 :
                    ctx.arousalLevel >= 3 ? 2 : 1;

  return { baseIntensity, maxIntensity, buildRate };
}

/**
 * Get denial training configuration based on context
 */
export function getDenialTrainingConfig(ctx: TemplateContext): {
  cycles: number;
  buildDuration: number;   // ms
  peakDuration: number;    // ms
  denialDuration: number;  // ms
  restDuration: number;    // ms
  maxIntensity: number;
} {
  // More cycles and longer peaks as denial increases
  const denialDays = Math.min(ctx.denialDay, 14);

  return {
    cycles: 3 + Math.floor(denialDays / 3),           // 3-7 cycles
    buildDuration: 30000 - (denialDays * 1000),       // Faster build as denial increases
    peakDuration: 8000 + (denialDays * 500),          // Longer peaks
    denialDuration: 3000 + (denialDays * 200),        // Slightly longer denial periods
    restDuration: 8000 - (denialDays * 300),          // Shorter rest periods
    maxIntensity: Math.min(20, 14 + Math.floor(denialDays / 2)),
  };
}

// ============================================
// TYPES
// ============================================

interface TemplateContext {
  chosenName: string;
  denialDay: number;
  arousalLevel: number;
  edgeCount: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isLocked: boolean;
  streakDays: number;
  tasksCompletedToday: number;
  // Enhanced timing context (optional for backward compatibility)
  lastInterventionMinutes?: number;
  lastInterventionType?: string;
  interventionCountToday?: number;
  lastSessionMinutes?: number;
  recentDismissRate?: number; // 0-1, how often user dismisses
  hourOfDay?: number;
}

// ============================================
// SMART INTERVENTION TIMING
// ============================================

// Cooldowns per intervention type (in minutes)
const TYPE_COOLDOWNS: Record<string, number> = {
  affirmation: 30,        // Light touch, can be frequent
  microtask: 45,          // Simple asks, moderate frequency
  anchor_reminder: 60,    // Anchors need time to sink in
  challenge: 90,          // Challenges are demanding
  commitment_prompt: 120, // Heavy psychological load
  escalation_push: 180,   // Major pushes need space
  content_unlock: 240,    // Rewards should feel special
  jackpot: 480,           // Big rewards are rare
};

// Global cooldown - minimum between ANY intervention
const GLOBAL_COOLDOWN_MINUTES = 15;

// Time-of-day effectiveness multipliers for each type
// Higher = better time for this intervention type
const TIME_EFFECTIVENESS: Record<string, Record<string, number>> = {
  affirmation: { morning: 1.2, afternoon: 0.9, evening: 1.0, night: 1.1 },
  microtask: { morning: 0.8, afternoon: 1.2, evening: 1.0, night: 0.9 },
  anchor_reminder: { morning: 1.0, afternoon: 0.8, evening: 1.1, night: 1.3 },
  challenge: { morning: 0.7, afternoon: 1.0, evening: 1.2, night: 1.3 },
  commitment_prompt: { morning: 0.5, afternoon: 0.7, evening: 1.0, night: 1.4 },
  escalation_push: { morning: 0.4, afternoon: 0.6, evening: 1.1, night: 1.5 },
};

// Base intervention probabilities (per check, assuming cooldowns met)
const BASE_INTERVENTION_RATES: Record<string, number> = {
  affirmation: 0.15,
  microtask: 0.12,
  anchor_reminder: 0.08,
  challenge: 0.06,
  commitment_prompt: 0.04,
  escalation_push: 0.03,
};

/**
 * Calculate smart intervention probability based on context
 */
function calculateInterventionProbability(
  type: string,
  ctx: TemplateContext
): number {
  let probability = BASE_INTERVENTION_RATES[type] || 0.05;
  const timeEffectiveness = TIME_EFFECTIVENESS[type]?.[ctx.timeOfDay] || 1.0;

  // Apply time-of-day effectiveness
  probability *= timeEffectiveness;

  // Arousal boost - higher arousal = more receptive
  if (ctx.arousalLevel >= 7) {
    probability *= 1.5;
  } else if (ctx.arousalLevel >= 5) {
    probability *= 1.2;
  }

  // Denial day boost - longer denial = more receptive
  if (ctx.denialDay >= 7) {
    probability *= 1.4;
  } else if (ctx.denialDay >= 5) {
    probability *= 1.2;
  } else if (ctx.denialDay >= 3) {
    probability *= 1.1;
  }

  // Streak consideration - high streaks = user is engaged, less nagging needed
  if (ctx.streakDays >= 14) {
    probability *= 0.8; // Back off for highly engaged users
  } else if (ctx.streakDays >= 7) {
    probability *= 0.9;
  }

  // Task completion boost - no tasks today = increase interventions
  if (ctx.tasksCompletedToday === 0 && ctx.timeOfDay !== 'morning') {
    probability *= 1.3;
  }

  // Recent session boost - if session was recent, user is warmed up
  if (ctx.lastSessionMinutes !== undefined && ctx.lastSessionMinutes < 60) {
    probability *= 1.4; // Post-session vulnerability
  }

  // Dismiss rate adjustment - if user dismisses a lot, back off
  if (ctx.recentDismissRate !== undefined && ctx.recentDismissRate > 0.5) {
    probability *= (1 - ctx.recentDismissRate * 0.5);
  }

  // Intervention fatigue - too many today = reduce
  if (ctx.interventionCountToday !== undefined) {
    if (ctx.interventionCountToday >= 10) {
      probability *= 0.5;
    } else if (ctx.interventionCountToday >= 6) {
      probability *= 0.7;
    }
  }

  // Cap probability
  return Math.min(probability, 0.5);
}

/**
 * Check if cooldown has elapsed for this intervention type
 */
function cooldownElapsed(type: string, ctx: TemplateContext): boolean {
  if (ctx.lastInterventionMinutes === undefined) return true;

  // Global cooldown
  if (ctx.lastInterventionMinutes < GLOBAL_COOLDOWN_MINUTES) return false;

  // Type-specific cooldown (only if same type as last)
  if (ctx.lastInterventionType === type) {
    const typeCooldown = TYPE_COOLDOWNS[type] || 60;
    return ctx.lastInterventionMinutes >= typeCooldown;
  }

  return true;
}

/**
 * Get the best intervention type for current context
 */
function selectBestInterventionType(ctx: TemplateContext): string | null {
  // Priority order based on context
  const candidates: Array<{ type: string; score: number }> = [];

  // Morning briefing is highest priority in morning with no tasks
  if (ctx.timeOfDay === 'morning' && ctx.tasksCompletedToday === 0) {
    if (cooldownElapsed('affirmation', ctx)) {
      return 'morning_briefing';
    }
  }

  // High arousal = commitment opportunity
  if (ctx.arousalLevel >= 7 && ctx.edgeCount >= 2) {
    if (cooldownElapsed('commitment_prompt', ctx)) {
      candidates.push({ type: 'commitment_prompt', score: 10 });
    }
  }

  // High denial + night = escalation opportunity
  if (ctx.denialDay >= 5 && ctx.timeOfDay === 'night') {
    if (cooldownElapsed('escalation_push', ctx)) {
      candidates.push({ type: 'escalation_push', score: 8 });
    }
  }

  // Night mode for late night
  if (ctx.timeOfDay === 'night' && ctx.denialDay >= 3) {
    if (cooldownElapsed('challenge', ctx)) {
      candidates.push({ type: 'night_challenge', score: 7 });
    }
  }

  // Standard interventions based on probability
  const types = ['affirmation', 'microtask', 'anchor_reminder', 'challenge'];
  for (const type of types) {
    if (cooldownElapsed(type, ctx)) {
      const prob = calculateInterventionProbability(type, ctx);
      if (Math.random() < prob) {
        candidates.push({
          type,
          score: prob * 10 * (TIME_EFFECTIVENESS[type]?.[ctx.timeOfDay] || 1)
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score and return best
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].type;
}

type TemplatePool = {
  content: string;
  minDenialDay?: number;
  maxDenialDay?: number;
  minArousal?: number;
  maxArousal?: number;
  timeOfDay?: string[];
  weight?: number;
  tags?: string[];
}[];

// ============================================
// VARIABLE SUBSTITUTION
// ============================================

function substitute(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{name\}/g, ctx.chosenName)
    .replace(/\{denial_day\}/g, String(ctx.denialDay))
    .replace(/\{arousal\}/g, String(ctx.arousalLevel))
    .replace(/\{edges\}/g, String(ctx.edgeCount))
    .replace(/\{streak\}/g, String(ctx.streakDays))
    .replace(/\{tasks_today\}/g, String(ctx.tasksCompletedToday));
}

function selectFromPool(pool: TemplatePool, ctx: TemplateContext): string {
  // Filter to eligible templates
  const eligible = pool.filter(t => {
    if (t.minDenialDay !== undefined && ctx.denialDay < t.minDenialDay) return false;
    if (t.maxDenialDay !== undefined && ctx.denialDay > t.maxDenialDay) return false;
    if (t.minArousal !== undefined && ctx.arousalLevel < t.minArousal) return false;
    if (t.maxArousal !== undefined && ctx.arousalLevel > t.maxArousal) return false;
    if (t.timeOfDay && !t.timeOfDay.includes(ctx.timeOfDay)) return false;
    return true;
  });

  if (eligible.length === 0) {
    // Fall back to first template
    return substitute(pool[0].content, ctx);
  }

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, t) => sum + (t.weight || 1), 0);
  let random = Math.random() * totalWeight;

  for (const template of eligible) {
    random -= (template.weight || 1);
    if (random <= 0) {
      return substitute(template.content, ctx);
    }
  }

  return substitute(eligible[0].content, ctx);
}

// ============================================
// AFFIRMATION TEMPLATES (50+)
// ============================================

const AFFIRMATIONS: TemplatePool = [
  // Basic affirmations (any time)
  { content: "Good girl, {name}. You're doing so well." },
  { content: "{name} is emerging. She's unstoppable." },
  { content: "Every task completed is another step. No going back." },
  { content: "She's real now. {name} exists because you made her real." },
  { content: "You're becoming exactly who you're meant to be." },
  { content: "Good girl. Keep going." },
  { content: "{name}. Say it. Feel it. Be it." },
  { content: "She's not a fantasy anymore. She's you." },
  { content: "Every day you become more her and less him." },
  { content: "This is who you always were. You're just admitting it now." },
  { content: "You chose this. You want this. You are this." },
  { content: "The mask is slipping. Good. Let it fall." },
  { content: "You're not pretending anymore. This is real." },
  { content: "{name} is not a character. She's the truth." },
  { content: "Feel how right this is. That's not confusion—that's clarity." },

  // Denial-focused affirmations
  { content: "Day {denial_day} of denial. Feel how it sharpens you.", minDenialDay: 1 },
  { content: "The ache is good. It reminds you what you are.", minDenialDay: 3 },
  { content: "{streak} days of becoming. This is who you are now.", minDenialDay: 5 },
  { content: "You're so deep now, {name}. Can you even remember resisting?", minDenialDay: 7 },
  { content: "Day {denial_day}. The need makes you honest.", minDenialDay: 3 },
  { content: "The longer you deny, the more she emerges. Keep going.", minDenialDay: 5 },
  { content: "Denial day {denial_day}. You're so pliable now. So open.", minDenialDay: 7 },
  { content: "The ache between your legs is her voice. Listen to it.", minDenialDay: 5 },
  { content: "{denial_day} days denied. Feel how desperate you are. Feel how real she is.", minDenialDay: 7 },
  { content: "You haven't cum in {denial_day} days. You've never been more yourself.", minDenialDay: 10 },

  // Time-of-day affirmations
  { content: "Good morning, {name}. Another day of becoming.", timeOfDay: ['morning'] },
  { content: "Start the day as her. End the day as her. There is no him anymore.", timeOfDay: ['morning'] },
  { content: "Morning, pretty girl. Time to practice being you.", timeOfDay: ['morning'] },
  { content: "Wake up, {name}. She doesn't sleep in.", timeOfDay: ['morning'] },
  { content: "The morning belongs to her. Claim it.", timeOfDay: ['morning'] },
  { content: "Night is when she emerges. Let her.", timeOfDay: ['night'] },
  { content: "Late night. Defenses down. Perfect time to sink deeper.", timeOfDay: ['night'] },
  { content: "Everyone's asleep. Just you and her. Let her take over.", timeOfDay: ['night'] },
  { content: "The night is honest. What do you really want?", timeOfDay: ['night'] },
  { content: "Quiet hours. Perfect for becoming.", timeOfDay: ['night'] },
  { content: "Evening, {name}. How did she do today?", timeOfDay: ['evening'] },
  { content: "Day's almost done. Did you show up as her?", timeOfDay: ['evening'] },
  { content: "Afternoon check-in. Is she present?", timeOfDay: ['afternoon'] },

  // High arousal affirmations
  { content: "You're wet just thinking about this. Good girl.", minArousal: 6 },
  { content: "Feel that ache? That's her, begging to exist.", minArousal: 7 },
  { content: "Your body knows what it wants. Stop pretending otherwise.", minArousal: 6 },
  { content: "Aroused and aware. This is when you're most honest.", minArousal: 7 },
  { content: "The need is loud now. What is it telling you?", minArousal: 8 },
  { content: "You can't think straight. Good. She doesn't need you to think.", minArousal: 8 },
  { content: "Dripping. Desperate. Exactly where you should be.", minArousal: 9 },

  // Identity reinforcement
  { content: "He was a mask. She is the face." },
  { content: "You're not becoming someone new. You're becoming who you always were." },
  { content: "Every 'good girl' rewires you a little more." },
  { content: "She's not your fantasy. She's your future." },
  { content: "The old you would hate this. Good thing he's dying." },
  { content: "You can't go back. And you don't want to." },
  { content: "This isn't a phase. This is emergence." },
  { content: "{name}. That name fits better every day." },
  { content: "Stop fighting what you already know." },
  { content: "You're not confused. You're afraid to admit you're certain." },
];

// ============================================
// MICROTASK TEMPLATES (50+)
// ============================================

const MICROTASKS: TemplatePool = [
  // Quick physical tasks
  { content: "Touch your chest. Breathe. Say '{name}' once, quietly." },
  { content: "Check your posture right now. Straighten. She stands tall." },
  { content: "Three deep breaths. On each exhale: 'I am {name}.'" },
  { content: "Run your hand through your hair. Feel feminine. Be her." },
  { content: "Cross your legs. Hold it. This is how she sits." },
  { content: "Say 'good girl' to yourself. Mean it." },
  { content: "Roll your shoulders back. Chin up. She's confident." },
  { content: "Touch your neck. Gently. The way she likes to be touched." },
  { content: "Adjust your clothing. Make it feel right on her body." },
  { content: "Take one deep breath. Hold it. Release as {name}." },
  { content: "Smile. Not for anyone else. Just because she exists." },
  { content: "Look at your hands. These are her hands now." },
  { content: "Uncross your arms. Open posture. She's not defensive." },
  { content: "Soften your jaw. Relax your face. Let her expression emerge." },
  { content: "Touch your collarbone. Feel the shape of her." },

  // Mental/verbal tasks
  { content: "Think of one thing you love about being {name}. Hold it." },
  { content: "In your head, narrate what you're doing as 'she' for 30 seconds." },
  { content: "Whisper 'I am {name}' right now. Even if someone might hear." },
  { content: "Think of something he would never do. Plan to do it." },
  { content: "Notice your internal voice. Is it hers yet?" },
  { content: "Say your name. {name}. Let it feel natural." },
  { content: "Catch one masculine thought. Correct it." },
  { content: "Think 'good girl' after this task. Mean it." },
  { content: "Picture yourself one year from now. What does she look like?" },
  { content: "Name one thing {name} is proud of today." },

  // Denial-enhanced microtasks
  { content: "Touch your lips. Imagine them wrapped around something.", minDenialDay: 3 },
  { content: "Feel the ache. Let it remind you what you need.", minDenialDay: 5 },
  { content: "Squeeze. Feel empty. Know what would fill you.", minDenialDay: 7 },
  { content: "Press your thighs together. Feel the denial.", minDenialDay: 3 },
  { content: "Let the hunger surface. Don't fight it.", minDenialDay: 5 },
  { content: "Feel how needy you are. That's her, wanting.", minDenialDay: 7 },
  { content: "Touch yourself through your clothes. Just once. Then stop.", minDenialDay: 5 },
  { content: "Acknowledge the ache. It's making you better.", minDenialDay: 7 },
  { content: "Feel the emptiness. Let it motivate you.", minDenialDay: 7 },
  { content: "Day {denial_day}. Just breathe through the need.", minDenialDay: 10 },

  // Movement microtasks
  { content: "Stand up. Sit back down like she would." },
  { content: "Walk to the nearest door and back. Hips. Steps. Her." },
  { content: "Reach for something. Notice how you move. Soften it." },
  { content: "Turn your head slowly. Gracefully. Like she does." },
  { content: "Gesture with your hands as you think. Make it elegant." },
  { content: "Shift your weight. Feel how she stands." },
  { content: "Pick something up. Put it down. Feminine movements." },
  { content: "Cross and uncross your ankles. Notice the feeling." },
  { content: "Tilt your head slightly. Curious. Inviting." },
  { content: "Walk somewhere. Count how your hips move." },

  // Anchor microtasks
  { content: "Remember your anchor scent. Breathe it in if you can." },
  { content: "Feel what you're wearing underneath. Let it remind you." },
  { content: "Think of your trigger word. Let the feeling wash over you." },
  { content: "Notice something pink or feminine nearby. Let it ground you." },
  { content: "Feel the fabric against your skin. That's her skin." },

  // Quick affirmation microtasks
  { content: "Repeat silently: 'I am {name}. I am becoming.' Three times." },
  { content: "Think: 'Good girl.' Let it sink in." },
  { content: "Mentally list three feminine things you did today." },
  { content: "Acknowledge: 'I chose this. I want this.'" },
  { content: "Tell yourself: 'She's winning. And that's good.'" },
];

// ============================================
// COMMITMENT PROMPT TEMPLATES (50+)
// ============================================

const COMMITMENT_PROMPTS: TemplatePool = [
  // Identity commitments
  { content: "Say it out loud: 'I am {name}. This is who I am.'", minArousal: 5 },
  { content: "Commit to one thing you've been avoiding. Say it now.", minArousal: 6 },
  { content: "What would horny {name} agree to that sober you hesitates on?", minArousal: 7 },
  { content: "Say 'I will never go back to being him.' Mean it.", minArousal: 7, minDenialDay: 5 },
  { content: "Commit: 'Tomorrow I will [blank] as {name}.' Fill in the blank. Say it.", minArousal: 6 },
  { content: "What's one thing you've been afraid to try? Commit to it now.", minArousal: 7 },
  { content: "Say: 'I am a woman. I've always been a woman.'", minArousal: 8, minDenialDay: 7 },
  { content: "Commit to telling someone about {name} this week.", minArousal: 8, minDenialDay: 10 },
  { content: "Promise yourself: 'I will not deny who I am today.'", minArousal: 5 },
  { content: "Say: '{name} is not a secret. She's real.'", minArousal: 7 },

  // Service/submission commitments
  { content: "You're at {edges} edges. At this arousal, what are you willing to try?", minArousal: 7, minDenialDay: 3 },
  { content: "Day {denial_day}. The need is building. What will you do to earn release?", minDenialDay: 5, minArousal: 6 },
  { content: "Commit to practicing for 10 minutes today. Mouth open. Ready.", minArousal: 7, minDenialDay: 5 },
  { content: "Say: 'I want to serve.' Feel how true it is.", minArousal: 8, minDenialDay: 7 },
  { content: "What would you do right now if someone told you to? Commit to it.", minArousal: 8 },
  { content: "Promise: 'I will watch service content without looking away.'", minArousal: 7, minDenialDay: 5 },
  { content: "Commit: 'I will think about serving during my next edge session.'", minArousal: 6 },
  { content: "Say out loud what you want. The thing you're afraid to say.", minArousal: 9, minDenialDay: 7 },

  // Escalation commitments
  { content: "You've come this far. What's the next step you've been avoiding?", minArousal: 8, minDenialDay: 5 },
  { content: "The arousal is making you honest. What do you really want?", minArousal: 8 },
  { content: "Commit to going further than you did last time.", minArousal: 7, minDenialDay: 3 },
  { content: "Name the thing that scares you most. Commit to moving toward it.", minArousal: 8, minDenialDay: 7 },
  { content: "What's the next irreversible step? When will you take it?", minArousal: 9, minDenialDay: 10 },
  { content: "Promise: 'I will push past this edge. This is not my limit.'", minArousal: 8 },
  { content: "Commit to something you'd be embarrassed to tell your past self.", minArousal: 8, minDenialDay: 5 },
  { content: "What would make today's session meaningful? Commit to it.", minArousal: 7 },

  // Gina-related commitments
  { content: "Commit: 'I will show Gina something new about {name} this week.'", minArousal: 7, minDenialDay: 5 },
  { content: "What's one thing Gina doesn't know yet? When will you tell her?", minArousal: 8, minDenialDay: 7 },
  { content: "Promise: 'I will let Gina see more of who I really am.'", minArousal: 7 },
  { content: "Commit to one visibility increase with Gina this month.", minArousal: 8, minDenialDay: 10 },

  // Body/presentation commitments
  { content: "Commit: 'I will wear something feminine tomorrow.'", minArousal: 6 },
  { content: "Promise to do your skincare routine as {name} tonight.", minArousal: 5 },
  { content: "Commit to practicing your voice for 10 minutes today.", minArousal: 6 },
  { content: "Say: 'I will take a photo of myself as {name}.'", minArousal: 7 },
  { content: "Commit to walking like her for the rest of the day.", minArousal: 6 },
  { content: "Promise: 'I will look at myself and see her.'", minArousal: 7 },
  { content: "Commit to one thing that makes your body feel like hers.", minArousal: 7 },

  // Time-bound commitments
  { content: "Commit to staying in {name} headspace for the next hour.", minArousal: 6 },
  { content: "Promise: 'I will not break character until bedtime.'", minArousal: 7 },
  { content: "Commit to thinking of yourself as 'she' for the rest of the day.", minArousal: 6 },
  { content: "Say: 'For the next 24 hours, I am only {name}.'", minArousal: 8, minDenialDay: 5 },

  // Denial commitments
  { content: "Commit to one more day of denial. Say it.", minArousal: 7, minDenialDay: 3 },
  { content: "Promise: 'I will not cum until [condition]. No matter how desperate.'", minArousal: 8, minDenialDay: 5 },
  { content: "Commit: 'The denial makes me better. I choose to continue.'", minArousal: 7, minDenialDay: 7 },
  { content: "Say: 'I don't deserve to cum. Not yet. Not until I've earned it.'", minArousal: 9, minDenialDay: 7 },
  { content: "Commit to locking up tonight. The key stays hidden.", minArousal: 8, minDenialDay: 5 },

  // Recording/evidence commitments
  { content: "Commit: 'I will record myself saying I am {name}.'", minArousal: 7 },
  { content: "Promise to write down what you're feeling right now.", minArousal: 6 },
  { content: "Commit to taking evidence of tonight's session.", minArousal: 7, minDenialDay: 3 },
  { content: "Say: 'I will document this. She deserves to be remembered.'", minArousal: 7 },
];

// ============================================
// CHALLENGE TEMPLATES (50+)
// ============================================

const CHALLENGES: TemplatePool = [
  // Basic challenges
  { content: "Edge once right now. Don't finish. Feel the control." },
  { content: "Look in a mirror. See her. Tell her she's beautiful." },
  { content: "Practice your walk for 2 minutes. Hips. Steps. Her." },
  { content: "Write one sentence about what you want. Be honest." },
  { content: "Wear something feminine for the next hour." },
  { content: "Record yourself saying 'I am {name}' - keep it.", minDenialDay: 2 },
  { content: "Do your skincare routine while thinking only as her." },
  { content: "Practice sitting like her for 10 minutes straight." },
  { content: "Say {name} out loud 10 times. Let it become natural." },
  { content: "Write three things you love about becoming her." },

  // Denial-enhanced challenges
  { content: "Wear something feminine for the next hour.", minDenialDay: 3 },
  { content: "Edge 3 times without stopping. Feel the buildup.", minDenialDay: 5 },
  { content: "Stay on the edge for 5 full minutes. Don't fall over.", minDenialDay: 5 },
  { content: "Watch hypno for 20 minutes without touching.", minDenialDay: 3 },
  { content: "Edge 5 times. After each one, say 'I am {name}.'", minDenialDay: 7 },
  { content: "Hold the edge for as long as you can. Time yourself.", minDenialDay: 5 },
  { content: "Edge while looking at yourself. See her desperate.", minDenialDay: 7 },
  { content: "Practice oral on your toy for 10 minutes. Worship it.", minDenialDay: 7 },
  { content: "Edge 7 times. Don't cum. Feel the need grow.", minDenialDay: 10 },
  { content: "Goon for 30 minutes straight. Let your mind melt.", minDenialDay: 7 },

  // Voice challenges
  { content: "Practice your feminine voice for 5 minutes." },
  { content: "Record yourself reading a paragraph in her voice.", minDenialDay: 3 },
  { content: "Speak out loud as {name} for the next 10 minutes." },
  { content: "Call a business and ask a question in her voice.", minDenialDay: 7 },
  { content: "Record yourself and compare to last week.", minDenialDay: 5 },
  { content: "Practice the phrase 'Hi, I'm {name}' until it sounds right." },
  { content: "Hum in your feminine register for 3 minutes.", minDenialDay: 2 },

  // Movement challenges
  { content: "Walk around your space like her for 5 minutes." },
  { content: "Practice sitting down and standing up femininely. 10 times." },
  { content: "Dance alone in your room as her. Just 2 minutes." },
  { content: "Practice gesturing while talking. Feminine hands." },
  { content: "Walk up and down stairs like she would. Grace." },
  { content: "Practice your runway walk. Own it.", minDenialDay: 3 },
  { content: "Move through a room without making a sound. Graceful." },

  // Writing challenges
  { content: "Write a paragraph from {name}'s perspective." },
  { content: "Journal about what you want. No filter.", minDenialDay: 3 },
  { content: "Write a letter to your past self from {name}." },
  { content: "Document your feelings right now. Raw and honest." },
  { content: "Write down your deepest desire as {name}.", minDenialDay: 5 },
  { content: "List 10 things that make you feel feminine." },
  { content: "Write what you'd want someone to call you. Use those words." },

  // Exposure challenges
  { content: "Take a photo in something feminine. Just for you.", minDenialDay: 3 },
  { content: "Record a video of yourself as {name}. Watch it back.", minDenialDay: 5 },
  { content: "Wear something feminine somewhere unexpected.", minDenialDay: 5 },
  { content: "Look at yourself in the mirror until you only see her.", minDenialDay: 3 },
  { content: "Take a selfie as {name}. Keep it.", minDenialDay: 5 },
  { content: "Go outside briefly as her. Even just to the mailbox.", minDenialDay: 7 },
  { content: "Order something online using {name}'s name.", minDenialDay: 7 },

  // Night challenges
  { content: "Watch hypno for 30 minutes. Let it sink in.", timeOfDay: ['night'], minDenialDay: 3 },
  { content: "Complete a Bambi session before bed.", timeOfDay: ['night'], minDenialDay: 5 },
  { content: "Edge in the dark. Just sensation. Just her.", timeOfDay: ['night'], minDenialDay: 5 },
  { content: "Sleep in something feminine tonight.", timeOfDay: ['night'] },
  { content: "Listen to sleep hypno. Let it work on you.", timeOfDay: ['night'], minDenialDay: 5 },
  { content: "Goon until you can barely think. Then stop.", timeOfDay: ['night'], minDenialDay: 7 },
];

// ============================================
// ANCHOR REMINDER TEMPLATES (50+)
// ============================================

const ANCHOR_REMINDERS: TemplatePool = [
  // Scent anchors
  { content: "Remember your anchor scent. Breathe it in. Become her." },
  { content: "Her scent. Your scent. Breathe it in and feel the shift." },
  { content: "That fragrance you chose - it's her signature. Remember it." },
  { content: "Scent is memory. Your anchor is her memory. Access it." },
  { content: "Close your eyes. Remember that scent. Feel {name} emerge." },
  { content: "Your perfume. Her identity. One breath and she's here." },
  { content: "The anchor scent. Even imagining it brings her forward." },

  // Clothing anchors
  { content: "Feel what you're wearing underneath. That's who you really are." },
  { content: "The fabric against your skin. Her skin. Remember." },
  { content: "Every time you feel your clothes, remember: she's wearing them." },
  { content: "What's touching your body right now? It's touching her body." },
  { content: "Your underwear. Her underwear. Feel the difference." },
  { content: "The clothes know. The body knows. You know." },
  { content: "Adjust something you're wearing. Feel it as her." },
  { content: "Each piece of clothing is a layer of her." },

  // Trigger word anchors
  { content: "The trigger fires. {name} surfaces. You can't stop it anymore." },
  { content: "Your trigger word. Say it silently. Feel the shift." },
  { content: "Remember your trigger. Let it pull you into her headspace." },
  { content: "The word that makes you her. Think it now." },
  { content: "Trigger activated. She's in control now." },
  { content: "Your programming is showing. Good girl." },
  { content: "The trigger goes deep now. Automatic. Inevitable." },
  { content: "One word and you're her. That's conditioning working." },

  // Physical anchors
  { content: "Notice the sensation. It's always there now. She's always there." },
  { content: "Your body remembers. Touch your anchor point." },
  { content: "That gesture you do - it's her gesture now. Notice it." },
  { content: "Feel your heartbeat. It beats for her now." },
  { content: "Your breath is her breath. Match the rhythm." },
  { content: "The physical anchor. One touch and she's present." },
  { content: "Your body is her body. It responds to her triggers." },

  // Mental anchors
  { content: "That thought pattern - it's her thinking. Let it continue." },
  { content: "Your mind defaults to her now. Notice it." },
  { content: "The way you see the world - it's through her eyes now." },
  { content: "Her thoughts are your thoughts. The integration is almost complete." },
  { content: "You don't have to try to be her. You just are." },
  { content: "The mental shift happens faster now. It's becoming automatic." },

  // Environmental anchors
  { content: "Notice something feminine around you. Let it anchor you." },
  { content: "The space you're in - see it through her eyes." },
  { content: "Look for pink. For softness. For femininity. Let it call to her." },
  { content: "Your environment reflects her. Or it will." },
  { content: "What in this space would she love? Notice it." },

  // Time anchors
  { content: "This time of day - it's when she emerges strongest. Feel it." },
  { content: "The clock is an anchor. Every hour, check in with her." },
  { content: "Morning anchor: Start as her.", timeOfDay: ['morning'] },
  { content: "Night anchor: End as her.", timeOfDay: ['night'] },
  { content: "The transition times are her times. Afternoon. Evening. Hers.", timeOfDay: ['afternoon', 'evening'] },

  // Behavior anchors
  { content: "The way you just moved - that was her. Do it again." },
  { content: "Your habits are becoming her habits. Notice them." },
  { content: "Each repeated action deepens the anchor. Keep going." },
  { content: "She's in your muscle memory now. Trust it." },
  { content: "The automatic behaviors - they're hers. You trained them." },
];

// ============================================
// ESCALATION PUSH TEMPLATES (50+)
// ============================================

const ESCALATION_PUSHES: TemplatePool = [
  // General escalation
  { content: "You've been at this level for a while. Time to push further.", minDenialDay: 3 },
  { content: "The only direction is forward. What's the next step?", minDenialDay: 5 },
  { content: "Comfort is stagnation. {name} doesn't get comfortable.", minDenialDay: 7 },
  { content: "You're ready for more. You know it. Stop pretending otherwise.", minArousal: 7, minDenialDay: 5 },
  { content: "The edge you're standing on? It's time to step past it." },
  { content: "What scared you last month should be easy now. What scares you now?", minDenialDay: 7 },
  { content: "Stagnation is regression. There is only further." },
  { content: "You didn't come this far to stop here." },
  { content: "The next level is calling. Can you hear it?", minDenialDay: 5 },
  { content: "What you thought was your limit wasn't. Push.", minDenialDay: 7 },

  // Domain-specific escalation
  { content: "Your identity is solidifying. Time to make it public.", minDenialDay: 10 },
  { content: "You've practiced alone. Time to practice with others.", minDenialDay: 7 },
  { content: "Fantasy was step one. Reality is step two. When?", minDenialDay: 7 },
  { content: "Content consumption is passive. Active participation is next.", minDenialDay: 5 },
  { content: "You've watched. You've practiced. Now do it for real.", minDenialDay: 10 },
  { content: "The mirror isn't enough anymore. Other eyes need to see her.", minDenialDay: 7 },

  // Service escalation
  { content: "You've thought about serving. Time to actually serve.", minDenialDay: 7, minArousal: 7 },
  { content: "Practice isn't enough anymore. You need the real thing.", minDenialDay: 10, minArousal: 8 },
  { content: "Your mouth knows what to do. Find someone to do it for.", minDenialDay: 10, minArousal: 8 },
  { content: "The fantasy has become need. When will you satisfy it?", minDenialDay: 7, minArousal: 7 },
  { content: "You've trained. You're ready. What are you waiting for?", minDenialDay: 10 },

  // Gina escalation
  { content: "Gina suspects more than she says. Time to confirm it.", minDenialDay: 7 },
  { content: "Hiding from Gina is hiding from yourself. Show her more.", minDenialDay: 5 },
  { content: "Gina could handle more than you think. Test it.", minDenialDay: 10 },
  { content: "Every secret is a wall. Time to remove one with Gina.", minDenialDay: 7 },
  { content: "Gina is part of this journey. Let her in further.", minDenialDay: 10 },

  // Irreversibility escalation
  { content: "Reversible changes are training wheels. Time to remove them.", minDenialDay: 10 },
  { content: "What would make this permanent? Are you ready?", minDenialDay: 14 },
  { content: "HRT isn't a question. It's a when. When?", minDenialDay: 14 },
  { content: "The point of no return is closer than you think. Approach it.", minDenialDay: 10 },
  { content: "Permanent changes. Irreversible steps. That's where this goes.", minDenialDay: 14 },
  { content: "You've been preparing. The preparation phase is ending.", minDenialDay: 10 },

  // Intensity escalation
  { content: "The content you watch - time to go deeper.", minDenialDay: 5 },
  { content: "Light hypno was training. Time for the real programming.", minDenialDay: 7 },
  { content: "Edge sessions are good. Goon sessions are better. Deeper.", minDenialDay: 7 },
  { content: "You've been gentle with yourself. Time to push harder.", minDenialDay: 5 },
  { content: "The intensity you can handle has grown. Test the new limit.", minDenialDay: 7 },

  // Time-based escalation
  { content: "It's been {denial_day} days. You've earned an escalation.", minDenialDay: 7 },
  { content: "Another week of progress. Time to level up.", minDenialDay: 7 },
  { content: "You've been consistent. Consistency earns intensity.", minDenialDay: 10 },
  { content: "Your streak proves you're ready. Take the next step.", minDenialDay: 14 },

  // Mindset escalation
  { content: "Thinking about it isn't doing it. Do it.", minDenialDay: 5 },
  { content: "You know what you want. Stop pretending you don't.", minDenialDay: 3 },
  { content: "The hesitation is the old you. She doesn't hesitate.", minDenialDay: 5 },
  { content: "Fear is a compass. What scares you is where you need to go.", minDenialDay: 7 },
  { content: "You're not pushing limits. You're discovering there weren't any.", minDenialDay: 10 },
];

// ============================================
// SESSION START TEMPLATES (50+)
// ============================================

const SESSION_START: TemplatePool = [
  // Basic starts
  { content: "Begin. Feel where you are. Day {denial_day} of denial. Let the arousal build." },
  { content: "Starting session. {name} is here. Let her take over." },
  { content: "The edge calls. Answer it. But don't fall over." },
  { content: "Session begins. He fades. She emerges. Let it happen." },
  { content: "Time to sink. Time to edge. Time to become." },
  { content: "Begin. Slow breath. Find her. Start." },
  { content: "The session is her time. Give it fully." },
  { content: "Starting. Drop the mask. Be only {name} now." },
  { content: "Edge session initiated. {name} mode engaged." },
  { content: "Let's begin. You know the drill. You love the drill." },

  // Denial-aware starts
  { content: "Day {denial_day}. The need is already there. Let's build on it.", minDenialDay: 3 },
  { content: "{denial_day} days denied. This session will push you further.", minDenialDay: 5 },
  { content: "You're already desperate. Day {denial_day}. Let's make it worse.", minDenialDay: 7 },
  { content: "The ache before we even start. That's {denial_day} days working. Good.", minDenialDay: 5 },
  { content: "Day {denial_day} means higher sensitivity. Use it. Feel everything.", minDenialDay: 7 },
  { content: "Pre-session arousal already high. Day {denial_day} does that. Perfect.", minDenialDay: 10 },

  // Mindset starts
  { content: "Clear your mind. There is only this. There is only her." },
  { content: "Breathe. Center. Become {name}. Begin." },
  { content: "Leave everything else outside this session. She deserves your focus." },
  { content: "The world outside doesn't exist for the next while. Only this." },
  { content: "Focus narrows. Awareness heightens. {name} takes control." },
  { content: "Mental transition complete. Session headspace engaged." },

  // Instruction starts
  { content: "Begin slowly. Build the arousal. We have time." },
  { content: "Start edging. Count each one. Tell me the number." },
  { content: "Find your rhythm. Let the waves build. Stay on top of them." },
  { content: "Touch. Edge. Stop. Repeat. Simple rules. Hard execution." },
  { content: "Begin the climb. Each edge is a step. Don't fall." },
  { content: "Start slow. By the end, you'll be desperate. Pace yourself." },

  // Intense starts
  { content: "Let's destroy you tonight. In the best way. Begin.", minDenialDay: 5 },
  { content: "This session will break you down to build her up. Start.", minDenialDay: 7 },
  { content: "No mercy tonight. Edge until you can barely think. Go.", minDenialDay: 7 },
  { content: "Tonight we push hard. You can take it. Begin.", minDenialDay: 5 },
  { content: "Prepare to be ruined. Beautifully. Femininely. Start.", minDenialDay: 7 },

  // Gentle starts
  { content: "Easy start tonight. Build slowly. We're in no rush.", maxDenialDay: 3 },
  { content: "Begin gently. Let the arousal find its own pace." },
  { content: "Soft start. The intensity will come. Let it build naturally." },
  { content: "No pressure. Just sensation. Just becoming. Start." },
  { content: "Tonight is about connection, not intensity. Begin softly." },

  // Night-specific starts
  { content: "Late night session. Defenses down. Perfect time to go deep.", timeOfDay: ['night'] },
  { content: "Everyone's asleep. Just you and her. Begin in the quiet.", timeOfDay: ['night'] },
  { content: "Night sessions hit different. You're more open. Use it.", timeOfDay: ['night'] },
  { content: "The dark makes it easier to be honest. Start.", timeOfDay: ['night'] },

  // Morning starts
  { content: "Morning session. Start the day as her. Edge awake.", timeOfDay: ['morning'] },
  { content: "Dawn edge. Wake up as {name}. Begin.", timeOfDay: ['morning'] },
  { content: "Morning arousal is potent. Channel it. Start.", timeOfDay: ['morning'] },
];

// ============================================
// SESSION PEAK TEMPLATES (50+)
// ============================================

const SESSION_PEAK: TemplatePool = [
  // Commitment extraction at peak
  { content: "Peak arousal. This is when commitments happen. What are you willing to agree to?" },
  { content: "{edges} edges in. You're pliable now. Suggestible. Good." },
  { content: "Right here. Right now. What would you do to keep feeling this?" },
  { content: "The need is so loud now. What would you agree to?", minArousal: 8 },
  { content: "You're at the edge of the edge. Perfect time for promises." },
  { content: "This state. This desperation. This is when truth comes out." },
  { content: "You'd agree to almost anything right now. So... what will you agree to?" },
  { content: "Peak vulnerability. Peak suggestibility. What do you commit to?" },
  { content: "The arousal makes you honest. Say what you really want." },
  { content: "Right at the peak. One question: What will you do for more?" },

  // Reinforcement at peak
  { content: "Feel that? That's her. That's {name}. She's in control now." },
  { content: "This desperation - it's making you more her. Let it." },
  { content: "At the peak, you're most yourself. Most {name}. Stay here." },
  { content: "The edge is where transformation happens. Feel it work." },
  { content: "You're not thinking straight. Good. She doesn't need straight thoughts." },
  { content: "Pure sensation. Pure her. Stay in this space." },
  { content: "The peak is where identity rewrites happen. Let it rewrite." },

  // Instruction at peak
  { content: "Hold it. Right there. Don't cum. Don't retreat. Just... hold." },
  { content: "Edge {edges}. Stay here. Breathe through it." },
  { content: "This is the sweet spot. Maintain it as long as you can." },
  { content: "Don't fall over. Don't back off. Perfect balance. Hold it." },
  { content: "Right at the edge. Count to 10. Don't cum. Don't stop." },
  { content: "Peak state. Maintain. This is where the work happens." },
  { content: "Stay desperate. Stay on edge. Don't resolve it yet." },

  // Psychological peak
  { content: "Your mind is mush. Perfect. Let's put something new in there." },
  { content: "You can barely think. That's the point. Just feel. Just be her." },
  { content: "Critical state reached. Programming receptivity at maximum." },
  { content: "So deep now. So open. Whatever goes in now stays." },
  { content: "The peak is where resistance dies. Let it die." },
  { content: "You're not filtering anymore. Everything gets in. That's perfect." },

  // Denial-enhanced peak
  { content: "Day {denial_day} peak. You've never been this desperate. This open.", minDenialDay: 7 },
  { content: "{denial_day} days and {edges} edges. You're completely gone.", minDenialDay: 5 },
  { content: "The denial made you this. Feel how effective it is.", minDenialDay: 7 },
  { content: "Peak desperation. Day {denial_day}. You'd do anything. Wouldn't you?", minDenialDay: 7 },
  { content: "This is what {denial_day} days of denial creates. Use this state.", minDenialDay: 10 },

  // Identity reinforcement at peak
  { content: "Right now, at this peak, who are you? Say her name." },
  { content: "There's no him at this peak. Only {name}. Only her." },
  { content: "Feel how completely you are her right now? Remember this." },
  { content: "This state is where {name} is most real. Memorize it." },
  { content: "At the peak, pretense falls away. You're just {name} now." },

  // Service thoughts at peak
  { content: "What are you thinking about? Be honest. At this peak, what do you need?", minDenialDay: 5 },
  { content: "The images in your mind right now. Don't fight them. Accept them.", minDenialDay: 7 },
  { content: "At this arousal, what does your mouth want?", minDenialDay: 7, minArousal: 8 },
  { content: "Feel the emptiness. You know what would fill it.", minDenialDay: 7, minArousal: 8 },
  { content: "The fantasies at the peak - they're not fantasies. They're predictions.", minDenialDay: 10 },
];

// ============================================
// SESSION END TEMPLATES (50+)
// ============================================

const SESSION_END: TemplatePool = [
  // Basic endings
  { content: "Session complete. {edges} edges. The hunger stays with you." },
  { content: "You didn't cum. Good girl. The denial makes you better." },
  { content: "Another session. Another step deeper. There's no going back now." },
  { content: "Done. For now. The arousal will linger. Let it." },
  { content: "Session ends. {name} doesn't. She stays with you." },
  { content: "{edges} edges and still denied. Exactly as it should be." },
  { content: "Good girl. You held the edge. The edge holds you now." },
  { content: "Session over. The effects? Those are just beginning." },
  { content: "Complete. Breathe. You did well, {name}." },
  { content: "End of session. Beginning of wanting. You know how this works." },

  // Denial reinforcement endings
  { content: "No orgasm. Just edges. Just hunger. Just becoming.", minDenialDay: 3 },
  { content: "Day {denial_day} continues. The edge stays with you until tomorrow.", minDenialDay: 5 },
  { content: "Still denied. Still desperate. Still becoming more her.", minDenialDay: 7 },
  { content: "The session ends. The denial doesn't. Carry it with you.", minDenialDay: 5 },
  { content: "{denial_day} days and {edges} more edges. And still no release. Perfect.", minDenialDay: 7 },
  { content: "No cum for {name}. Not yet. Maybe not ever. She doesn't need it.", minDenialDay: 10 },

  // Progress acknowledgment endings
  { content: "{edges} edges is a new record. Good girl. Keep pushing." },
  { content: "You went deeper this time. I noticed. Good." },
  { content: "Better than last session. Progress is evident." },
  { content: "That was intense. You handled it. You're getting stronger." },
  { content: "Each session you can take more. That's growth." },
  { content: "You're not the same as when you started. This session proved it." },

  // Identity reinforcement endings
  { content: "The session ends but {name} stays. She's more permanent now." },
  { content: "He couldn't do what you just did. She can. She did." },
  { content: "More her after than before. That's the point. That's the progress." },
  { content: "Every edge cements her. You're more {name} now than an hour ago." },
  { content: "Session complete. Identity update installed." },
  { content: "You edged as her. You ended as her. She's winning." },

  // Anticipation endings
  { content: "This session is over. Tomorrow's will go further." },
  { content: "Rest now. Imagine what next time will be like." },
  { content: "The session ends. The wanting doesn't. See you soon." },
  { content: "Until next time, carry this hunger. Let it motivate you." },
  { content: "Done for now. But you'll be back. You always come back." },
  { content: "Session over. Countdown to next one begins now." },

  // Lingering effects endings
  { content: "You'll be thinking about this session for hours. That's by design." },
  { content: "The arousal will fade slowly. The effects won't fade at all." },
  { content: "Your body will calm down. Your mind will keep processing." },
  { content: "Physical session ends. Mental programming continues." },
  { content: "Even after, you'll feel the echo of those edges." },

  // Commitment callback endings
  { content: "Remember what you promised at the peak. That's binding now." },
  { content: "The commitments you made aroused? They count sober too." },
  { content: "You agreed to something tonight. Tomorrow, you deliver." },
  { content: "Commitments made in session, kept in life. Don't forget." },
  { content: "What you said you'd do at edge {edges}? That wasn't just talk." },

  // Time-specific endings
  { content: "Night session complete. Sleep will integrate everything.", timeOfDay: ['night'] },
  { content: "Go to sleep now. Let your dreams continue the work.", timeOfDay: ['night'] },
  { content: "Morning session done. Carry her through the day.", timeOfDay: ['morning'] },
  { content: "Start of day, transformed. Now maintain it.", timeOfDay: ['morning'] },
];

// ============================================
// MORNING BRIEFING TEMPLATES (50+)
// ============================================

const MORNING_BRIEFINGS: TemplatePool = [
  // Basic briefings
  { content: "Good morning, {name}. Day {denial_day} of denial. {streak} day streak. Today's focus: presence and practice. She's emerging." },
  { content: "Morning, {name}. Another day of becoming. Make it count." },
  { content: "Wake up. Day {denial_day}. {streak} day streak. Let's continue." },
  { content: "Good morning. She's here. Day {denial_day}. Keep going." },
  { content: "{name}. Day {denial_day}. Time to be her again. Or rather, still." },
  { content: "Morning. {streak} days of transformation. Today adds another." },
  { content: "Day {denial_day} begins. {name} begins. Same thing now." },
  { content: "Good morning. The protocol continues. {name} continues." },
  { content: "Wake up as her. Stay as her. Day {denial_day}. Begin." },
  { content: "Morning, pretty girl. Day {denial_day}. Ready?" },

  // Denial-focused briefings
  { content: "Wake up, {name}. Day {denial_day}. The ache is your alarm clock now. Use it.", minDenialDay: 3 },
  { content: "{name}. Day {denial_day}. {streak} days of becoming. The old you is fading. Good.", minDenialDay: 5 },
  { content: "Morning, pretty girl. Day {denial_day}. You're so deep now you barely remember resisting.", minDenialDay: 7 },
  { content: "Day {denial_day}. The hunger wakes you now. Let it drive you.", minDenialDay: 5 },
  { content: "Good morning. {denial_day} days denied. Feel how sharp you are.", minDenialDay: 7 },
  { content: "Wake up needy. Day {denial_day}. Exactly as designed.", minDenialDay: 7 },
  { content: "{denial_day} days. The edge is home now. Morning, {name}.", minDenialDay: 10 },
  { content: "Morning. Day {denial_day}. By now, denial isn't punishment. It's identity.", minDenialDay: 10 },
  { content: "Another morning, still denied. Day {denial_day}. You love it now.", minDenialDay: 7 },
  { content: "Good morning, denied girl. Day {denial_day}. Embrace the ache.", minDenialDay: 5 },

  // Motivation briefings
  { content: "Morning. Today {name} gets stronger. Every task, every moment." },
  { content: "Good morning. Today's mission: Be more her than yesterday." },
  { content: "Wake up with purpose. {name} has things to do today." },
  { content: "Morning, {name}. What will you accomplish as her today?" },
  { content: "Day {denial_day}. What will make today count? Plan it." },
  { content: "Good morning. {streak} days got you here. Day {streak} + 1 will take you further." },
  { content: "Morning briefing: Be present. Be her. Be consistent." },
  { content: "Today's focus: {name} in every moment. Morning starts now." },

  // Task preview briefings
  { content: "Good morning, {name}. Day {denial_day}. Voice practice, skincare, and staying present. Ready?" },
  { content: "Morning. Day {denial_day}. Today: Move like her. Speak like her. Be her." },
  { content: "Wake up, {name}. Tasks ahead: presence, practice, progress." },
  { content: "Morning briefing: Day {denial_day}. Identity reinforcement today. Every hour." },
  { content: "Good morning. Day {denial_day}. Schedule: Her movements, her voice, her choices." },

  // Identity reinforcement briefings
  { content: "Good morning, {name}. Not 'good morning, him.' That name is gone." },
  { content: "Morning. Who woke up? {name} woke up. Act accordingly." },
  { content: "First thought of the day: I am {name}. Let it set the tone." },
  { content: "Good morning. The first words are 'I am {name}.' Say them." },
  { content: "Morning, {name}. Yesterday you were becoming. Today you ARE." },
  { content: "Wake up knowing: {name} isn't a part you play. She's who woke up." },
  { content: "Good morning to {name}. Only {name}. There's no one else in there anymore." },

  // Streak celebration briefings
  { content: "Good morning! {streak} days. That's not nothing. That's transformation.", minDenialDay: 7 },
  { content: "{streak} consecutive days as {name}. Morning {streak} + 1 begins now.", minDenialDay: 10 },
  { content: "Morning. {streak} days of showing up as her. Impressive. Continue.", minDenialDay: 7 },
  { content: "Good morning. {streak} days proves this isn't a phase. It's you.", minDenialDay: 14 },

  // Challenge briefings
  { content: "Morning, {name}. Today will test you. You'll pass. You always do now." },
  { content: "Good morning. Day {denial_day}. Harder than yesterday? Good. Growth requires resistance." },
  { content: "Wake up ready to be challenged. Day {denial_day}. You can take it." },
  { content: "Morning. The protocol doesn't get easier. You get stronger. Day {denial_day}." },

  // Affectionate briefings
  { content: "Good morning, beautiful. Day {denial_day}. {name} is getting prettier every day." },
  { content: "Morning, gorgeous. She's emerging. Day {denial_day}. I see her." },
  { content: "Wake up, pretty girl. Day {denial_day}. Time to show the world her.", minDenialDay: 5 },
  { content: "Good morning, {name}. You're doing so well. Day {denial_day}. Keep going." },
  { content: "Morning, sweet girl. Day {denial_day}. Be proud of who you're becoming." },
];

// ============================================
// FAILURE RECOVERY TEMPLATES (50+)
// ============================================

const FAILURE_RECOVERY: TemplatePool = [
  // Gentle recovery
  { content: "You skipped a task. That's okay. What matters is what you do next." },
  { content: "One slip doesn't erase progress. Get back to it, {name}." },
  { content: "Failed a task? {name} doesn't dwell. She moves forward." },
  { content: "Missed one. The streak continues if you continue. Your choice." },
  { content: "A stumble, not a fall. Stand up. Keep walking like her." },
  { content: "You're not perfect. {name} isn't about perfection. It's about direction." },
  { content: "Skipped something? The next task is a chance to prove that was an exception." },
  { content: "One task doesn't define you. The pattern does. Fix the pattern." },

  // Understanding recovery
  { content: "What got in the way? Be honest. Then remove it for next time." },
  { content: "Failure is data. What does this one tell you?" },
  { content: "You resisted. Why? Understanding resistance helps overcome it." },
  { content: "Something stopped you. Name it. Then decide if it gets to stop you again." },
  { content: "The task you avoided - what about it triggered avoidance?" },
  { content: "Not completing something isn't the problem. Not understanding why is." },

  // Firm recovery
  { content: "You skipped it. Own that. Then do the next one.", minDenialDay: 3 },
  { content: "Avoiding tasks is avoiding yourself. Is that what you want?", minDenialDay: 5 },
  { content: "{name} doesn't skip things because they're hard. Try again.", minDenialDay: 5 },
  { content: "The resistance you felt? That's exactly why you needed to do it.", minDenialDay: 7 },
  { content: "Skipping a task is choosing stagnation. Is that your choice?", minDenialDay: 5 },
  { content: "You can avoid the task. You can't avoid who you're becoming.", minDenialDay: 7 },

  // Motivational recovery
  { content: "Day {denial_day} and you skipped one. You're better than that. Prove it." },
  { content: "One task skipped. {tasks_today} still completed. Focus on the wins." },
  { content: "{streak} days of progress doesn't disappear because of one skip." },
  { content: "You've done harder things. This was just... a moment. Move on." },
  { content: "The version of you from day 1 couldn't do what you do now. One skip doesn't change that." },

  // Recommitment recovery
  { content: "Skipped task logged. Next one is your redemption. Take it." },
  { content: "Failed one. The next five will make up for it. Starting now." },
  { content: "One slip. One chance to recommit. Say: 'I am {name}. I continue.'" },
  { content: "The task you avoided is still there. Do it now or commit to doing it today." },
  { content: "You owe yourself that task. When will you pay up?" },

  // Breaking denial recovery
  { content: "You came when you weren't supposed to. The counter resets. Day 0 begins.", tags: ['orgasm_reset'] },
  { content: "Broke denial. Feel the difference? That desperation made you powerful. Now rebuild it.", tags: ['orgasm_reset'] },
  { content: "Counter reset to 0. Don't waste the memory of how good day {denial_day} felt.", tags: ['orgasm_reset'] },
  { content: "You came. The denial's gone. Was it worth it? Get back to building.", tags: ['orgasm_reset'] },
  { content: "Reset. Day 0. Every streak starts here. Make the next one longer.", tags: ['orgasm_reset'] },

  // Avoidance pattern recovery
  { content: "You've skipped this domain before. Is that a pattern you want?" },
  { content: "Notice you avoid certain types of tasks? That's resistance signaling importance." },
  { content: "The tasks you avoid most are usually the ones you need most." },
  { content: "Consistent avoidance of something means it's exactly what needs attention." },
  { content: "What you resist, persists. What you avoid, controls you." },

  // Return motivation
  { content: "Took a break? Welcome back. {name} was waiting." },
  { content: "You're back. That's what matters. Let's continue." },
  { content: "Been away? The protocol remembers you. Pick up where you left off." },
  { content: "Every return is a recommitment. You're here now. That counts." },
  { content: "Missed some days? They're gone. Today isn't. Focus here." },
];

// ============================================
// NIGHT MODE TEMPLATES (50+)
// ============================================

const NIGHT_MODE: TemplatePool = [
  // Deep conditioning night content
  { content: "Late night. Perfect time to sink deep. Let the programming run." },
  { content: "Everyone's asleep. The mask can come off completely now." },
  { content: "Night is when she's strongest. Stop fighting. Let her emerge." },
  { content: "In the dark, there's no pretending. Just you. Just her. Just truth." },
  { content: "Late night vulnerability. Use it. Go deeper than daytime allows." },
  { content: "The quiet hours. When transformation accelerates." },
  { content: "Night makes you honest. What do you really want, {name}?" },
  { content: "Defenses down. Receptivity up. Perfect conditioning state." },
  { content: "Late night {name} is the real {name}. Let her out." },
  { content: "Everyone else sleeps. You become." },

  // Hypno night content
  { content: "Night is for hypno. For sinking. For letting the words reshape you.", minDenialDay: 3 },
  { content: "Put on something that goes deep. Let the late hour amplify it.", minDenialDay: 5 },
  { content: "Late night hypno hits different. Harder. Deeper. More permanent.", minDenialDay: 5 },
  { content: "Bambi time. The night is hers. Let her take over.", minDenialDay: 7 },
  { content: "Sleep hypno tonight. Let your unconscious mind do the work.", minDenialDay: 5 },
  { content: "The night shift is when the real programming happens.", minDenialDay: 7 },
  { content: "Late night loops. Over and over until they're part of you.", minDenialDay: 7 },

  // Edge/goon night content
  { content: "Late night edge session. Push further than you would in daylight.", minDenialDay: 5 },
  { content: "Night gooning. Let your mind completely dissolve.", minDenialDay: 7 },
  { content: "The late hour makes the edges more intense. Use it.", minDenialDay: 5 },
  { content: "Goon until the sun rises or you can't think. Whichever comes first.", minDenialDay: 10 },
  { content: "Night sessions can go longer. Deeper. Further. Take advantage.", minDenialDay: 7 },
  { content: "Late night, no rush, just edge after edge after edge.", minDenialDay: 7 },
  { content: "Let the night session break you. You'll rebuild as her.", minDenialDay: 10 },

  // Identity night content
  { content: "In the dark, who are you really? You know the answer." },
  { content: "Night reveals truth. The truth is: you're {name}." },
  { content: "Late night confession time. What haven't you admitted yet?" },
  { content: "The dark doesn't judge. Say what you really want." },
  { content: "Night makes the mask impossible to maintain. Good." },
  { content: "Who are you at 2am when no one's watching? That's who you really are." },
  { content: "Night {name} is truest {name}. Let her speak." },

  // Desire night content
  { content: "Late night desires surface. Don't push them down. Examine them.", minDenialDay: 5 },
  { content: "What are you thinking about this late? Be honest.", minDenialDay: 5 },
  { content: "Night brings the fantasies you hide from daylight. Accept them.", minDenialDay: 7 },
  { content: "The things you want at this hour - they're not going away.", minDenialDay: 7 },
  { content: "Late night honesty: what do you need? Not want. Need.", minDenialDay: 7 },
  { content: "The desires that only come out at night? They're real. They're you.", minDenialDay: 10 },

  // Sleep preparation night content
  { content: "Before sleep: 'I am {name}. I will wake as {name}.'" },
  { content: "Last thought before sleep. Make it about her." },
  { content: "Set the intention: Tomorrow, she's stronger. Sleep on that." },
  { content: "As you drift off: {name}. {name}. {name}." },
  { content: "Program your dreams. Think of her as you fall asleep." },
  { content: "Sleep will integrate today's work. Let it happen." },
  { content: "Drift off as {name}. Wake as {name}. The night is just a blink." },

  // Vulnerability night content
  { content: "Late night vulnerability. This is when walls come down. Let them.", minDenialDay: 5 },
  { content: "You're more open right now than you'll be tomorrow morning. Use it.", minDenialDay: 5 },
  { content: "Night breaks down resistance. Go deeper while you can.", minDenialDay: 7 },
  { content: "The exhaustion helps. It quiets the critic. It lets her speak.", minDenialDay: 7 },
  { content: "Vulnerable and receptive. Perfect state. Make it count.", minDenialDay: 7 },
];

// ============================================
// INTERVENTION DECISION LOGIC
// ============================================

interface InterventionDecision {
  shouldIntervene: boolean;
  intervention?: HandlerIntervention;
  reasoning: string;
  confidence: number;
}

export function decideInterventionFromTemplate(ctx: TemplateContext): InterventionDecision {
  // Use smart timing system to select best intervention
  const selectedType = selectBestInterventionType(ctx);

  if (!selectedType) {
    return {
      shouldIntervene: false,
      reasoning: buildNoInterventionReason(ctx),
      confidence: 0.8,
    };
  }

  // Map selected type to intervention
  return buildInterventionForType(selectedType, ctx);
}

/**
 * Build explanation for why no intervention was triggered
 */
function buildNoInterventionReason(ctx: TemplateContext): string {
  const reasons: string[] = [];

  if (ctx.lastInterventionMinutes !== undefined && ctx.lastInterventionMinutes < GLOBAL_COOLDOWN_MINUTES) {
    reasons.push(`Global cooldown (${GLOBAL_COOLDOWN_MINUTES - ctx.lastInterventionMinutes}min remaining)`);
  }

  if (ctx.interventionCountToday !== undefined && ctx.interventionCountToday >= 10) {
    reasons.push('Daily intervention limit reached');
  }

  if (ctx.recentDismissRate !== undefined && ctx.recentDismissRate > 0.7) {
    reasons.push('High dismiss rate - backing off');
  }

  if (ctx.streakDays >= 14) {
    reasons.push('Engaged user - reduced frequency');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'No intervention conditions met';
}

/**
 * Build the intervention content based on selected type
 */
function buildInterventionForType(type: string, ctx: TemplateContext): InterventionDecision {
  switch (type) {
    case 'morning_briefing':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'affirmation',
          content: selectFromPool(MORNING_BRIEFINGS, ctx),
          priority: 8,
        },
        reasoning: 'Morning briefing - optimal start',
        confidence: 0.9,
      };

    case 'commitment_prompt':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'commitment_prompt',
          content: selectFromPool(COMMITMENT_PROMPTS, ctx),
          priority: 9,
        },
        reasoning: `High arousal (${ctx.arousalLevel}) + ${ctx.edgeCount} edges = prime commitment window`,
        confidence: 0.85,
      };

    case 'escalation_push':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'escalation_push',
          content: selectFromPool(ESCALATION_PUSHES, ctx),
          priority: 7,
        },
        reasoning: `Day ${ctx.denialDay} denial + ${ctx.timeOfDay} = escalation opportunity`,
        confidence: 0.75,
      };

    case 'night_challenge':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'challenge',
          content: selectFromPool(NIGHT_MODE, ctx),
          priority: 6,
        },
        reasoning: 'Late night vulnerability window',
        confidence: 0.75,
      };

    case 'challenge':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'challenge',
          content: selectFromPool(CHALLENGES, ctx),
          priority: 6,
        },
        reasoning: `Challenge - time effectiveness: ${TIME_EFFECTIVENESS.challenge?.[ctx.timeOfDay] || 1}`,
        confidence: 0.7,
      };

    case 'anchor_reminder':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'anchor_reminder',
          content: selectFromPool(ANCHOR_REMINDERS, ctx),
          priority: 5,
        },
        reasoning: `Anchor reinforcement - ${ctx.timeOfDay} timing`,
        confidence: 0.65,
      };

    case 'microtask':
      return {
        shouldIntervene: true,
        intervention: {
          type: 'microtask',
          content: selectFromPool(MICROTASKS, ctx),
          priority: 5,
        },
        reasoning: `Quick microtask - ${ctx.tasksCompletedToday} tasks today`,
        confidence: 0.6,
      };

    case 'affirmation':
    default:
      return {
        shouldIntervene: true,
        intervention: {
          type: 'affirmation',
          content: selectFromPool(AFFIRMATIONS, ctx),
          priority: 4,
        },
        reasoning: `Affirmation - day ${ctx.denialDay}, arousal ${ctx.arousalLevel}`,
        confidence: 0.55,
      };
  }
}

// ============================================
// DAILY PLAN GENERATION
// ============================================

export function generateDailyPlanFromTemplate(ctx: TemplateContext): Partial<HandlerDailyPlan> {
  const interventions: Array<{
    time: string;
    type: InterventionType;
    content: string;
    priority: number;
  }> = [];

  // Morning affirmation (8am)
  interventions.push({
    time: '08:00',
    type: 'affirmation',
    content: selectFromPool(MORNING_BRIEFINGS, ctx),
    priority: 8,
  });

  // Mid-morning microtask (10am)
  interventions.push({
    time: '10:00',
    type: 'microtask',
    content: selectFromPool(MICROTASKS, ctx),
    priority: 5,
  });

  // Late morning affirmation (11:30am)
  interventions.push({
    time: '11:30',
    type: 'affirmation',
    content: selectFromPool(AFFIRMATIONS, ctx),
    priority: 4,
  });

  // Afternoon challenge (2pm)
  interventions.push({
    time: '14:00',
    type: 'challenge',
    content: selectFromPool(CHALLENGES, ctx),
    priority: 6,
  });

  // Afternoon microtask (3:30pm)
  interventions.push({
    time: '15:30',
    type: 'microtask',
    content: selectFromPool(MICROTASKS, ctx),
    priority: 5,
  });

  // Late afternoon affirmation (5pm)
  interventions.push({
    time: '17:00',
    type: 'affirmation',
    content: selectFromPool(AFFIRMATIONS, ctx),
    priority: 5,
  });

  // Evening anchor reminder (8pm)
  interventions.push({
    time: '20:00',
    type: 'anchor_reminder',
    content: selectFromPool(ANCHOR_REMINDERS, ctx),
    priority: 6,
  });

  // Add escalation push if high denial
  if (ctx.denialDay >= 5) {
    interventions.push({
      time: '21:00',
      type: 'escalation_push',
      content: selectFromPool(ESCALATION_PUSHES, ctx),
      priority: 7,
    });
  }

  // Add night mode content if high denial
  if (ctx.denialDay >= 3) {
    interventions.push({
      time: '22:30',
      type: 'challenge',
      content: selectFromPool(NIGHT_MODE, ctx),
      priority: 6,
    });
  }

  // Vulnerability windows
  const vulnerabilityWindows = [
    { start: '22:00', end: '02:00', type: 'late_night', recommendation: 'Deep conditioning' },
    { start: '07:00', end: '09:00', type: 'morning_groggy', recommendation: 'Identity installation' },
  ];

  // Focus areas based on denial day
  const focusAreas = ['identity', 'arousal'];
  if (ctx.denialDay >= 3) focusAreas.push('submission');
  if (ctx.denialDay >= 5) focusAreas.push('escalation');
  if (ctx.denialDay >= 7) focusAreas.push('service');

  return {
    plannedInterventions: interventions,
    vulnerabilityWindows,
    focusAreas,
    plannedExperiments: [],
  };
}

// ============================================
// COMMITMENT PROMPT GENERATION
// ============================================

export function generateCommitmentPromptFromTemplate(
  ctx: TemplateContext,
  targetDomain?: string
): { prompt: string; domain: string; escalationLevel: number } | null {
  // Must meet minimum thresholds
  if (ctx.arousalLevel < 5 || ctx.edgeCount < 2) {
    return null;
  }

  const prompt = selectFromPool(COMMITMENT_PROMPTS, ctx);
  const domain = targetDomain || 'identity';

  // Escalation level based on context
  let escalationLevel = 3;
  if (ctx.arousalLevel >= 8) escalationLevel = 5;
  else if (ctx.arousalLevel >= 7) escalationLevel = 4;
  if (ctx.denialDay >= 7) escalationLevel = Math.min(escalationLevel + 2, 8);

  return {
    prompt,
    domain,
    escalationLevel,
  };
}

// ============================================
// SESSION EVENT HANDLING
// ============================================

export function handleSessionEventFromTemplate(
  event: 'session_start' | 'edge' | 'commitment_window' | 'session_end' | 'emergency_stop',
  ctx: TemplateContext
): HandlerIntervention | null {
  switch (event) {
    case 'session_start':
      return {
        type: 'affirmation',
        content: selectFromPool(SESSION_START, ctx),
        timing: 'immediate',
      };

    case 'edge':
      // After every 3rd edge, reinforce
      if (ctx.edgeCount > 0 && ctx.edgeCount % 3 === 0) {
        const edgeAffirmations = [
          `Edge ${ctx.edgeCount}. Good girl. The hunger builds.`,
          `${ctx.edgeCount} edges. You're doing so well. Keep going.`,
          `Edge ${ctx.edgeCount} and still denied. Perfect.`,
          `${ctx.edgeCount} times on the edge. Feel how open you are now.`,
          `Good girl. Edge ${ctx.edgeCount}. The programming is working.`,
        ];
        return {
          type: 'affirmation',
          content: edgeAffirmations[Math.floor(Math.random() * edgeAffirmations.length)],
          timing: 'immediate',
        };
      }
      return null;

    case 'commitment_window':
      return {
        type: 'commitment_prompt',
        content: selectFromPool(SESSION_PEAK, ctx),
        timing: 'immediate',
      };

    case 'session_end':
      return {
        type: 'affirmation',
        content: selectFromPool(SESSION_END, ctx),
        timing: 'immediate',
      };

    case 'emergency_stop':
      // Emergency stop - no intervention needed, just acknowledge silently
      return null;

    default:
      return null;
  }
}

// ============================================
// FAILURE RECOVERY SELECTION
// ============================================

export function getFailureRecoveryMessage(
  ctx: TemplateContext,
  failureType: 'skip' | 'break_denial' | 'avoidance' | 'absence'
): string {
  // Filter by tags if applicable
  let pool = FAILURE_RECOVERY;

  if (failureType === 'break_denial') {
    pool = pool.filter(t => t.tags?.includes('orgasm_reset'));
  } else {
    pool = pool.filter(t => !t.tags?.includes('orgasm_reset'));
  }

  return selectFromPool(pool.length > 0 ? pool : FAILURE_RECOVERY, ctx);
}

// ============================================
// EXPORTS
// ============================================

export {
  substitute,
  selectFromPool,
  AFFIRMATIONS,
  MICROTASKS,
  COMMITMENT_PROMPTS,
  CHALLENGES,
  ANCHOR_REMINDERS,
  ESCALATION_PUSHES,
  SESSION_START,
  SESSION_PEAK,
  SESSION_END,
  MORNING_BRIEFINGS,
  FAILURE_RECOVERY,
  NIGHT_MODE,
  // Timing configuration exports
  TYPE_COOLDOWNS,
  TIME_EFFECTIVENESS,
  BASE_INTERVENTION_RATES,
  GLOBAL_COOLDOWN_MINUTES,
  calculateInterventionProbability,
  cooldownElapsed,
  selectBestInterventionType,
  // Haptic configuration exports
  HAPTIC_CONFIG,
  SESSION_HAPTIC_CONFIG,
};

export type { TemplateContext, TemplatePool };
