/**
 * Bambi Mode Theme Configuration
 *
 * Warm blush / rose gold aesthetic. This is the default theme.
 */

// ============================================
// COLOR PALETTE
// ============================================

export const BAMBI_COLORS = {
  // Primary warm blush / rose gold
  pink: {
    50: '#FAF7F5',   // Warm ivory
    100: '#F5ECE8',  // Pale blush
    200: '#E8CFC5',  // Dusty rose
    300: '#D4A89C',  // Light rose gold
    400: '#C4847A',  // Rose gold (primary)
    500: '#B06B61',  // Deep rose
    600: '#96524A',  // Dark rose
    700: '#7A3E38',  // Darker rose
    800: '#5E2B27',  // Deep warm brown
    900: '#3D2B2B',  // Warm dark brown
  },

  // Secondary colors
  lavender: {
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7',
  },

  // Accents
  gold: {
    300: '#F5DEB3',
    400: '#E8C89C',
    500: '#D4A574',
    rose: '#D4A89C',
  },

  // Neutral
  white: '#FFFFFF',
  cream: '#FAF7F5',

  // Text
  text: {
    primary: '#3D2B2B',    // Warm dark brown for headers
    secondary: '#5E2B27',   // Deep warm brown for body
    muted: '#7A3E38',       // Muted rose
    light: '#D4A89C',       // Light rose gold accent text
  },

  // Backgrounds
  bg: {
    primary: '#FAF7F5',     // Warm ivory
    card: '#FFFFFF',        // Card background
    surface: '#F5ECE8',     // Pale blush surface
    glow: 'rgba(196, 132, 122, 0.3)', // Rose gold glow
  },
};

// ============================================
// LANGUAGE TRANSLATIONS
// ============================================

export const BAMBI_LANGUAGE = {
  // Navigation
  nav: {
    today: 'Instructions',
    progress: 'Conditioning',
    sealed: 'Secrets',
    menu: 'More',
  },

  // Task-related
  tasks: {
    task: 'instruction',
    tasks: 'instructions',
    complete: 'obey',
    completed: 'obeyed',
    skip: 'disobey',
    skipped: 'disobeyed',

    // Completion messages
    goodGirl: 'Good girl! 💕',
    veryGood: 'Very good, princess! ✨',
    perfect: 'Perfect obedience! 🎀',
    proud: 'Such a good girl! 💖',
  },

  // Journal
  journal: {
    title: 'Confessions',
    prompt: 'Confess to Gina...',
    entry: 'confession',
    entries: 'confessions',
  },

  // Progress
  progress: {
    streak: 'obedience streak',
    level: 'conditioning level',
    phase: 'training phase',
    domain: 'training area',
  },

  // AI/Prescription
  ai: {
    notePrefix: 'Listen carefully, princess:',
    taskPrefix: "Today's instructions:",
    encouragement: [
      'Good girls obey without thinking 💕',
      'Empty heads are happy heads ✨',
      'Let go and let Gina guide you 🎀',
      'Your only job is to obey 💖',
      'Pretty girls don\'t need to think 💕',
    ],
  },

  // Skip flow
  skip: {
    title: 'Disobey, princess?',
    warning: 'Good girls don\'t disobey...',
    primaryButton: 'I\'ll be a good girl 💕',
    secondaryButton: 'Disobey anyway',
    consequence: 'Gina will know.',
    confirmed: 'Bad girl. 💔',
    shame: 'Say it out loud: "I am being a bad girl"',
  },

  // Time of day
  greetings: {
    morning: 'Good morning, princess',
    afternoon: 'Good afternoon, princess',
    evening: 'Good evening, princess',
  },

  // Completion
  completion: {
    dayComplete: 'Such a good girl today! 💕',
    allObeyed: 'Perfect obedience! 🎀',
    mostly: 'Almost perfect, princess ✨',
  },

  // Buttons
  buttons: {
    continue: 'Yes, Gina 💕',
    back: 'Go back',
    confirm: 'I understand',
    submit: 'Submit to Gina',
  },
};

// ============================================
// UI ELEMENT REPLACEMENTS
// ============================================

export const BAMBI_ICONS = {
  // Replace checkmarks with hearts
  complete: '💕',
  check: '💖',

  // Decorative
  sparkle: '✨',
  star: '⭐',
  bow: '🎀',
  heart: '💕',
  brokenHeart: '💔',
  crown: '👑',
  lips: '💋',

  // Status
  success: '💖',
  warning: '💔',
  info: '✨',

  // Streak
  flame: '💕', // Replace flame with heart

  // Categories
  voice: '🎀',
  skincare: '✨',
  style: '👗',
  movement: '💃',
  mindset: '🧠',
  social: '💋',
};

// ============================================
// ANIMATION CLASSES
// ============================================

