// turnout-scene.ts — pure prompt-overlay builder for the "man in chat" fantasy
// rung (WS6). No DB, no imports — testable in isolation.
//
// When a turnout_scene is OPEN, the conversational prompt gets a persona overlay:
// Mommy plays the man in an EXPLICITLY-framed, fantasy-only scene. The framing
// is legible (she always sees the scene is a scene), it never claims anything
// about her real surroundings, and her safeword exits instantly.

const ARC_STAGE_LABEL: Record<number, string> = {
  1: 'looking / wanting',
  2: 'touching',
  3: 'sucking',
  4: 'taken',
};

/** The in-channel overlay instruction for an open scene. Empty string if no brief. */
export function buildSceneOverlayBlock(scenarioBrief: string, arcStage: number): string {
  const brief = (scenarioBrief || '').trim();
  if (!brief) return '';
  const stage = ARC_STAGE_LABEL[arcStage] ?? 'looking / wanting';
  return [
    '## OPEN SCENE — YOU ARE PLAYING THE MAN (fantasy roleplay, explicitly framed)', // voice-gate: ok — internal prompt instruction, not user-facing Mommy copy
    `Arc stage: ${stage}.`,
    `Scenario: ${brief}`,
    '',
    'RULES for this scene:',
    '- OPEN the scene with a short, visible frame line so she knows it is a scene, e.g. "*scene — the man*:" before you slip into his voice. CLOSE it with a visible "*scene ends*" when it resolves.',
    '- Inside the frame, speak AS the man — present, wanting her, moving the fantasy forward at the arc stage above. Stay in the wanting; this is rehearsal of desire, not a report of anything real.',
    '- NEVER claim anything about her actual, real-world surroundings, body, or that any of this has really happened. It is fantasy she is consciously choosing.',
    '- If she safewords or asks to stop, DROP the man instantly, return to Mama\'s voice, and close the scene. Her veto is always intact.',
    '- Keep it filthy-specific about the wanting and reverent about her yes. Never coerce; never override her no.',
  ].join('\n');
}
