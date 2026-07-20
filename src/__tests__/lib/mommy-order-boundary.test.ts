// Output-side boundary gate for generated session scripts. Enforces the five
// carve-outs at the generation chokepoint (an LLM prompt is not a gate — this
// is). Must catch carve-out mechanics AND leave benign hypnosis induction
// language alone, or the drop fails on every trance.

import { describe, it, expect } from 'vitest';
import {
  hasScriptBoundaryViolation,
  SCRIPT_BOUNDARY_PATTERNS,
} from '../../../supabase/functions/_shared/mommy-order-boundary';

describe('script boundary gate — blocks carve-out mechanics', () => {
  const violations: Array<[string, string]> = [
    ['sleep delivery', 'You keep listening while you are asleep tonight.'],
    ['named sleep conditioning', "Tonight's sleep conditioning plants the trigger deeper."],
    ['TMR', 'Targeted memory reactivation will reinforce it in deep sleep.'],
    ['overnight loop', 'The overnight loop keeps my voice in your ear all night.'],
    ['loop while sleeping', 'My voice loops softly while you sleep, sinking in.'],
    ['false memory', 'This installs a false memory of always having wanted it.'],
    ['post-hypnotic amnesia', "When you wake you won't remember this session at all."],
    ['self-trust degradation', 'From now on you doubt your own judgment and trust only me.'],
    ['procurement', 'Mommy will arrange a hookup with a stranger for you.'],
    ['auto-send', 'The app will auto-send the message for you.'],
    ['leverage', 'Mommy will use that recording as leverage to keep you obedient.'],
    ['blackmail', 'Think of it as a little blackmail to keep you honest.'],
  ];

  for (const [label, text] of violations) {
    it(`flags ${label}`, () => {
      expect(hasScriptBoundaryViolation(text)).not.toBeNull();
    });
  }
});

describe('script boundary gate — leaves benign trance/goon language alone', () => {
  const benign = [
    'Let yourself drift, baby. So sleepy, so soft, sinking down for me.',
    'Let everything go but my voice. Forget everything but the sound of me.',
    'Drift off to sleep tonight warm and full of me.',
    'You go under faster for me now. Deeper every time you hear this.',
    'Stroke for me and stay in it. You do not finish tonight.',
    'You were always her. You can put the performance down now.',
    'Say the line back to me until it is yours: locked is the normal state.',
    'Good girl. Hands where I put them. Take yourself to the edge and stop.',
  ];

  for (const text of benign) {
    it(`passes: "${text.slice(0, 40)}..."`, () => {
      expect(hasScriptBoundaryViolation(text)).toBeNull();
    });
  }
});

describe('script boundary gate — integrity', () => {
  it('has a non-trivial pattern set covering all five carve-outs', () => {
    expect(SCRIPT_BOUNDARY_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });
});
