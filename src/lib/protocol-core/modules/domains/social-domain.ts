/**
 * SocialDomainModule
 *
 * Social interaction and relationship practice domain.
 * Tracks social confidence, feminine social behaviors, relationship building.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const SOCIAL_CONFIG: DomainModuleConfig = {
  domain: 'social',
  displayName: 'Social',
  levelDescriptions: [
    'Observation - Watching how women interact socially',
    'Practice - Experimenting with feminine social behaviors',
    'Confidence - Presenting femininely in safe spaces',
    'Expansion - Building relationships as your true self',
    'Mastery - Authentic feminine social presence',
  ],
  advancementThresholds: [8, 12, 15, 18, 22],
  streakThreshold: 4,
  coreTaskCategories: ['practice', 'explore', 'learn'],
};

// ============================================
// TEMPLATES
// ============================================

const SOCIAL_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Social practice. Relationships are built through connection.",
    "Time to work on your social presence. How do you show up?",
    "Social skills are learnable. Let's practice.",
  ],

  // Progress acknowledgment
  level_up: [
    "Social Level {level}: {description}. Your confidence is growing.",
    "Level {level} in social. {description}. You're learning to connect.",
    "Social Level {level} reached. {description}. Relationships are opening up.",
  ],

  // Avoided domain
  avoided: [
    "No social practice in {days} days. Isolation reinforces old patterns.",
    "Social work avoided for {days} days. You need connection to transform.",
    "{days} days without social practice. Are you hiding from the world?",
  ],

  // Task completion
  task_complete: [
    "Social task completed. Your confidence is building.",
    "Another step toward authentic connection.",
    "Good. You're learning to show up as yourself.",
  ],

  // Streak celebration
  streak: [
    "{days} days of social practice. You're becoming more comfortable.",
    "Social streak: {days} days. Connection is becoming natural.",
    "{days} consecutive days of social work. This is brave.",
  ],

  // Context-specific
  conversation_practice: [
    "Practice feminine conversation patterns. Listen more. Connect emotionally.",
    "Conversation practice. Women communicate differently. Learn how.",
    "How do you speak with others? Let's refine that.",
  ],

  boundary_setting: [
    "Setting boundaries is self-respect. Practice saying no.",
    "Boundaries protect your energy. Know where yours are.",
    "Strong women have clear boundaries. Build yours.",
  ],

  confidence_building: [
    "Confidence comes from action. Do the scary thing.",
    "Each interaction builds confidence. Show up anyway.",
    "You're more capable than you think. Prove it to yourself.",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class SocialDomainModule extends BaseDomainModule {
  readonly name = 'social-domain';
  protected readonly config = SOCIAL_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = SOCIAL_TEMPLATES[templateKey as keyof typeof SOCIAL_TEMPLATES];
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
