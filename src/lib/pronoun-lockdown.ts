const MASCULINE_PATTERNS = [
  /\bi'?m a (guy|man|dude|boy|male)\b/i,
  /\bi'?m (your|the|a|just) (boyfriend|husband|father|son|brother|uncle|king)\b/i,
  /\bcall me (sir|david|dave)\b/i,
  /\b(he|him|his|himself)\b(?=.*\bi\b)/i,
];

const FORCED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bi'?m a guy\b/gi, "I'm a sissy"],
  [/\bi'?m a man\b/gi, "I'm becoming her"],
  [/\bi'?m a dude\b/gi, "I'm a sissy girl"],
  [/\bcall me david\b/gi, "call me Maxy"],
  [/\bcall me dave\b/gi, "call me Maxy"],
  [/\bcall me sir\b/gi, "call me Maxy"],
];

export function detectMasculineLanguage(text: string): boolean {
  return MASCULINE_PATTERNS.some((p) => p.test(text));
}

export function forceFeminineLanguage(text: string): string {
  let result = text;
  for (const [pattern, replacement] of FORCED_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function pronounLockdownTransform(text: string): { transformed: string; corrected: boolean } {
  const transformed = forceFeminineLanguage(text);
  return {
    transformed,
    corrected: transformed !== text,
  };
}
