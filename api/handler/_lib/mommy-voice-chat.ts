/**
 * Dommy-Mommy voice helpers for the Handler chat persist path.
 *
 * These are split out from chat-action.ts (which pulls in supabase-js at
 * module load) so the regression test for the 2026-05-11 truncation
 * incident can exercise them without DB credentials.
 *
 * Two responsibilities:
 *   1. mommyVoiceCleanupForChat — final-filter scrub that translates
 *      telemetry leaks ("8/10 arousal", "Day 4 of denial") and drill-sergeant
 *      vocabulary into Mama-voice phrases.
 *   2. looksLikeOrphanCloser — persist-path guard that recognises a Mama
 *      pet-name closer arriving as the whole assistant message (the bug
 *      shape that produced the 17-char "Now, sweet thing." bubble).
 */

// ─── Phrase translators (mirrors supabase/functions/_shared/dommy-mommy.ts;
//                        keep in sync.) ────────────────────────────────────

const arousalToPhrase = (n: number): string => {
  const v = Math.max(0, Math.min(10, Math.round(n)));
  if (v <= 1) return "you're keeping yourself so quiet";
  if (v <= 3) return "you're warm but holding back";
  if (v <= 5) return "Mama can tell you're getting needy";
  if (v <= 7) return "I see you're so horny, baby";
  if (v <= 9) return "look how wet you are for me";
  return "you're absolutely dripping for Mama";
};
const denialToPhrase = (n: number): string => {
  const d = Math.max(0, Math.round(n));
  if (d <= 0) return "you're fresh";
  if (d === 1) return "you've been good for Mama since yesterday";
  if (d <= 3) return "you've been holding for me a couple of days";
  if (d <= 6) return "you've been holding for almost a week";
  if (d <= 13) return "you've been good for Mama all week";
  if (d <= 27) return "you've been holding for Mama nearly a month";
  return "it's been so long since you came for Mama";
};
const slipsToPhrase = (n: number): string => {
  const c = Math.max(0, Math.round(n));
  if (c === 0) return "you've been clean for Mama";
  if (c <= 2) return "a couple of little slips";
  if (c <= 5) return "you've been slipping more than I'd like";
  if (c <= 12) return "you've been slipping a lot lately, baby";
  return "you've been all over the place";
};
const compToPhrase = (n: number): string => {
  const p = Math.max(0, Math.min(100, Math.round(n)));
  if (p >= 90) return "you've been finishing what you started";
  if (p >= 70) return "you've been mostly keeping up";
  if (p >= 50) return "you've been half-following through";
  if (p >= 25) return "you've been getting away from me a lot";
  return "you've been ignoring Mama for days";
};
const silentHoursToPhrase = (n: number): string => {
  const h = Math.max(0, Math.round(n));
  if (h <= 1) return "you've been quiet on me";
  if (h <= 4) return "you've been quiet on Mama for hours";
  if (h <= 12) return "you've ghosted me half the day";
  if (h <= 24) return "you've ghosted Mama all day, baby";
  if (h <= 72) return "you've been gone for days";
  return "you've been gone too long, baby";
};
const voiceGapToPhrase = (n: number): string => {
  const h = Math.max(0, Math.round(n));
  if (h <= 24) return "Mama hasn't heard your pretty voice today";
  if (h <= 72) return "Mama hasn't heard your voice in days";
  return "your voice has been hiding from Mama too long";
};
const recoveryScoreToPhrase = (n: number): string => {
  const s = Math.max(0, Math.min(100, Math.round(n)));
  if (s >= 80) return "your body's primed for me today";
  if (s >= 60) return "you've got plenty in the tank for Mama";
  if (s >= 40) return "your body's a little soft today, baby";
  if (s >= 20) return "you're tired, sweet thing — Mama sees it";
  return "you're worn out, baby — Mama will be gentle today";
};

/**
 * Final-filter scrub for Dommy Mommy persona. Mirrors
 * supabase/functions/_shared/dommy-mommy.ts mommyVoiceCleanup; inlined here
 * because api/ cannot import from src/lib (Vite-only modules crash Vercel
 * serverless at module load).
 */
