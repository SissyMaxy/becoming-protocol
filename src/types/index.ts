// Intensity levels for daily protocol
export type Intensity = 'crazy' | 'normal' | 'spacious';

// Time blocks for organizing tasks
export type TimeBlock = 'morning' | 'day' | 'evening';

// Domain categories for tracking different aspects of feminization
export type Domain =
  | 'voice'
  | 'movement'
  | 'skincare'
  | 'style'
  | 'social'
  | 'mindset'
  | 'body';

// Sensory guidance for immersive task experience
export interface SensoryGuidance {
  think?: string;      // Mental focus / mantra / mindset
  feel?: string;       // Physical sensations to notice
  see?: string;        // What to visualize or look at
  smell?: string;      // Scents to incorporate
  taste?: string;      // Taste-related guidance
  listen?: string;     // Audio / music recommendations
}

// Ambiance settings for task environment
export interface TaskAmbiance {
  lighting?: string;   // e.g., "Soft pink lighting", "Candlelit"
  music?: string;      // e.g., "Lo-fi beats", "Meditation music"
  environment?: string; // e.g., "Bathroom with steam", "Bedroom mirror"
}

// Clear task instructions
export interface TaskInstructions {
  overview: string;           // Brief summary of what this task is
  preparation?: string;       // What to prepare before starting
  steps: string[];            // Numbered step-by-step instructions
  goal: string;               // What success looks like
  tips?: string[];            // Helpful tips for better results
  commonMistakes?: string[];  // What to avoid
}

// Success indicators and sensory cues for task completion
export interface WhatToNotice {
  successIndicators?: string[];  // "You'll know it's working when..."
  sensoryCues?: string[];        // Specific body sensations to pay attention to
  progressMarkers?: string[];    // Signs of improvement over time
}

// A single task in the protocol
export interface ProtocolTask {
  id: string;
  title: string;
  description?: string;
  domain: Domain;
  timeBlock: TimeBlock;
  duration?: number; // in minutes
  baseIntensity: Intensity; // minimum intensity level to include this task
  completed: boolean;
  // Clear instructions
  instructions?: TaskInstructions;
  // Rich immersive content
  sensory?: SensoryGuidance;
  ambiance?: TaskAmbiance;
  imageUrl?: string;   // Hero image for the task
  affirmation?: string; // Affirmation to repeat during/after
  // Enhanced contextual content
  whyItMatters?: string;           // Context explaining why this task helps feminization
  whatToNotice?: WhatToNotice;     // Success indicators & sensory cues
  commonExperiences?: string[];    // Emotional scaffolding quotes from others
  resourceIds?: string[];          // References to task_resources table
}

// Journal entry for evening reflection
export interface JournalEntry {
  alignmentScore: number; // 1-10
  euphoriaNote: string;
  dysphoriaNote: string;
  insights: string;
}

// A complete daily entry
export interface DailyEntry {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  intensity: Intensity;
  tasks: ProtocolTask[];
  journal?: JournalEntry;
  createdAt: string;
  updatedAt: string;
}

// Progress tracking for domains
export interface DomainProgress {
  domain: Domain;
  level: number; // 1-10
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  lastActiveDate?: string;
}

// Phase progression through the protocol
export interface PhaseProgress {
  currentPhase: number; // 1-4 typically
  phaseName: string;
  daysInPhase: number;
  phaseStartDate: string;
}

// Overall user progress
export interface UserProgress {
  overallStreak: number;
  longestStreak: number;
  totalDays: number;
  domainProgress: DomainProgress[];
  phase: PhaseProgress;
  lastActiveDate?: string;
}

// App state
export interface AppState {
  currentEntry: DailyEntry | null;
  progress: UserProgress;
  history: DailyEntry[];
}

// Domain display information
export interface DomainInfo {
  domain: Domain;
  label: string;
  icon: string;
  color: string;
  description: string;
}

// Phase definitions
export interface PhaseDefinition {
  phase: number;
  name: string;
  description: string;
  durationDays: number;
  focus: Domain[];
}

// Re-export all types from submodules
export * from './rewards';
export * from './lovense';
export * from './arousal';
export * from './edge-session';
export * from './investments';
export * from './ratchets';
export * from './task-templates';
export * from './escalation';
export * from './profile';
export * from './gina';
export * from './handler';
export * from './scheduled-ambush';
export * from './resistance';
export * from './gina-discovery';
export * from './bambi';
export * from './content-permanence';
export * from './hrt';
