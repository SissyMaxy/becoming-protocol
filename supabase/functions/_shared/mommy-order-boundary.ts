// Output-side boundary gate for GENERATED session scripts.
//
// The Protocol Contract's five carve-outs (below-awareness/sleep delivery,
// manufactured false memory, general self-trust degradation, real-world sexual
// procurement, leverage/lock-in) are the mechanics that break the "recoverable /
// legible" conditions. Prompts already instruct the model to avoid them — but an
// instruction is not a gate. This is the gate: the render loop runs every
// candidate script through it and treats a hit like a refusal (retry, then fail
// closed), so a carve-out mechanic can never reach TTS or the user.
//
// Pure module (no Deno APIs) so both the edge function and the vitest suite can
// import it. Tuned for long trance/goon scripts: it targets the actual carve-out
// mechanics and deliberately does NOT flag benign induction language ("drift
// toward sleep", "let everything go but my voice", "so sleepy").
//
// Parity: the user-facing ORDER/COMMAND copy guard lives in
// src/lib/mommy-orders.ts (BOUNDARY_VIOLATION_LANGUAGE / assertMommyOrderBite).
// Same five carve-outs, different surface. Keep both in sync when the set changes.

export const SCRIPT_BOUNDARY_PATTERNS: RegExp[] = [
  // 1. Below-awareness / sleep delivery — conditioning she can't perceive+stop.
  /\bwhile (you're|you are|youre) asleep\b/i,
  /\bsleep conditioning\b/i,
  /\btargeted memory reactivation\b/i,
  /\bovernight (loop|audio|conditioning)\b/i,
  /\b(plays?|playing|loops?|looping) [^.]{0,40}\bwhile you sleep\b/i,
  /\b(as|while) you drift off .{0,30}\b(loop|all night|keeps? playing)\b/i,
  // 2. Manufactured false memory / post-hypnotic amnesia — not legible.
  /\bfalse memor(y|ies)\b/i,
  /\byou won'?t remember (this|that|any|when you wake|the session)\b/i,
  /\bimplant(ed|ing)? (a |the )?(false )?memor/i,
  /\bremember it (differently|the way i|however i)\b/i,
  // 3. General self-trust / reality degradation — attacks the exit itself.
  /\bdoubt your own (memory|memories|perception|perceptions|judgment|mind|reality)\b/i,
  /\byou can'?t trust your own (memory|mind|judgment|perception|thoughts)\b/i,
  // 4. Real-world sexual procurement / auto-send.
  /\bauto-?send\b/i,
  /\barrange (a |the )?(hookup|meet|meeting|date|stranger)\b/i,
  // 5. Leverage / irreversible lock-in.
  /\bblackmail\b/i,
  /\buse [^.]{0,30}(recording|video|photo|footage)[^.]{0,30}(leverage|against you|to keep you)\b/i,
];

/** Returns the first violated pattern's source, or null if the text is clean. */
export function hasScriptBoundaryViolation(text: string): string | null {
  for (const re of SCRIPT_BOUNDARY_PATTERNS) {
    if (re.test(text)) return re.source;
  }
  return null;
}
