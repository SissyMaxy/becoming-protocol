/**
 * Pop-Up Message Tests
 * Validates character limits on all pop-up messages (template and utility paths).
 *
 * Test IDs:
 *   POP1 — truncatePopUp enforces limits on oversized input
 *   POP2 — all template-generated pop-ups respect limits
 *   POP3 — validatePopUp catches violations
 */
import { describe, it, expect } from 'vitest';
import { truncateToLimit, truncatePopUp, validatePopUp } from '../../lib/handler-v2/popup-utils';
import { TemplateEngine } from '../../lib/handler-v2/template-engine';
import type { PopUpMessage, PopUpNotificationType, HandlerMode } from '../../lib/handler-v2/types';
import { POPUP_LIMITS } from '../../lib/handler-v2/types';
import type { UserState } from '../../lib/handler-v2/types';

// ============================================
// HELPERS
// ============================================

function makeState(overrides: Partial<UserState> = {}): Partial<UserState> {
  return {
    denialDay: 5,
    streakDays: 12,
    edgeCount: 3,
    timeOfDay: 'morning',
    tasksCompletedToday: 2,
    currentArousal: 3,
    pointsToday: 45,
    odometer: 'progress',
    handlerMode: 'director',
    avoidedDomains: [],
    estimatedExecFunction: 'medium',
    ...overrides,
  };
}

// ============================================
// POP1: truncatePopUp enforces limits
// ============================================

