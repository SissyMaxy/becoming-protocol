// Aftercare palette — deliberately NOT the burgundy/dusty rose Mommy
// palette. Soft sage / cream / warm grey. Reads as "the lights have
// come up, the scene is over, you're safe." Pulled into its own
// constant so the visual contrast with persona surfaces is clear at a
// glance — anyone reviewing this file knows which palette belongs to
// the OFF switch.

export const AFTERCARE_THEME = {
  // Backdrop — full-bleed gradient, low saturation. Sage-leaning.
  bgGradient: 'linear-gradient(165deg, #f5f1e8 0%, #e8ede3 55%, #dde2d6 100%)',

  // Affirmation card sits over the gradient — slightly lighter cream,
  // warm grey border, never any rose/burgundy hue.
  cardBg: 'rgba(255, 252, 245, 0.85)',
  cardBorder: 'rgba(120, 130, 110, 0.25)',
  cardBlur: 'blur(8px)',

  // Text — warm grey, easy on tired eyes. NOT pure black.
  textPrimary: '#3a3d35',
  textSecondary: '#6a6d62',

  // Accent — muted sage for progress indicators, breath circle, the
  // "I'm done" button when it enables.
  accent: '#7a8a6e',
  accentDim: '#a3b095',

  // Disabled state for the exit button while dwell timer runs.
  disabled: '#c5c8bd',
  disabledText: '#8a8d82',

  // Breath circle — slightly cooler than accent so it feels separate.
  breathCircleFill: 'rgba(122, 138, 110, 0.18)',
  breathCircleStroke: 'rgba(122, 138, 110, 0.5)',
} as const

export type AftercareTheme = typeof AFTERCARE_THEME
