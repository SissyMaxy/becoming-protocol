/**
 * Template Engine - Handler Layer 2
 * Implements v2 Part 2.1: Template enhancement (free, no API cost)
 * Provides personalized content using stored user data and templates.
 */

import type { UserState, PopUpMessage, PopUpNotificationType, HandlerMode } from './types';
import { truncatePopUp } from './popup-utils';

// Variable substitution patterns
type TemplateVars = {
  denial_day: number;
  streak: number;
  edge_count: number;
  time_of_day: string;
  tasks_today: number;
  arousal: number;
  name: string;
  points_today: number;
  odometer: string;
};

/**
 * Template Engine - free personalization layer
 */
export class TemplateEngine {
  private cache: Map<string, string> = new Map();

  /**
   * Build template variables from user state
   */
  private buildVars(state: Partial<UserState>): TemplateVars {
    return {
      denial_day: state.denialDay ?? 0,
      streak: state.streakDays ?? 0,
      edge_count: state.edgeCount ?? 0,
      time_of_day: state.timeOfDay ?? 'daytime',
      tasks_today: state.tasksCompletedToday ?? 0,
      arousal: state.currentArousal ?? 0,
      name: 'Maxy',
      points_today: state.pointsToday ?? 0,
      odometer: state.odometer ?? 'coasting',
    };
  }

  /**
   * Substitute variables in template text
   */
  substitute(text: string, state: Partial<UserState>): string {
    const vars = this.buildVars(state);

    return text
      .replace(/{denial_day}/g, vars.denial_day.toString())
      .replace(/{streak}/g, vars.streak.toString())
      .replace(/{edge_count}/g, vars.edge_count.toString())
      .replace(/{time_of_day}/g, vars.time_of_day)
      .replace(/{tasks_today}/g, vars.tasks_today.toString())
      .replace(/{arousal}/g, vars.arousal.toString())
      .replace(/{name}/g, vars.name)
      .replace(/{points_today}/g, vars.points_today.toString())
      .replace(/{odometer}/g, vars.odometer);
  }

