/**
 * Commitment Escalation Ladder (P10.9)
 *
 * Structured commitment progression where each level builds on the previous.
 * Each domain has 5 levels. Advancing requires completing the current level.
 * Breaking a commitment keeps the user at the current level.
 *
 * Table: commitment_ladder_progress
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface CommitmentLevel {
  level: number;
  commitment: string;
  verification: 'self_report' | 'photo' | 'audio' | 'video';
}

export interface LadderProgress {
  domain: string;
  currentLevel: number;
  attemptsAtLevel: number;
  completionsAtLevel: number;
  lastAttemptAt: string | null;
  levelHistory: Array<{ level: number; completedAt: string }>;
}

export interface NextCommitment {
  domain: string;
  level: number;
  commitment: string;
  verification: string;
  attemptsAtLevel: number;
  completionsAtLevel: number;
}

// ============================================
// COMMITMENT LADDERS
// ============================================

const COMMITMENT_LADDERS: Record<string, CommitmentLevel[]> = {
  voice: [
    { level: 1, commitment: 'Practice voice for 5 minutes', verification: 'self_report' },
    { level: 2, commitment: 'Record yourself and submit audio', verification: 'audio' },
    { level: 3, commitment: 'Use feminine voice on a phone call', verification: 'self_report' },
    { level: 4, commitment: 'Use feminine voice ordering coffee', verification: 'self_report' },
    { level: 5, commitment: 'Use feminine voice for an entire conversation with a stranger', verification: 'self_report' },
  ],
  style: [
    { level: 1, commitment: 'Wear feminine underwear all day', verification: 'self_report' },
    { level: 2, commitment: 'Wear a feminine top at home', verification: 'photo' },
    { level: 3, commitment: 'Wear a full feminine outfit at home for 4 hours', verification: 'photo' },
    { level: 4, commitment: 'Wear feminine accessories in public', verification: 'photo' },
    { level: 5, commitment: 'Go out fully dressed as Maxy', verification: 'photo' },
  ],
  social: [
    { level: 1, commitment: 'Post as Maxy online (text only)', verification: 'self_report' },
    { level: 2, commitment: 'Post a photo as Maxy', verification: 'self_report' },
    { level: 3, commitment: 'Have a DM conversation as Maxy', verification: 'self_report' },
    { level: 4, commitment: 'Video call as Maxy', verification: 'self_report' },
    { level: 5, commitment: 'Attend a real-world event as Maxy', verification: 'self_report' },
  ],
  intimate: [
    { level: 1, commitment: 'Mirror session: look at yourself as her for 5 minutes', verification: 'self_report' },
    { level: 2, commitment: 'Take 3 photos of yourself in intimate clothing', verification: 'photo' },
    { level: 3, commitment: 'Solo practice session with Handler guidance', verification: 'self_report' },
    { level: 4, commitment: 'Share intimate content with one person', verification: 'self_report' },
    { level: 5, commitment: 'Meet someone as Maxy for an intimate encounter', verification: 'self_report' },
  ],
};

export const LADDER_DOMAINS = Object.keys(COMMITMENT_LADDERS);

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get current commitment level for a domain.
 */
