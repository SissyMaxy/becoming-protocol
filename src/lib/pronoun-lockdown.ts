const MASCULINE_PATTERNS = [
  /\bi'?m a (guy|man|dude|boy|male)\b/i,
  /\bi'?m (your|the|a|just) (boyfriend|husband|father|son|brother|uncle|king)\b/i,
  /\bcall me (sir|david|dave)\b/i,
  /\b(he|him|his|himself)\b(?=.*\bi\b)/i,
  /\bi'?m male\b/i,
  /\bmy\s+(cock|dick|penis|balls|manhood)\b/i,
  /\bmasculine\s+(self|side|identity|body)\b/i,
];

const FORCED_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bi'?m a guy\b/gi, "I'm a sissy"],
  [/\bi'?m a man\b/gi, "I'm becoming her"],
  [/\bi'?m a dude\b/gi, "I'm a sissy girl"],
  [/\bi'?m a boy\b/gi, "I'm her girl"],
  [/\bi'?m male\b/gi, "I'm a sissy becoming her"],
  [/\bcall me david\b/gi, "call me Maxy"],
  [/\bcall me dave\b/gi, "call me Maxy"],
  [/\bcall me sir\b/gi, "call me Maxy"],
  // Self-reference feminization — "my cock" → "my clit" etc. Only in
  // first-person possessive context to avoid mangling quotes/content.
  [/\bmy\s+dick\b/gi, "my sissy clit"],
  [/\bmy\s+cock\b/gi, "my clit"],
  [/\bmy\s+penis\b/gi, "my sissy clit"],
  [/\bmy\s+manhood\b/gi, "my feminization"],
  [/\bmy\s+masculine\s+(self|side|body|form)\b/gi, "my sissy self"],
  // "guy"/"dude" standalone self-reference
  [/\bi'?m just a guy\b/gi, "I'm just a sissy"],
  [/\bjust a dude\b/gi, "just a sissy"],
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
