/**
 * theme-tokens — the ONLY sanctioned way to use protocol colors from
 * TypeScript (inline styles, canvas, SVG strokes, chart configs).
 *
 * Values are CSS custom properties defined in src/styles/tokens.css — the
 * single source of truth. Use PROTOCOL.* wherever a CSS color string works
 * (inline style, SVG fill/stroke attributes). Use resolveToken() only where
 * a literal color value is required at runtime (canvas 2D contexts,
 * color-math). Do not copy hex values into components; ui-lint flags new
 * raw hex literals in src/components.
 */

export const PROTOCOL = {
  bg: 'var(--protocol-bg)',
  bgDeep: 'var(--protocol-bg-deep)',
  bgWarm: 'var(--protocol-bg-warm)',
  surface: 'var(--protocol-surface)',
  surfaceLight: 'var(--protocol-surface-light)',
  border: 'var(--protocol-border)',
  text: 'var(--protocol-text)',
  textMuted: 'var(--protocol-text-muted)',
  textWarm: 'var(--protocol-text-warm)',
  accent: 'var(--protocol-accent)',
  accentSoft: 'var(--protocol-accent-soft)',
  accentHover: 'var(--protocol-accent-hover)',
  accentBright: 'var(--protocol-accent-bright)',
  success: 'var(--protocol-success)',
  warning: 'var(--protocol-warning)',
  danger: 'var(--protocol-danger)',
} as const;

/**
 * Rose accent with alpha — for glows, washes, and gradient stops that need
 * transparency without inventing a new hex.
 */
export function accentAlpha(alpha: number): string {
  return `rgb(var(--protocol-accent-rgb) / ${alpha})`;
}

/**
 * Resolve a `--protocol-*` custom property to its literal value (e.g.
 * '#c9557f') for consumers that cannot use var() — canvas gradients,
 * getImageData comparisons. Returns empty string outside the DOM.
 */
export function resolveToken(varName: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}
