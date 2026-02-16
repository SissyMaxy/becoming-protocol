import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(__dirname, '..');
const SERVER_DIR = join(__dirname, '..', '..', '..', 'server');

/**
 * Recursively collect all .js/.jsx source files under a directory,
 * excluding node_modules, __tests__, and dist directories.
 */
function collectSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      collectSourceFiles(full, files);
    } else if (['.js', '.jsx'].includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

describe('Privacy Verification (7.7)', () => {
  const clientFiles = collectSourceFiles(CLIENT_SRC);
  const serverFiles = collectSourceFiles(SERVER_DIR);
  const allSourceFiles = [...clientFiles, ...serverFiles];

  it('no audio data is sent to external URLs from client', () => {
    const externalUrlPattern = /fetch\s*\(\s*['"`](https?:\/\/(?!localhost))/;
    const violations = [];

    for (const file of clientFiles) {
      const content = readFileSync(file, 'utf-8');
      if (externalUrlPattern.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no hardcoded API keys in source files', () => {
    const apiKeyPatterns = [
      /sk-ant-[a-zA-Z0-9_-]{20,}/,
      /AKIA[A-Z0-9]{16}/,
      /['"`]sk-[a-zA-Z0-9_-]{32,}['"`]/,
    ];

    const violations = [];

    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of apiKeyPatterns) {
        if (pattern.test(content)) {
          violations.push({ file, pattern: pattern.source });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('API key is read from process.env, not hardcoded', () => {
    const coachRoute = join(SERVER_DIR, 'routes', 'coach.js');
    const content = readFileSync(coachRoute, 'utf-8');

    expect(content).toContain('process.env.ANTHROPIC_API_KEY');
    expect(content).not.toMatch(/new Anthropic\(\s*\{\s*apiKey:\s*['"`]sk-/);
  });

  it('client never directly imports or references Anthropic SDK', () => {
    const violations = [];

    for (const file of clientFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('@anthropic-ai/sdk') || content.includes('new Anthropic')) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no WebSocket, sendBeacon, or XMLHttpRequest to external hosts in client', () => {
    const patterns = [
      /new WebSocket\s*\(\s*['"`]wss?:\/\/(?!localhost)/,
      /navigator\.sendBeacon\s*\(\s*['"`]https?:\/\/(?!localhost)/,
      /XMLHttpRequest/,
    ];

    const violations = [];

    for (const file of clientFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push({ file, pattern: pattern.source });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