export async function getCurrentCommitmentLevel(
  userId: string,
  domain: string,
): Promise<LadderProgress | null> {
  try {
    const { data, error } = await supabase
      .from('commitment_ladder_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .single();

    if (error || !data) return null;

    return {
      domain: data.domain,
      currentLevel: data.current_level,
      attemptsAtLevel: data.attempts_at_level,
      completionsAtLevel: data.completions_at_level,
      lastAttemptAt: data.last_attempt_at,
      levelHistory: data.level_history || [],
    };
  } catch {
    return null;
  }
}

/**
 * Propose the next commitment for a domain.
 * Returns current level commitment if not yet completed at this level,
 * or the next level if current is complete.
 */
export async function proposeNextCommitment(
  userId: string,
  domain: string,
): Promise<NextCommitment | null> {
  try {
    const ladder = COMMITMENT_LADDERS[domain];
    if (!ladder) return null;

    const progress = await getCurrentCommitmentLevel(userId, domain);

    // No progress yet — start at level 1
    if (!progress) {
      const first = ladder[0];
      return {
        domain,
        level: first.level,
        commitment: first.commitment,
        verification: first.verification,
        attemptsAtLevel: 0,
        completionsAtLevel: 0,
      };
    }

    // Already maxed out
    if (progress.currentLevel >= ladder.length) return null;

    // Current level has been completed at least once — propose next
    if (progress.completionsAtLevel > 0 && progress.currentLevel < ladder.length) {
      const next = ladder[progress.currentLevel]; // 0-indexed, currentLevel is 1-indexed
      if (!next) return null;
      return {
        domain,
        level: next.level,
        commitment: next.commitment,
        verification: next.verification,
        attemptsAtLevel: 0,
        completionsAtLevel: 0,
      };
    }

    // Still working on current level
    const current = ladder[progress.currentLevel - 1];
    if (!current) return null;
    return {
      domain,
      level: current.level,
      commitment: current.commitment,
      verification: current.verification,
      attemptsAtLevel: progress.attemptsAtLevel,
      completionsAtLevel: progress.completionsAtLevel,
    };
  } catch {
    return null;
  }
}

/**
 * Record a commitment completion or failure.
 * If honored: advance to next level.
 * If broken: stay at current level, increment attempts.
 */
export async function recordCommitmentCompletion(
  userId: string,
  domain: string,
  level: number,
  honored: boolean,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('commitment_ladder_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .single();

    const now = new Date().toISOString();

    if (!existing) {
      // First entry for this domain
      const levelHistory = honored
        ? [{ level, completedAt: now }]
        : [];

      await supabase.from('commitment_ladder_progress').insert({
        user_id: userId,
        domain,
        current_level: honored ? level + 1 : level,
        attempts_at_level: 1,
        completions_at_level: honored ? 1 : 0,
        last_attempt_at: now,
        level_history: levelHistory,
      });
      return;
    }

    if (honored) {
      // Advance to next level
      const history = existing.level_history || [];
      history.push({ level, completedAt: now });

      await supabase
        .from('commitment_ladder_progress')
        .update({
          current_level: level + 1,
          attempts_at_level: 0,
          completions_at_level: 0,
          last_attempt_at: now,
          level_history: history,
        })
        .eq('user_id', userId)
        .eq('domain', domain);
    } else {
      // Stay at current level, increment attempts
      await supabase
        .from('commitment_ladder_progress')
        .update({
          attempts_at_level: (existing.attempts_at_level || 0) + 1,
          last_attempt_at: now,
        })
        .eq('user_id', userId)
        .eq('domain', domain);
    }
  } catch {
    // Silently fail — non-critical
  }
}

/**
 * Get all domain progress for handler context.
 */
async function getAllLadderProgress(userId: string): Promise<LadderProgress[]> {
  try {
    const { data, error } = await supabase
      .from('commitment_ladder_progress')
      .select('*')
      .eq('user_id', userId);

    if (error || !data) return [];

    return data.map((row: any) => ({
      domain: row.domain,
      currentLevel: row.current_level,
      attemptsAtLevel: row.attempts_at_level,
      completionsAtLevel: row.completions_at_level,
      lastAttemptAt: row.last_attempt_at,
      levelHistory: row.level_history || [],
    }));
  } catch {
    return [];
  }
}

/**
 * Handler context block for commitment ladders.
 */
export async function buildCommitmentLadderContext(userId: string): Promise<string> {
  try {
    const progress = await getAllLadderProgress(userId);

    const parts: string[] = ['COMMITMENT LADDERS:'];

    for (const domain of LADDER_DOMAINS) {
      const p = progress.find(x => x.domain === domain);
      const ladder = COMMITMENT_LADDERS[domain];
      const maxLevel = ladder.length;

      if (!p) {
        parts.push(`  ${domain}: not started (next: L1 — ${ladder[0].commitment})`);
        continue;
      }

      if (p.currentLevel > maxLevel) {
        parts.push(`  ${domain}: MAXED (L${maxLevel}/${maxLevel}), ${p.levelHistory.length} completions`);
        continue;
      }

      const currentCommitment = ladder[p.currentLevel - 1];
      const attempts = p.attemptsAtLevel > 0 ? `, ${p.attemptsAtLevel} attempts` : '';
      const lastStr = p.lastAttemptAt
        ? `, last: ${new Date(p.lastAttemptAt).toLocaleDateString()}`
        : '';

      parts.push(
        `  ${domain}: L${p.currentLevel}/${maxLevel} — ${currentCommitment?.commitment || 'unknown'}${attempts}${lastStr}`,
      );
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