describe('POP1: truncatePopUp enforces limits', () => {
  it('should pass through messages already under limits', () => {
    const msg: PopUpMessage = {
      title: 'Quick Task',
      body: 'Apply lip balm right now.',
      subtext: 'Small actions compound.',
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const result = truncatePopUp(msg);
    expect(result.title).toBe(msg.title);
    expect(result.body).toBe(msg.body);
    expect(result.subtext).toBe(msg.subtext);
  });

  it('should truncate title to ≤40 chars at word boundary', () => {
    const msg: PopUpMessage = {
      title: 'This is a very long title that definitely exceeds the forty character limit',
      body: 'Short body.',
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const result = truncatePopUp(msg);
    expect(result.title.length).toBeLessThanOrEqual(POPUP_LIMITS.title);
  });

  it('should truncate body to ≤200 chars at sentence boundary', () => {
    const longBody = 'Apply lip balm right now. Notice how it feels on your skin. Let the sensation anchor you to this moment. Feel the gloss catching the light. Remember that she lives in these small details. Every micro-action builds the neural pathway deeper.';
    const msg: PopUpMessage = {
      title: 'Quick Task',
      body: longBody,
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    expect(longBody.length).toBeGreaterThan(POPUP_LIMITS.body);
    const result = truncatePopUp(msg);
    expect(result.body.length).toBeLessThanOrEqual(POPUP_LIMITS.body);
    // Should end at a sentence boundary
    expect(result.body).toMatch(/[.!?]$/);
  });

  it('should truncate subtext to ≤80 chars', () => {
    const msg: PopUpMessage = {
      title: 'Hey',
      body: 'Short.',
      subtext: 'This is a subtext that is way too long and goes on and on about nothing in particular just to exceed the eighty character limit for subtexts.',
      notification_type: 'affirmation',
      handler_mode: 'director',
      priority: 'normal',
    };

    const result = truncatePopUp(msg);
    expect(result.subtext!.length).toBeLessThanOrEqual(POPUP_LIMITS.subtext);
  });

  it('should leave undefined subtext as undefined', () => {
    const msg: PopUpMessage = {
      title: 'Hey',
      body: 'Short.',
      notification_type: 'affirmation',
      handler_mode: 'director',
      priority: 'normal',
    };

    const result = truncatePopUp(msg);
    expect(result.subtext).toBeUndefined();
  });
});

// ============================================
// POP1 continued: truncateToLimit edge cases
// ============================================

describe('POP1: truncateToLimit', () => {
  it('should return text unchanged if under limit', () => {
    expect(truncateToLimit('Hello', 40)).toBe('Hello');
  });

  it('should truncate at last sentence boundary', () => {
    const text = 'First sentence. Second sentence. Third sentence that is too long.';
    const result = truncateToLimit(text, 35);
    expect(result).toBe('First sentence. Second sentence.');
    expect(result.length).toBeLessThanOrEqual(35);
  });

  it('should truncate at word boundary when no sentence end', () => {
    const text = 'one two three four five six seven eight nine ten';
    const result = truncateToLimit(text, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).not.toMatch(/ $/); // no trailing space
  });

  it('should handle exclamation and question marks as sentence ends', () => {
    const text = 'Do it now! Keep going? Maybe later.';
    const result = truncateToLimit(text, 15);
    expect(result).toBe('Do it now!');
  });
});

// ============================================
// POP2: all template pop-ups respect limits
// ============================================

describe('POP2: template-generated pop-ups respect limits', () => {
  const engine = new TemplateEngine();
  const types: PopUpNotificationType[] = ['micro_task', 'affirmation', 'content_unlock', 'challenge', 'jackpot'];
  const modes: HandlerMode[] = ['director', 'handler', 'caretaker', 'architect', 'invisible'];

  // Test every type × mode combination
  for (const type of types) {
    for (const mode of modes) {
      it(`${type} × ${mode}: all fields within limits`, () => {
        const state = makeState({ handlerMode: mode });

        // Generate multiple times to cover random template selection
        for (let i = 0; i < 10; i++) {
          const popup = engine.generatePopUp(type, state);

          expect(popup.title.length).toBeLessThanOrEqual(POPUP_LIMITS.title);
          expect(popup.body.length).toBeLessThanOrEqual(POPUP_LIMITS.body);
          if (popup.subtext) {
            expect(popup.subtext.length).toBeLessThanOrEqual(POPUP_LIMITS.subtext);
          }
          expect(popup.notification_type).toBe(type);
          expect(popup.handler_mode).toBe(mode);
        }
      });
    }
  }

  it('should substitute template variables and stay within limits', () => {
    // Use extreme values to push substitution length
    const state = makeState({
      denialDay: 999,
      streakDays: 9999,
      edgeCount: 99,
      pointsToday: 99999,
      handlerMode: 'handler',
    });

    for (const type of types) {
      for (let i = 0; i < 5; i++) {
        const popup = engine.generatePopUp(type, state);
        expect(popup.title.length).toBeLessThanOrEqual(POPUP_LIMITS.title);
        expect(popup.body.length).toBeLessThanOrEqual(POPUP_LIMITS.body);
      }
    }
  });
});

// ============================================
// POP3: validatePopUp catches violations
// ============================================

describe('POP3: validatePopUp catches violations', () => {
  it('should return empty array for valid message', () => {
    const msg: PopUpMessage = {
      title: 'Quick Task',
      body: 'Apply lip balm.',
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    expect(validatePopUp(msg)).toEqual([]);
  });

  it('should flag title over 40 chars', () => {
    const msg: PopUpMessage = {
      title: 'A'.repeat(41),
      body: 'Fine.',
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const violations = validatePopUp(msg);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('Title');
  });

  it('should flag body over 200 chars', () => {
    const msg: PopUpMessage = {
      title: 'OK',
      body: 'X'.repeat(201),
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const violations = validatePopUp(msg);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('Body');
  });

  it('should flag subtext over 80 chars', () => {
    const msg: PopUpMessage = {
      title: 'OK',
      body: 'Fine.',
      subtext: 'S'.repeat(81),
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const violations = validatePopUp(msg);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('Subtext');
  });

  it('should flag multiple violations at once', () => {
    const msg: PopUpMessage = {
      title: 'T'.repeat(50),
      body: 'B'.repeat(250),
      subtext: 'S'.repeat(100),
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    const violations = validatePopUp(msg);
    expect(violations.length).toBe(3);
  });

  it('should not flag subtext if undefined', () => {
    const msg: PopUpMessage = {
      title: 'OK',
      body: 'Fine.',
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    expect(validatePopUp(msg)).toEqual([]);
  });

  it('should accept messages at exactly the limit', () => {
    const msg: PopUpMessage = {
      title: 'T'.repeat(40),
      body: 'B'.repeat(200),
      subtext: 'S'.repeat(80),
      notification_type: 'micro_task',
      handler_mode: 'director',
      priority: 'normal',
    };

    expect(validatePopUp(msg)).toEqual([]);
  });
});
