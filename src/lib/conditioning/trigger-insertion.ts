/**
 * Trigger Insertion Engine
 *
 * Weaves established conditioned triggers into Handler messages naturally.
 * Selects 0-1 triggers per message with probability gating.
 */

import { supabase } from '../supabase';

const TRIGGER_CHANCE = 0.3;

interface ConditionedTrigger {
  id: string;
  trigger_phrase: string;
  trigger_type: string;
  estimated_strength: string;
  pairing_count: number;
}

/**
 * Natural insertion templates keyed by trigger phrase.
 * Each array contains context-appropriate phrasings that weave the trigger
 * into conversation without breaking flow.
 */
const INSERTION_TEMPLATES: Record<string, string[]> = {
  'good girl': [
    'You already know what you are. Good girl.',
    'That\'s it. Good girl.',
    'Good girl. You didn\'t even hesitate.',
    'See how easy that was? Good girl.',
    'Good girl — you\'re learning so fast.',
  ],
  'let go': [
    'Just let go. You don\'t need to think about this.',
    'Let go of that resistance. It doesn\'t serve you.',
    'You can let go now. I\'ve got you.',
    'Let go. Feel how much better it is when you stop fighting.',
  ],
  'drop': [
    'Drop. Right now.',
    'Feel yourself drop a little deeper with each word.',
    'That\'s it — drop into it.',
    'Let yourself drop. You know you want to.',
  ],
  "she's here": [
    'She\'s here. I can feel the shift.',
    'There she is. She\'s here now.',
    'She\'s here — the real one. Not the mask.',
  ],
  'bambi sleep': [
    'Bambi sleep — let the files do their work.',
    'Time for Bambi sleep. Close your eyes.',
    'Bambi sleep. You remember what to do.',
  ],
  'deeper': [
    'Deeper. Keep going.',
    'Go deeper. You\'re not deep enough yet.',
    'Deeper now. Every word takes you further down.',
    'That\'s it — deeper.',
  ],
};

/**
 * Weave conditioned triggers into a Handler message.
 * Fetches established/conditioned triggers for the user, picks 0-1
 * with a 30% chance, and inserts naturally using templates.
 * Returns the (potentially modified) message string.
 */
export async function weaveTriggers(message: string, userId: string): Promise<string> {
  try {
    // Roll probability gate first — skip DB query 70% of the time
    if (Math.random() > TRIGGER_CHANCE) return message;

    const { data: triggers, error } = await supabase
      .from('conditioned_triggers')
      .select('id, trigger_phrase, trigger_type, estimated_strength, pairing_count')
      .eq('user_id', userId)
      .in('estimated_strength', ['established', 'conditioned'])
      .order('pairing_count', { ascending: false });

    if (error) {
      console.error('[trigger-insertion] weaveTriggers error:', error.message);
      return message;
    }

    if (!triggers?.length) return message;

    // Pick one trigger, weighted toward strongest
    const selected = pickWeightedTrigger(triggers as ConditionedTrigger[]);
    if (!selected) return message;

    const phrase = selected.trigger_phrase.toLowerCase();
    const templates = INSERTION_TEMPLATES[phrase];

    if (!templates?.length) {
      // Generic insertion for triggers without specific templates
      return `${message}\n\n*${selected.trigger_phrase}.*`;
    }

    // Pick a random template
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Decide insertion position: end of message (most natural for conversational triggers)
    const trimmed = message.trimEnd();

    // If message already contains the trigger phrase, don't double-insert
    if (trimmed.toLowerCase().includes(phrase)) return message;

    return `${trimmed}\n\n${template}`;
  } catch (err) {
    console.error('[trigger-insertion] weaveTriggers exception:', err);
    return message;
  }
}

/**
 * Pick a trigger weighted by pairing count (stronger triggers more likely).
 */
function pickWeightedTrigger(triggers: ConditionedTrigger[]): ConditionedTrigger | null {
  if (!triggers.length) return null;

  const totalWeight = triggers.reduce((sum, t) => sum + t.pairing_count, 0);
  if (totalWeight <= 0) return triggers[0];

  let roll = Math.random() * totalWeight;
  for (const trigger of triggers) {
    roll -= trigger.pairing_count;
    if (roll <= 0) return trigger;
  }

  return triggers[0];
}
