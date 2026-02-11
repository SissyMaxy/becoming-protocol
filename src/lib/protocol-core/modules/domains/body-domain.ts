/**
 * BodyDomainModule
 *
 * Physical body care and transformation practice domain.
 * Tracks fitness, hair removal, body awareness, physical self-care.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const BODY_CONFIG: DomainModuleConfig = {
  domain: 'body',
  displayName: 'Body',
  levelDescriptions: [
    'Awareness - Getting to know your body',
    'Care - Beginning regular body maintenance',
    'Transformation - Active body feminization work',
    'Refinement - Advanced body care routines',
    'Mastery - Body maintenance is effortless ritual',
  ],
  advancementThresholds: [10, 15, 18, 22, 25],
  streakThreshold: 3,
  coreTaskCategories: ['care', 'routine', 'practice'],
};

// ============================================
// TEMPLATES
// ============================================

const BODY_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Body care time. Your body is the vessel of your transformation.",
    "Time to care for your body. She maintains herself.",
    "Body work. Physical transformation requires physical effort.",
  ],

  // Progress acknowledgment
  level_up: [
    "Body Level {level}: {description}. Your body is changing.",
    "Level {level} in body care. {description}. Physical transformation progressing.",
    "Body Level {level} reached. {description}. You're learning to inhabit this body.",
  ],

  // Avoided domain
  avoided: [
    "No body care in {days} days. Physical transformation requires consistency.",
    "Body work neglected for {days} days. Your body needs attention.",
    "{days} days without body care. Are you comfortable in your body?",
  ],

  // Task completion
  task_complete: [
    "Body care logged. Physical transformation continues.",
    "Another step toward a body that matches your identity.",
    "Good. You're caring for yourself.",
  ],

  // Streak celebration
  streak: [
    "{days} days of body care. Your physical self is transforming.",
    "Body care streak: {days} days. Consistency creates change.",
    "{days} consecutive days of body work. This is dedication.",
  ],

  // Context-specific
  hair_removal: [
    "Hair removal time. Smooth skin is feminine skin.",
    "Time for hair removal. This is maintenance, not optional.",
    "Remove unwanted hair. Your body should feel right.",
  ],

  fitness_prompt: [
    "Movement and fitness. Build a body you're proud of.",
    "Exercise time. Strong and feminine aren't opposites.",
    "Physical activity. Your body needs to move.",
  ],

  body_awareness: [
    "Check in with your body. How does it feel right now?",
    "Body awareness practice. Notice how you're holding tension.",
    "Your body communicates. Are you listening?",
  ],

  self_care_ritual: [
    "Body self-care ritual. Lotion, attention, appreciation.",
    "Treat your body with care. This is a ritual of becoming.",
    "Self-care time. Your body deserves this attention.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class BodyDomainModule extends BaseDomainModule {
  readonly name = 'body-domain';
  protected readonly config = BODY_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = BODY_TEMPLATES[templateKey as keyof typeof BODY_TEMPLATES];
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
