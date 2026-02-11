/**
 * SkincareDomainModule
 *
 * Skincare routine and self-care practice domain.
 * Tracks morning/evening routines, treatments, product usage.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const SKINCARE_CONFIG: DomainModuleConfig = {
  domain: 'skincare',
  displayName: 'Skincare',
  levelDescriptions: [
    'Foundation - Learning basic cleanse-moisturize routine',
    'Building - Adding serums, SPF, and treatments',
    'Consistency - Routine is becoming automatic',
    'Advanced - Multi-step routines with targeted treatments',
    'Mastery - Comprehensive skincare ritual is second nature',
  ],
  advancementThresholds: [10, 12, 15, 18, 20],
  streakThreshold: 2, // Skincare should be daily
  coreTaskCategories: ['routine', 'care', 'ritual'],
};

// ============================================
// TEMPLATES
// ============================================

const SKINCARE_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Skincare time. Your skin deserves this attention.",
    "Time for your routine. This is self-care, not vanity.",
    "Begin your skincare ritual. Each step is an act of becoming.",
  ],

  // Progress acknowledgment
  level_up: [
    "Skincare Level {level}: {description}. Your skin is thanking you.",
    "Level {level} in skincare. {description}. You're learning to care for yourself.",
    "Skincare Level {level} reached. {description}. This is what she does.",
  ],

  // Avoided domain
  avoided: [
    "No skincare in {days} days. You're neglecting yourself.",
    "Skincare skipped for {days} days. Your skin shows what you don't do.",
    "{days} days without skincare routine. She takes care of herself. Do you?",
  ],

  // Task completion
  task_complete: [
    "Skincare routine logged. You're learning to care for yourself.",
    "Another step in becoming someone who takes care of her skin.",
    "Good. Self-care completed.",
  ],

  // Streak celebration
  streak: [
    "{days} days of consistent skincare. Your skin is transforming.",
    "Skincare streak: {days} days. This is becoming who you are.",
    "{days} consecutive days of skincare. You're learning to nurture yourself.",
  ],

  // Time-specific
  morning_routine: [
    "Morning skincare. Cleanse, treat, protect. Face the day as her.",
    "Start your day right. Morning routine time.",
    "Good morning routine sets up your whole day. Begin.",
  ],

  evening_routine: [
    "Evening skincare. Remove the day, treat, restore.",
    "Night routine time. Your skin heals while you sleep.",
    "End your day by caring for yourself. Evening routine.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class SkincareDomainModule extends BaseDomainModule {
  readonly name = 'skincare-domain';
  protected readonly config = SKINCARE_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = SKINCARE_TEMPLATES[templateKey as keyof typeof SKINCARE_TEMPLATES];
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
