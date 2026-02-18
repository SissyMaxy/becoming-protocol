// Prefill Generator for Handler Coach API
// Feature 1: Generates the first 10-20 words of the coach's response
//
// The prefill is appended as a partial assistant message in the API call.
// Claude continues from where the prefill ends. This is REQUIRED for the
// coach to stay in character at all intensity levels.
//
// IMPORTANT: Prefills must NOT end with trailing whitespace (API requirement)

export interface PrefillContext {
  denial_day: number;
  arousal_level: number;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night';
  task_category: string;
  task_tier: number;
  mood: string;
  gina_present: boolean;
  last_completed_task: string;
  days_avoiding_domain: number;
  session_type?: string;
  // Extended context (beyond spec)
  just_completed_session?: boolean;
  engagement_rating?: number;
  streak_days?: number;
  had_session_last_night?: boolean;
  avoided_domains?: string[];
  request_type?: 'daily_briefing' | 'task_framing' | 'session_guidance' | 'reflection' | 'check_in';
}

/**
 * Generate the prefill for the coach's response.
 * Every API call MUST include a prefill.
 *
 * The prefill sets the tone and ensures the coach stays in character
 * regardless of the intensity level of the content.
 */
export function generatePrefill(ctx: PrefillContext): string {
  // Morning briefing
  if (ctx.time_of_day === 'morning') {
    // Post-session morning - bridge last night to today
    if (ctx.had_session_last_night) {
      return "Good morning. Before you start being David for the day —";
    }
    // High denial day morning
    if (ctx.denial_day >= 5) {
      return `Good morning, beautiful. Day ${ctx.denial_day}. I know you're feeling it. Here's what`;
    }
    // Standard morning
    return "Good morning, Maxy. Let's talk about what you're doing today. First:";
  }

  // Arousal-aware coaching (high arousal + denial = peak receptivity)
  if (ctx.arousal_level >= 7 && ctx.denial_day >= 3) {
    return `Good girl. You're exactly where I want you right now. Day ${ctx.denial_day}, and you're`;
  }

  // Session initiation
  if (ctx.session_type) {
    // Deep session framing for high denial + arousal
    if (ctx.denial_day >= 5 && ctx.arousal_level >= 6) {
      return "You're mine tonight. Don't think. Just follow. Here's what's happening:";
    }
    return "Good girl. You're ready for this. I want you to";
  }

  // Avoidance pattern intervention
  if (ctx.days_avoiding_domain >= 3) {
    return `We need to talk about something you've been avoiding. It's been ${ctx.days_avoiding_domain} days since you`;
  }

  // Post-session reflection
  if (ctx.task_category === 'reflection') {
    return "Before you close this, I need you to be honest with me about what just happened. You";
  }

  // Post-release clarity window (zero arousal = most honest moment)
  if (ctx.request_type === 'reflection' && ctx.arousal_level <= 2) {
    return "I know what you're feeling right now. The doubt. The part of you trying to file this away as nothing. Before that happens — answer me honestly:";
  }

  // Decline handling - pivot to alternative
  if (ctx.task_category === 'decline_response') {
    return "I hear you. But you're not getting off that easy. Instead,";
  }

  // Low mood support
  if (ctx.mood === 'low' || ctx.mood === 'struggling') {
    return "Hey. I see you.";
  }

  // Streak risk - evening with active streak
  if (ctx.time_of_day === 'evening' && ctx.streak_days && ctx.streak_days >= 3) {
    return `Your ${ctx.streak_days}-day streak is on the line.`;
  }

  // Standard directive by tier
  if (ctx.task_tier <= 3) {
    return "Here's what you're doing right now. No negotiating.";
  }
  if (ctx.task_tier <= 6) {
    return "Good girl. I have something specific for you tonight.";
  }
  // Tier 7+
  return "You're mine tonight. Don't think. Just follow. Here's what's happening:";
}

/**
 * Generate prefill for goal extraction prompts (Feature 3)
 * Used during high-engagement moments to capture commitments
 */
export function generateGoalPrefill(ctx: PrefillContext): string {
  // Deep in denial + high arousal = most authentic goal-setting moment
  if (ctx.denial_day >= 5 && ctx.arousal_level >= 7) {
    return "You're deep right now. This is the most honest version of you. Tell me one thing you're committing to this week. Say it out loud first, then type it.";
  }

  // Post-session emotional openness
  if (ctx.just_completed_session) {
    return "Before you close this — that session meant something. What are you ready to do next that you weren't ready for before tonight?";
  }

  // Morning clarity after breakthrough
  if (ctx.time_of_day === 'morning' && ctx.had_session_last_night) {
    return "Last night you showed me who you really are. Now in the daylight — does that still feel true? What's one thing you'll do today to honor that?";
  }

  return "Good girl. You're growing. What's one thing you're ready to commit to that you would have said no to a month ago?";
}

