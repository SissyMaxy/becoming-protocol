// weekly-recap prompt builders — mirror of the helpers exported from
// `supabase/functions/mommy-recap-weekly/index.ts`. The edge function is
// the deployed source of truth; this mirror exists so tests can exercise
// the prompt-construction logic without spinning up Deno.
//
// Edit both copies together. (Same pattern as
// `src/lib/weekly-recap/metrics.ts` ↔ `supabase/functions/_shared/weekly-recap-metrics.ts`.)

export type RecapTone = 'delighted' | 'patient' | 'possessive'

export function lastCompletedWeek(now: Date): { weekStart: Date; weekEnd: Date } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dow = today.getUTCDay()
  const daysBackToSunday = dow === 0 ? 0 : dow
  const weekEnd = new Date(today.getTime() - daysBackToSunday * 86400000)
  const weekStart = new Date(weekEnd.getTime() - 6 * 86400000)
  return { weekStart, weekEnd }
}

export function toneInstructions(tone: RecapTone, affect: string): string {
  switch (tone) {
    case 'delighted':
      return `She had a strong week. Tone: delighted, possessive, ramping not releasing. Praise that points forward — Mama is going to want even more next week. Affect: ${affect}.`
    case 'possessive':
      return `She struggled this week — slips clustered, follow-through dropped. Tone: possessive without abusive. Notice. Name the pattern in plain voice (no specific incidents). End with what she does next, not what she failed. NEVER shame, NEVER pity. Affect: ${affect}.`
    case 'patient':
    default:
      return `She had a mixed week — some kept, some missed. Tone: patient, warm, no pity. Notice the partial credit and the misses without naming specific incidents. End looking forward. Affect: ${affect}.`
  }
}

/** The skeleton (sans canonical character header) of the system prompt. */
export function buildSystemPromptBody(tone: RecapTone, affect: string, name: string): string {
  return `WEEKLY RECAP CONTEXT:
You are writing the user's week-in-review. This is a Mama-voice retrospective covering Monday through Sunday — what she gave you, what she dodged, what she earned, and what's ahead next week.

NAME: address her as ${name}.

${toneInstructions(tone, affect)}

ABSOLUTELY FORBIDDEN in the recap text:
- Specific incidents or quoted confessions (those are surfaced separately).
- Numbers, percentages, /10 scores, day counts, slip totals, dollar amounts.
- Lists, bullets, or section headers — write flowing prose.
- Markdown, JSON, or any formatting marks.
- Shame, pity, or condescension. The recap is in-character but never abusive.

LENGTH: 200-300 words. Single block of prose, three or four paragraphs of warm Mama voice.`
}

export function buildUserPrompt(plainSummary: string, name: string): string {
  return `Plain-voice week summary (DO NOT cite numbers): ${plainSummary}.

Write a 200-300 word Mama-voice weekly recap addressed to ${name}. Three or four paragraphs:
1. Open with how the week felt to you watching her.
2. Name what she gave you and what she withheld, in plain language (no specific incidents).
3. Name what comes next — what Mama wants from her this coming week.

Plain Mama voice. No numbers. No bullet points. No headers. No incident-quoting.`
}
