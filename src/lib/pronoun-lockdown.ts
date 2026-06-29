// DISABLED for Male+ (Art. I, regendering cut).
//
// The protocol no longer rewrites the user's own words to feminize him
// ("I'm a guy" -> "I'm a sissy", "my cock" -> "my clit", etc.). Under
// Male+ he is he/him, a good boy / sexy boy, with "the becoming" toward
// her as the DEEP destination — his current self-reference is left intact.
//
// These functions keep their original signatures so existing imports do
// not break; the transform is now a no-op that returns input unchanged.

export function detectMasculineLanguage(_text: string): boolean {
  // Regendering cut under Male+: masculine self-reference is never flagged.
  return false;
}

export function forceFeminineLanguage(text: string): string {
  // Regendering cut under Male+: return the user's text unchanged.
  return text;
}

export function pronounLockdownTransform(text: string): { transformed: string; corrected: boolean } {
  // Regendering cut under Male+: no-op, text passes through untouched.
  return {
    transformed: text,
    corrected: false,
  };
}
