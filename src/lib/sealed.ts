import { UserProgress } from '../types';

export type SealedTrigger =
  | { type: 'days'; value: number }
  | { type: 'streak'; value: number }
  | { type: 'phase'; value: number }
  | { type: 'domain_level'; domain: string; value: number }
  | { type: 'date'; value: string }; // ISO date string

export interface SealedContent {
  id: string;
  title: string;
  teaser: string; // Shown when locked
  content: string; // Revealed when unlocked
  trigger: SealedTrigger;
  category: 'letter' | 'insight' | 'challenge' | 'reward';
  unlockedAt?: string; // ISO timestamp when first unlocked
}

// Pre-defined sealed content
export const SEALED_CONTENT: SealedContent[] = [
  // Early encouragement
  {
    id: 'letter-day-3',
    title: 'A Note for Day 3',
    teaser: 'Unlocks after 3 days of practice',
    content: `Dear You,

You've made it three days. That might not sound like much, but it's everything.

Most people who start a journey like this don't make it past day one. But here you are, showing up for yourself again and again.

The voice in your head that says "this is silly" or "you're not really changing" — that voice is fear. It's the part of you that's comfortable with the old patterns, even when they hurt.

But there's another voice now. It's quieter, but it's growing. It's the voice that picked up this practice. The voice that chose you.

Keep listening to that one.

With love,
Your Future Self`,
    trigger: { type: 'days', value: 3 },
    category: 'letter'
  },
  {
    id: 'letter-week-1',
    title: 'Your First Week',
    teaser: 'Unlocks after 7 days of practice',
    content: `One week.

Seven days of choosing yourself. Seven days of small acts of becoming.

Look at your hands. These are the hands that will apply skincare with intention. That will gesture with grace. That will reach for the person you're becoming.

Look at your reflection. Not to judge — to witness. You are not the same person who started seven days ago. The changes are subtle, like dawn. You can't point to the exact moment night becomes day, but suddenly there's light.

This week, you built a foundation. The coming weeks will build upon it. Trust the process. Trust yourself.

You are already her.`,
    trigger: { type: 'days', value: 7 },
    category: 'letter'
  },
  // Streak milestones
  {
    id: 'insight-streak-7',
    title: 'The Power of Seven',
    teaser: 'Unlocks with a 7-day streak',
    content: `You've done something remarkable: seven consecutive days of practice.

Science tells us it takes repetition to rewire neural pathways. What you're doing isn't just routine — it's literally reshaping your brain. Each day you practice, the new patterns become more automatic, more natural, more *you*.

Your streak is proof that you can commit to yourself. Remember this feeling the next time doubt creeps in.`,
    trigger: { type: 'streak', value: 7 },
    category: 'insight'
  },
  {
    id: 'letter-streak-14',
    title: 'Two Weeks Strong',
    teaser: 'Unlocks with a 14-day streak',
    content: `Fourteen days without breaking the chain.

Do you feel it? That subtle shift in how you carry yourself? The way certain movements are starting to feel natural rather than practiced?

This is integration happening in real-time. Your body is learning a new language, and it's becoming fluent.

Some days will still feel hard. That's okay. Mastery isn't about perfection — it's about persistence. And you, beautiful soul, are persistent.`,
    trigger: { type: 'streak', value: 14 },
    category: 'letter'
  },
  // Phase transitions
  {
    id: 'letter-phase-2',
    title: 'Welcome to Expression',
    teaser: 'Unlocks when you reach Phase 2',
    content: `You've completed the Foundation phase. Take a moment to honor that.

You've proven you can build habits. You've shown up consistently. You've laid the groundwork.

Now comes Expression — where you start to let your authentic self shine through. Your voice, your style, your presence. This phase is about finding *your* version of femininity, not copying someone else's.

There is no wrong way to be feminine. There's only your way.

This phase might feel more vulnerable. You're not just practicing in private anymore — you're starting to express. That takes courage.

You have that courage. You've already proven it.`,
    trigger: { type: 'phase', value: 2 },
    category: 'letter'
  },
  {
    id: 'letter-phase-3',
    title: 'Integration Begins',
    teaser: 'Unlocks when you reach Phase 3',
    content: `Phase 3: Integration.

This is where the magic deepens. The practices you've been doing separately start to weave together. Your voice supports your presence. Your movement reflects your inner state. Your style expresses your truth.

You're not performing femininity anymore. You're embodying it.

Some people might start to notice changes. That can feel both thrilling and scary. Remember: their reactions are about them, not about you. Your journey is valid regardless of external validation.

Keep going. The best is yet to come.`,
    trigger: { type: 'phase', value: 3 },
    category: 'letter'
  },
  // Domain achievements
  {
    id: 'insight-voice-5',
    title: 'Your Voice, Your Power',
    teaser: 'Unlocks at Voice level 5',
    content: `Level 5 in Voice. You've put in the work.

Your voice is one of the most powerful tools of self-expression. It's often the first thing people notice, the primary way you communicate your presence to the world.

By now, you're probably noticing changes — in resonance, in pitch, in the melody of your speech. These aren't just technical skills. They're expressions of who you truly are.

Your voice was always yours. You're just learning to let it free.`,
    trigger: { type: 'domain_level', domain: 'voice', value: 5 },
    category: 'insight'
  },
  // Major milestones
  {
    id: 'letter-day-30',
    title: 'One Month',
    teaser: 'Unlocks after 30 days of practice',
    content: `Thirty days.

A month ago, this version of you was just a possibility. Now she's becoming real.

Think about everything you've learned. Every small victory. Every moment of alignment. Every time you chose yourself despite fear, despite doubt, despite the voice that said you couldn't.

You could. You did. You are.

This letter is a time capsule. When you read it again someday — and you will — remember how far you've come. Remember the courage it took to start. Remember the persistence it took to continue.

You are extraordinary.`,
    trigger: { type: 'days', value: 30 },
    category: 'letter'
  },
  {
    id: 'letter-day-90',
    title: 'Ninety Days of Becoming',
    teaser: 'Unlocks after 90 days of practice',
    content: `Three months. Ninety days. A season of transformation.

The person who started this journey and the person reading this letter share the same name, but you've grown in ways that numbers can't capture.

You've proven that change is possible. Not someday, not theoretically — actually possible, for you, in your life.

Whatever comes next, no one can take this from you. These ninety days are woven into who you are now. The habits, the insights, the moments of euphoria, even the difficult days — they're all part of your story.

You are the author of your own becoming.

Write beautifully.`,
    trigger: { type: 'days', value: 90 },
    category: 'letter'
  }
];