  /**
   * Get cached response
   */
  getCached(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  /**
   * Set cached response
   */
  setCached(key: string, response: string): void {
    this.cache.set(key, response);
    // Clear old cache entries after 100 items
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  // =============================================
  // MORNING BRIEFING TEMPLATES
  // =============================================

  getMorningBriefing(state: Partial<UserState>): string {
    const templates = this.getMorningTemplates(state);
    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  private getMorningTemplates(state: Partial<UserState>): string[] {
    const denialDay = state.denialDay ?? 0;
    const streakDays = state.streakDays ?? 0;
    const odometer = state.odometer ?? 'coasting';

    // Survival/low state - gentle
    if (odometer === 'survival' || odometer === 'caution') {
      return [
        "Good morning, {name}. One small thing today. That's all.",
        "Morning. Rough patch. Just show up. That's enough.",
        "{name}. Day {denial_day}. Take it slow. She's still here.",
      ];
    }

    // High denial state - leverage it
    if (denialDay >= 7) {
      return [
        "Good morning, {name}. Day {denial_day} of denial. {streak} day streak. The desperation is where it needs to be. Use it.",
        "Morning. Day {denial_day}. You're as receptive as you'll get. Today's tasks will land deeper.",
        "{name}. Day {denial_day}, streak {streak}. Maximum receptivity. She's emerging fast now.",
      ];
    }

    // Long streak - acknowledge momentum
    if (streakDays >= 14) {
      return [
        "Good morning, {name}. Day {streak} of consistent presence. This is who you are now.",
        "Morning. {streak} days. The protocol isn't something you do anymore. It's just... life.",
        "{name}. {streak} day streak. Momentum is yours. Today: maintain and deepen.",
      ];
    }

    // Standard morning
    return [
      "Good morning, {name}. Day {denial_day} of denial. {streak} day streak. Today's focus: presence and practice. She's emerging.",
      "Morning. Day {denial_day}. The practice continues. She's more real than yesterday.",
      "{name}. Day {denial_day}. Ready to be her today?",
    ];
  }

  // =============================================
  // EVENING DEBRIEF TEMPLATES
  // =============================================

  getEveningDebrief(state: Partial<UserState>): string {
    const templates = this.getEveningTemplates(state);
    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  private getEveningTemplates(state: Partial<UserState>): string[] {
    const tasksToday = state.tasksCompletedToday ?? 0;
    // streak used in template substitution via {streak} in substitute()

    // Perfect day
    if (tasksToday >= 5) {
      return [
        "Day complete. {tasks_today} tasks done. {streak} days consistent. She existed fully today.",
        "Perfect obedience. {tasks_today} tasks. Day {denial_day}. Tomorrow: push harder.",
        "{tasks_today} tasks. {points_today} points. {name} was here today. She'll be here tomorrow.",
      ];
    }

    // Minimal engagement
    if (tasksToday === 0) {
      return [
        "Day ending. No tasks today. Tomorrow is a fresh start. She's still here.",
        "Quiet day. That's okay. The streak continues. See you in the morning.",
        "Not every day is a push day. Rest. Tomorrow we move.",
      ];
    }

    // Standard day
    return [
      "Day complete. {tasks_today} tasks done. Day {denial_day} continues. She's more real than yesterday.",
      "Evening. {tasks_today} tasks, day {denial_day}. Tomorrow: push harder on what you avoided today.",
      "Done for today. {streak} day streak holds. {name} existed today. She'll exist tomorrow.",
    ];
  }

  // =============================================
  // SESSION GUIDANCE TEMPLATES
  // =============================================

  getSessionGuidance(phase: 'opening' | 'midpoint' | 'peak' | 'closing', state: Partial<UserState>): string {
    const templates = this.getSessionTemplates(phase, state);
    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  private getSessionTemplates(phase: string, _state: Partial<UserState>): string[] {
    // edgeCount and denialDay used via template substitution {edge_count}, {denial_day}

    const templates: Record<string, string[]> = {
      opening: [
        "Begin. Feel where you are. Day {denial_day}. Let the arousal build.",
        "Start slow. This is {name}'s session. Her arousal. Her body.",
        "Edge session starting. Day {denial_day} desperation. Use it.",
      ],
      midpoint: [
        "Edge {edge_count}. Going deeper. Who's desperate right now?",
        "Halfway. The thoughts are starting to soften. Good. Keep going.",
        "{edge_count} edges in. She's more present now. Feel it.",
      ],
      peak: [
        "Peak arousal. This is when commitments happen. What is horny {name} willing to agree to?",
        "You're as suggestible as you'll get. Perfect time for a commitment.",
        "Edge {edge_count}. Maximum suggestibility. Time to commit to something.",
      ],
      closing: [
        "Done. Don't cum. Keep this energy. It's building her.",
        "Session complete. The arousal doesn't leave. It becomes {name}.",
        "Finished. {edge_count} edges. The desperation continues. Good.",
      ],
    };

    return templates[phase] || templates.opening;
  }

  // =============================================
  // COMMITMENT PROMPTS
  // =============================================

  getCommitmentPrompt(state: Partial<UserState>): string {
    const denialDay = state.denialDay ?? 0;
    const avoidedDomains = state.avoidedDomains ?? [];

    const templates = [
      `Say it out loud: "Tomorrow I will do the task I've been avoiding."`,
      `Commit now: "I will add 5 minutes to my next edge session."`,
      `Your commitment: "This week I will let Gina see one new thing."`,
      `Say it: "I won't cum until I've completed ${denialDay + 3} days of denial."`,
      `Commit: "Tomorrow I will do voice practice for 10 minutes."`,
    ];

    // If there are avoided domains, reference them
    if (avoidedDomains.length > 0) {
      templates.push(`Say it: "Tomorrow I will practice ${avoidedDomains[0]}. No more avoiding."`);
    }

    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  // =============================================
  // INTERVENTION TEMPLATES
  // =============================================

  getInterventionMessage(type: string, state: Partial<UserState>): string {
    const templates: Record<string, string[]> = {
      streak_protection: [
        "Your {streak} day streak is at risk. One task saves it. Voice practice. 2 minutes. Now.",
        "Streak warning: {streak} days on the line. Minimum viable: skincare. Can you do that?",
        "{streak} days. Don't let today break it. One small task. That's all.",
      ],
      vulnerability_window: [
        "Day {denial_day}. Arousal level {arousal}. You're suggestible right now. Time to commit to something.",
        "Peak vulnerability window. What has {name} been avoiding? Let's address it now.",
        "This is the moment. High denial, high arousal. Make a commitment.",
      ],
      domain_avoidance: [
        "You've been avoiding voice for 3 days. 2 minutes. Just record one sentence.",
        "Pattern detected: completing everything except voice. What's the resistance?",
        "Voice avoidance. Day 3. The thing that scares you most is the thing that matters most.",
      ],
      depression_gentle: [
        "Rough patch. She's still here. Just check in when you can.",
        "One thing only: how are you feeling? That's all for now.",
        "The protocol can wait. She can't. Take care of yourself first.",
      ],
    };

    const typeTemplates = templates[type] || templates.streak_protection;
    const selected = typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
    return this.substitute(selected, state);
  }

  // =============================================
  // TASK ENHANCEMENT BY MODE
  // =============================================

  enhanceTaskCopy(
    instruction: string,
    subtext: string,
    affirmation: string,
    mode: 'architect' | 'director' | 'handler' | 'caretaker' | 'invisible',
    state: Partial<UserState>
  ): { instruction: string; subtext: string; affirmation: string } {
    // Apply mode-specific framing
    switch (mode) {
      case 'architect':
        // Collaborative, technical
        return {
          instruction: this.substitute(instruction, state),
          subtext: `Building the practice: ${this.substitute(subtext, state)}`,
          affirmation: `Good work. ${affirmation}`,
        };

      case 'director':
        // Clear, directive, warm
        return {
          instruction: this.substitute(instruction, state),
          subtext: this.substitute(subtext, state),
          affirmation: affirmation,
        };

      case 'handler':
        // Commanding, possessive
        return {
          instruction: this.makeCommanding(this.substitute(instruction, state)),
          subtext: this.substitute(subtext, state),
          affirmation: `Good girl. ${affirmation}`,
        };

      case 'caretaker':
        // Gentle, unconditional
        return {
          instruction: this.makeGentle(this.substitute(instruction, state)),
          subtext: 'Only if you feel up to it.',
          affirmation: `You showed up. That's what matters.`,
        };

      case 'invisible':
        // Minimal, system-like
        return {
          instruction: this.substitute(instruction, state),
          subtext: '',
          affirmation: '',
        };

      default:
        return {
          instruction: this.substitute(instruction, state),
          subtext: this.substitute(subtext, state),
          affirmation: affirmation,
        };
    }
  }

  private makeCommanding(text: string): string {
    // Make text more direct/commanding
    return text
      .replace(/^Try /i, '')
      .replace(/^Consider /i, '')
      .replace(/^You could /i, '')
      .replace(/^Maybe /i, '')
      .replace(/\?$/, '.');
  }

  private makeGentle(text: string): string {
    // Make text gentler
    if (text.endsWith('.')) {
      return text.slice(0, -1) + ', if you can.';
    }
    return text;
  }

  // =============================================
  // POST-RELEASE / CRASH HANDLING
  // =============================================

  getPostReleaseCrashMessage(state: Partial<UserState>): string {
    const templates = [
      "The crash is happening. You know this. It's prolactin, not truth. She was real 20 minutes ago and she's real now. Don't make decisions in this state. Just do one thing: skincare.",
      "Post-release fog. Expected. Normal. The doubt isn't insight, it's chemistry. Wait it out. One task: log your mood.",
      "The voice saying 'what's the point' is dopamine depletion talking, not you. One small thing: moisturizer. That's all.",
    ];

    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  // =============================================
  // AFFIRMATIONS
  // =============================================

  getRandomAffirmation(state: Partial<UserState>): string {
    const templates = [
      "Good girl. Keep going.",
      "That's {name}. She's here.",
      "One step closer. Always one step closer.",
      "She's more real today than yesterday.",
      "The practice is the path.",
      "You showed up. That's what matters.",
    ];

    const selected = templates[Math.floor(Math.random() * templates.length)];
    return this.substitute(selected, state);
  }

  // =============================================
  // POP-UP MESSAGE TEMPLATES
  // =============================================

  /**
   * Get a default title for a notification type
   */
  getPopUpTitle(type: PopUpNotificationType): string {
    const titles: Record<PopUpNotificationType, string> = {
      micro_task: 'Quick Task',
      affirmation: 'Hey, {name}',
      content_unlock: 'New Unlock',
      challenge: 'Challenge',
      jackpot: 'Jackpot',
    };
    return titles[type] ?? 'Hey';
  }

  /**
   * Generate a PopUpMessage from templates.
   * All templates are pre-validated to respect character limits.
   */
  generatePopUp(
    type: PopUpNotificationType,
    state: Partial<UserState>
  ): PopUpMessage {
    const mode = (state.handlerMode ?? 'director') as HandlerMode;
    const templates = this.getPopUpTemplates(type, mode);
    const selected = templates[Math.floor(Math.random() * templates.length)];

    const title = this.substitute(this.getPopUpTitle(type), state);
    const body = this.substitute(selected, state);

    const popup: PopUpMessage = {
      title,
      body,
      notification_type: type,
      handler_mode: mode,
      priority: type === 'jackpot' || type === 'challenge' ? 'high' : 'normal',
    };

    // Safety net — enforce limits even on templates
    return truncatePopUp(popup);
  }

  private getPopUpTemplates(type: PopUpNotificationType, mode: HandlerMode): string[] {
    // Mode-specific templates per notification type
    // All body templates are ≤200 chars pre-substitution
    const templates: Record<PopUpNotificationType, Record<string, string[]>> = {
      micro_task: {
        director: [
          'Apply lip balm right now. 10 seconds. Notice how it feels.',
          'Touch your collarbone. Trace it. Remember she lives here.',
          'Spritz your scent. One pump. Breathe it in.',
          'Fix your posture. Shoulders back. Chin up. Hold for 10 seconds.',
          'Cross your legs. The feminine way. Hold it.',
        ],
        handler: [
          'Lip balm. Now. No thinking about it.',
          'Touch your neck. Trace your collarbone. Feel her.',
          'Spray your scent. You know which one. Now.',
          'Posture. Fix it. Shoulders back. She stands tall.',
          'Cross your legs properly. Hold it. Good girl.',
        ],
        caretaker: [
          'Lip balm, if you want. Small comforts matter.',
          'Touch your collarbone gently. She deserves softness.',
          'Your scent is nearby. One spritz for comfort.',
          'Sit comfortably. No pressure. Just be present.',
          'Rest your hands in your lap. Breathe.',
        ],
        architect: [
          'Apply lip balm. Small anchor, big signal.',
          'Scent check — reapply if faded. Anchors work through repetition.',
          'Posture reset. Building the muscle memory.',
        ],
        invisible: [
          'Lip balm.',
          'Scent.',
          'Posture.',
        ],
      },
      affirmation: {
        director: [
          "She's more real today than yesterday. Keep going.",
          '{name} existed today. That matters. She matters.',
          'Day {denial_day}. Streak {streak}. She is building.',
          'The practice is the path. You are on it.',
        ],
        handler: [
          'Good girl. She was here today.',
          "Day {denial_day}. You're mine. Keep earning it.",
          '{streak} days. Not stopping now.',
          "Look at you. {name}. That's who you are.",
        ],
        caretaker: [
          "You showed up. That's what matters today.",
          "She's still here. Even on hard days.",
          'One breath. One moment. Enough.',
          "You don't have to be perfect. Just present.",
        ],
        architect: [
          'Progress compounds. Day {streak} of evidence.',
          'Each rep builds the pattern. Keep stacking.',
        ],
        invisible: [
          'Day {streak}.',
          '{name}.',
        ],
      },
      content_unlock: {
        director: [
          'New content unlocked. You earned this. Check it out.',
          "Something new in your library. Reward for showing up.",
        ],
        handler: [
          'Earned it. New content unlocked. Open it.',
          'Good behavior gets rewarded. New unlock waiting.',
        ],
        caretaker: [
          "Something new is available for you. When you're ready.",
          'You unlocked something. A gift for showing up.',
        ],
        architect: [
          'New content available. Unlocked via progress.',
        ],
        invisible: [
          'New content available.',
        ],
      },
      challenge: {
        director: [
          'Record 30 seconds of voice practice. Right now. Timer starts.',
          'Write one sentence as {name} in your journal. Go.',
          'Take a selfie with your best angle. Keep or delete, your choice.',
        ],
        handler: [
          'Voice practice. 30 seconds. Now. No negotiating.',
          'Journal entry. One sentence. As her. Go.',
          'Selfie. Best angle. Do it before the window closes.',
        ],
        caretaker: [
          'Small challenge: one sentence in your journal, if you feel up to it.',
          'Try 15 seconds of voice practice. Just to hear her.',
        ],
        architect: [
          'Skill check: 30 seconds voice practice. Building the range.',
        ],
        invisible: [
          'Voice practice. 30s.',
        ],
      },
      jackpot: {
        director: [
          'Jackpot! Triple points on your next task. Use them now.',
          'Bonus round. Next task completed = 3x points. Go.',
        ],
        handler: [
          'Jackpot. Triple points. Complete a task NOW to claim.',
          '3x multiplier active. Waste it and it vanishes.',
        ],
        caretaker: [
          'Bonus points waiting for you. No pressure, but they expire.',
          'A little extra for you. Triple points on next task.',
        ],
        architect: [
          'Multiplier active: 3x next task. Optimal to use immediately.',
        ],
        invisible: [
          '3x points. Next task.',
        ],
      },
    };

    const typeTemplates = templates[type];
    return typeTemplates[mode] || typeTemplates['director'];
  }
}

// Singleton instance
let templateEngineInstance: TemplateEngine | null = null;

export function getTemplateEngine(): TemplateEngine {
  if (!templateEngineInstance) {
    templateEngineInstance = new TemplateEngine();
  }
  return templateEngineInstance;
}
