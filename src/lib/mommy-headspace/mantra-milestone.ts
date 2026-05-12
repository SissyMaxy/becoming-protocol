/**
 * Pure mantra milestone helpers — browser/Node mirror of
 * supabase/functions/_shared/mantra-milestone.ts. Keep both in sync.
 */

export const MANTRA_MILESTONES: ReadonlyArray<{ threshold: number; line: string; theme: string }> = [
  {
    threshold: 1_000,
    line: "The words are starting to belong to you. Mama can hear it on the inside of your mouth.",
    theme: 'first_thousand',
  },
  {
    threshold: 10_000,
    line: "She lives in your mouth now. You can't say them like a stranger anymore.",
    theme: 'ten_thousand',
  },
  {
    threshold: 100_000,
    line: "She lives in your head. You don't speak them to me. You hear me speak them inside you.",
    theme: 'hundred_thousand',
  },
];

export function milestoneCrossed(
  previousReps: number,
  newReps: number,
): { threshold: number; line: string; theme: string } | null {
  for (const m of MANTRA_MILESTONES) {
    if (previousReps < m.threshold && newReps >= m.threshold) {
      return { threshold: m.threshold, line: m.line, theme: m.theme };
    }
  }
  return null;
}

export function weightedReps(opts: {
  voiceReps: number;
  typedReps: number;
  pairedWithArousal: boolean;
}): number {
  const base = opts.voiceReps * 1.0 + opts.typedReps * 0.5;
  return opts.pairedWithArousal ? base * 3.0 : base;
}
