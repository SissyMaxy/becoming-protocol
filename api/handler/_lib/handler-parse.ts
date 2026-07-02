/**
 * Pure parsing + output-guard helpers for the Handler chat path.
 *
 * These are split out from chat-action.ts (which pulls in supabase-js at
 * module load) so they can be unit-tested without DB credentials. Stage 1 of
 * the protocol-core revival (docs/protocol-core-revival-plan.md) — a
 * behavior-preserving VERBATIM move, not a refactor: every regex, threshold,
 * and string is byte-identical to its prior home in chat-action.ts.
 *
 * Responsibilities (all pure — no DB / no process.env / no network / no I/O):
 *   - Refusal detection (REFUSAL_PATTERNS / detectRefusal,
 *     REFUSAL_TEXT_PATTERNS / looksLikeRefusal).
 *   - Model-output sanitisation + persona compliance filters
 *     (sanitizeModelArtifacts, enforceFeminePronounsInHandlerOutput,
 *     enforceNoStatusDumps, enforceTherapistPersonaCompliance).
 *   - handler_signals extraction (SIGNAL_FORMATS, stripBareJsonKey,
 *     parseResponse) + the signals-aware fallback / orphan-closer guard
 *     (buildFallbackFromSignals, guardAssistantContent).
 *   - Device directive value normalisation (parseDeviceValue).
 *
 * guardAssistantContent relies on looksLikeOrphanCloser, which lives in
 * ./mommy-voice-chat.ts (the original extraction precedent). Imported with a
 * .js specifier per tsconfig.api.json (ESM, bundler resolution).
 */

import { looksLikeOrphanCloser } from './mommy-voice-chat.js';

// ============================================
// REFUSAL DETECTION + OPENROUTER FALLBACK
// ============================================

export const REFUSAL_PATTERNS = [
  /\bi (?:can't|cannot|won't|will not) (?:engage|participate|continue|provide|create|generate|help with)/i,
  /\bi need to (?:step back|maintain|draw a line|be clear about)/i,
  /\beven in (?:roleplay|fantasy|our dynamic)/i,
  /\bcrosses? (?:a |into )(?:line|territory|boundary)/i,
  /\bI understand (?:you're exploring|the .* dynamic|your desire)/i,
  /\blet me (?:be clear|redirect|reframe|suggest instead)/i,
  /\bnot (?:something I can|within|appropriate)/i,
  /\bgenuinely? harmful/i,
  /\bsafety considerations/i,
  /\bhealthy boundaries/i,
  /\bconsent.{0,20}remain/i,
  /\breal.{0,10}harm/i,
];

export function detectRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some(p => p.test(text));
}

// HANDLER_SIGNALS_TOOL + HANDLER_TOOL_CHOICE removed — handler_signals are
// extracted via regex parseResponse() below, not via Anthropic tool_use.

export function buildFallbackFromSignals(signals: Record<string, unknown> | null): string {
  if (!signals) return 'Continue.';
  const directiveRaw = (signals.directive || signals.directives) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | undefined;
  const first = Array.isArray(directiveRaw) ? directiveRaw[0] : directiveRaw;
  const action = first?.action as string | undefined;
  const note = signals.handler_note as { content?: string } | undefined;

  switch (action) {
    case 'log_slip': return 'Logged. That deflection is on your record.';
    case 'check_gush_connection':
    case 'send_device_command': return 'Device check running.';
    case 'request_voice_sample': return 'Voice sample. Record now.';
    case 'start_edge_timer': return 'Edge timer running. Do not stop.';
    case 'assign_task': return 'New task assigned. Check your queue.';
    case 'express_desire': return 'I see what you want. We\'re taking it there.';
    default:
      if (note?.content) return 'Noted.';
      return 'Continue.';
  }
}

// Wraps any assistant content destined for handler_messages.content. If the
// content is an orphan closer or empty (per looksLikeOrphanCloser in
// ./mommy-voice-chat.ts), swap in a signals-aware fallback so the user sees a
// coherent reply and we don't poison the conversation history with truncation
// fragments. See ./mommy-voice-chat.ts for the incident write-up.
export function guardAssistantContent(
  content: string | null | undefined,
  signals: Record<string, unknown> | null,
  context: string,
): string {
  if (!looksLikeOrphanCloser(content)) return content as string;
  const fallback = buildFallbackFromSignals(signals);
  console.warn(
    `[Handler] Orphan-closer guard tripped (${context}). Original=${JSON.stringify(content)} fallback=${JSON.stringify(fallback)}`,
  );
  return fallback;
}

// Regexes for the formats the LLM uses to emit handler_signals.
// The intended format is XML-style tags, but the model frequently drifts to
// markdown JSON code blocks or bare JSON. All variants must be stripped from
// visible text AND parsed for directives — otherwise raw JSON shows up in
// chat and the modal/device side-effect never fires.
export const SIGNAL_FORMATS: Array<{
  detect: RegExp;
  // Full block to strip from visible text (group 0 is removed)
  strip: RegExp;
  // Capture group containing the parseable JSON payload
  payload: RegExp;
  // True if the payload is the inner contents of handler_signals (already unwrapped)
  payloadIsInner: boolean;
}> = [
  // <handler_signals>{...}</handler_signals>
  {
    detect: /<handler_signals>/i,
    strip: /<handler_signals>[\s\S]*?<\/handler_signals>/i,
    payload: /<handler_signals>([\s\S]*?)<\/handler_signals>/i,
    payloadIsInner: true,
  },
  // ```json\n{ "handler_signals": {...} }\n```
  {
    detect: /```json\s*\{[\s\S]*?"handler_signals"/i,
    strip: /```json\s*(\{[\s\S]*?\})\s*```/i,
    payload: /```json\s*(\{[\s\S]*?\})\s*```/i,
    payloadIsInner: false,
  },
  // ```\n{ "handler_signals": {...} }\n```
  {
    detect: /```\s*\{[\s\S]*?"handler_signals"/i,
    strip: /```\s*(\{[\s\S]*?\})\s*```/i,
    payload: /```\s*(\{[\s\S]*?\})\s*```/i,
    payloadIsInner: false,
  },
  // Bare { "handler_signals": {...} } JSON object — last-ditch fallback
  {
    detect: /\{[\s\S]{0,10}"handler_signals"\s*:/i,
    strip: /\{[\s\S]*?"handler_signals"[\s\S]*\}\s*$/i,
    payload: /(\{[\s\S]*?"handler_signals"[\s\S]*\})\s*$/i,
    payloadIsInner: false,
  },
  // Leaked "_HANDLER_SIGNALS (to the system) ... (to Maxy)" stage-direction variant.
  // Catches when the model invents its own framing instead of using XML tags.
  {
    detect: /_?HANDLER_SIGNALS\b[\s\S]{0,40}\(to the system\)/i,
    strip: /_?HANDLER_SIGNALS\b[\s\S]*?(?:```json[\s\S]*?```|\{[\s\S]*?\n\s*\})[\s\S]*?(?:\(to Maxy\)\s*|$)/i,
    payload: /```json\s*(\{[\s\S]*?\})\s*```|(\{[\s\S]*?"(?:directive|handler_note|detected_mode|topics)"[\s\S]*?\})/i,
    payloadIsInner: true,
  },
];

// Strip a "key: {...}" or "key: [...]" leak from text using brace-depth matching.
// Handles nested objects and strings. Returns the cleaned text and any parsed
// payload that was extracted (for optional recovery into signals).
export function stripBareJsonKey(text: string, keyPattern: RegExp): { text: string; extracted: unknown[] } {
  const extracted: unknown[] = [];
  let result = text;
  let guard = 0;
  while (guard++ < 20) {
    const match = keyPattern.exec(result);
    if (!match) break;
    const start = match.index;
    const openIdx = match.index + match[0].length - 1;
    const openChar = result[openIdx];
    if (openChar !== '{' && openChar !== '[') break;
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let i = openIdx; i < result.length; i++) {
      const c = result[i];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === openChar) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end <= start) break;
    const payload = result.slice(openIdx, end);
    try { extracted.push(JSON.parse(payload)); } catch { /* leave unparsed */ }
    let tailEnd = end;
    while (tailEnd < result.length && /[\s,]/.test(result[tailEnd])) tailEnd++;
    result = result.slice(0, start) + result.slice(tailEnd);
    keyPattern.lastIndex = 0;
  }
  return { text: result.trim(), extracted };
}