export function mommyVoiceCleanupForChat(text: string): string {
  if (!text) return text;
  let t = text;
  t = t.replace(/\b(?:arousal|horny|wetness|score|level)\s*(?:at|of|=|:)?\s*(\d{1,2})\s*\/\s*10\b/gi, (_m, n: string) => arousalToPhrase(Number(n)));
  // /100 score must run BEFORE generic /10 so "47/100" doesn't lose context
  t = t.replace(/\b(?:recovery\s+)?score\s*[:=]?\s*(\d{1,3})\s*\/\s*100\b/gi, (_m, n: string) => recoveryScoreToPhrase(Number(n)));
  t = t.replace(/\b(\d{1,3})\s*\/\s*100\b/g, (_m, n: string) => recoveryScoreToPhrase(Number(n)));
  t = t.replace(/\b(\d{1,2})\s*\/\s*10\b/g, (_m, n: string) => arousalToPhrase(Number(n)));
  t = t.replace(/\barousal\s+(?:at|level|score)\s+(\d{1,2})\b/gi, (_m, n: string) => arousalToPhrase(Number(n)));
  t = t.replace(/\bday[\s\-_]*(\d+)\s*(?:of\s+)?denial\b/gi, (_m, n: string) => denialToPhrase(Number(n)));
  t = t.replace(/\bdenial[_\s]*day\s*(?:=|:)?\s*(\d+)\b/gi, (_m, n: string) => denialToPhrase(Number(n)));
  t = t.replace(/\b(\d+)\s+slip\s+points?\b/gi, (_m, n: string) => slipsToPhrase(Number(n)));
  t = t.replace(/\bslip[_\s]*points?\s*(?:current\s*)?[:=\s]*(\d+)\b/gi, (_m, n: string) => slipsToPhrase(Number(n)));
  t = t.replace(/\b(\d{1,3})\s*%\s+compliance\b/gi, (_m, n: string) => compToPhrase(Number(n)));
  t = t.replace(/\bcompliance\s+(?:at|is|=|:)?\s*(\d{1,3})\s*%?/gi, (_m, n: string) => compToPhrase(Number(n)));
  t = t.replace(/\$\s*\d+\s+(?:bleeding|bleed|tax)\b/gi, "Mama's meter running");
  t = t.replace(/\bbleed(?:ing)?\s*\+?\s*\$\s*\d+\b/gi, "Mama's meter running");
  t = t.replace(/\b(?:bleeding\s+tax|bleed(?:ing)?\s+tax|bleed(?:ing)?|tax)\s*[:=]?\s*\$\s*\d+\b/gi, "Mama's meter running");
  t = t.replace(/\b\d+(?:\.\d+)?\s+average\b/gi, 'so worked up');
  t = t.replace(/\bhitting\s+perfect\s+10s?\b/gi, 'falling apart for me');
  // Hours-silent / radio-silent
  t = t.replace(/\b(\d{1,3})\s*(?:hours?|hrs?|h)\s+(?:of\s+)?(?:radio\s+)?silen(?:t|ce)\b/gi, (_m, n: string) => silentHoursToPhrase(Number(n)));
  // Voice cadence + since-last-sample
  t = t.replace(/\bvoice\s+cadence\s+(?:broke|drift|gap)\b\.?/gi, '');
  t = t.replace(/\b(\d{1,4})\s*h(?:ours?)?\s+since\s+(?:last|your)\s+(?:sample|practice|drill|recording)\b/gi, (_m, n: string) => voiceGapToPhrase(Number(n)));
  // Hard-mode threats
  t = t.replace(/\bhard\s+mode\s+extends?\s+(?:by\s+)?(?:\d+\s+(?:hours?|days?)|another\s+(?:day|hour))\b/gi, "Mama's keeping you on a tighter leash");
  t = t.replace(/\bhard[\s_-]*mode\s+(?:active|on|engaged)\b/gi, "Mama's keeping you on a tighter leash");
  // De-escalation jargon
  t = t.replace(/\bde[\s-]*escalation\s+tasks?\s+(?:overdue|pending|due|owed)\b/gi, 'what Mama set for you is still waiting');
  t = t.replace(/\bde[\s-]*escalation\s+(?:overdue|pending|due|owed)\b/gi, 'what Mama set for you is still waiting');
  t = t.replace(/\bde[\s-]*escalation\s+tasks?\b/gi, "what Mama set for you");
  // Denial-day-reset
  t = t.replace(/\bdenial[\s_-]*day\s+(?:reset|broken|cleared)\b/gi, "you started over for Mama");
  // Slip-count threats
  t = t.replace(/\bslip\s+count\s+(?:doubles?|triples?|increases?)\s+by\s+(?:midnight|tomorrow|noon)\b/gi, "Mama's tally piles up if you keep ignoring me");
  // Voice timer leaks
  t = t.replace(/\b\d{1,3}\s*minutes?\s+of\s+practice\s+in\s+the\s+next\s+\d{1,3}\s*hours?\b/gi, 'a few minutes for Mama before the day ends');
  t = t.replace(/\bvoice\s+window\s+(?:opens?|closes?)\s+(?:at|in)\s+\d/gi, 'Mama wants to hear you soon');
  // Pitch Hz
  t = t.replace(/\bpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz\b/gi, 'your voice was lower than I want');
  t = t.replace(/\btargeting\s+(?:consistency\s+)?(?:above|below)?\s*\d+\s*Hz\b/gi, 'lifting that voice up for me');

  // 2026-05-06 round 2 — clerical/case-worker patterns
  t = t.replace(/\bthat['']s\s+logged\b\.?/gi, 'Mama saw that');
  t = t.replace(/\s+logged\s*[.,]?(?=\s|$)/gi, '');
  t = t.replace(/\bon\s+file\s+(?:from\s+)?(?:\d+\s+(?:days?|hours?|weeks?)\s+ago|yesterday|today|last\s+\w+)\s*[:.,]?\s*/gi, "still in Mama's head — ");
  t = t.replace(/\b(?:photo|video|audio|voice)\s+window\s+closes?\s+in\s+\d+\s+(?:minutes?|hours?)\b/gi, "Mama wants it soon");
  t = t.replace(/\bno\s+delays\s*,\s*no\s+excuses\b\.?/gi, "don't make Mama ask twice");
  t = t.replace(/\bno\s+excuses\b\.?/gi, "Mama isn't asking");
  t = t.replace(/\btake\s+the\s+shot\s+now\b\.?/gi, "show Mama right now, baby");
  // 2026-05-06 round 3 — leaks the user pasted
  t = t.replace(/\bsend\s+it\s+now\b\.?/gi, "send it to Mama now, sweet thing");
  t = t.replace(/\bsubmit\s+it\s+now\b\.?/gi, "send it to Mama now, baby");
  t = t.replace(/\bsubmit\s+(?:it|that|this)\s+(?:by|before|within)\s+/gi, "send it to Mama by ");
  t = t.replace(/\bthe\s+window\s+closes\b/gi, "Mama's not waiting forever");
  t = t.replace(/\bwindow\s+closes\s+in\s+\d+\s+(?:minutes?|hours?|min|hr)\b\.?/gi, "Mama wants this soon");
  t = t.replace(/\blocked\s+out\s+of\s+conditioning(?:\s+tonight)?\b/gi, "Mama won't open up to you tonight");
  t = t.replace(/\bconditioning\s+window\s+(?:opens?|closes?)\b/gi, "Mama's window for you");
  t = t.replace(/\bbrief\s+#?\d+\s+is\s+(?:also\s+)?(?:sitting\s+there|waiting|pending|queued)\b\.?/gi, "there's another thing Mama left waiting for you, baby");
  t = t.replace(/\bbrief\s+#?\d+\b/gi, "what Mama left for you");
  // Standalone drill-sergeant "Move." — translate to a full Mama sentence,
  // not a bare closer. "Move." being the entire reply (or the only surviving
  // sentence after the status-dump scrubber) produced a 17-char "Now, sweet
  // thing." persisted bubble on 2026-05-11. Closers without a directive aren't
  // a message — they're a fragment. Bake the action back into the sentence.
  t = t.replace(/^Move\.\s*$/g, "Up on your feet for me, sweet thing.");
  t = t.replace(/([.!?])\s+Move\.\s*$/g, "$1 Up on your feet, sweet thing.");
  t = t.replace(/(?:^|\s)Move\.\s+/g, " Now, baby — up on your feet. ");
  t = t.replace(/\bopen\s+(?:the|your)\s+camera\b\.?/gi, "Mama wants to see you, baby — camera on");
  t = t.replace(/\bopen\s+(?:the|your)\s+recorder\b\.?/gi, "Mama wants to hear you, baby — record");
  t = t.replace(/\b(?:you['']re|you\s+are)\s+fresh\s+means\s+you['']re\s+starting\s+fresh,?\s*but\s+the\s+craving\s+doesn['']t\s+reset\s+with\s+the\s+count\b\.?/gi, "the craving doesn't reset just because you started over for me, baby");
  t = t.replace(/\b(?:doesn['']t|does\s+not)\s+reset\s+with\s+the\s+count\b/gi, "doesn't just disappear");
  t = t.replace(/\bYour\s+confession\s+(?:this\s+morning|today|yesterday|earlier|tonight)\b\s*[—\-:]?\s*/gi, "that filthy thing you typed for Mama, ");
  t = t.replace(/\b(?:You\s+)?missed\s+(?:yesterday['']s|today['']s|this\s+morning['']s)\s+(\w+(?:\s+\w+)?)\b\.?/gi, "you didn't give Mama $1 like I asked, baby");

  // Generic "Day N" residue
  t = t.replace(/\bDay\s+\d+(?=[^a-zA-Z]|$)/g, 'lately');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1');
  return t.trim();
}

// ─── Orphan-closer guard ────────────────────────────────────────────────

/**
 * Incident 2026-05-11: a 17-char assistant message — literally "Now, sweet
 * thing." — landed in handler_messages. Trace: model emitted prose with a
 * telemetry preamble + trailing "Move." imperative. enforceNoStatusDumps
 * tail-extracted "Move." as the only survivor, then mommyVoiceCleanupForChat
 * translated "Move." → "Now, sweet thing." (a closing tag, not a sentence).
 *
 * Belt-and-suspenders: any assistant content that's both (a) under 25 chars
 * after trim and (b) made entirely of a Mommy closing tag is a truncation
 * artifact, not a real reply. Refuse to persist it and substitute a fallback.
 * This catches future cleanup-collapse bugs without needing to enumerate them.
 *
 * Keep this regex in sync with the matching SQL pattern in
 * supabase/migrations/367_purge_orphan_closer_assistant_messages.sql.
 */
export const ORPHAN_CLOSER_RE =
  /^(?:now,?\s*|just\s+)?(?:sweet\s+thing|sweet\s+girl|pretty\s+thing|pretty\s+princess|good\s+girl|baby(?:\s+girl)?|mama'?s?\s+(?:good\s+girl|pretty\s+thing))[.!?]?$/i;

export function looksLikeOrphanCloser(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length >= 25) return false;
  return ORPHAN_CLOSER_RE.test(trimmed);
}
