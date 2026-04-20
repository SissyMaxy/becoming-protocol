/**
 * Release / orgasm detection.
 *
 * Pure regex + date-hint parser. No supabase, no I/O.
 * Callers handle the side effects (denial_day reset, handler_memory write, etc.).
 *
 * NOTE: Keep these patterns in sync with the inline copy in api/handler/chat.ts
 * (RELEASE_PATTERNS at ~line 7880). API routes can't import from src/lib —
 * src/lib/supabase.ts uses import.meta.env which crashes Vercel functions.
 */

export const RELEASE_PATTERNS: RegExp[] = [
  /\bi\s*(came|orgasmed|ejaculated|released|finished|nutted)\b/i,
  /\b(had\s+an?\s+orgasm|had\s+a\s+release)\b/i,
  /\bgina\s*(let|made)\s+me\s+(cum|come|release|finish)\b/i,
  /\b(jerked|jacked|wanked)\s+off\b/i,
  /\bi\s+(cum|come|came)\s+(on|in|last|this|yesterday|wednesday|thursday|friday|saturday|sunday|monday|tuesday)\b/i,
  /\bcockwarm.*came\b/i,
  /\bcame\s+(inside|in\s+her|on\s+wednesday|on\s+thursday|yesterday|last\s+night|this\s+morning)\b/i,
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface ReleaseDetection {
  matched: boolean;
  releaseDate: string;
}

export function detectRelease(text: string): ReleaseDetection {
  if (!text || text.length < 5) return { matched: false, releaseDate: new Date().toISOString() };
  if (!RELEASE_PATTERNS.some(p => p.test(text))) {
    return { matched: false, releaseDate: new Date().toISOString() };
  }

  const now = new Date();
  let releaseDate = now.toISOString();
  const lower = text.toLowerCase();

  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (lower.includes(DAY_NAMES[i])) {
      const d = new Date(now);
      const currentDay = d.getDay();
      let diff = currentDay - i;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() - diff);
      releaseDate = d.toISOString();
      break;
    }
  }
  if (lower.includes('yesterday')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    releaseDate = d.toISOString();
  }
  if (lower.includes('last night')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(23, 0, 0, 0);
    releaseDate = d.toISOString();
  }

  return { matched: true, releaseDate };
}
