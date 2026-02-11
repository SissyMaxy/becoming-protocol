/**
 * VoiceDomainModule
 *
 * Voice feminization practice domain.
 * Tracks resonance practice, pitch exercises, speech pattern training.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const VOICE_CONFIG: DomainModuleConfig = {
  domain: 'voice',
  displayName: 'Voice',
  levelDescriptions: [
    'Awareness - Learning what feminine voice sounds like',
    'Exploration - Experimenting with resonance and pitch',
    'Practice - Building muscle memory for feminine speech',
    'Integration - Using feminine voice in daily conversations',
    'Mastery - Feminine voice is natural and automatic',
  ],
  advancementThresholds: [10, 15, 20, 25, 30],
  streakThreshold: 3,
  coreTaskCategories: ['practice', 'routine', 'listen'],
};

// ============================================
// TEMPLATES
// ============================================

const VOICE_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Time for voice practice. Find somewhere private and let's work on that resonance.",
    "Your voice is getting softer. Let's keep building on that.",
    "Even 10 minutes of practice moves you forward. Begin when ready.",
  ],

  // Progress acknowledgment
  level_up: [
    "Your voice is changing. Level {level}: {description}. Keep practicing.",
    "Voice Level {level} reached. {description}. The work is paying off.",
    "Level {level} in voice. {description}. Your voice betrays who you're becoming.",
  ],

  // Avoided domain
  avoided: [
    "You've been avoiding voice practice. {days} days. Your voice won't feminize itself.",
    "Voice work abandoned for {days} days. The longer you wait, the harder it gets.",
    "No voice practice in {days} days. Are you afraid of what you'll sound like?",
  ],

  // Task completion
  task_complete: [
    "Voice practice logged. Your resonance is shifting.",
    "Another step toward a voice that matches who you are.",
    "Good. Your voice is becoming yours.",
  ],

  // Streak celebration
  streak: [
    "{days} days of consistent voice practice. The changes are becoming permanent.",
    "Voice streak: {days} days. Your muscle memory is building.",
    "{days} consecutive days of voice work. This is how transformation happens.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class VoiceDomainModule extends BaseDomainModule {
  readonly name = 'voice-domain';
  protected readonly config = VOICE_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = VOICE_TEMPLATES[templateKey as keyof typeof VOICE_TEMPLATES];
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
