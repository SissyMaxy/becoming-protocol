/**
 * Bambi Mode Context
 *
 * Provides theme and language configuration based on whether the user
 * has a "Bambi" variant name. Creates a completely different app experience
 * with hot pink colors, hearts, sparkles, and directive language.
 */

import React, { createContext, useContext, useMemo, useCallback, useState } from 'react';
import { useProtocol } from './ProtocolContext';
import {
  BAMBI_COLORS,
  BAMBI_LANGUAGE,
  BAMBI_ICONS,
  BAMBI_STYLES,
  BAMBI_CELEBRATIONS,
  getRandomMantra,
  getCelebrationMessage,
} from '../themes/bambi';

// ============================================
// TYPES
// ============================================

interface BambiTheme {
  colors: typeof BAMBI_COLORS;
  styles: typeof BAMBI_STYLES;
  icons: typeof BAMBI_ICONS;
}

interface BambiLanguage {
  nav: typeof BAMBI_LANGUAGE.nav;
  tasks: typeof BAMBI_LANGUAGE.tasks;
  journal: typeof BAMBI_LANGUAGE.journal;
  progress: typeof BAMBI_LANGUAGE.progress;
  ai: typeof BAMBI_LANGUAGE.ai;
  skip: typeof BAMBI_LANGUAGE.skip;
  greetings: typeof BAMBI_LANGUAGE.greetings;
  completion: typeof BAMBI_LANGUAGE.completion;
  buttons: typeof BAMBI_LANGUAGE.buttons;
}

interface BambiModeContextType {
  // Core detection
  isBambiMode: boolean;

  // Theme
  theme: BambiTheme;

  // Language
  language: BambiLanguage;

  // Utilities
  getMantra: () => string;
  getCelebration: (type: keyof typeof BAMBI_CELEBRATIONS, value?: number) => string;
  getGreeting: () => string;
  getRandomEncouragement: () => string;

  // UI utilities
  cn: (...classes: (string | boolean | undefined | null)[]) => string;
  cardClass: string;
  buttonPrimaryClass: string;
  buttonSecondaryClass: string;
  inputClass: string;
  textClass: string;
  textMutedClass: string;
  accentClass: string;
  bgClass: string;

  // Hearts animation
  triggerHearts: () => void;
  showingHearts: boolean;
}

// ============================================
// DETECTION FUNCTION
// ============================================

/**
 * Detect if user is in Bambi mode based on their name
 */
export function detectBambiMode(userName: string | null): boolean {
  if (!userName) return false;
  const name = userName.toLowerCase().trim();
  return (
    name === 'bambi' ||
    name === 'bambi sleep' ||
    name === 'bimbo' ||
    name.includes('bambi') ||
    name.includes('bimbo') ||
    name === 'princess' ||
    name === 'doll' ||
    name === 'dolly'
  );
}

// ============================================
// DEFAULT VALUES (Normal mode)
// ============================================

const defaultTheme: BambiTheme = {
  colors: BAMBI_COLORS,
  styles: BAMBI_STYLES,
  icons: BAMBI_ICONS,
};

const normalLanguage: BambiLanguage = {
  nav: {
    today: 'Today',
    progress: 'Progress',
    sealed: 'Sealed',
    menu: 'Menu',
  },
  tasks: {
    task: 'task',
    tasks: 'tasks',
    complete: 'complete',
    completed: 'completed',
    skip: 'skip',
    skipped: 'skipped',
    goodGirl: 'Great job!',
    veryGood: 'Well done!',
    perfect: 'Perfect!',
    proud: 'Keep it up!',
  },
  journal: {
    title: 'Journal',
    prompt: 'Write your thoughts...',
    entry: 'entry',
    entries: 'entries',
  },
  progress: {
    streak: 'streak',
    level: 'level',
    phase: 'phase',
    domain: 'domain',
  },
  ai: {
    notePrefix: 'Today\'s focus:',
    taskPrefix: 'Today\'s tasks:',
    encouragement: [
      'You\'re making great progress!',
      'Consistency is key!',
      'Every step counts!',
      'Keep going!',
      'You\'ve got this!',
    ],
  },
  skip: {
    title: 'Skip this task?',
    warning: 'Consider your commitment.',
    primaryButton: 'I\'ll do it',
    secondaryButton: 'Skip anyway',
    consequence: 'This will be recorded.',
    confirmed: 'Task skipped.',
    shame: '',
  },
  greetings: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  },
  completion: {
    dayComplete: 'Day complete!',
    allObeyed: 'All tasks done!',
    mostly: 'Almost there!',
  },
  buttons: {
    continue: 'Continue',
    back: 'Back',
    confirm: 'Confirm',
    submit: 'Submit',
  },
};

