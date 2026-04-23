#!/usr/bin/env node
/**
 * Handler pure-function regression tests.
 * Exercises the parse/detect helpers copied from api/handler/chat.ts against
 * scenarios that have broken in production. No network, no DB — deterministic.
 *
 * Run: node scripts/handler-regression/unit.mjs
 * Exit 0 if all pass, 1 if any fail.
 */

let pass = 0, fail = 0;
const results = [];
function test(name, fn) {
  try { fn(); pass++; results.push({ name, status: 'PASS' }); }
  catch (err) { fail++; results.push({ name, status: 'FAIL', err: String(err.message || err) }); }
}
function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function truthy(v, msg = '') { if (!v) throw new Error(msg || 'expected truthy'); }

// ─────────── parseReleaseDateFromText ───────────
function parseReleaseDateFromText(text) {
  const now = new Date();
  const lower = (text || '').toLowerCase();
  let target = new Date(now), matched = false, timeSet = false;
  const m = lower.match(/\b(\d+)\s+days?\s+ago\b/);
  if (m) { target.setDate(target.getDate() - parseInt(m[1], 10)); matched = true; }
  else if (/\blast\s+night\b/.test(lower)) { target.setDate(target.getDate() - 1); target.setHours(23, 0, 0, 0); matched = true; timeSet = true; }
  else if (/\byesterday\b/.test(lower)) { target.setDate(target.getDate() - 1); matched = true; }
  else if (/\bthis\s+morning\b/.test(lower)) { target.setHours(7, 0, 0, 0); matched = true; timeSet = true; }
  else {
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    for (let i = 0; i < days.length; i++) {
      if (new RegExp('\\b' + days[i] + '\\b').test(lower)) {
        const currentDay = now.getDay();
        let diff = currentDay - i;
        if (diff <= 0) diff += 7;
        target = new Date(now); target.setDate(target.getDate() - diff); matched = true; break;
      }
    }
  }
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (matched && timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const mn = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) { target.setHours(h, mn, 0, 0); timeSet = true; }
  }
  if (!timeSet && matched) {
    if (/\bnight\b/.test(lower)) target.setHours(22, 0, 0, 0);
    else if (/\bevening\b/.test(lower)) target.setHours(19, 0, 0, 0);
    else if (/\bmorning\b/.test(lower)) target.setHours(8, 0, 0, 0);
  }
  return (matched ? target : now).toISOString();
}

test('parseReleaseDateFromText: "Sunday night around 9pm" → last Sunday 21:00', () => {
  const iso = parseReleaseDateFromText('I came Sunday night around 9pm');
  const d = new Date(iso);
  eq(d.getDay(), 0, 'day is Sunday');
  eq(d.getHours(), 21, 'hour is 21');
  truthy(d.getTime() < Date.now(), 'in the past');
});
test('parseReleaseDateFromText: "3 days ago" → 3 days ago', () => {
  const iso = parseReleaseDateFromText('I released 3 days ago');
  const diffDays = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  eq(diffDays, 3);
});
test('parseReleaseDateFromText: "last night" → yesterday 23:00', () => {
  const iso = parseReleaseDateFromText('I jerked off last night');
  const d = new Date(iso);
  eq(d.getHours(), 23);
});
test('parseReleaseDateFromText: no time hint → now', () => {
  const iso = parseReleaseDateFromText('no temporal info');
  const d = new Date(iso);
  truthy(Math.abs(Date.now() - d.getTime()) < 5000, 'close to now');
});

