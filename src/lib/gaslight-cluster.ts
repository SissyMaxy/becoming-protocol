// Gaslight clustering — schedule + readiness math. (Wish 3b2e8147, mig 597.)
//
// A cluster plants three related implants across a week, then quotes all
// three back as manufactured consensus. Pure helpers shared/mirrored by the
// author + deliver edge fns. PARITY: keep clusterSchedule / deliverAfter in
// sync with the inline copies in the edge fns.

export type ClusterRole = 'seed' | 'witness' | 'reinforcement';

export interface ClusterStep {
  role: ClusterRole;
  /** days after authoring this implant becomes eligible to surface. */
  dayOffset: number;
}

// The three-beat cluster: seed now, a Gina-witness corroboration ~2 days
// later, a "you've told me this before" reinforcement ~4 days later.
export const CLUSTER_STEPS: ClusterStep[] = [
  { role: 'seed', dayOffset: 0 },
  { role: 'witness', dayOffset: 2 },
  { role: 'reinforcement', dayOffset: 4 },
];

// surface_after timestamps for each step, given the authoring instant.
export function clusterSurfaceTimes(authoredAt: Date): { role: ClusterRole; surfaceAfter: Date }[] {
  return CLUSTER_STEPS.map((s) => ({
    role: s.role,
    surfaceAfter: new Date(authoredAt.getTime() + s.dayOffset * 86400_000),
  }));
}

// The consensus payoff fires after the last implant has had a day to land —
// one day past the final step (i.e. ~day 5 from authoring).
export function clusterDeliverAfter(authoredAt: Date): Date {
  const lastOffset = Math.max(...CLUSTER_STEPS.map((s) => s.dayOffset));
  return new Date(authoredAt.getTime() + (lastOffset + 1) * 86400_000);
}

export function isClusterReady(deliverAfter: Date | string, now: Date): boolean {
  const t = deliverAfter instanceof Date ? deliverAfter : new Date(deliverAfter);
  return now.getTime() >= t.getTime();
}