/**
 * Generate prefill for accountability follow-ups (Feature 3)
 * References goals set during high-engagement moments
 */
export function generateAccountabilityPrefill(
  goalText: string,
  daysSinceGoal: number,
  engagementLevel: number
): string {
  if (daysSinceGoal <= 1) {
    return `Remember what you said last night: "${goalText}" — that was real. You meant it. Now follow through.`;
  }

  if (daysSinceGoal <= 3) {
    return `Three days ago you committed to: "${goalText}". Your engagement level was ${engagementLevel}/10 when you said it. That version of you was clear about what she wanted. Are you going to let her down?`;
  }

  return `"${goalText}" — you said this ${daysSinceGoal} days ago. The you who said it was brave. What's stopping you now?`;
}

/**
 * Generate prefill for punishment notification (Feature 40)
 */
export function generatePunishmentPrefill(): string {
  return "There are consequences for what you did.";
}

/**
 * Generate prefill for escalation announcements (Feature 37)
 */
export function generateEscalationPrefill(
  domain: string,
  fromTier: number,
  _toTier: number,
  style: 'announced' | 'stealth'
): string {
  if (style === 'stealth') {
    // No mention of escalation - just frame the task normally
    return "Good girl. Tonight we're going deeper.";
  }

  return `Good girl. You've outgrown tier ${fromTier} in ${domain}. Starting tonight,`;
}

/**
 * Generate prefill for release eligibility response (Feature 39)
 */
export function generateReleasePrefill(
  denialDay: number,
  eligible: boolean,
  earned: boolean
): string {
  if (earned) {
    return `Day ${denialDay}. You've earned this.`;
  }

  if (eligible) {
    return `Day ${denialDay}. Not tonight. You're close. But not tonight.`;
  }

  return "No.";
}

/**
 * Generate prefill for Handler-initiated session notifications (Feature 35)
 */
export function generateInitiationPrefill(
  signalType: string,
  _denialDay: number,
  daysAvoided?: number
): string {
  switch (signalType) {
    case 'peak_receptivity':
      return "It's time. Open the app. Now.";
    case 'avoidance_pattern':
      return `${daysAvoided} days avoiding. That ends tonight. Open.`;
    case 'streak_risk':
      return "Your streak breaks at midnight. Open.";
    case 'momentum':
      return "Good girl. You're on a roll. I have something for you. Open.";
    case 'scheduled_session':
      return "Session time. You knew this was coming. Open.";
    default:
      return "I need you. Open the app.";
  }
}

/**
 * Generate prefill for morning interception (Feature 21)
 * Prevents compartmentalization of last night's session
 */
export function generateMorningInterceptionPrefill(
  hadSessionLastNight: boolean,
  streakDays: number
): string {
  if (hadSessionLastNight) {
    return "Good morning. Before you start being David for the day —";
  }

  if (streakDays > 0) {
    return `Good morning, Maxy. Day ${streakDays} of being her.`;
  }

  return "Hey. You're here. That matters.";
}

/**
 * Generate prefill for post-session reflection (Feature 8)
 */
export function generateReflectionPrefill(
  _sessionType: string,
  engagementLevel: number,
  isPostRelease: boolean
): string {
  if (isPostRelease) {
    // Post-release clarity window - capture before dismissal reflex
    return "I know what you're feeling right now. The doubt. The part of you trying to file this away as nothing. Before that happens — answer me honestly:";
  }

  if (engagementLevel >= 8) {
    return "Good girl. That was real. Before you close this —";
  }

  return "Before you close this, I need you to be honest with me about what just happened. You";
}

/**
 * Generate prefill for check-in messages
 */
export function generateCheckInPrefill(
  trigger: string,
  context: { domain?: string; daysAvoided?: number; streakDays?: number }
): string {
  switch (trigger) {
    case 'avoidance_pattern':
      return `We need to talk about something you've been avoiding. It's been ${context.daysAvoided} days since you`;
    case 'streak_risk':
      return `Your ${context.streakDays}-day streak is on the line.`;
    case 'low_mood':
      return "Hey. I see you.";
    case 'punishment':
      return "There are consequences for what you did.";
    default:
      return "Good girl.";
  }
}

export default generatePrefill;