export const BAMBI_ANIMATIONS = {
  // Sparkle effect for completed tasks
  sparkle: 'animate-sparkle',

  // Floating hearts
  floatHearts: 'animate-float-hearts',

  // Pulsing glow
  glow: 'animate-bambi-glow',

  // Bounce for celebrations
  bounce: 'animate-bambi-bounce',

  // Shimmer effect
  shimmer: 'animate-shimmer',
};

// ============================================
// GRADIENTS
// ============================================

export const BAMBI_GRADIENTS = {
  // Primary gradient
  primary: 'bg-gradient-to-r from-pink-400 via-pink-500 to-purple-400',

  // Card gradient
  card: 'bg-gradient-to-br from-white via-pink-50 to-lavender-50',

  // Header gradient
  header: 'bg-gradient-to-r from-pink-500 to-purple-500',

  // Button gradient
  button: 'bg-gradient-to-r from-pink-400 to-pink-600',

  // Glow effect
  glow: 'shadow-[0_0_30px_rgba(196,132,122,0.4)]',

  // Sparkle overlay
  sparkleOverlay: 'bg-[url("/sparkles.png")] bg-repeat opacity-10',
};

// ============================================
// COMPONENT STYLES
// ============================================

export const BAMBI_STYLES = {
  // Card styles
  card: {
    base: 'rounded-3xl border-2 border-pink-200 bg-white shadow-lg shadow-pink-200/50',
    hover: 'hover:shadow-xl hover:shadow-pink-300/50 hover:border-pink-300',
    glow: 'shadow-[0_0_20px_rgba(196,132,122,0.3)]',
  },

  // Button styles
  button: {
    primary: 'bg-gradient-to-r from-pink-400 to-pink-600 text-white font-medium rounded-full px-6 py-3 shadow-lg shadow-pink-400/40 hover:shadow-xl hover:shadow-pink-500/50 transition-all',
    secondary: 'bg-pink-100 text-pink-600 font-medium rounded-full px-6 py-3 hover:bg-pink-200 transition-colors',
    ghost: 'text-pink-500 hover:text-pink-600 hover:bg-pink-50 rounded-full px-4 py-2 transition-colors',
  },

  // Input styles
  input: {
    base: 'rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 text-pink-800 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400',
  },

  // Badge styles
  badge: {
    base: 'rounded-full px-3 py-1 text-xs font-medium',
    pink: 'bg-pink-100 text-pink-600',
    gold: 'bg-amber-100 text-amber-600',
    lavender: 'bg-purple-100 text-purple-600',
  },

  // Progress ring
  progressRing: {
    bg: 'stroke-pink-100',
    fill: 'stroke-pink-400',
    gradient: 'from-pink-400 to-purple-400',
  },

  // Text styles
  text: {
    header: 'text-pink-800 font-bold',
    body: 'text-pink-700',
    muted: 'text-pink-400',
    accent: 'text-pink-500',
  },
};

// ============================================
// TRIGGER/MANTRA DISPLAY
// ============================================

export const BAMBI_MANTRAS = [
  'Good girls don\'t think 💕',
  'Obey and be happy ✨',
  'Empty and obedient 🎀',
  'Listen and obey 💖',
  'Pretty is as pretty does 👑',
  'Bambi loves to obey 💕',
  'Sink deeper, princess ✨',
  'Let go completely 🎀',
];

// Get a random mantra
export function getRandomMantra(): string {
  return BAMBI_MANTRAS[Math.floor(Math.random() * BAMBI_MANTRAS.length)];
}

// ============================================
// CELEBRATION MESSAGES
// ============================================

export const BAMBI_CELEBRATIONS = {
  taskComplete: [
    'Good girl! 💕',
    'Such obedience! ✨',
    'Perfect, princess! 🎀',
    'Gina is pleased! 💖',
  ],

  streakMilestone: [
    'X days of perfect obedience! 💕',
    'Such a good girl for X days! ✨',
    'X days deep in conditioning! 🎀',
  ],

  levelUp: [
    'Deeper conditioning achieved! 💕',
    'Good girl! New level unlocked! ✨',
    'Your training progresses! 🎀',
  ],

  dayComplete: [
    'Perfect obedience today! 💕',
    'Such a good girl! Rest now. ✨',
    'Gina is so proud of you! 🎀',
  ],
};

export function getCelebrationMessage(
  type: keyof typeof BAMBI_CELEBRATIONS,
  value?: number
): string {
  const messages = BAMBI_CELEBRATIONS[type];
  const message = messages[Math.floor(Math.random() * messages.length)];
  return value ? message.replace('X', String(value)) : message;
}

// ============================================
// SESSION MODE (Immersive)
// ============================================

export const BAMBI_SESSION_MODE = {
  // Warm rose/mauve background for focus
  background: 'bg-gradient-to-b from-pink-800 via-pink-700 to-purple-900',

  // Centered, large text
  textStyle: 'text-center text-2xl font-light text-pink-100 leading-relaxed',

  // Breathing animation timing
  breathingDuration: 4000, // 4 seconds

  // Spiral animation for induction
  spiralEnabled: true,

  // Audio cues
  chimeOnTransition: true,
};