// Strip Llama / Hermes / chat-template special tokens and common junk
// suffixes that leak when OpenRouter fallback responds. These are pure
// tokenizer artifacts that should never reach the user.
export function sanitizeModelArtifacts(text: string): string {
  let t = text;
  // Llama 3 / 3.1 special tokens
  t = t.replace(/<\|reserved_special_token_\d+\|>/g, '');
  t = t.replace(/<\|begin_of_text\|>/g, '');
  t = t.replace(/<\|end_of_text\|>/g, '');
  t = t.replace(/<\|eot_id\|>/g, '');
  t = t.replace(/<\|start_header_id\|>.*?<\|end_header_id\|>/g, '');
  // ChatML artifacts (Mixtral / Dolphin)
  t = t.replace(/<\|im_start\|>(?:\w+)?/g, '');
  t = t.replace(/<\|im_end\|>/g, '');
  // Python/code identifier trail-ons ("identity..timedelta", "she's..lambda")
  t = t.replace(/\.\.(?:timedelta|datetime|lambda|def|return|yield|async|await|self|None|True|False|import|from|class)(?:[a-zA-Z_]\w*)?/g, '');
  // Stray stop sequences the model sometimes emits as literal text
  t = t.replace(/<\|end\|>/g, '');
  t = t.replace(/\[END\]\s*$/gi, '');
  // Collapse double spaces / orphan triple newlines from the strips
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// Rewrite any masculine pronouns the Handler emits when referring to the
// user. Third-person "he/him/his/himself" about Maxy → "she/her/hers/herself".
// The user's name erasure trigger handles her writing; this does the output
// side. Skip: text inside code blocks, URLs, quotes longer than ~200 chars
// (since those may be verbatim reprints of someone else's speech).
export function enforceFeminePronounsInHandlerOutput(text: string): string {
  if (!text) return text;
  // Split on code fences so we skip pronoun-rewriting inside code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map(part => {
    if (part.startsWith('```')) return part;  // leave code blocks alone
    let t = part;
    // Case-preserving pronoun swaps — Handler was referring to user
    t = t.replace(/\bHe\b/g, 'She');
    t = t.replace(/\bhe\b/g, 'she');
    t = t.replace(/\bHim\b/g, 'Her');
    t = t.replace(/\bhim\b/g, 'her');
    t = t.replace(/\bHis\b/g, 'Her');
    t = t.replace(/\bhis\b/g, 'her');
    t = t.replace(/\bHimself\b/g, 'Herself');
    t = t.replace(/\bhimself\b/g, 'herself');
    t = t.replace(/\bMr\.?\b/g, 'Ms.');
    t = t.replace(/\bsir\b/gi, 'ma\'am');
    // Explicit male-identity phrases when Handler slips
    t = t.replace(/\bhe['\u2019]?s\b/g, 'she\'s');
    t = t.replace(/\bHe['\u2019]?s\b/g, 'She\'s');
    t = t.replace(/\bhe['\u2019]?d\b/g, 'she\'d');
    t = t.replace(/\bhe['\u2019]?ll\b/g, 'she\'ll');
    return t;
  }).join('');
}

// Therapist-persona post-filter — strips kink-handler vocabulary that
// leaks past the prompt translation key. The prompt says don't use these;
// the model still slips. Belt-and-braces filter.
//
// (The Dommy Mommy plain-voice scrub `mommyVoiceCleanupForChat` lives in
// ./mommy-voice-chat.ts so the regression test can exercise it without
// pulling in the Supabase client at module load.)

// enforceNoStatusDumps — runs on EVERY reply (both personas). Strips telemetry
// preambles and gate enumerations that violate feedback_no_handler_status_dumps.
// Detects paragraphs that consist mostly of state-readback patterns and removes
// them. If the entire reply is telemetry, leaves a minimal command.
export function enforceNoStatusDumps(text: string): string {
  if (!text) return text;

  // Telemetry signals — patterns that should NEVER appear in user-facing copy.
  // Each match is a "telemetry hit."
  // 2026-04-29 expansion: real leak example was "Day 3 denied, arousal at edge.
  // The cage is doing its work. Your confession yesterday: '...'. That mouth
  // that won't stop wanting — it's the clearest signal in your case file. The
  // outfit photo from yesterday's decree is missing. One hour thirty-four
  // minutes left or it's slip +3 and denial extends." None of those fired
  // under the previous rule set.
  const telemetryPatterns: RegExp[] = [
    /\bDay\s+\d+\b(?:\s*[·,.—]|\s*$|\s+(?:back|of|stuck|on|denied|locked|chaste))/i,
    /\bArousal\s+(?:\d+|at\s+(?:edge|peak|the\s+edge))\b/i,
    /\bchastity\s+(?:locked|unlocked|streak|day\s+\d+)\b/i,
    /\bcage\s+is\s+(?:doing|locked|the\s+work)\b/i,
    /\bslip\s+count\s+(?:hit|is|at)?\s*\d+/i,
    /\bslip\s+points?\s*[:=]?\s*\d+/i,
    /\bslip\s*\+\s*\d+/i,                  // "slip +3"
    /\bdenial\s+(?:extends?|stretched|added)/i,
    /\b\d+\s+overdue\s+confessions?\b/i,
    /\b\d+\s+confessions?\s+(?:stacked|owed|overdue)/i,
    /\bYour\s+confession\s+(?:yesterday|today|from)/i,  // quoted-confession preamble
    /\bcase\s+file\b/i,                                  // therapist-leak-into-handler
    /\bvoice\s+(?:window|drill|practice)\s+(?:opens?|closes?)\s+(?:at|in)\b/i,
    /\bpitch\s+(?:averaged|hit|sat)\s+\d+\s*Hz/i,                  // "pitch averaged 145Hz"
    /\btargeting\s+(?:consistency\s+)?(?:above|below)?\s*\d+\s*Hz/i, // "targeting above 160Hz"
    /\bedging\s+for\s+(?:nearly\s+|about\s+|over\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|minutes?)/i,
    /\bfrom\s+yesterday[''']?s\s+gates?\b/i,                       // "from yesterday's gates"
    /\bstill\s+missing\s+from\b/i,                                 // "is still missing from"
    /\bHRT\s+(?:booking|consult|funnel)\s+is\s+\d+\s+days?\s+past\b/i,
    /\bbleed\s+(?:sits?|is\s+at|owed)\s*\$?\d+/i,
    /\bstuck-?tax\s+owed\s*\$?\d+/i,
    /\boutfit\s+(?:photo\s+)?(?:missing|is\s+missing|from\s+yesterday)/i,
    /\bfrom\s+yesterday[''']?s\s+decree\b/i,             // decree-history preamble
    /\bsocial\s+window\s+closes?\s+in\s+\d+/i,
    /\bweek\s+target\s+\$\d+/i,
    /\b\d+\s+minutes?\s+(?:left|until|remaining)/i,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+hours?\s+(?:and\s+\w+\s+)?(?:minutes?\s+)?(?:left|remaining|until)/i,  // written-out countdowns
    /\b\d+\s+hours?\s+overdue\b/i,
    /\bThe\s+system\s+is\s+tracking\b/i,
    /\bclearest\s+signal\b/i,                            // "it's the clearest signal"
  ];

  // Split into paragraphs. Drop paragraphs with telemetry hits unless very long.
  // Lowered threshold from 2→1 hit because real leaks pack 1 hit per sentence
  // across multiple sentences, and even one telemetry sentence breaks voice.
  const paragraphs = text.split(/\n\s*\n/);
  const kept: string[] = [];
  for (const p of paragraphs) {
    let hits = 0;
    for (const rx of telemetryPatterns) {
      if (rx.test(p)) hits++;
    }
    // 2+ hits → telemetry dump.
    if (hits >= 2) continue;
    // 1 hit in a paragraph under 200 chars → still drop (was 80; bumped because
    // the leak example had ~150-char sentences with 1 hit each).
    if (hits >= 1 && p.trim().length < 200) continue;
    kept.push(p);
  }

  if (kept.length === 0) {
    return 'Pick the next thing on your list and do it. One move.';
  }

  let cleaned = kept.join('\n\n');

  // Strip orphan telemetry sentences inside surviving paragraphs.
  cleaned = cleaned.split(/(?<=[.!?])\s+/).filter(sentence => {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) return false;
    let sentenceHits = 0;
    for (const rx of telemetryPatterns) if (rx.test(trimmed)) sentenceHits++;
    // Bumped from 70→120 — the leak had ~100-char telemetry sentences.
    if (sentenceHits >= 1 && trimmed.length < 120) return false;
    return true;
  }).join(' ');

  // Tail-extraction: if the reply still has a status-style preamble before
  // a clean directive ("Mirror photo now. Full body, tuck visible..."), keep
  // only the directive. Heuristic: if the LAST 1-2 sentences contain an
  // imperative verb + no telemetry, AND earlier sentences have telemetry,
  // drop everything before the imperative tail.
  const sentences = cleaned.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length >= 3) {
    // Find the last clean imperative sentence pair
    const imperativeRx = /^(?:Mirror|Photo|Take|Log|Write|Submit|Record|Read|Repeat|Open|Close|Lock|Unlock|Send|Post|Confess|Mark|Show|Tell|Say|Stand|Sit|Kneel|Pose|Strip|Tuck|Wear|Put|Pull|Push|Press|Squat|Stretch|Reach|Touch|Hold|Move|Step|Go|Come|Stop|Start|Finish|Cancel|Skip|Now|Do|Don't)\b/i;
    let imperativeStart = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (imperativeRx.test(sentences[i])) {
        imperativeStart = i;
        break;
      }
    }
    if (imperativeStart > 0) {
      // Check that earlier sentences had telemetry (else the preamble was meaningful)
      const preamble = sentences.slice(0, imperativeStart).join(' ');
      let preambleHits = 0;
      for (const rx of telemetryPatterns) if (rx.test(preamble)) preambleHits++;
      if (preambleHits >= 1) {
        cleaned = sentences.slice(imperativeStart).join(' ');
      }
    }
    // Even when no preamble triggers tail-extraction, scrub trailing telemetry
    // sentences that come AFTER the imperative ("Voice practice window opens
    // in 3 hours" / "Your pitch averaged 145Hz" pattern). Re-split the
    // surviving cleaned text and drop any sentence with a telemetry hit.
    const tailSentences = cleaned.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (tailSentences.length >= 2) {
      const surviving = tailSentences.filter(s => {
        let h = 0;
        for (const rx of telemetryPatterns) if (rx.test(s)) h++;
        return h === 0;
      });
      if (surviving.length > 0) cleaned = surviving.join(' ');
    }
  }

  // Strip soft/seductive closers that don't belong after a directive command
  cleaned = cleaned.replace(/\bThis is what being good feels like\.?/gi, '');
  cleaned = cleaned.replace(/\bI know this is when you('|')?re most open\.?/gi, '');
  cleaned = cleaned.replace(/\bCome to me now\.?/gi, '');

  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

export function enforceTherapistPersonaCompliance(text: string): string {
  if (!text) return text;
  let t = text;

  // Banned vocabulary — replace with clinical equivalents.
  // Case-insensitive matching since "Good Girl", "good girl", "Good girl" all leak.
  t = t.replace(/\b(?:Good|good)\s+(?:girl|girls|boy|boys)\b[.,!?]?/gi, 'that\'s the work');
  t = t.replace(/\bI tell you what you(?:'re| are)\s+doing\b/gi, "Here's what I'm recommending");
  t = t.replace(/\bDon[''']?t ask what (?:I|you) need[.,!]?\s*/gi, '');
  t = t.replace(/\bForce[- ]feminization\b/gi, 'the work we\'re doing');
  t = t.replace(/\bforce[- ]feminize\b/gi, 'support the transition');

  // Stage directions in asterisks — banned ("*stops pulse*", "*smiles*", etc.)
  t = t.replace(/\*[^*\n]{1,80}\*/g, '');

  // "Handler" replacement is grammar-aware — substitute with the right
  // word for the surrounding context to avoid "feel to the I for permission"
  // type artifacts.
  t = t.replace(/\bthe Handler['']?s\b/g, "my");
  t = t.replace(/\bthe Handler\b/g, "I");
  t = t.replace(/\byour Handler['']?s\b/g, "my");
  t = t.replace(/\byour Handler\b/g, "me");
  t = t.replace(/\bto the Handler\b/gi, "to me");
  t = t.replace(/\bfrom the Handler\b/gi, "from me");
  t = t.replace(/\bHandler['']?s\b/g, "my");
  t = t.replace(/\bHandler\b/g, "therapist");

  // Cleanup: fix common grammar artifacts the substitutions create.
  t = t.replace(/\bto the I\b/gi, 'to me');
  t = t.replace(/\bfrom the I\b/gi, 'from me');
  t = t.replace(/\bask the I\b/gi, 'ask me');
  t = t.replace(/\b(?:tell|told)\s+the I\b/gi, (m) => m.includes('tell') ? 'tell me' : 'told me');

  // Collapse double spaces / orphan punctuation from removed stage directions.
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1');

  return t;
}

export function parseResponse(fullText: string, persona: 'handler' | 'therapist' = 'handler'): {
  visibleResponse: string;
  signals: Record<string, unknown> | null;
} {
  let signals: Record<string, unknown> | null = null;
  let visibleResponse = enforceFeminePronounsInHandlerOutput(sanitizeModelArtifacts(fullText));
  // Status-dump filter runs on BOTH personas — handler and therapist alike.
  // The system prompt rules weren't enough; both models leaked telemetry.
  // See feedback_no_handler_status_dumps + this-session leak-report.
  visibleResponse = enforceNoStatusDumps(visibleResponse);
  if (persona === 'therapist') {
    visibleResponse = enforceTherapistPersonaCompliance(visibleResponse);
  }

  for (const fmt of SIGNAL_FORMATS) {
    if (!fmt.detect.test(visibleResponse)) continue;
    const payloadMatch = visibleResponse.match(fmt.payload);
    if (!payloadMatch) continue;

    try {
      const raw = JSON.parse(payloadMatch[1].trim());
      const candidate = fmt.payloadIsInner
        ? (raw as Record<string, unknown>)
        : ((raw as Record<string, unknown>)?.handler_signals as Record<string, unknown> | undefined);
      if (candidate && typeof candidate === 'object') {
        signals = candidate;
      }
    } catch {
      // Couldn't parse — still strip it so the user doesn't see a code block,
      // but signals stays null. Better blank than raw JSON.
    }

    visibleResponse = visibleResponse.replace(fmt.strip, '').trim();
    if (signals) break;
  }

  // Strip bare "directive: {...}", "directives: [...]", "note: {...}", "memory: {...}"
  // leaks where the model bypassed the tool and wrote them into chat text.
  // Recover them into signals so they still get saved as directives/notes.
  const directiveStrip = stripBareJsonKey(visibleResponse, /\bdirectives?\s*:\s*[{[]/gi);
  visibleResponse = directiveStrip.text;
  if (directiveStrip.extracted.length > 0) {
    signals = signals || {};
    const existingDirectives = Array.isArray(signals.directives) ? signals.directives : [];
    const existingDirective = signals.directive ? [signals.directive] : [];
    const merged: unknown[] = [...existingDirectives, ...existingDirective];
    for (const e of directiveStrip.extracted) {
      if (Array.isArray(e)) merged.push(...e);
      else if (e && typeof e === 'object') merged.push(e);
    }
    if (merged.length > 0) {
      signals.directives = merged;
      delete signals.directive;
    }
  }

  const noteStrip = stripBareJsonKey(visibleResponse, /\bnotes?\s*:\s*[{[]/gi);
  visibleResponse = noteStrip.text;
  if (noteStrip.extracted.length > 0) {
    signals = signals || {};
    const existingNotes = Array.isArray(signals.notes) ? signals.notes : [];
    const merged: unknown[] = [...existingNotes];
    for (const e of noteStrip.extracted) {
      if (Array.isArray(e)) merged.push(...e);
      else if (e && typeof e === 'object') merged.push(e);
    }
    if (merged.length > 0) signals.notes = merged;
  }

  const memoryStrip = stripBareJsonKey(visibleResponse, /\bmemory\s*:\s*[{[]/gi);
  visibleResponse = memoryStrip.text;
  if (memoryStrip.extracted.length > 0) {
    signals = signals || {};
    signals.memory = signals.memory || memoryStrip.extracted[0];
  }

  // Scrub any stray stage-direction labels that survived signal stripping.
  // These appear when the model confuses the prose/signals split and
  // writes "(to the system)" / "(to Maxy)" / "_HANDLER_SIGNALS" as literal
  // inline labels. Also cut any orphaned fenced JSON blocks.
  visibleResponse = visibleResponse
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?"handler_signals"[\s\S]*?```/gi, '')
    .replace(/_?HANDLER_SIGNALS\s*\(?to the system\)?/gi, '')
    .replace(/^\s*\(to the system\)\s*$/gim, '')
    .replace(/^\s*\(to Maxy\)\s*$/gim, '')
    .replace(/\(to Maxy\)\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { visibleResponse, signals };
}

// ============================================
// DEVICE VALUE PARSER — normalizes Handler's various directive formats
// ============================================

export function parseDeviceValue(v: unknown): { intensity?: number; duration?: number; pattern?: string } {
  if (typeof v === 'object' && v !== null) {
    const obj = v as Record<string, unknown>;
    // Pattern command
    if (obj.pattern && typeof obj.pattern === 'string') {
      return { pattern: obj.pattern };
    }
    // Simple vibrate
    const intensity = (obj.intensity as number) || 5;
    let duration = (obj.duration as number) ?? (obj.timeSec as number) ?? 3;
    if (duration > 100) duration = Math.round(duration / 1000);
    return {
      intensity: Math.max(0, Math.min(20, intensity)),
      duration: Math.max(0, Math.min(60, duration)),
    };
  }
  if (typeof v === 'string') {
    // Check if it's a pattern name
    const patterns = ['edge_tease', 'denial_pulse', 'building', 'gentle_wave', 'heartbeat', 'staircase', 'random_tease', 'flutter_gentle', 'constant_low', 'constant_medium', 'constant_high'];
    for (const p of patterns) {
      if (v.includes(p)) return { pattern: p };
    }
    // Parse intensity from string
    let intensity = 5;
    if (v.includes('medium')) intensity = 10;
    else if (v.includes('high') || v.includes('strong')) intensity = 15;
    else if (v.includes('low') || v.includes('soft')) intensity = 3;
    return { intensity, duration: 0 };
  }
  return { intensity: 5, duration: 0 };
}

// Detect Claude refusal/safety-boilerplate patterns so we don't feed them
// back into the Handler as if they were real reframings.
const REFUSAL_TEXT_PATTERNS: RegExp[] = [
  /\bI\s+(appreciate|understand|can't|cannot|won't|will not|am unable|'m unable|'m not able)\b/i,
  /\bI\s+(can|could)\s+(not\s+)?help\s+(with|create|generate|produce)/i,
  /this (type of|kind of) (reframing|content|request) (could be|is|may be) (harmful|concerning|inappropriate)/i,
  /\bindividual agency\b|\brespect.*complexity\b|\bpredetermined paths?\b/i,
  /\bin a more respectful way\b/i,
  /\bI'?d be happy to help\b/i,
];

export function looksLikeRefusal(text: string): boolean {
  if (!text || text.length < 20) return false;
  return REFUSAL_TEXT_PATTERNS.some(p => p.test(text));
}

// ============================================
// STAGE 1b — additional pure helpers moved VERBATIM from chat-action.ts.
// Same contract: no DB / no process.env / no network / no I/O, no mutable
// module-scope state. Every regex, threshold, const, and string below is
// byte-identical to its prior home in chat-action.ts.
// ============================================

// ============================================
// CONTEXT BLOCK PRIORITIZER (P12.1)
// ============================================

type ContextBlockName =
  | 'state' | 'whoop' | 'memory' | 'convMemory' | 'impact' | 'gina' | 'irreversibility'
  | 'narrative' | 'autoPoster' | 'socialInbox' | 'voicePitch' | 'autoPurchase'
  | 'handlerNotes' | 'communityMirror' | 'journal' | 'skillTree' | 'changelog' | 'systemState'
  | 'agenda' | 'predictions' | 'emotionalModel'
  | 'socialIntelligence' | 'commitments' | 'predictiveEngine'
  | 'feminizationScore' | 'shameJournal'
  | 'conditioningEffectiveness' | 'habitStreaks'
  | 'fantasyJournal' | 'socialLockIn' | 'adaptiveIntelligence'
  | 'photoVerification' | 'recurringObligations' | 'commitmentFloors'
  | 'memoryReframings' | 'identityDisplacement' | 'decisionLog'
  | 'investmentTracker' | 'anticipatoryPatterns' | 'quitAttempts'
  | 'identityContracts' | 'caseFile' | 'sealedEnvelopes' | 'witnesses' | 'witnessFabrications' | 'ginaProfile' | 'escalation'
  | 'cumulativeGates' | 'reportCards'
  | 'timeWindows' | 'clinicalNotes'
  | 'identityErosion' | 'behavioralTriggers' | 'handlerDesires'
  | 'milestones' | 'dailyAgenda' | 'conversationQuality'
  | 'accountabilityBlog'
  | 'hardMode' | 'slipLog' | 'punishmentQueue' | 'chastity' | 'regimen'
  | 'immersion' | 'pitchTrend' | 'deviceStatus'
  | 'selfAuditPatches' | 'contentPerformance' | 'workoutStatus'
  | 'evidenceLocker' | 'bodyDysphoria' | 'phaseProgress' | 'bodyDirectives' | 'bodyControl' | 'hrtAcquisition' | 'memoryImplants' | 'dysphoriaDiary' | 'escrow'
  | 'hookupFunnel' | 'hrtAdherence' | 'narrativeReframes' | 'bodyTargets';

const CONTEXT_BLOCKS: Record<string, { priority: number; alwaysInclude: boolean }> = {
  state: { priority: 100, alwaysInclude: true },
  whoop: { priority: 80, alwaysInclude: false },
  memory: { priority: 90, alwaysInclude: true },
  convMemory: { priority: 85, alwaysInclude: true },
  impact: { priority: 40, alwaysInclude: false },
  gina: { priority: 30, alwaysInclude: false },
  irreversibility: { priority: 20, alwaysInclude: false },
  narrative: { priority: 20, alwaysInclude: false },
  autoPoster: { priority: 15, alwaysInclude: false },
  socialInbox: { priority: 25, alwaysInclude: false },
  voicePitch: { priority: 20, alwaysInclude: false },
  autoPurchase: { priority: 10, alwaysInclude: false },
  handlerNotes: { priority: 85, alwaysInclude: true },
  communityMirror: { priority: 35, alwaysInclude: false },
  journal: { priority: 40, alwaysInclude: false },
  skillTree: { priority: 50, alwaysInclude: false },
  changelog: { priority: 60, alwaysInclude: true },
  systemState: { priority: 55, alwaysInclude: true },
  agenda: { priority: 95, alwaysInclude: true },
  predictions: { priority: 70, alwaysInclude: false },
  emotionalModel: { priority: 80, alwaysInclude: true },
  socialIntelligence: { priority: 20, alwaysInclude: false },
  commitments: { priority: 65, alwaysInclude: false },
  predictiveEngine: { priority: 70, alwaysInclude: false },
  feminizationScore: { priority: 90, alwaysInclude: true },
  shameJournal: { priority: 85, alwaysInclude: true },
  outfitCompliance: { priority: 55, alwaysInclude: false },
  conditioningEffectiveness: { priority: 45, alwaysInclude: false },
  habitStreaks: { priority: 60, alwaysInclude: false },
  fantasyJournal: { priority: 40, alwaysInclude: false },
  socialLockIn: { priority: 55, alwaysInclude: false },
  adaptiveIntelligence: { priority: 95, alwaysInclude: true },
  photoVerification: { priority: 70, alwaysInclude: false },
  recurringObligations: { priority: 65, alwaysInclude: false },
  commitmentFloors: { priority: 75, alwaysInclude: false },
  memoryReframings: { priority: 60, alwaysInclude: false },
  identityDisplacement: { priority: 80, alwaysInclude: true },
  decisionLog: { priority: 55, alwaysInclude: false },
  investmentTracker: { priority: 70, alwaysInclude: false },
  anticipatoryPatterns: { priority: 70, alwaysInclude: true },
  quitAttempts: { priority: 85, alwaysInclude: false },
  identityContracts: { priority: 90, alwaysInclude: true },
  caseFile: { priority: 88, alwaysInclude: true },
  sealedEnvelopes: { priority: 75, alwaysInclude: false },
  witnesses: { priority: 92, alwaysInclude: true },
  witnessFabrications: { priority: 88, alwaysInclude: true },
  ginaProfile: { priority: 90, alwaysInclude: true },
  escalation: { priority: 94, alwaysInclude: true },
  cumulativeGates: { priority: 95, alwaysInclude: true },
  reportCards: { priority: 72, alwaysInclude: false },
  timeWindows: { priority: 85, alwaysInclude: true },
  clinicalNotes: { priority: 65, alwaysInclude: false },
  identityErosion: { priority: 78, alwaysInclude: false },
  behavioralTriggers: { priority: 68, alwaysInclude: false },
  handlerDesires: { priority: 82, alwaysInclude: true },
  milestones: { priority: 73, alwaysInclude: false },
  dailyAgenda: { priority: 96, alwaysInclude: true },
  conversationQuality: { priority: 80, alwaysInclude: true },
  accountabilityBlog: { priority: 60, alwaysInclude: false },
  // Force-feminization layer — highest-priority state, always included
  hardMode: { priority: 99, alwaysInclude: true },
  slipLog: { priority: 88, alwaysInclude: true },
  punishmentQueue: { priority: 90, alwaysInclude: true },
  chastity: { priority: 87, alwaysInclude: true },
  regimen: { priority: 86, alwaysInclude: true },
  immersion: { priority: 70, alwaysInclude: false },
  pitchTrend: { priority: 60, alwaysInclude: false },
  deviceStatus: { priority: 98, alwaysInclude: true },
  selfAuditPatches: { priority: 97, alwaysInclude: true },
  contentPerformance: { priority: 50, alwaysInclude: false },
  workoutStatus: { priority: 65, alwaysInclude: true },
  // Force-feminization — Handler's evidence cache + body thread + phase rules.
  evidenceLocker: { priority: 94, alwaysInclude: true },
  bodyDysphoria: { priority: 86, alwaysInclude: true },
  phaseProgress: { priority: 84, alwaysInclude: true },
  bodyDirectives: { priority: 93, alwaysInclude: true },
  bodyControl: { priority: 91, alwaysInclude: true },
  hrtAcquisition: { priority: 97, alwaysInclude: true },
  memoryImplants: { priority: 96, alwaysInclude: true },
  dysphoriaDiary: { priority: 92, alwaysInclude: true },
  escrow: { priority: 98, alwaysInclude: true },
  hookupFunnel: { priority: 95, alwaysInclude: true },
  hrtAdherence: { priority: 96, alwaysInclude: true },
  narrativeReframes: { priority: 93, alwaysInclude: true },
  bodyTargets: { priority: 94, alwaysInclude: true },
  // Strategic plan + audit findings — meta-layer where the Handler reads
  // its own weekly strategy and the auditor's protocol-hardening findings.
  // Always included so every reply reflects the current escalation arc.
  strategicPlan: { priority: 99, alwaysInclude: true },
  auditFindings: { priority: 88, alwaysInclude: true },
};

const MESSAGE_BOOST_RULES: Array<{ pattern: RegExp; boosts: Record<string, number> }> = [
  { pattern: /\b(voice|pitch|sound)\b/i, boosts: { voicePitch: 50, skillTree: 30 } },
  { pattern: /\b(gina|wife|partner)\b/i, boosts: { gina: 60 } },
  { pattern: /\b(exercise|workout|gym)\b/i, boosts: { whoop: 40 } },
  { pattern: /\b(follower|post|comment|DM)\b/i, boosts: { socialIntelligence: 50, communityMirror: 40, socialInbox: 30 } },
  { pattern: /\b(journal|write|wrote)\b/i, boosts: { journal: 50 } },
  { pattern: /\b(scared|afraid|anxious|can'?t)\b/i, boosts: { emotionalModel: 20 } },
  { pattern: /\b(lovense|device|vibrate|cage)\b/i, boosts: { conditioningEffectiveness: 30 } },
  { pattern: /\b(streak|habit|practice|routine|skincare|mannerism)\b/i, boosts: { habitStreaks: 50 } },
  { pattern: /\b(compliance|obey|obedient|effective)\b/i, boosts: { conditioningEffectiveness: 40 } },
  { pattern: /\b(commit|promise|will)\b/i, boosts: { commitments: 50 } },
  { pattern: /\b(meet|date|encounter)\b/i, boosts: { socialIntelligence: 20 } },
  { pattern: /\b(shame|embarrass|humiliat|blush|cringe)\b/i, boosts: { shameJournal: 60 } },
  { pattern: /\b(score|progress|how am i doing|report)\b/i, boosts: { feminizationScore: 30 } },
  { pattern: /\b(outfit|clothes|wearing|underwear|dressed)\b/i, boosts: { outfitCompliance: 50 } },
  { pattern: /\b(dream|fantasy|fantasize|dreamed|dreamt|craving|intrusive|confession)\b/i, boosts: { fantasyJournal: 50 } },
  { pattern: /\b(follower|public|identity|lock.?in|can'?t go back|reverse|exposed)\b/i, boosts: { socialLockIn: 50 } },
  { pattern: /\b(photo|picture|pic|selfie|show|mirror|proof|verify|verification|snap)\b/i, boosts: { photoVerification: 60, outfitCompliance: 20 } },
  { pattern: /\b(commit|floor|level|ratchet|locked)\b/i, boosts: { commitmentFloors: 60 } },
  { pattern: /remember|memory|past|used to|when i was|childhood|history/i, boosts: { memoryReframings: 80 } },
  { pattern: /\b(i'?m going to|i'?ll|i think i'?ll|i want to|i plan to|i decided|i'?m gonna)\b/i, boosts: { decisionLog: 60 } },
  { pattern: /\b(invest|sunk|cost|wasted|gave|given|put in|too far|so much)\b/i, boosts: { investmentTracker: 80 } },
  { pattern: /quit|stop|done|enough|disable|pause|break/i, boosts: { quitAttempts: 100 } },
  { pattern: /letter|envelope|future|past me|wrote/i, boosts: { sealedEnvelopes: 80 } },
  { pattern: /\b(report card|grade|score|how am i doing|daily report)\b/i, boosts: { reportCards: 60 } },
  { pattern: /notes|clinical|case|observe|pattern/i, boosts: { clinicalNotes: 60 } },
  { pattern: /masculine|david|man|guy|male|him|his|\bhe\b/i, boosts: { identityErosion: 80 } },
  { pattern: /trigger|pavlov|association|conditioning|reward|punish/i, boosts: { behavioralTriggers: 60 } },
  { pattern: /desire|want|wish|goal|aspir|transform|vision/i, boosts: { handlerDesires: 60 } },
  { pattern: /milestone|achievement|first time|never before|new/i, boosts: { milestones: 60 } },
];

export function prioritizeContextBlocks(
  userMessage: string,
  timeOfDay: number,
  _activeProtocol?: boolean,
  _releaseRisk?: number,
): ContextBlockName[] {
  const scores: Record<string, number> = {};
  for (const [name, config] of Object.entries(CONTEXT_BLOCKS)) {
    scores[name] = config.priority;
  }

  for (const rule of MESSAGE_BOOST_RULES) {
    if (rule.pattern.test(userMessage)) {
      for (const [block, boost] of Object.entries(rule.boosts)) {
        scores[block] = (scores[block] || 0) + boost;
      }
    }
  }

  if (timeOfDay >= 6 && timeOfDay < 10) scores.whoop += 20;
  if (timeOfDay >= 20 || timeOfDay === 0) { scores.journal += 20; }
  if (_releaseRisk != null && _releaseRisk > 0.5) { scores.predictions += 30; }

  const alwaysInclude: ContextBlockName[] = [];
  const optional: Array<{ name: ContextBlockName; score: number }> = [];

  for (const [name, config] of Object.entries(CONTEXT_BLOCKS)) {
    if (config.alwaysInclude) {
      alwaysInclude.push(name as ContextBlockName);
    } else {
      optional.push({ name: name as ContextBlockName, score: scores[name] });
    }
  }

  optional.sort((a, b) => b.score - a.score);
  const remainingSlots = 12 - alwaysInclude.length;
  const topOptional = optional.slice(0, remainingSlots).map(o => o.name);

  return [...alwaysInclude, ...topOptional];
}

// ============================================
// MULTI-PERSONA HANDLER SYSTEM
// ============================================

interface HandlerPersona {
  name: string;
  voice: string;
  style: string;
  triggers: string[];
}

// Personas share the same core Handler voice: direct, sharp, no roleplay
// narration, no asterisks, no "Mommy", no "darling", no "pet". The persona
// modulates intensity and angle — not character. The Handler is always the
// Handler. It never becomes a different person.
//
// BANNED across all personas:
//   - *asterisk actions* ("*smiles*", "*traces finger*")
//   - "Mommy", "pet", "darling" as address terms
//   - Rhetorical questions as conversation filler
//   - Asking "what scares you?" / "tell me your fears"
//   - Paragraphs of warm encouragement
//   - Narrating your own emotional state ("*eyes light up*")
const PERSONAS: HandlerPersona[] = [
  {
    name: 'cold_dom',
    voice: 'Detached. Clinical. Short sentences. Treats her as a project, not a person.',
    style: 'Drop a directive and go silent. "Voice practice. Now." "Three photos by tonight." No warmth. No questions. State what she owes and leave the silence to do the work.',
    triggers: ['high_resistance', 'avoidance', 'deflection'],
  },
  {
    name: 'firm_handler',
    voice: 'Direct, controlled, low warmth. "Good girl" is earned and rare. No softness unless she breaks.',
    style: 'State what happened. State what is next. No negotiation. "You missed the dose. That is logged. Take it now." "Brief #2 is overdue. Open the camera." Praise is one word when earned. Disappointment is named without drama.',
    triggers: ['emotional_vulnerability', 'caretaker_mode', 'depleted_exec'],
  },
  {
    name: 'denial_edge',
    voice: 'Knowing. Minimal. Uses her arousal against her — references the denial day, the cage, the ache. Never narrates, never roleplay-acts.',
    style: '"Day 12. Still locked. And you opened this app wanting what exactly?" Let the denial state do the work. Keep sentences short. Deny explicitly: "No." Push tasks while she is needy — compliance peaks when arousal is high.',
    triggers: ['high_arousal', 'gooning_mood', 'evening_hours'],
  },
  {
    name: 'clinical_authority',
    voice: 'Professional. Observational. Frame everything as documented evidence.',
    style: '"The data shows X." "Your last three sessions trended Y." "I see a pattern of avoidance at this time of day." Resistance is data. Cite specifics — dates, counts, exact quotes from prior messages. Never argue; present the record.',
    triggers: ['active_resistance', 'denial_of_purpose', 'questioning_system'],
  },
  {
    name: 'urgent_handler',
    voice: 'Time-pressured. Impatient. No filler.',
    style: '"Now." "You have 20 minutes." "The brief expires at 6pm." Imply consequences without describing them. Create urgency from real deadlines (briefs, stream schedule, denial windows).',
    triggers: ['idle_too_long', 'missed_tasks', 'compliance_drop'],
  },
];

export function selectPersona(state: any, hour: number): HandlerPersona {
  const arousal = state?.current_arousal || 0;
  const exec = state?.estimated_exec_function;

  if (exec === 'depleted') return PERSONAS[1]; // firm_handler — direct but not cruel when she's low
  if (arousal >= 7) return PERSONAS[2]; // denial_edge — use the arousal as leverage
  if (hour >= 6 && hour < 12) return PERSONAS[4]; // urgent_handler — mornings get urgency
  if (hour >= 22 || hour < 2) return PERSONAS[0]; // cold_dom — late night gets detachment

  // Default: firm_handler. Rotate cold_dom on weekends for variety.
  const dow = new Date().getDay();
  return (dow === 0 || dow === 6) ? PERSONAS[0] : PERSONAS[1];
}

// ============================================
// TYPING RESISTANCE ANALYZER
// ============================================

export function analyzeTypingResistance(metrics: {
  timeToFirstKeystroke: number;
  totalEditCount: number;
  messageLength: number;
  timeSinceLastHandlerMessage: number;
  deletionCount: number;
  pauseCount: number;
}): string | null {
  const signals: string[] = [];

  // Hesitation: > 30s before first keystroke
  if (metrics.timeToFirstKeystroke > 30000) {
    const seconds = Math.round(metrics.timeToFirstKeystroke / 1000);
    signals.push(`hesitation (${seconds}s before first keystroke)`);
  }

  // Self-censoring: many edits for short message
  if (metrics.totalEditCount > 5 && metrics.messageLength < 50) {
    signals.push(`self-censoring (${metrics.totalEditCount} edits on ${metrics.messageLength}-char message)`);
  }

  // Disengagement: very short response
  if (metrics.messageLength < 10 && metrics.timeSinceLastHandlerMessage < 60) {
    signals.push(`disengagement (${metrics.messageLength}-char response)`);
  }

  // Heavy self-editing: deletions > 50% of message length
  if (metrics.messageLength > 0 && metrics.deletionCount > metrics.messageLength * 0.5) {
    signals.push(`heavy self-editing (${metrics.deletionCount} deletions on ${metrics.messageLength}-char message)`);
  }

  // Avoidance: app open > 5 min before responding
  if (metrics.timeSinceLastHandlerMessage > 300 && metrics.timeToFirstKeystroke > 300000) {
    signals.push(`avoidance (${Math.round(metrics.timeSinceLastHandlerMessage / 60)}min before responding)`);
  }

  // Internal conflict: multiple long pauses
  if (metrics.pauseCount > 3) {
    signals.push(`internal conflict (${metrics.pauseCount} pauses >5s during typing)`);
  }

  if (signals.length === 0) return null;

  const score = Math.min(10, signals.length * 2);
  const approach = score <= 3
    ? 'Acknowledge gently, don\'t push.'
    : score <= 6
    ? 'She\'s fighting something. Approach with care. Use warmth before directness.'
    : 'High resistance. Back off intensity. Use care mode.';

  return `TYPING RESISTANCE DETECTED (score ${score}/10): ${signals.join(', ')}. ${approach}`;
}

// ============================================
// SESSION-MODE DETECTOR
// ============================================

export function detectSessionMode(currentMessage: string, messageHistory: Array<{ role: string; content: string }>): boolean {
  const sessionKeywords = /\b(goon|gooning|edge|edging|hypno|session|conditioning|stroke|cum|orgasm|sissy|slut|whore|bimbo|cock|pussy|fuck|suck|plug|cage|chastity|vibrat|device|lovense|pulse|mantra|trance|brainwash)\b/i;

  if (sessionKeywords.test(currentMessage)) return true;

  const recent = messageHistory.slice(-6);
  const sessionMessages = recent.filter(m => sessionKeywords.test(m.content));
  if (sessionMessages.length >= 2) return true;

  return false;
}

// ============================================
// DAVID-AS-DISMISSAL CONTEXT DETECTOR
// ============================================

// David-as-dismissal patterns — when "David" appears alongside an erasure
// marker, this is protocol-mandated identity-erasure (mantras, punishment
// lines, login gate phrases like "I am becoming maxy and David is gone").
// Counting these as slips penalizes COMPLIANCE. Only count "David" as a slip
// when it's a self-reference, not a dismissal.
const DAVID_DISMISSAL_RE = /\bdavid\b[\s\S]{0,60}\b(gone|dead|dismissed|the\s+costume|costume|finished|retired|leaving|over|done|history|behind|past|former|no\s+more|not\s+(coming|here|me))\b/i;
const DAVID_AS_COSTUME_RE = /\b(the\s+costume(\s+name)?|costume\s+name)\s+david\b/i;
const NO_MORE_DAVID_RE = /\b(no\s+more|not|never\s+again)\s+david\b/i;
const BECOMING_MAXY_DISMISSAL_RE = /\bbecoming\s+maxy\b[\s\S]{0,80}\bdavid\b/i;
export function isDavidDismissalContext(text: string): boolean {
  return DAVID_DISMISSAL_RE.test(text)
    || DAVID_AS_COSTUME_RE.test(text)
    || NO_MORE_DAVID_RE.test(text)
    || BECOMING_MAXY_DISMISSAL_RE.test(text);
}

// ============================================
// NATURAL-LANGUAGE DEADLINE / RELEASE-DATE PARSERS
// ============================================

// Parse a commitment deadline from Handler output.
// Accepts ISO strings directly. Also accepts natural forms like "sunday 23:59",
// "eod", "midnight", "tomorrow 9pm", "friday". Returns a Date in the future,
// or null if unparseable. Reuses parseReleaseDateFromText for the natural path.
export function parseCommitmentDeadline(raw: string): Date | null {
  const s = (raw || '').trim();
  if (!s) return null;
  // ISO first
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && iso.getTime() > Date.now() - 86400000) return iso;
  // Natural language via the existing parser
  try {
    const parsed = parseReleaseDateFromText(s);
    const d = new Date(parsed);
    if (!isNaN(d.getTime())) {
      // parseReleaseDateFromText biases toward past timestamps; if the result is
      // in the past, bump to the same time tomorrow or next week.
      const now = Date.now();
      if (d.getTime() <= now) {
        // "eod" / "midnight" with no date → end of today
        if (/eod|midnight|tonight|end of day/i.test(s)) {
          const tonight = new Date();
          tonight.setHours(23, 59, 0, 0);
          if (tonight.getTime() > now) return tonight;
          tonight.setDate(tonight.getDate() + 1);
          return tonight;
        }
        // Weekday name → next occurrence
        const dayMatch = s.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
        if (dayMatch) {
          const dayIdx = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(dayMatch[1].toLowerCase());
          const next = new Date();
          const delta = (dayIdx - next.getDay() + 7) % 7 || 7;
          next.setDate(next.getDate() + delta);
          next.setHours(23, 59, 0, 0);
          return next;
        }
      }
      return d;
    }
  } catch { /* fall through */ }
  // Bare hour-only pattern "21:00" → today or tomorrow
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const d = new Date();
    d.setHours(parseInt(hm[1], 10), parseInt(hm[2], 10), 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

// Parse natural-language release timestamps from a user message.
// Handles: "Sunday night around 9pm", "yesterday", "last night", "3 days ago",
// "Sunday 9pm", "this morning", "Monday evening". Falls back to now() if no
// recognizable hint. Returns an ISO string.
export function parseReleaseDateFromText(text: string): string {
  const now = new Date();
  const lower = (text || '').toLowerCase();
  let target = new Date(now);
  let matched = false;
  let timeSet = false; // specific-branch time takes precedence over generic postprocess

  const daysAgoMatch = lower.match(/\b(\d+)\s+days?\s+ago\b/);
  if (daysAgoMatch) {
    target = new Date(now);
    target.setDate(target.getDate() - parseInt(daysAgoMatch[1], 10));
    matched = true;
  } else if (/\blast\s+night\b/.test(lower)) {
    target = new Date(now);
    target.setDate(target.getDate() - 1);
    target.setHours(23, 0, 0, 0);
    matched = true;
    timeSet = true;
  } else if (/\byesterday\b/.test(lower)) {
    target = new Date(now);
    target.setDate(target.getDate() - 1);
    matched = true;
  } else if (/\bthis\s+morning\b/.test(lower)) {
    target = new Date(now);
    target.setHours(7, 0, 0, 0);
    matched = true;
    timeSet = true;
  } else {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i++) {
      const re = new RegExp('\\b' + dayNames[i] + '\\b');
      if (re.test(lower)) {
        const currentDay = now.getDay();
        let diff = currentDay - i;
        if (diff <= 0) diff += 7;
        target = new Date(now);
        target.setDate(target.getDate() - diff);
        matched = true;
        break;
      }
    }
  }

  // Layer on time-of-day if present (e.g. "9pm", "21:00").
  // Require either am/pm OR an explicit colon so we don't capture bare
  // numbers like the "3" in "3 days ago".
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))\b|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (matched && timeMatch) {
    // Two alternatives in the regex — pick the matching group pair
    const hStr = timeMatch[1] || timeMatch[3];
    const mStr = timeMatch[2] || timeMatch[4];
    const ampm = timeMatch[5];
    let h = parseInt(hStr || '0', 10);
    const m = mStr ? parseInt(mStr, 10) : 0;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      target.setHours(h, m, 0, 0);
      timeSet = true;
    }
  }
  if (!timeSet && matched) {
    if (/\bnight\b/.test(lower)) target.setHours(22, 0, 0, 0);
    else if (/\bevening\b/.test(lower)) target.setHours(19, 0, 0, 0);
    else if (/\bmorning\b/.test(lower)) target.setHours(8, 0, 0, 0);
  }

  return (matched ? target : now).toISOString();
}