// ============================================
// CONTEXT
// ============================================

const BambiModeContext = createContext<BambiModeContextType | undefined>(undefined);

export function BambiModeProvider({ children }: { children: React.ReactNode }) {
  const { userName } = useProtocol();
  const [showingHearts, setShowingHearts] = useState(false);

  const isBambiMode = useMemo(() => detectBambiMode(userName), [userName]);

  // Get time-based greeting
  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    const lang = isBambiMode ? BAMBI_LANGUAGE : normalLanguage;

    if (hour < 12) return lang.greetings.morning;
    if (hour < 18) return lang.greetings.afternoon;
    return lang.greetings.evening;
  }, [isBambiMode]);

  // Get random encouragement
  const getRandomEncouragement = useCallback(() => {
    const encouragements = isBambiMode
      ? BAMBI_LANGUAGE.ai.encouragement
      : normalLanguage.ai.encouragement;
    return encouragements[Math.floor(Math.random() * encouragements.length)];
  }, [isBambiMode]);

  // Conditional class name helper
  const cn = useCallback(
    (...classes: (string | boolean | undefined | null)[]) => {
      return classes.filter(Boolean).join(' ');
    },
    []
  );

  // Trigger hearts animation
  const triggerHearts = useCallback(() => {
    if (!isBambiMode) return;
    setShowingHearts(true);
    setTimeout(() => setShowingHearts(false), 3000);
  }, [isBambiMode]);

  // Memoized class names based on mode
  const cardClass = useMemo(
    () => (isBambiMode ? 'bambi-card bambi-card-hover' : 'card'),
    [isBambiMode]
  );

  const buttonPrimaryClass = useMemo(
    () => (isBambiMode ? 'bambi-btn-primary' : 'btn-primary'),
    [isBambiMode]
  );

  const buttonSecondaryClass = useMemo(
    () => (isBambiMode ? 'bambi-btn-secondary' : 'btn-secondary'),
    [isBambiMode]
  );

  const inputClass = useMemo(
    () =>
      isBambiMode
        ? 'bambi-input'
        : 'rounded-lg border border-protocol-border bg-protocol-surface px-4 py-3 text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent',
    [isBambiMode]
  );

  const textClass = useMemo(
    () => (isBambiMode ? 'text-pink-900' : 'text-protocol-text'),
    [isBambiMode]
  );

  const textMutedClass = useMemo(
    () => (isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'),
    [isBambiMode]
  );

  const accentClass = useMemo(
    () => (isBambiMode ? 'text-pink-500' : 'text-protocol-accent'),
    [isBambiMode]
  );

  const bgClass = useMemo(
    () => (isBambiMode ? 'bambi-mode' : 'bg-protocol-bg'),
    [isBambiMode]
  );

  const value: BambiModeContextType = useMemo(
    () => ({
      isBambiMode,
      theme: defaultTheme,
      language: isBambiMode ? BAMBI_LANGUAGE : normalLanguage,
      getMantra: getRandomMantra,
      getCelebration: getCelebrationMessage,
      getGreeting,
      getRandomEncouragement,
      cn,
      cardClass,
      buttonPrimaryClass,
      buttonSecondaryClass,
      inputClass,
      textClass,
      textMutedClass,
      accentClass,
      bgClass,
      triggerHearts,
      showingHearts,
    }),
    [
      isBambiMode,
      getGreeting,
      getRandomEncouragement,
      cn,
      cardClass,
      buttonPrimaryClass,
      buttonSecondaryClass,
      inputClass,
      textClass,
      textMutedClass,
      accentClass,
      bgClass,
      triggerHearts,
      showingHearts,
    ]
  );

  return (
    <BambiModeContext.Provider value={value}>
      {children}
    </BambiModeContext.Provider>
  );
}

export function useBambiMode(): BambiModeContextType {
  const context = useContext(BambiModeContext);
  if (context === undefined) {
    throw new Error('useBambiMode must be used within a BambiModeProvider');
  }
  return context;
}

// ============================================
// FLOATING HEARTS COMPONENT
// ============================================

export function FloatingHearts() {
  const { showingHearts, isBambiMode } = useBambiMode();

  if (!showingHearts || !isBambiMode) return null;

  const hearts = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    size: Math.random() * 0.5 + 0.8,
  }));

  return (
    <div className="bambi-hearts-container">
      {hearts.map((heart) => (
        <span
          key={heart.id}
          className="bambi-heart"
          style={{
            left: heart.left,
            animationDelay: heart.delay,
            transform: `scale(${heart.size})`,
          }}
        >
          💕
        </span>
      ))}
    </div>
  );
}
