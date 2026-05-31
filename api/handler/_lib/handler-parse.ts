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
  const directiveStrip = stripBareJsonKey(visibleResponse, /\bdirectives?\s*:\s*[{\[]/gi);
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

  const noteStrip = stripBareJsonKey(visibleResponse, /\bnotes?\s*:\s*[{\[]/gi);
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

  const memoryStrip = stripBareJsonKey(visibleResponse, /\bmemory\s*:\s*[{\[]/gi);
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
    let intensity = (obj.intensity as number) || 5;
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
