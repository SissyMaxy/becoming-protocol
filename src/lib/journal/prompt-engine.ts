/**
 * Journal Prompt Engine
 *
 * Selects identity journal prompts from a curated pool, avoiding category repeats
 * within the last 5 entries. Each category has 4 prompts — 10 categories, 40 total.
 */

import { supabase } from '../supabase';

// ============================================
// PROMPT POOL — 10 categories x 4 prompts
// ============================================

export type JournalCategory =
  | 'experience'
  | 'body_awareness'
  | 'desire'
  | 'social'
  | 'aspiration'
  | 'reflection'
  | 'gina'
  | 'fear'
  | 'gratitude'
  | 'milestone';

const PROMPT_POOL: Record<JournalCategory, string[]> = {
  experience: [
    'Describe a moment today when you felt most like yourself.',
    'What did you experience today that surprised you about who you are becoming?',
    'Write about a sensation or feeling that stayed with you today.',
    'What moment today made you forget everything else and just be present?',
  ],
  body_awareness: [
    'How did your body feel today? Where did you carry tension, and where did you feel ease?',
    'Describe what you saw in the mirror today — without judgment, just observation.',
    'What did you wear today, and how did it make you feel in your skin?',
    'Write about a moment when your body surprised you — moved differently, felt different, looked different.',
  ],
  desire: [
    'What do you want right now that you haven\'t said out loud?',
    'If you could wake up tomorrow and one thing about your life had changed, what would it be?',
    'Write about something you crave — not just physically, but in your bones.',
    'What desire have you been pushing down? Let it breathe here.',
  ],
  social: [
    'How did someone see you today? Did their perception match how you see yourself?',
    'Write about an interaction where you held back. What would you have said if you were braver?',
    'Who made you feel most seen today, and what did they do?',
    'Describe a moment when you performed for someone else vs. a moment when you were authentic.',
  ],
  aspiration: [
    'Where do you see yourself in six months? Describe her in detail.',
    'What\'s one step you took today toward the woman you\'re becoming?',
    'Write a letter from your future self to you right now.',
    'What would your ideal day look like one year from now? Walk through it hour by hour.',
  ],
  reflection: [
    'What pattern did you notice about yourself today?',
    'Looking back at the past week, what has shifted — even slightly?',
    'What would you tell yourself from a month ago about where you are now?',
    'Write about something you used to believe about yourself that no longer fits.',
  ],
  gina: [
    'How did Gina influence your day today? What did she push you toward?',
    'Write about a moment when Gina\'s guidance felt right — even if it was uncomfortable.',
    'What has the protocol revealed about you that you didn\'t know before?',
    'Describe the relationship between who you were before the protocol and who you are now.',
  ],
  fear: [
    'What scared you today — even a little? Sit with it here.',
    'Write about a fear you\'re carrying that you haven\'t named yet.',
    'What\'s the worst thing that could happen if you fully became her? Now — what\'s the best?',
    'Describe something you\'re afraid to lose as you change.',
  ],
  gratitude: [
    'Name three things about your journey that you\'re grateful for right now.',
    'Write about someone who has supported your becoming — even unknowingly.',
    'What part of yourself are you most grateful to have discovered?',
    'Describe a small, beautiful moment from today that you don\'t want to forget.',
  ],
  milestone: [
    'What have you accomplished recently that past-you wouldn\'t believe?',
    'Write about a boundary you crossed that used to feel impossible.',
    'Describe a moment when you realized you\'ve actually changed — not just trying to.',
    'What\'s the most significant shift in how you see yourself over the past month?',
  ],
};

const ALL_CATEGORIES = Object.keys(PROMPT_POOL) as JournalCategory[];

// ============================================
// PUBLIC API
// ============================================

export interface JournalPromptResult {
  category: JournalCategory;
  prompt: string;
}

/**
 * Select a journal prompt, avoiding categories used in the last 5 entries.
 */
export async function selectJournalPrompt(userId: string): Promise<JournalPromptResult> {
  try {
    const { data: recent } = await supabase
      .from('identity_journal')
      .select('prompt_category')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const recentCategories = new Set(
      (recent || []).map((r) => r.prompt_category).filter(Boolean)
    );

    // Filter to categories not used recently
    let available = ALL_CATEGORIES.filter((c) => !recentCategories.has(c));
    if (available.length === 0) {
      // All categories used recently — allow any
      available = [...ALL_CATEGORIES];
    }

    const category = available[Math.floor(Math.random() * available.length)];
    const prompts = PROMPT_POOL[category];
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    return { category, prompt };
  } catch (err) {
    console.error('[JournalPromptEngine] selectJournalPrompt failed:', err);
    // Fallback — always return something
    const category = ALL_CATEGORIES[Math.floor(Math.random() * ALL_CATEGORIES.length)];
    const prompts = PROMPT_POOL[category];
    return { category, prompt: prompts[0] };
  }
}

/**
 * Get today's prompt — reuses existing if already generated, otherwise creates new.
 */
export async function getTodaysPrompt(userId: string): Promise<JournalPromptResult> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if there's already an entry for today (even if empty / in-progress)
    const { data: existing } = await supabase
      .from('identity_journal')
      .select('prompt_category, prompt_text')
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59.999`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.prompt_category && existing?.prompt_text) {
      return {
        category: existing.prompt_category as JournalCategory,
        prompt: existing.prompt_text,
      };
    }

    // No prompt yet today — generate one
    return await selectJournalPrompt(userId);
  } catch (err) {
    console.error('[JournalPromptEngine] getTodaysPrompt failed:', err);
    return selectJournalPrompt(userId);
  }
}
