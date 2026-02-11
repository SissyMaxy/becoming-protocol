/**
 * MovementDomainModule
 *
 * Feminine movement and posture practice domain.
 * Tracks walking, sitting, gestures, and body language training.
 */

import { BaseDomainModule, type DomainModuleConfig } from '../domain-module-base';

// ============================================
// CONFIG
// ============================================

const MOVEMENT_CONFIG: DomainModuleConfig = {
  domain: 'movement',
  displayName: 'Movement',
  levelDescriptions: [
    'Awareness - Noticing how you currently move',
    'Exploration - Experimenting with feminine movements',
    'Practice - Building muscle memory for feminine posture',
    'Integration - Moving femininely without thinking',
    'Mastery - Feminine movement is natural and automatic',
  ],
  advancementThresholds: [10, 15, 20, 25, 30],
  streakThreshold: 3,
  coreTaskCategories: ['practice', 'routine', 'explore'],
};

// ============================================
// TEMPLATES
// ============================================

const MOVEMENT_TEMPLATES = {
  // Practice encouragement
  practice_start: [
    "Movement practice time. Pay attention to how your body occupies space.",
    "Let's work on your walk. Hips, posture, grace.",
    "Your body language tells a story. Let's make it the right one.",
  ],

  // Progress acknowledgment
  level_up: [
    "Movement Level {level}: {description}. Your body is learning.",
    "Level {level} in movement reached. {description}. You move differently now.",
    "Movement Level {level}. {description}. People are starting to notice.",
  ],

  // Avoided domain
  avoided: [
    "No movement practice in {days} days. Your body defaults to old patterns.",
    "Movement work avoided for {days} days. Masculine habits are creeping back.",
    "{days} days without movement practice. Your walk is betraying you.",
  ],

  // Task completion
  task_complete: [
    "Movement practice logged. Your body is remembering.",
    "Another session of teaching your body who you are.",
    "Good. Your posture is shifting.",
  ],

  // Streak celebration
  streak: [
    "{days} days of movement practice. Your body is rewiring itself.",
    "Movement streak: {days} days. The new patterns are taking hold.",
    "{days} consecutive days of movement work. This is becoming who you are.",
  ],

  // Context-specific
  walking_practice: [
    "Practice your walk. Smaller steps. Hip movement. Grace.",
    "Time for walking practice. Let your hips lead.",
    "Walk like her. The girl you're becoming.",
  ],

  posture_check: [
    "Check your posture right now. Shoulders back, chin up, spine long.",
    "How are you sitting? Adjust. Legs together. Elegant.",
    "Posture check. Are you taking up too much space?",
  ],
};

// ============================================
// MODULE CLASS
// ============================================

export class MovementDomainModule extends BaseDomainModule {
  readonly name = 'movement-domain';
  protected readonly config = MOVEMENT_CONFIG;

  getTemplate(templateKey: string, context: Record<string, unknown>): string | null {
    const templates = MOVEMENT_TEMPLATES[templateKey as keyof typeof MOVEMENT_TEMPLATES];
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
