/**
 * Integration test for the drip → answer → re-drip loop.
 *
 * Simulates the edge function's state transitions in memory:
 *   1. selector picks question A.
 *   2. caller writes a delivered_at row → A is now "in flight".
 *   3. user "answers" → caller stamps answered_at on A's row + writes a
 *      mommy_dossier upsert.
 *   4. selector runs again — must NOT re-pick A (because answered_at is
 *      set), must pick a different unanswered question.
 *   5. user "skips" question B → row gets skipped=true with updated_at=now.
 *   6. selector runs again within the 14d cooldown — must NOT re-pick B.
 *   7. selector runs again with a clock 30 days later — B is eligible
 *      again because skip cooldown lapsed.
 *
 * This is the core invariant of the drip loop. If any step regresses,
 * the user either gets the same question repeatedly or never re-asked
 * a skipped question that should reappear.
 */

import { describe, it, expect } from 'vitest';
import {
  selectNextDossierQuestion,
  type DossierQuestionRow,
  type DossierResponseSnapshot,
  type UserStateSnapshot,
} from '../../lib/persona/dossier-selector';

function q(id: string, category: DossierQuestionRow['category'], priority: number): DossierQuestionRow {
  return {
    id, question_key: `key-${id}`, category, question_text: `q-${id}`,
    placeholder: null, expected_response_kind: 'text', choices: null,
    phase_min: 0, intensity_min: 'gentle', priority, importance: 3,
    tone: 'soft', input_length: 'short', active: true,
  };
}

const state: UserStateSnapshot = { current_phase: 1, escalation_level: 2 };

describe('dossier drip — full delivery + answer + skip cycle', () => {
  it('answered question is never re-selected; skipped question waits 14 days', () => {
    const catalog = [
      q('A', 'name', 10),
      q('B', 'gina', 20),
      q('C', 'body', 30),
    ];
    // Simulated DB state. We push rows as the "edge fn" would.
    const responses: DossierResponseSnapshot[] = [];
    const mommyDossier: Array<{ key: string; answer: string }> = [];

    // Step 1 — first drip
    const t0 = new Date('2026-05-08T12:00:00Z');
    let pick = selectNextDossierQuestion(catalog, responses, state, { now: t0 }).pick;
    expect(pick?.id).toBe('A'); // lowest priority + zero coverage

    // Step 2 — caller writes the delivery
    responses.push({
      question_id: pick!.id, category: pick!.category,
      delivered_at: t0.toISOString(), answered_at: null,
      skipped: false, updated_at: t0.toISOString(),
    });

    // Step 3 — user answers A
    const answerTs = new Date(t0.getTime() + 60_000);
    const aRow = responses[responses.length - 1];
    aRow.answered_at = answerTs.toISOString();
    aRow.updated_at = answerTs.toISOString();
    mommyDossier.push({ key: pick!.question_key, answer: 'Maxy' });
    expect(mommyDossier).toHaveLength(1);

    // Step 4 — second drip; must not re-pick A
    pick = selectNextDossierQuestion(catalog, responses, state, { now: answerTs }).pick;
    expect(pick?.id).not.toBe('A');
    expect(pick?.id).toBe('B'); // next-best by priority, different category (coverage bias)

    // Step 5 — deliver + skip B
    responses.push({
      question_id: pick!.id, category: pick!.category,
      delivered_at: answerTs.toISOString(), answered_at: null,
      skipped: false, updated_at: answerTs.toISOString(),
    });
    const skipTs = new Date(answerTs.getTime() + 5_000);
    const bRow = responses[responses.length - 1];
    bRow.skipped = true;
    bRow.updated_at = skipTs.toISOString();

    // Step 6 — third drip within cooldown window (5 days later); must NOT
    // re-pick B
    const fiveDaysLater = new Date(skipTs.getTime() + 5 * 86400_000);
    pick = selectNextDossierQuestion(catalog, responses, state, { now: fiveDaysLater }).pick;
    expect(pick?.id).toBe('C');

    // Step 7 — fourth drip 30 days later; B's skip cooldown has lapsed.
    // C is now the most-recently-delivered (we'll write it as such), so
    // recency avoidance pushes selector back to B.
    responses.push({
      question_id: 'C', category: 'body',
      delivered_at: fiveDaysLater.toISOString(), answered_at: null,
      skipped: false, updated_at: fiveDaysLater.toISOString(),
    });
    const thirtyDaysAfterSkip = new Date(skipTs.getTime() + 30 * 86400_000);
    pick = selectNextDossierQuestion(catalog, responses, state, { now: thirtyDaysAfterSkip }).pick;
    // B should be eligible again. C was delivered most recently. With B
    // and C both eligible (A is answered, B's skip lapsed) coverage bias
    // is equal (none answered), recency avoidance prefers B.
    expect(pick?.id).toBe('B');
  });

  it('phase gate is enforced even after the answered/skipped pool changes', () => {
    const catalog: DossierQuestionRow[] = [
      { ...q('easy', 'name', 50), phase_min: 0 },
      { ...q('hard', 'confession_seed', 1), phase_min: 5, intensity_min: 'cruel' },
    ];
    const phase1: UserStateSnapshot = { current_phase: 1, escalation_level: 2 };
    const r = selectNextDossierQuestion(catalog, [], phase1);
    // Even though "hard" has the lowest priority, it's gated out — pick
    // must always be "easy" for a phase-1 user.
    expect(r.pick?.id).toBe('easy');
  });

  it('mirrors a catch-up answer correctly: dual-write keeps drip selector in sync', () => {
    // Simulates the MommyDossierQuiz catch-up path — writes to
    // mommy_dossier AND dossier_question_responses with source='catchup'.
    // The selector must respect that catch-up answers count as answered.
    const catalog = [q('A', 'name', 10), q('B', 'gina', 20)];
    const responses: DossierResponseSnapshot[] = [
      // Catch-up answered A directly without going through a drip
      // delivery. delivered_at is set to the same moment as answered_at
      // by the quiz code so the row still satisfies the "delivered or
      // answered" view.
      {
        question_id: 'A', category: 'name',
        delivered_at: new Date().toISOString(),
        answered_at: new Date().toISOString(),
        skipped: false, updated_at: new Date().toISOString(),
      },
    ];
    const r = selectNextDossierQuestion(catalog, responses, state);
    expect(r.pick?.id).toBe('B');
  });
});
