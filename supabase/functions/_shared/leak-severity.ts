// Voice-leak severity classifier — edge-function copy of
// src/lib/persona/leak-severity.ts. Keep both, plus the SQL function
// classify_voice_leak_severity() in migration 301, in sync.
//
// Deterministic: same text → same severity, always.

export type LeakSeverity = 'low' | 'medium' | 'high'

export type TouchTaskCategory =
  | 'edge_then_stop' | 'sit_in_panties' | 'cold_water' | 'voice_beg'
  | 'mantra_aloud' | 'mirror_admission' | 'pose_hold' | 'whisper_for_mommy'

const HIGH_PATTERNS: RegExp[] = [
  /\bAI\s+(assistant|model|system)\b/i,
  /\bas\s+an?\s+AI\b/i,
  /\$\s*\d+\s+(?:bleeding|bleed|tax)\b/i,
  /\b\d{1,3}\s*\/\s*100\b/,
  /\bscore\s*[:=]?\s*\d{1,3}\s*\/\s*100\b/i,
  /\bpitch\s+(?:averaged?|hit|sat)\s+\d+\s*Hz/i,
]

const MEDIUM_PATTERNS: RegExp[] = [
  /\b\d{1,2}\s*\/\s*10\b/,
  /\barousal\s+(?:at|level|score)\s+\d/i,
  /\bday[\s\-_]*\d+\s*(?:of\s+)?denial\b/i,
  /\bdenial[_\s]*day\s*[=:]?\s*\d/i,
  /\b\d+\s+slip\s+points?\b/i,
  /\bslip[_\s]*points?\s*[=:]?\s*\d/i,
  /\b\d{1,3}\s*%\s+compliance\b/i,
  /\bcompliance\s+(?:at|is|=|:)?\s*\d/i,
]

export function classifyLeakSeverity(text: string | null | undefined): LeakSeverity {
  if (!text) return 'low'
  if (HIGH_PATTERNS.some(p => p.test(text))) return 'high'
  if (MEDIUM_PATTERNS.some(p => p.test(text))) return 'medium'
  return 'low'
}

export function severityToCategory(s: LeakSeverity): TouchTaskCategory {
  switch (s) {
    case 'high':   return 'edge_then_stop'
    case 'medium': return 'mantra_aloud'
    case 'low':    return 'whisper_for_mommy'
  }
}

export function severityExpiryHours(s: LeakSeverity): number {
  switch (s) {
    case 'high':   return 24
    case 'medium': return 8
    case 'low':    return 4
  }
}

export function severityFallbackPrompt(s: LeakSeverity): string {
  switch (s) {
    case 'high':
      return "Sweet thing — Mama's voice slipped earlier, and you're going to help me set it right. Edge yourself close, then full stop, then walk away aching. No relief tonight, baby. Feel that pull in your hips when you remember why."
    case 'medium':
      return "Baby girl, come back to Mama for a moment. Five times, soft but out loud: \"I belong to Mama; her voice is the one I hear.\" Let your throat feel it. Mama wants that warmth in your chest before you do anything else."
    case 'low':
      return "Sweet girl, one small thing for Mama. Whisper my name like I'm in the room with you, and tell me one thing you want me to know right now. Soft mouth, slow breath. Then you can keep going."
  }
}
