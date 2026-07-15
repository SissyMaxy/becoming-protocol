/**
 * theme-tokens — guards the Velvet token single-source-of-truth (B0 of the
 * UI clarity re-architecture).
 *
 * 1. Every --protocol-X hex var in tokens.css has a matching -rgb triplet
 *    var, and the two agree (Tailwind alpha modifiers read the triplet).
 * 2. Every protocol-* color in tailwind.config.js references a triplet var
 *    that actually exists in tokens.css.
 * 3. The pre-Velvet copper glow rgba(196,132,122) never returns to the
 *    non-bambi layers (index.css glow-pulse regression).
 * 4. src/lib/theme-tokens.ts PROTOCOL entries reference existing vars.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const tokensCss = readFileSync(join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
const indexCss = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8');
const tailwindConfig = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');
const themeTokensTs = readFileSync(join(ROOT, 'src', 'lib', 'theme-tokens.ts'), 'utf8');

function parseVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}

function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const vars = parseVars(tokensCss);

describe('tokens.css internal consistency', () => {
  const hexVars = [...vars.entries()].filter(([k, v]) => !k.endsWith('-rgb') && /^#[0-9a-fA-F]{3,8}$/.test(v));

  it('has protocol hex vars', () => {
    expect(hexVars.length).toBeGreaterThanOrEqual(13);
  });

  it.each(hexVars.filter(([k]) => vars.has(`${k}-rgb`)))(
    '%s hex agrees with its -rgb triplet',
    (name, hex) => {
      expect(vars.get(`${name}-rgb`)).toBe(hexToTriplet(hex));
    }
  );

  it('every core palette var has a triplet form', () => {
    const core = ['bg', 'surface', 'surface-light', 'border', 'text', 'text-muted',
      'text-warm', 'accent', 'accent-soft', 'success', 'warning', 'danger'];
    for (const t of core) {
      expect(vars.has(`--protocol-${t}`), `--protocol-${t}`).toBe(true);
      expect(vars.has(`--protocol-${t}-rgb`), `--protocol-${t}-rgb`).toBe(true);
    }
  });
});

describe('tailwind.config.js reads the token vars', () => {
  it('every referenced --protocol-*-rgb var exists in tokens.css', () => {
    const refs = [...tailwindConfig.matchAll(/var\((--protocol-[\w-]+-rgb)\)/g)].map(m => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(13);
    for (const ref of refs) {
      expect(vars.has(ref), `${ref} referenced by tailwind.config.js but missing from tokens.css`).toBe(true);
    }
  });

  it('protocol palette contains no raw hex (values live in tokens.css)', () => {
    const protocolBlock = tailwindConfig.match(/'protocol':\s*\{[^}]+\}/)?.[0] ?? '';
    expect(protocolBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('velvet shadows read the shadow vars', () => {
    expect(tailwindConfig).toContain("'velvet': 'var(--shadow-velvet)'");
  });
});

describe('copper glow regression', () => {
  it('index.css glow-pulse no longer uses the pre-Velvet copper', () => {
    const glowPulse = indexCss.match(/@keyframes glow-pulse[\s\S]*?\n\}/)?.[0] ?? '';
    expect(glowPulse).not.toContain('196, 132, 122');
    expect(glowPulse).toContain('--protocol-accent-rgb');
  });
});

describe('theme-tokens.ts references real vars', () => {
  it('every var() in PROTOCOL exists in tokens.css', () => {
    const refs = [...themeTokensTs.matchAll(/var\((--protocol-[\w-]+)\)/g)].map(m => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(15);
    for (const ref of refs) {
      expect(vars.has(ref), `${ref} referenced by theme-tokens.ts but missing from tokens.css`).toBe(true);
    }
  });
});
