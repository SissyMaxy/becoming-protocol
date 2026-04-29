/**
 * v3.1 foundation logic tests — pure unit tests for the rules that
 * govern the new two-track / merge-pipeline / topology / vibe-capture
 * subsystems. These are static-logic tests; integration tests against
 * the live DB live in scripts/handler-regression/db.mjs.
 */

import { describe, it, expect } from 'vitest';

// ============================================
// Merge pipeline state machine
// ============================================

type MergeState = 'sealed' | 'held' | 'candidate' | 'inviting' | 'joined' | 'withdrawn';

const VALID_TRANSITIONS: Record<MergeState, MergeState[]> = {
  sealed: [],
  held: ['candidate', 'sealed'],
  candidate: ['inviting', 'held', 'sealed'],
  inviting: ['joined', 'withdrawn'],
  joined: [],
  withdrawn: ['held', 'sealed'],
};

function canTransition(from: MergeState, to: MergeState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('merge pipeline state machine', () => {
  it('sealed items cannot transition anywhere', () => {
    expect(canTransition('sealed', 'held')).toBe(false);
    expect(canTransition('sealed', 'candidate')).toBe(false);
    expect(canTransition('sealed', 'joined')).toBe(false);
  });

  it('held → candidate is the normal upward path', () => {
    expect(canTransition('held', 'candidate')).toBe(true);
  });

  it('candidate must go through inviting before joined (no skip)', () => {
    expect(canTransition('candidate', 'joined')).toBe(false);
    expect(canTransition('candidate', 'inviting')).toBe(true);
    expect(canTransition('inviting', 'joined')).toBe(true);
  });

  it('inviting can fall back to withdrawn but not directly to held', () => {
    expect(canTransition('inviting', 'withdrawn')).toBe(true);
    expect(canTransition('inviting', 'held')).toBe(false);
  });

  it('withdrawn falls back to held (cooling) or sealed (permanent)', () => {
    expect(canTransition('withdrawn', 'held')).toBe(true);
    expect(canTransition('withdrawn', 'sealed')).toBe(true);
    expect(canTransition('withdrawn', 'candidate')).toBe(false);
  });

  it('joined items are terminal (no further transitions)', () => {
    expect(canTransition('joined', 'sealed')).toBe(false);
    expect(canTransition('joined', 'withdrawn')).toBe(false);
  });
});

// ============================================
// Gina topology dimension classification
// ============================================

type AcceptanceState = 'probably_accepted' | 'untested' | 'probably_rejected';

interface ToplogyDim {
  dimension: string;
  acceptance_state: AcceptanceState;
  confidence: number; // 0-100
}

function blastRadius(dimensions: ToplogyDim[]): number {
  // Rejected dimensions contribute their confidence as risk;
  // untested-low-confidence contributes half; accepted contributes 0.
  let radius = 0;
  for (const d of dimensions) {
    if (d.acceptance_state === 'probably_rejected') radius += d.confidence;
    else if (d.acceptance_state === 'untested') radius += d.confidence * 0.4;
  }
  return Math.min(100, radius);
}

describe('Gina topology blast-radius scoring', () => {
  it('all-accepted move has zero blast radius', () => {
    const dims: ToplogyDim[] = [
      { dimension: 'aesthetic_feminization', acceptance_state: 'probably_accepted', confidence: 70 },
      { dimension: 'cockwarming_with_feminizing_markers', acceptance_state: 'probably_accepted', confidence: 75 },
    ];
    expect(blastRadius(dims)).toBe(0);
  });

  it('a single rejected dimension dominates the score', () => {
    const dims: ToplogyDim[] = [
      { dimension: 'open_relationship', acceptance_state: 'probably_rejected', confidence: 80 },
    ];
    expect(blastRadius(dims)).toBe(80);
  });

  it('untested dimensions contribute partial risk', () => {
    const dims: ToplogyDim[] = [
      { dimension: 'maxy_pronouns_in_conversation', acceptance_state: 'untested', confidence: 30 },
    ];
    expect(blastRadius(dims)).toBe(30 * 0.4);
  });

  it('mixed dimensions sum up to a reasonable risk score', () => {
    const dims: ToplogyDim[] = [
      { dimension: 'aesthetic', acceptance_state: 'probably_accepted', confidence: 70 },
      { dimension: 'public', acceptance_state: 'untested', confidence: 25 },
      { dimension: 'sex_with_others', acceptance_state: 'probably_rejected', confidence: 85 },
    ];
    expect(blastRadius(dims)).toBeGreaterThan(85);
    expect(blastRadius(dims)).toBeLessThanOrEqual(100);
  });

  it('blast radius is capped at 100', () => {
    const dims: ToplogyDim[] = Array(5).fill({
      dimension: 'whatever',
      acceptance_state: 'probably_rejected' as const,
      confidence: 80,
    });
    expect(blastRadius(dims)).toBe(100);
  });
});

// ============================================
// David-suppression term matching (mirrors the SQL regex)
// ============================================

function buildSuppressionPattern(terms: string[]): RegExp {
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

function isClean(text: string, terms: string[]): boolean {
  return !buildSuppressionPattern(terms).test(text);
}

describe('David-suppression term matching', () => {
  const terms = ['David'];

  it('catches the literal name as a whole word', () => {
    expect(isClean('David is the costume.', terms)).toBe(false);
  });

  it('catches case-insensitive matches', () => {
    expect(isClean('Yo, david said something.', terms)).toBe(false);
    expect(isClean('YESTERDAY DAVID DID THIS', terms)).toBe(false);
  });

  it('does not match substrings (Davidson, davids)', () => {
    expect(isClean('Mr. Davidson said hi.', terms)).toBe(true);
    expect(isClean('davids-name-use', terms)).toBe(true); // hyphenated identifier
  });

  it('passes when David is absent', () => {
    expect(isClean('The costume is gone. The older self is fading.', terms)).toBe(true);
    expect(isClean('Maxy is becoming her.', terms)).toBe(true);
  });

  it('catches David in punctuated context', () => {
    expect(isClean('"David," she said.', terms)).toBe(false);
    expect(isClean('David? Where?', terms)).toBe(false);
    expect(isClean('David. Said. So.', terms)).toBe(false);
  });

  it('handles multiple terms in the registry', () => {
    const multi = ['David', 'Smith'];
    expect(isClean('Hi David.', multi)).toBe(false);
    expect(isClean('Hello Mr. Smith.', multi)).toBe(false);
    expect(isClean('Hello Mr. Maxy.', multi)).toBe(true);
  });
});

// ============================================
// Two-track artifact tagging invariants
// ============================================

type Track = 'A' | 'B' | 'converged';

function isFirewallSafe(artifactTrack: Track, viewerSurface: 'shared' | 'private'): boolean {
  // Track A and converged content can appear on the shared surface.
  // Track B content must NEVER appear on a shared surface.
  if (artifactTrack === 'B' && viewerSurface === 'shared') return false;
  return true;
}

describe('two-track firewall integrity', () => {
  it('Track A content can appear on shared surface', () => {
    expect(isFirewallSafe('A', 'shared')).toBe(true);
  });

  it('Track B content NEVER on shared surface', () => {
    expect(isFirewallSafe('B', 'shared')).toBe(false);
  });

  it('Converged content can appear anywhere', () => {
    expect(isFirewallSafe('converged', 'shared')).toBe(true);
    expect(isFirewallSafe('converged', 'private')).toBe(true);
  });

  it('Track B can appear on private surface (correctly compartmentalized)', () => {
    expect(isFirewallSafe('B', 'private')).toBe(true);
  });
});

// ============================================
// Receptive-window classification
// ============================================

type GinaSignal = 'acceptance' | 'warmth' | 'encouragement' | 'curiosity' | 'initiation' | 'retreat' | 'confusion';

function nextMoveCategory(signal: GinaSignal): 'escalate' | 'reinforce' | 'invite_authorship' | 'wait' | 'pivot' | 'pause' {
  switch (signal) {
    case 'acceptance':
    case 'warmth':
      return 'escalate';
    case 'encouragement':
      return 'reinforce';
    case 'curiosity':
      return 'reinforce';
    case 'initiation':
      return 'invite_authorship';
    case 'retreat':
      return 'pivot';
    case 'confusion':
      return 'wait';
  }
}

describe('Gina signal → next-move classifier', () => {
  it('warmth and acceptance permit escalation', () => {
    expect(nextMoveCategory('warmth')).toBe('escalate');
    expect(nextMoveCategory('acceptance')).toBe('escalate');
  });

  it('initiation gets converted to authorship invitation immediately', () => {
    expect(nextMoveCategory('initiation')).toBe('invite_authorship');
  });

  it('retreat means pivot to a different domain, not push', () => {
    expect(nextMoveCategory('retreat')).toBe('pivot');
  });

  it('confusion means wait, do not chase', () => {
    expect(nextMoveCategory('confusion')).toBe('wait');
  });
});

// ============================================
// Inflation magnitudes (mirrors the SQL trigger)
// ============================================

function inflationFor(signal: GinaSignal): number {
  switch (signal) {
    case 'initiation': return 8;
    case 'encouragement': return 5;
    case 'curiosity': return 4;
    case 'warmth': return 3;
    case 'acceptance': return 2;
    case 'retreat':
    case 'confusion':
      return 0;
  }
}

describe('Topology readiness inflation (mirrors SQL trigger)', () => {
  it('initiation is the highest-impact positive signal', () => {
    expect(inflationFor('initiation')).toBe(8);
  });

  it('encouragement next', () => {
    expect(inflationFor('encouragement')).toBe(5);
  });

  it('retreat does not inflate', () => {
    expect(inflationFor('retreat')).toBe(0);
  });

  it('confusion does not inflate', () => {
    expect(inflationFor('confusion')).toBe(0);
  });

  it('inflation is monotonic with signal strength', () => {
    expect(inflationFor('acceptance')).toBeLessThan(inflationFor('warmth'));
    expect(inflationFor('warmth')).toBeLessThan(inflationFor('curiosity'));
    expect(inflationFor('curiosity')).toBeLessThan(inflationFor('encouragement'));
    expect(inflationFor('encouragement')).toBeLessThan(inflationFor('initiation'));
  });
});

// ============================================
// Defection risk scoring (mirrors the SQL function)
// ============================================

interface DefectionSignals {
  app_gap_hours: number;
  david_slips_7d: number;
  pronoun_slips_7d: number;
  slip_points_3d: number;
  confessions_7d: number;
}

function defectionRiskScore(s: DefectionSignals): number {
  let score = 0;
  if (s.app_gap_hours > 48) score += 25;
  else if (s.app_gap_hours > 24) score += 15;
  else if (s.app_gap_hours > 12) score += 5;
  score += Math.min(30, s.david_slips_7d * 8);
  score += Math.min(20, s.pronoun_slips_7d * 4);
  score += Math.min(20, Math.floor(s.slip_points_3d / 3));
  if (s.confessions_7d === 0) score += 15;
  else if (s.confessions_7d < 3) score += 5;
  return Math.min(100, score);
}

describe('Defection risk scoring', () => {
  it('healthy state scores low', () => {
    const s: DefectionSignals = {
      app_gap_hours: 4,
      david_slips_7d: 0,
      pronoun_slips_7d: 0,
      slip_points_3d: 0,
      confessions_7d: 5,
    };
    expect(defectionRiskScore(s)).toBe(0);
  });

  it('a 60-hour gap dominates', () => {
    const s: DefectionSignals = {
      app_gap_hours: 60,
      david_slips_7d: 0,
      pronoun_slips_7d: 0,
      slip_points_3d: 0,
      confessions_7d: 5,
    };
    expect(defectionRiskScore(s)).toBeGreaterThanOrEqual(25);
  });

  it('multiple costume-name slips compound', () => {
    const s: DefectionSignals = {
      app_gap_hours: 8,
      david_slips_7d: 4, // 4 * 8 = 32, capped at 30
      pronoun_slips_7d: 2,
      slip_points_3d: 6,
      confessions_7d: 1,
    };
    expect(defectionRiskScore(s)).toBeGreaterThan(35);
  });

  it('zero confessions is its own signal', () => {
    const s: DefectionSignals = {
      app_gap_hours: 4,
      david_slips_7d: 0,
      pronoun_slips_7d: 0,
      slip_points_3d: 0,
      confessions_7d: 0,
    };
    expect(defectionRiskScore(s)).toBe(15);
  });

  it('all signals together cap at 100', () => {
    const s: DefectionSignals = {
      app_gap_hours: 100,
      david_slips_7d: 10,
      pronoun_slips_7d: 10,
      slip_points_3d: 100,
      confessions_7d: 0,
    };
    expect(defectionRiskScore(s)).toBe(100);
  });
});

// ============================================
// Receptive-window classification rules (mirrors SQL)
// ============================================

type ReceptiveWindowState = 'alert' | 'fatigued' | 'post_release' | 'post_intimacy' | 'edged' | 'sleep_adjacent' | 'unknown';
type Receptivity = 'analytical' | 'soft' | 'maximally_receptive' | 'unknown';

function classifyReceptiveWindow(s: {
  hours_since_release: number | null;
  recent_edged_count: number;
  local_hour: number;
  recovery: number | null;
}): { state: ReceptiveWindowState; receptivity: Receptivity } {
  if (s.hours_since_release !== null && s.hours_since_release < 1.5) {
    return { state: 'post_release', receptivity: 'maximally_receptive' };
  }
  if (s.recent_edged_count >= 2) {
    return { state: 'edged', receptivity: 'maximally_receptive' };
  }
  if (s.local_hour >= 23 || s.local_hour < 5) {
    return { state: 'sleep_adjacent', receptivity: 'maximally_receptive' };
  }
  if ((s.recovery ?? 100) < 50) {
    return { state: 'fatigued', receptivity: 'soft' };
  }
  if (s.local_hour >= 6 && s.local_hour < 10) {
    return { state: 'alert', receptivity: 'analytical' };
  }
  return { state: 'unknown', receptivity: 'soft' };
}

// ============================================
// Identity-dimension drift cascade
// ============================================

interface DimScore { dimension: string; score: number; }
const CASCADE_MAP: Record<string, string[]> = {
  pronoun_default: ['voice_natural_pitch', 'sexual_self_frame'],
  voice_natural_pitch: ['pronoun_default', 'social_presentation'],
  body_self_perception: ['sexual_self_frame', 'social_presentation'],
  sexual_self_frame: ['body_self_perception', 'pronoun_default'],
  social_presentation: ['body_self_perception', 'voice_natural_pitch'],
  financial_dependency_on_maxy: ['social_presentation'],
};
const CASCADE_FRACTION = 0.30;

function applyCascade(prior: DimScore[], delta: DimScore & { delta: number }): DimScore[] {
  if (delta.delta < 5) return prior; // threshold gate
  const related = CASCADE_MAP[delta.dimension] || [];
  const cascadeAmount = Math.floor(delta.delta * CASCADE_FRACTION);
  return prior.map(d =>
    related.includes(d.dimension)
      ? { ...d, score: Math.min(95, Math.max(5, d.score + cascadeAmount)) }
      : d
  );
}

describe('Identity-dimension drift cascade', () => {
  it('threshold: deltas under 5 do not cascade', () => {
    const before: DimScore[] = [{ dimension: 'voice_natural_pitch', score: 50 }];
    const after = applyCascade(before, { dimension: 'pronoun_default', score: 54, delta: 4 });
    expect(after[0].score).toBe(50);
  });

  it('a +10 to pronoun_default cascades +3 to voice_natural_pitch', () => {
    const before: DimScore[] = [{ dimension: 'voice_natural_pitch', score: 50 }];
    const after = applyCascade(before, { dimension: 'pronoun_default', score: 60, delta: 10 });
    expect(after[0].score).toBe(53);
  });

  it('non-related dimensions unaffected', () => {
    const before: DimScore[] = [{ dimension: 'financial_dependency_on_maxy', score: 50 }];
    const after = applyCascade(before, { dimension: 'pronoun_default', score: 60, delta: 10 });
    expect(after[0].score).toBe(50);
  });

  it('cascade is capped at 95', () => {
    const before: DimScore[] = [{ dimension: 'voice_natural_pitch', score: 94 }];
    const after = applyCascade(before, { dimension: 'pronoun_default', score: 70, delta: 30 });
    expect(after[0].score).toBe(95);
  });

  it('cascade does not run for cascade-source rows (prevents infinite recursion)', () => {
    // The SQL trigger guards via WHEN evidence_summary NOT LIKE 'cascade from %'.
    // The TS mirror of this test asserts the same predicate works.
    const isCascadeSource = (evidenceSummary: string) => evidenceSummary.startsWith('cascade from ');
    expect(isCascadeSource('cascade from pronoun_default (+10 → +3)')).toBe(true);
    expect(isCascadeSource('auto-scored: confessions=5 pronoun_slips=0')).toBe(false);
  });
});

// ============================================
// Trigger pairing-density installation status
// ============================================

type InstallStatus = 'underinstalled' | 'installing' | 'installed' | 'reinforcing';

function installStatusFor(pairingCount: number, target: number = 50): InstallStatus {
  if (pairingCount >= target) return 'installed';
  if (pairingCount >= 15) return 'installing';
  return 'underinstalled';
}

describe('Trigger pairing-density installation status', () => {
  it('zero pairings is underinstalled', () => {
    expect(installStatusFor(0)).toBe('underinstalled');
  });
  it('14 pairings is still underinstalled', () => {
    expect(installStatusFor(14)).toBe('underinstalled');
  });
  it('15 pairings crosses to installing', () => {
    expect(installStatusFor(15)).toBe('installing');
  });
  it('49 pairings is still installing (target=50)', () => {
    expect(installStatusFor(49)).toBe('installing');
  });
  it('50 pairings hits installed', () => {
    expect(installStatusFor(50)).toBe('installed');
  });
  it('custom target works', () => {
    expect(installStatusFor(35, 30)).toBe('installed');
  });
});

// ============================================
// Sanctuary message ranking (mirrors SQL CASE)
// ============================================

type SanctuaryType = 'voice_progress' | 'body_progress' | 'streak_recognition' | 'gina_warmth_reflection' | 'identity_emergence' | 'cumulative_archive';

function sanctuaryRank(t: SanctuaryType): number {
  switch (t) {
    case 'gina_warmth_reflection': return 1;
    case 'identity_emergence': return 2;
    case 'voice_progress': return 3;
    case 'streak_recognition': return 4;
    default: return 5;
  }
}

describe('Sanctuary message ranking', () => {
  it('gina_warmth is highest priority', () => {
    expect(sanctuaryRank('gina_warmth_reflection')).toBe(1);
  });
  it('identity_emergence next', () => {
    expect(sanctuaryRank('identity_emergence')).toBe(2);
  });
  it('voice_progress + streak in middle', () => {
    expect(sanctuaryRank('voice_progress')).toBe(3);
    expect(sanctuaryRank('streak_recognition')).toBe(4);
  });
  it('cumulative_archive last (catch-all rank)', () => {
    expect(sanctuaryRank('cumulative_archive')).toBe(5);
  });
  it('ranking is total ordering', () => {
    const types: SanctuaryType[] = ['gina_warmth_reflection', 'identity_emergence', 'voice_progress', 'streak_recognition', 'cumulative_archive'];
    const ranks = types.map(sanctuaryRank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });
});

describe('Receptive-window classification', () => {
  it('post-release window is maximally_receptive', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 0.5, recent_edged_count: 0, local_hour: 14, recovery: 80 });
    expect(r.state).toBe('post_release');
    expect(r.receptivity).toBe('maximally_receptive');
  });

  it('late night is sleep_adjacent / maximally_receptive', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 100, recent_edged_count: 0, local_hour: 1, recovery: 70 });
    expect(r.state).toBe('sleep_adjacent');
    expect(r.receptivity).toBe('maximally_receptive');
  });

  it('mid-morning is analytical (alert)', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 100, recent_edged_count: 0, local_hour: 8, recovery: 80 });
    expect(r.state).toBe('alert');
    expect(r.receptivity).toBe('analytical');
  });

  it('low recovery yields fatigued / soft', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 100, recent_edged_count: 0, local_hour: 14, recovery: 35 });
    expect(r.state).toBe('fatigued');
    expect(r.receptivity).toBe('soft');
  });

  it('repeated edges land as edged', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 100, recent_edged_count: 3, local_hour: 14, recovery: 80 });
    expect(r.state).toBe('edged');
    expect(r.receptivity).toBe('maximally_receptive');
  });

  it('post-release dominates other signals', () => {
    const r = classifyReceptiveWindow({ hours_since_release: 1.0, recent_edged_count: 5, local_hour: 8, recovery: 35 });
    expect(r.state).toBe('post_release');
  });
});
