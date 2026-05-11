// Standalone reproducer of voice-gate.mjs on ONE file. Prints every hit
// and the path-exempt check result. Use to diagnose Linux vs Windows drift.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const file = 'supabase/functions/mommy-self-audit/index.ts';
const PATH_EXEMPT = (p) =>
  /[/\\](legal|tos|terms)[/\\]/.test(p) ||
  /\.(test|spec)\.(ts|tsx|mjs|js)$/.test(p) ||
  /[/\\]node_modules[/\\]/.test(p);

console.log('platform:', process.platform);
console.log('node:', process.version);
console.log('cwd:', process.cwd());
console.log('file path-exempt:', PATH_EXEMPT(file));
console.log('file stat:', statSync(file).size, 'bytes');

const BANNED = [
  { name: 'role-play', re: /['"`][^'"`\n]*\brole[\s-]?play(s|ing|ed|er|ers)?\b[^'"`\n]*['"`]/i },
  { name: 'simulation', re: /['"`][^'"`\n]*\bsimulat(ion|ions|ed|ing|or|ors)\b[^'"`\n]*['"`]/i },
  { name: 'fiction', re: /['"`][^'"`\n]*\bfiction(al|ally)?\b[^'"`\n]*['"`]/i },
  { name: 'not-medical-advice', re: /['"`][^'"`\n]*not\s+medical\s+advice[^'"`\n]*['"`]/i },
  { name: 'intake', re: /['"`][^'"`\n]*\bintake\b[^'"`\n]*['"`]/i },
  { name: 'questionnaire', re: /['"`][^'"`\n]*\bquestionnaire\b[^'"`\n]*['"`]/i },
  { name: 'disclaimer', re: /['"`][^'"`\n]*\bdisclaimer(s)?\b[^'"`\n]*['"`]/i },
  { name: 'for-entertainment', re: /['"`][^'"`\n]*for\s+entertainment(\s+(only|purposes))?\b[^'"`\n]*['"`]/i },
  { name: 'consent-to-fantasy', re: /['"`][^'"`\n]*consent\s+to\s+(the\s+)?(fantasy|simulation|scene)[^'"`\n]*['"`]/i },
];

const text = readFileSync(file, 'utf8');
const lines = text.split('\n');
console.log('line count:', lines.length);
console.log('line 294 raw:', JSON.stringify(lines[293]));
console.log('line 304 raw:', JSON.stringify(lines[303]));
console.log('line 392 raw (first 200):', JSON.stringify((lines[391] || '').slice(0, 200)));
const l294 = lines[293] || '';
const l294strip = l294.replace(/\/\/.*$/, '');
console.log('line 294 stripped:', JSON.stringify(l294strip));
console.log('line 294 strip differs from raw:', l294 !== l294strip);

let totalHits = 0;
for (const p of BANNED) {
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.includes('voice-gate: ok')) continue;
    const codeOnly = raw.replace(/\/\/.*$/, '');
    if (p.re.test(codeOnly)) {
      console.log(`  ${p.name} line ${i + 1}: ${raw.trim().slice(0, 100)}`);
      totalHits++;
    }
  }
}
console.log('total hits:', totalHits);
