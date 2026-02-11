/**
 * MindsetDomainModule
 *
 * Mental and emotional transformation practice domain.
 * Tracks affirmations, journaling, meditation, identity work.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const MINDSET_CONFIG: DomainModuleConfig = {
  domain: 'mindset',
  displayName: 'Mindset',
  levelDescriptions: [
    'Awareness - Recognizing thought patterns and beliefs',
    'Questioning - Challenging old narratives',
    'Reframing - Building new mental frameworks',
    'Integration - New beliefs becoming automatic',
    'Mastery - Authentic self-concept fully internalized',
  ],
  advancementThresholds: [12, 15, 20, 25, 30],
  streakThreshold: 2, // Mental work should be frequent
  coreTaskCategories: ['practice', 'ritual', 'learn'],
};

// ============================================
// TEMPLATES
// ============================================

const MINDSET_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Mindset work. Your thoughts create your reality.",
    "Time for mental practice. What stories are you telling yourself?",
    "The mind shapes everything. Let's shape yours.",
  ],

  // Progress acknowledgment
  level_up: [
    "Mindset Level {level}: {description}. Your inner world is shifting.",
    "Level {level} in mindset. {description}. Your beliefs are changing.",
    "Mindset Level {level} reached. {description}. You think differently now.",
  ],

  // Avoided domain
  avoided: [
    "No mindset work in {days} days. Old patterns persist without attention.",
    "Mindset practice skipped for {days} days. Your thoughts need direction.",
    "{days} days without mindset work. Are you letting old beliefs win?",
  ],

  // Task completion
  task_complete: [
    "Mindset work logged. Your beliefs are shifting.",
    "Another step toward thinking like who you're becoming.",
    "Good. Mental transformation in progress.",
  ],

  // Streak celebration
  streak: [
    "{days} days of mindset practice. Your inner world is transforming.",
    "Mindset streak: {days} days. New thought patterns are forming.",
    "{days} consecutive days of mental work. This is deep change.",
  ],

  // Context-specific
  affirmation_prompt: [
    "Repeat your affirmations. Words become beliefs become reality.",
    "Affirmation time. Speak who you're becoming into existence.",
    "What you tell yourself matters. Affirm your truth.",
  ],

  journaling_prompt: [
    "Journal time. Process your thoughts on paper.",
    "Write about your transformation. Journaling creates clarity.",
    "Put pen to paper. What's moving through you today?",
  ],

  meditation_prompt: [
    "Meditation practice. Quiet the noise. Find yourself.",
    "Sit with yourself. Breathe. Listen inward.",
    "Stillness reveals truth. Meditate.",
  ],

  identity_reflection: [
    "Who are you becoming? Reflect on that question.",
    "Your identity is not fixed. You're choosing who to be.",
    "The old self fades. The new self emerges. Notice the shift.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class MindsetDomainModule extends BaseDomainModule {
  readonly name = 'mindset-domain';
  protected readonly config = MINDSET_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = MINDSET_TEMPLATES[templateKey as keyof typeof MINDSET_TEMPLATES];
    if (!templates) return null;

    const template = templates[Math.floor(Math.random() * templates.length)];
    return this.interpolateTemplate(template, context);
  }

  private interpolateTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (key === 'level' && context.level === undefined && this.domainState) {
        return String(this.domainState.currentLevel);
      }
      if (key === 'description' && context.description === undefined && this.domainState) {
        return this.config.levelDescriptions[this.domainState.currentLevel - 1] || '';
      }
      if (key === 'days' && context.days === undefined && this.domainState) {
        return String(this.domainState.streak || this.domainState.daysSinceLastPractice);
      }
      return context[key] !== undefined ? String(context[key]) : `{${key}}`;
    });
  }
}
