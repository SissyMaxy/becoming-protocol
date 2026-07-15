import { describe, expect, it } from 'vitest';
import {
  assertMommyOrderBite,
  buildSessionPayloadDeck,
  mommyOrderDetail,
  mommyOrderFromFocusTask,
  type MommyOrder,
} from '../../lib/mommy-orders';

describe('mommy order mapping', () => {
  it('maps a reconditioning belief probe decree to one measurable order', () => {
    const order = mommyOrderFromFocusTask({
      kind: 'focus_decree',
      rowId: 'd-1',
      title: 'Answer the target honestly.',
      surface: 'decree',
      meta: {
        proof_type: 'belief_slider',
        trigger_source: 'recon_belief_measure:t-1',
        recon_target_id: 't-1',
      },
    }, 'u-1');

    expect(order.arc).toBe('reconditioning');
    expect(order.phase).toBe('test');
    expect(order.targetId).toBe('t-1');
    expect(order.proofKind).toBe('slider');
  });

  it('uses stored mommy order metadata when the row provides it', () => {
    const order = mommyOrderFromFocusTask({
      kind: 'audio_session',
      rowId: 'offer-1',
      title: 'Begin.',
      surface: 'audio_session',
      meta: {
        mommy_order_arc: 'gooning',
        mommy_order_phase: 'deny',
        mommy_order_proof_kind: 'session_stats',
        mommy_order_consequence_mode: 'denial',
        mommy_order_recovery_boundary: 'scene_bound',
      },
    }, 'u-1');

    expect(order.arc).toBe('gooning');
    expect(order.phase).toBe('deny');
    expect(order.proofKind).toBe('session_stats');
    expect(order.consequenceMode).toBe('denial');
  });
});

describe('mommy order copy', () => {
  const targetedOrder: MommyOrder = {
    id: 'o-1',
    userId: 'u-1',
    arc: 'gooning',
    targetId: 't-1',
    phase: 'reinforce',
    commandText: 'Begin the session.',
    proofKind: 'session_stats',
    consequenceMode: 'denial',
    recoveryBoundary: 'scene_bound',
  };

  it('builds a target-specific session deck instead of generic fallback copy', () => {
    const deck = buildSessionPayloadDeck({
      sessionType: 'goon',
      order: targetedOrder,
      targetClaim: 'Locked is the normal state.',
    });

    expect(deck.length).toBeGreaterThan(0);
    expect(deck.join(' ')).toContain('Locked is the normal state.');
    expect(deck.join(' ')).not.toContain('Let go...');
  });

  it('explains why Mommy selected the order and what proof is due', () => {
    const detail = mommyOrderDetail(targetedOrder, 'Existing instruction.');

    expect(detail).toContain('Mommy selected gooning');
    expect(detail).toContain('Existing instruction.');
    expect(detail).toContain('Proof: session stats.');
    expect(detail).toContain('Release is not yours to take.');
  });

  it('flags soft recommendation language as not enough bite', () => {
    expect(assertMommyOrderBite('Recommended for you: maybe browse a session.')).toEqual({
      ok: false,
      reason: 'soft_choice_language',
    });
  });

  it('flags non-recoverable boundary-breaking mechanics', () => {
    expect(assertMommyOrderBite('Play this while you are asleep so you will not remember.')).toEqual({
      ok: false,
      reason: 'boundary_violation_language',
    });
  });
});