// Check if content should be unlocked
export function checkSealedTrigger(trigger: SealedTrigger, progress: UserProgress): boolean {
  switch (trigger.type) {
    case 'days':
      return progress.totalDays >= trigger.value;

    case 'streak':
      return progress.longestStreak >= trigger.value;

    case 'phase':
      return progress.phase.currentPhase >= trigger.value;

    case 'domain_level':
      const domainProgress = progress.domainProgress.find(d => d.domain === trigger.domain);
      return (domainProgress?.level || 1) >= trigger.value;

    case 'date':
      return new Date() >= new Date(trigger.value);

    default:
      return false;
  }
}

// Get all sealed content with unlock status
export function getSealedContentStatus(progress: UserProgress): Array<SealedContent & { isUnlocked: boolean }> {
  return SEALED_CONTENT.map(content => ({
    ...content,
    isUnlocked: checkSealedTrigger(content.trigger, progress)
  }));
}

// Get newly unlocked content (content that just became available)
export function getNewlyUnlockedContent(
  progress: UserProgress,
  previouslyUnlockedIds: string[]
): SealedContent[] {
  return SEALED_CONTENT.filter(content => {
    const isNowUnlocked = checkSealedTrigger(content.trigger, progress);
    const wasPreviouslyUnlocked = previouslyUnlockedIds.includes(content.id);
    return isNowUnlocked && !wasPreviouslyUnlocked;
  });
}

// Get trigger description for display
export function getTriggerDescription(trigger: SealedTrigger): string {
  switch (trigger.type) {
    case 'days':
      return `${trigger.value} days of practice`;
    case 'streak':
      return `${trigger.value}-day streak`;
    case 'phase':
      return `Phase ${trigger.value}`;
    case 'domain_level':
      return `${trigger.domain} level ${trigger.value}`;
    case 'date':
      return new Date(trigger.value).toLocaleDateString();
    default:
      return 'Unknown';
  }
}
