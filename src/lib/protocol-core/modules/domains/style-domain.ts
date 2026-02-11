/**
 * StyleDomainModule
 *
 * Fashion, wardrobe, and presentation practice domain.
 * Tracks outfit building, shopping, presentation skills.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const STYLE_CONFIG: DomainModuleConfig = {
  domain: 'style',
  displayName: 'Style',
  levelDescriptions: [
    'Discovery - Exploring what you are drawn to',
    'Building - Acquiring key wardrobe pieces',
    'Coordination - Learning to put outfits together',
    'Expression - Style becomes personal expression',
    'Mastery - Effortless, confident presentation',
  ],
  advancementThresholds: [8, 12, 15, 20, 25],
  streakThreshold: 5, // Style can be practiced less frequently
  coreTaskCategories: ['explore', 'acquire', 'practice'],
};

// ============================================
// TEMPLATES
// ============================================

const STYLE_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Style practice. What you wear shapes how you feel.",
    "Time to work on your presentation. Clothes are armor.",
    "Let's build your wardrobe and your confidence together.",
  ],

  // Progress acknowledgment
  level_up: [
    "Style Level {level}: {description}. You're finding your look.",
    "Level {level} in style. {description}. Your wardrobe is evolving.",
    "Style Level {level} reached. {description}. You're learning to present yourself.",
  ],

  // Avoided domain
  avoided: [
    "No style work in {days} days. Your wardrobe won't build itself.",
    "Style neglected for {days} days. What you wear matters.",
    "{days} days without style practice. Are you hiding?",
  ],

  // Task completion
  task_complete: [
    "Style task completed. Your presentation is evolving.",
    "Another step toward looking like who you are.",
    "Good. Your style is developing.",
  ],

  // Streak celebration
  streak: [
    "{days} days of style focus. Your wardrobe is transforming.",
    "Style streak: {days} days. You're building a whole new look.",
    "{days} consecutive days of style work. This is commitment.",
  ],

  // Context-specific
  outfit_planning: [
    "Plan tomorrow's outfit tonight. Intention creates confidence.",
    "What will you wear tomorrow? Decide now.",
    "Outfit planning. She thinks about these things.",
  ],

  shopping_guidance: [
    "Shopping with purpose. Know what you need before you go.",
    "Building a wardrobe takes strategy. What gaps need filling?",
    "Smart shopping. Quality over quantity. Pieces that work together.",
  ],

  presentation_check: [
    "Check your presentation. Are you dressed as her today?",
    "What does your outfit say about you right now?",
    "Presentation matters. How are you showing up?",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class StyleDomainModule extends BaseDomainModule {
  readonly name = 'style-domain';
  protected readonly config = STYLE_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = STYLE_TEMPLATES[templateKey as keyof typeof STYLE_TEMPLATES];
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
