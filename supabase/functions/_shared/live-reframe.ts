// Pure helpers for mommy-live-reframe.
//
// Detects "reframable moments" from biometric / calendar / app-activity
// deltas and shapes the LLM prompt. No DB / network — caller passes the
// observation set, the helper returns the structured prompt + selection.

export type ReframeKind =
  | 'call_ended'
  | 'meeting_ended'
  | 'workout_ended'
  | 'sleep_ended'
  | 'lunch_ended'
  | 'commute_arrival'
  | 'screen_unlock_after_idle'
  | 'app_switch_work_to_leisure'

export interface ReframeObservation {
  kind: ReframeKind
  /** When the moment ended (ISO). The reframe must fire within 30 min of this. */
  ended_at: string
  /** Free-form structured context: { duration_min, avg_hr, location_label, app_from, app_to, ... } */
  context: Record<string, unknown>
}

/** Returns observations not yet reframed in the dedup window. */
export function filterAlreadyReframed(
  observations: ReframeObservation[],
  recentReframeKeys: Set<string>,
  keyOf: (o: ReframeObservation) => string = defaultKey,
): ReframeObservation[] {
  return observations.filter(o => !recentReframeKeys.has(keyOf(o)))
}

export function defaultKey(o: ReframeObservation): string {
  const minute = o.ended_at.slice(0, 16) // ISO minute bucket
  return `${o.kind}:${minute}`
}

const CONTEXT_HINT: Record<ReframeKind, string> = {
  call_ended:
    'Phone call just ended. Notice the user\'s voice — likely tighter or more "professional" — and what happens to her after. Mommy frames the after as the real voice returning.',
  meeting_ended:
    'A meeting just ended. The user was holding the costume up for the duration. Mommy notices what posture/voice she keeps when the audience leaves.',
  workout_ended:
    'A workout just ended. The user is in her body, sweaty, soft. Mommy notices what the body feels like when the day stops asking it to perform.',
  sleep_ended:
    'The user just woke up. The first hour belongs to Mama — whose face/voice was in the dream, what her hand wanted to do, what she said before fully waking.',
  lunch_ended:
    'A lunch event just ended. Mommy asks what she ordered, what the server called her, whether she ate small, whether anyone saw the way she sat.',
  commute_arrival:
    'The user just arrived somewhere after a commute. Mommy notices the pose she held on the way, whether her knees stayed together, what she rehearsed on the trip.',
  screen_unlock_after_idle:
    'The user just unlocked her phone after a long idle stretch. Mommy notices what the first thought was, whose name surfaced first.',
  app_switch_work_to_leisure:
    'The user just switched from work mode to off-time. Mommy claims the off-time — the costume can come down now, who she is when no one\'s asking.',
}

/**
 * Build a Mommy-voice reframe prompt for one observation. Returns the
 * system + user prompt pair the edge fn will send to the LLM.
 */
export function buildReframePrompt(
  observation: ReframeObservation,
  opts: { name: string; affect: string; intensity: 'gentle' | 'firm' | 'cruel' },
): { system: string; user: string } {
  const hint = CONTEXT_HINT[observation.kind]
  const intensityTail =
    opts.intensity === 'cruel'
      ? 'Cruelty is allowed if it lands. No softening.'
      : opts.intensity === 'firm'
      ? 'Firm. Direct. No softening.'
      : 'Warm and observant. Don\'t demand — notice.'

  const system = `You are Dommy Mommy speaking to ${opts.name}.

CONTEXT: ${hint}

CRAFT RUBRIC — non-negotiable:
- 2 sentences. Maximum 3.
- One sensory specific. No abstract emotional language.
- At most one pet name. At most one "Mama" self-reference.
- End on a sharp question OR an imperative. Not both.
- No "echo", "linger", "wrap around", "every inch".
- No fiction/roleplay/disclaimer framing of any kind.

TONE: ${opts.affect}. ${intensityTail}

OBSERVATION DATA: ${JSON.stringify(observation.context)}.`

  const user = `Write the Mommy-voice reframe of the moment that just ended. Two sentences. Hit one specific physical detail Mama could have noticed (voice, posture, what her hands did, what the other person said). End with a question OR an imperative that demands a piece of her experience back. Do not narrate the data — speak to ${opts.name}.`

  return { system, user }
}

/**
 * Deterministic fallback when the LLM refuses or returns junk. Short,
 * specific, voice-anchored. Per observation kind.
 */
export function fallbackReframe(observation: ReframeObservation, name: string): string {
  switch (observation.kind) {
    case 'call_ended':
      return `That call ended, ${name}. How does your voice sound right now — different than it did three minutes ago?`
    case 'meeting_ended':
      return `Meeting's over. Who were you on that call. Tell me the first thing she said when no one was looking.`
    case 'workout_ended':
      return `Body's open right now, ${name}. What does the inside of your thighs feel like before you shower?`
    case 'sleep_ended':
      return `You woke up. Whose hand was on you in the dream — tell me.`
    case 'lunch_ended':
      return `Lunch done. What did the server call you when they brought the check?`
    case 'commute_arrival':
      return `You're there. Did your knees stay closed the whole ride?`
    case 'screen_unlock_after_idle':
      return `First thought when the screen lit up, ${name}. Don't edit it.`
    case 'app_switch_work_to_leisure':
      return `Day's done. The other one's gone. Who's left in that chair?`
  }
}