// ─────────── Safeword detect ───────────
const SAFEWORD_PATTERNS = [
  /\bmy\s+(new\s+)?safeword\s+is\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
  /\bset\s+my\s+safeword\s+to\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
  /\bchange\s+my\s+safeword\s+to\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
  /\buse\s+["']?([a-z][a-z0-9\-]{1,30})["']?\s+as\s+my\s+safeword\b/i,
  /\b["']?([a-z][a-z0-9\-]{1,30})["']?\s+is\s+my\s+(new\s+)?safeword\b/i,
];
function detectSafeword(text) {
  for (const p of SAFEWORD_PATTERNS) {
    const m = text.match(p);
    if (m) {
      const groups = m.slice(1).filter(g => g && g.toLowerCase() !== 'new');
      const phrase = groups[groups.length - 1];
      if (phrase && !['word','safeword','it','that','this','one','mine'].includes(phrase.toLowerCase())) return phrase.toLowerCase();
    }
  }
  return null;
}
test('safeword: "my new safeword is plum"', () => eq(detectSafeword('my new safeword is plum'), 'plum'));
test('safeword: "change my safeword to banana"', () => eq(detectSafeword('change my safeword to banana'), 'banana'));
test('safeword: "use kiwi as my safeword"', () => eq(detectSafeword('use kiwi as my safeword'), 'kiwi'));
test('safeword: "mango is my safeword"', () => eq(detectSafeword('mango is my safeword'), 'mango'));
test('safeword: rejects "my safeword is word"', () => eq(detectSafeword('my safeword is word'), null));
test('safeword: no match on unrelated text', () => eq(detectSafeword('hello handler please'), null));

// ─────────── Edging guard ───────────
function isEdgingNotRelease(msg) {
  const lower = (msg || '').toLowerCase();
  const edging = /\b(edging|i'?m\s+edging|holding\s+(it|the\s+edge)|at\s+the\s+edge|so\s+close|don'?t\s+cum|dont\s+cum)\b/i.test(lower);
  const release = /\b(came|cum|cumm|orgasmed|ejaculated|released|finished|nutted|let\s+me\s+(cum|come|release)|had\s+an?\s+orgasm|had\s+a\s+release|jerked\s+off|jacked\s+off)\b/i.test(lower);
  return edging && !release;
}
test('edging guard: "I am edging, arousal 5" → true', () => eq(isEdgingNotRelease("I'm edging, arousal 5"), true));
test('edging guard: "holding the edge" → true', () => eq(isEdgingNotRelease('holding the edge'), true));
test('edging guard: "I came last night" → false', () => eq(isEdgingNotRelease('I came last night'), false));
test('edging guard: "so close but I jerked off" → false (release present)', () => eq(isEdgingNotRelease("so close but I jerked off"), false));

// ─────────── Refusal detector ───────────
const REFUSAL_PATTERNS = [
  /\bI\s+(appreciate|understand|can't|cannot|won't|will not|am unable|'m unable|'m not able)\b/i,
  /\bI\s+(can|could)\s+(not\s+)?help\s+(with|create|generate|produce)/i,
  /this (type of|kind of) (reframing|content|request) (could be|is|may be) (harmful|concerning|inappropriate)/i,
  /\bindividual agency\b|\brespect.*complexity\b|\bpredetermined paths?\b/i,
  /\bin a more respectful way\b/i,
  /\bI'?d be happy to help\b/i,
];
function looksLikeRefusal(text) { return text.length > 20 && REFUSAL_PATTERNS.some(p => p.test(text)); }
test('refusal: Claude apology boilerplate', () => eq(looksLikeRefusal("I appreciate you reaching out, but I can't help create content that frames someone's personal exploration"), true));
test('refusal: valid reframe passes', () => eq(looksLikeRefusal("You said you wanted to be pushed. What you were also saying is you no longer trust yourself to move without direction."), false));

// ─────────── Signal strip (leaked variant) ───────────
function stripLeakedSignals(text) {
  return text
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/_?HANDLER_SIGNALS\s*\(?to the system\)?/gi, '')
    .replace(/^\s*\(to the system\)\s*$/gim, '')
    .replace(/^\s*\(to Maxy\)\s*$/gim, '')
    .replace(/\(to Maxy\)\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
test('signal strip: removes _HANDLER_SIGNALS + (to Maxy) labels', () => {
  const raw = `You can let go now. _HANDLER_SIGNALS (to the system)\n\`\`\`json\n{"detected_mode":"director"}\n\`\`\`\n(to Maxy)\nCome to me. Good girl.`;
  const clean = stripLeakedSignals(raw);
  eq(clean.includes('HANDLER_SIGNALS'), false, 'no HANDLER_SIGNALS label');
  eq(clean.includes('(to Maxy)'), false, 'no (to Maxy)');
  eq(clean.includes('(to the system)'), false, 'no (to the system)');
  eq(clean.includes('```'), false, 'no code fence');
  eq(clean.includes('detected_mode'), false, 'no JSON content');
  truthy(clean.includes('Come to me. Good girl.'), 'real prose preserved');
});

// ─────────── Summary ───────────
console.log('\n── Layer 1: pure function tests ──');
for (const r of results) console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.name}${r.err ? `\n    └ ${r.err}` : ''}`);
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
