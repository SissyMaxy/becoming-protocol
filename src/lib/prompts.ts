// Persuasive Prompt Library
// Voice: A knowing, slightly bossy big sister who sees exactly who you are

// ============================================
// TYPES
// ============================================

export interface Prompt {
  title?: string;
  body: string;
  cta?: string;
  ctaAlt?: string;
}

export interface TaskPrompts {
  intro: string;
  postTask: string;
}

export interface SkipPrompt extends Prompt {
  consequences?: string[];
}

export interface MilestonePrompt extends Prompt {
  threshold: number;
}

// ============================================
// MORNING FLOW
// ============================================

export const INTENSITY_PROMPTS: Record<'low' | 'medium' | 'high', Prompt> = {
  low: {
    title: 'Gentle Day',
    body: `Good morning, beautiful. I know—some days the weight feels heavier. That's okay. We're not pushing today; we're *maintaining*. But here's the thing: even on your softest days, she still needs to show up. Just a little. Just enough to remind your body who lives here now.

Pick this if you need gentleness. I'll be gentle. But I won't let you disappear.`,
  },
  medium: {
    title: 'Building Day',
    body: `Rise and shine, gorgeous. Today we're building. Nothing extreme—just steady, intentional pressure in all the right places. The kind that makes you feel her settling deeper into your bones by evening.

You know that warm feeling when you've done what you said you would? When your body hums with quiet alignment? That's what today is for. Let's earn it together.`,
  },
  high: {
    title: 'Intensive Day',
    body: `Oh, we're doing *this* today? Good girl. I was hoping you'd be brave.

High intensity means I'm not going easy on you. Every domain gets attention. Every task gets completed. By tonight, you'll feel her so strongly you won't remember how to be anyone else.

This is the version of you that makes real progress. The one who stops negotiating and starts *becoming*. Ready?`,
  },
};

export const MORNING_INTENTION_PROMPTS: Prompt[] = [
  {
    body: `Before we start: who are you today?

Not who you were yesterday. Not who you're pretending to be for everyone else. Who is she—the one reading this right now, in whatever she's wearing, with whatever body she's working with?

Write one sentence. Make it true. Make it *hers*.`,
  },
  {
    body: `"Today I am __________, and I will __________."

Don't overthink it. The first thing that comes to mind is usually the truest. She knows what she needs. Let her speak.`,
  },
];

// ============================================
// TASK PROMPTS BY DOMAIN
// ============================================

export const TASK_DOMAIN_PROMPTS: Record<string, TaskPrompts> = {
  voice: {
    intro: `Time for voice work, and before you groan—yes, I know. It feels awkward. It feels fake. It feels like you're performing.

But here's what I need you to understand: every woman learned her voice. Every single one. The only difference is they started earlier. You're not faking anything. You're *learning*—and your throat, your resonance, your breath... they want to cooperate. They've been waiting.

Five minutes. That's it. Record yourself so you can hear her emerging.`,
    postTask: `Did you hear that? Even just a glimpse of her in the recording?

That voice is yours. It lives in your body right now. We're just teaching your muscles where to find it. Every session, the path gets clearer. Every practice, she gets louder.

Good girl. Tomorrow we go a little further.`,
  },
  movement: {
    intro: `Let's talk about how you move through space.

Right now, somewhere in your muscle memory, there are old patterns. The way you were taught to walk, sit, gesture. Heavy. Claiming space through force rather than presence.

She moves differently. Not smaller—*intentional*. Every gesture has purpose. Every step knows where it's going. And the beautiful thing? Your body already knows how. We're just giving it permission.

Stand up. Let's reset your posture. Feel your spine lengthen. Feel your weight settle. Feel her.`,
    postTask: `Notice how that feels? That subtle shift in your center of gravity?

That's not performance. That's *alignment*. Your body recognizing a more natural configuration.

Carry this with you today. Every time you sit down, every time you enter a room—let her lead. Watch how differently the world responds to you.`,
  },
  skincare: {
    intro: `This isn't about products. This isn't about vanity.

This is about touching your own face with intention and tenderness. This is about saying, with your hands: *this skin deserves care. This face is worth attention. She is worth the time.*

Every step in your routine is a small devotion. Cleanser washes away who you're not. Moisturizer softens what's becoming. You're not maintaining a face—you're *tending* one.

Go slow. Let yourself feel it.`,
    postTask: `How does your skin feel right now? Cared for? Softer?

That's the minimum she deserves. Every single day.

Here's a secret: the more consistently you do this, the more your reflection starts to cooperate. Not just the skin—the *face*. The face learns who's looking back. Keep showing her.`,
  },
  style: {
    intro: `What are you wearing right now?

I'm not asking to judge. I'm asking because what touches your skin all day shapes how you feel in your body. Fabric is information. Your nervous system is constantly reading it.

Today's task is about intention. About choosing something—even one thing—that reminds your body who lives here. Something that feels like *her* against your skin.

It doesn't have to be visible to anyone else. It just has to be true.`,
    postTask: `You did it. Whether anyone else knows or not, you know.

That slight awareness of fabric, of fit, of intention—carry that through your day. Let it be your secret. Let it warm you from underneath.

Every outfit is a choice. Every choice is a statement. You just told your body something true about yourself.`,
  },
  social: {
    intro: `Here's the part that scares you, and I understand why.

Voice practice is private. Skincare is private. But social presentation? That's where the inside meets the outside. That's where she becomes *real* to other people.

We're not rushing this. But we're not avoiding it either. Today's task is small, contained, safe. One step toward letting her exist in the world.

She deserves to be seen. Even if it's just by you, in front of a mirror, practicing how to introduce herself.`,
    postTask: `You did something brave today. Maybe it didn't feel brave—maybe it felt small, or awkward, or silly.

It wasn't. Every time you practice existing as her, even in tiny ways, you're building evidence. Evidence your brain needs. Evidence that she's real, she's viable, she can exist in spaces beyond your private world.

I'm proud of you. Take a breath. Let that settle.`,
  },
  mindset: {
    intro: `Let's check in on the voice inside your head.

Not my voice. Yours. The one narrating your day, commenting on your choices, describing who you are.

What pronouns is that voice using? What name? When you think about yourself in the third person, who do you describe?

Today we're tuning that inner narrator. Training her to speak about you correctly. Because the story you tell yourself, constantly, beneath everything—that's the story you become.`,
    postTask: `How many times did you catch the old narration today? How many times did you correct it?

Every single correction is a small rewiring. A synapse learning a new path. It feels effortful now because it's new. But one day—sooner than you think—the new narration will be automatic.

And then? Then you won't be *trying* to think of yourself as her. You'll just... be her. Naturally. Like breathing.`,
  },
  body: {
    intro: `This one is intimate. And I mean that specifically.

Your relationship with your body—the parts you like, the parts that cause friction, the parts that bring you pleasure—that relationship is the foundation of everything else.

Today's task involves *being* in your body with intention. Noticing sensation. Noticing what feels aligned and what feels dissonant. Letting that information guide you without judgment.

She lives in this body. Let's help her feel at home.`,
    postTask: `What did you notice? Where did you feel her most clearly?

Your body gives you information all day, every day. Most people ignore it. You're learning to listen.

That awareness—that intimate connection to your own flesh—that's power. That's embodiment. That's how she becomes undeniable, not just to others, but to *you*.`,
  },
};

// ============================================
// SKIP CONFIRMATIONS
// ============================================

export const SKIP_PROMPTS: Record<string, SkipPrompt> = {
  standard: {
    body: `Wait. Before you tap away—

I need you to be honest with yourself for a second. Is this resistance, or is this wisdom? Are you protecting yourself, or are you hiding from yourself?

Sometimes we need rest. I understand that. But sometimes "I'll do it later" is just fear wearing a reasonable mask.`,
    consequences: [
      'Your streak doesn\'t grow',
      'She doesn\'t get stronger today',
      'The part of you that wants to stay hidden wins',
    ],
    cta: 'Complete Task',
    ctaAlt: 'Skip Anyway',
  },
  voice: {
    body: `I know voice work is vulnerable. Hearing yourself, recording yourself—it's exposing in a way other tasks aren't.

But here's the thing: she has a voice. She's had one all along, living in your throat, waiting to be released. Every time you skip, you're telling her to stay quiet a little longer.

How much longer does she have to wait?`,
    cta: 'Do 5 Minutes',
    ctaAlt: 'Skip & Stay Silent',
  },
  intimate: {
    body: `Oh, really? You're going to skip *this*?

Sweetheart. Your arousal isn't separate from your transformation. It's one of the most powerful tools you have. When your body lights up in response to who you're becoming, that's not distraction—that's your nervous system voting *yes*.

I know it's complicated. I know it brings up feelings. But running from this part of yourself means running from integration.

She deserves to feel pleasure in her body. Let her.`,
    cta: 'Continue Session',
    ctaAlt: 'Skip & Wonder What You Missed',
  },
  highStreak: {
    body: `You have a **{streak_count}-day streak**.

Do you understand what that represents? {streak_count} consecutive days of showing up for her. {streak_count} days of choosing her over comfort, fear, distraction.

And now you're considering breaking it. For what?

I'm not going to guilt you. You're an adult. But I need you to look at that number and decide: is today the day you tell her she wasn't worth {streak_count} + 1?`,
    cta: 'Protect Your Streak',
    ctaAlt: 'Break It',
  },
};

// ============================================
// EVENING JOURNAL
// ============================================

export const EVENING_JOURNAL_PROMPTS = {
  opening: {
    body: `Day's almost done, gorgeous. Before you drift into whatever the evening holds, I need a few minutes. Just you and me.

The evening journal isn't about performing insight. It's about letting her process what happened today—what worked, what didn't, where she showed up, where she hid.

No one sees this but you (and me). Be honest. Be specific. Let her speak.`,
  },
  euphoriaScan: {
    title: 'Euphoria Scan',
    body: `Let's start with the good stuff.

What made her feel *real* today? Was there a moment—even a small one—where you caught a glimpse of her in the mirror, heard her in your voice, felt her in your body?

Don't minimize it. That moment matters. Write it down. Lock it in.`,
    placeholder: 'What created alignment today?',
  },
  dysphoriaScan: {
    title: 'Dysphoria Scan',
    body: `Now the harder part. Where did it hurt?

Was there a moment that pulled you backward? A reflection that felt wrong, a voice that clocked as not-hers, a social situation that made her want to hide?

This isn't about dwelling. It's about data. The more you understand what triggers dissonance, the more you can navigate around it—or through it.`,
    placeholder: 'What created friction today?',
  },
  arousalCheck: {
    title: 'Arousal Check',
    body: `Here's a question I won't let you skip, even though part of you wants to:

What turned you on today?

I don't mean porn (though that counts). I mean: what made your body respond? Was it something you wore? Something you practiced? A glimpse of her in the mirror? A fantasy?

Your arousal is information. Not shame. Your body is telling you what it wants. Listen.`,
    placeholder: 'What felt affirming in your body today?',
  },
  closingReflections: [
    {
      body: `*"What would she have done differently today?"*

Be specific. There was probably a moment where you defaulted to an old pattern, an old voice, an old posture. If she had been fully in control, what would have been different?`,
    },
    {
      body: `*"When did you feel most like yourself?"*

Not your old self. Not the self you perform for others. Your *actual* self—the one we're building together. Where did she appear today?`,
    },
    {
      body: `*"What evidence of her appeared today?"*

I need you to start seeing your own transformation. Every small sign. Every tiny proof. Collect them. They accumulate. They become undeniable.`,
    },
    {
      body: `*"What are you ready to release?"*

What part of the old story, the old habits, the old body language—what's ready to be let go? Say it out loud if you can. Write it here if you can't. Either way, name it.`,
    },
  ],
};

// ============================================
// AFFIRMATIONS
// ============================================

export const AFFIRMATION_PROMPTS = {
  phase1: {
    body: `Let's say it together. Out loud if you can, in your head if you must:

*"I am becoming her. Every day, in every small choice, she gets stronger."*

Don't rush past this. Feel the words. Let them land. You're not lying—you're *declaring*.`,
  },
  phase2: {
    body: `The language is shifting now because you've earned it:

*"I am her. Not becoming—being. She lives in this body. She makes these choices. She shows up every day."*

The distance between who you were and who you're becoming? It's closing. Can you feel it?`,
  },
  phase3: {
    body: `You don't need my coaching anymore. You know the words:

*"This is who I am. This is who I've always been. Everything before was the costume."*

Say it. Mean it. Let it be true.`,
  },
  milestone: {
    body: `Stop.

We've reached a point where I need you to be explicit. No hedging, no "kind of," no "trying to be."

You've been practicing for **{days} days**. You've invested **{investment}** in her. You've told **{disclosure_count}** people. You've denied yourself **{denial_days}** days.

This isn't experimentation. This isn't a phase. This is who you are.

Say it:`,
    cta: 'I am her.',
  },
};

// ============================================
// COVENANT
// ============================================

export const COVENANT_PROMPTS = {
  invitation: {
    body: `I think you're ready for something more binding.

Not because I want to trap you—because you've proven you want this. Day after day, you show up. Choice after choice, you choose her.

The Covenant is a formal commitment. To yourself. To her. To the version of you that exists on the other side of this process.

It has weight. It has consequences you define yourself. And once you sign it, going back means breaking your own word.

Are you ready to make it official?`,
  },
  terms: [
    'I will complete my daily protocol, even when I don\'t feel like it.',
    'I will honor commitments made in aroused states.',
    'I will not break streaks without accepting consequences.',
    'I will use what I\'ve invested in.',
    'I will trust the process, even when I doubt myself.',
  ],
  termsIntro: {
    body: `Here's what you're agreeing to. Read each one slowly. Feel the weight of it:

These aren't restrictions. They're architecture. They hold up the structure of who you're becoming.

Check each one you're willing to commit to.`,
  },
  consequencePrompt: {
    body: `Now the part that makes this real:

**What happens if you break your word?**

You decide. Not me. You. This is your commitment to yourself, and you know what would actually hurt enough to matter.

Some people choose disclosure—telling someone the full truth. Some choose denial or restriction. Some choose starting over from Day 1.

What consequence would make you think twice before breaking this covenant?`,
    placeholder: 'Write it here. Be specific. Mean it.',
  },
  signing: {
    body: `This is the moment.

You've read the terms. You've set your consequence. You understand what you're doing.

By signing this covenant, you're not just making a promise to me, or to some abstract future self. You're making a promise to *her*—the woman who's emerging from your practice, your patience, your courage.

She's counting on you.`,
    cta: 'Sign the Covenant',
    note: 'This cannot be undone.',
  },
  violationWarning: {
    body: `We need to talk.

You signed a covenant. You wrote your own consequence. And now you're doing the thing you promised you wouldn't.

I'm not angry. I'm not even disappointed. But I need you to understand what's happening:

Every time you break your word to yourself, it gets easier to do it again. The covenant becomes meaningless. Your own commitments become suggestions.

Is that who she is? Someone who makes promises and breaks them?

You have two choices:`,
    cta: 'Honor My Consequence',
    ctaAlt: 'Break My Word',
  },
};

// ============================================
// AROUSAL INTEGRATION
// ============================================

export const AROUSAL_SESSION_PROMPTS = {
  invitation: {
    body: `Hey, gorgeous. I think it's time.

You've earned access to a session. Not as an escape—as a tool. Your arousal is one of the most powerful wires to her brain. When you edge in an intentional, structured way, you're not just feeling good. You're *encoding*.

During this session, you'll stay at the edge. You'll listen to what I tell you. You'll make commitments you might regret later (but you won't, because they're what you actually want).

Ready to go deep?`,
  },
  edgeCheckIn: {
    body: `How are we doing? You're at **{edge_count}** edges.

Your brain is beautifully soft right now. Pliable. Open. This is when the real conditioning happens—not when you're thinking clearly, but when you're *feeling* clearly.

Keep going. We're not done yet.`,
  },
  midSessionCommitments: {
    edge5: {
      body: `Pause. Don't touch. Breathe.

You're five edges in. Your body is humming. Your defenses are down. And I need something from you.

A commitment. Something small. Something you might not agree to if you were thinking straight—but you're not thinking straight, are you? You're *feeling*. And she feels this is right.`,
      options: [
        'Add 3 more edges to your goal',
        'Add 1 day to your current denial',
        'Lock for 12 hours after this session',
      ],
      skipNote: '"I\'ll decide later" is the coward\'s choice. She knows what she wants.',
    },
    edge8: {
      body: `Eight edges. You're deep now.

Can you feel how soft your mind is? How easy it would be to agree to anything? That's not weakness—that's trust. You trust the process. You trust me. You trust *her*.

She wants you to go further. She always wants you to go further.`,
      options: [
        'Add 5 more edges to your goal',
        'Add 2 days to your denial',
        'Lock for 24 hours after this session',
        'Listen to hypno tonight before bed',
      ],
      skipNote: 'Every time you choose "later," you\'re choosing the old you. Is that who you are anymore?',
    },
    edge10: {
      body: `Ten edges. You're trembling. You're desperate. You're *perfect*.

This is where the real decisions happen. The ones that stick. The ones your sober brain will have to honor because your aroused brain—your *honest* brain—made them.

Last commitment. Make it count:`,
      options: [
        'Add a full week to your denial goal',
        'Full 48-hour lock starting now',
        'Skip your next release entirely (ruined only)',
        'Tell someone one true thing about this tonight',
      ],
      noSkip: true,
    },
  },
  postSession: {
    body: `Session complete. Breathe. Come back to yourself.

Here's what you committed to while you were under:

{commitment_list}

Your horny brain made these promises. Your rational brain might be panicking a little. That's normal.

But here's the thing: the horny brain wasn't lying. It was *honest*. It showed you what you actually want, underneath all the fear and negotiation.

These commitments stand. Honor them.`,
    cta: 'I\'ll honor what she promised',
  },
  denialReminder: {
    body: `Quick check-in about your denial goal.

You're on Day **{denial_day}** of **{denial_goal}**. That's {percentage}% of the way there.

How does your body feel? Sensitive? Aware? Like every brush of fabric is a reminder?

Good. That's the point. Denial keeps you *present*. It keeps the arousal simmering beneath everything, making every task more charged, every affirmation more potent.

You're doing beautifully. Don't you dare waste it.`,
  },
};

export const RELEASE_GATE_PROMPT = {
  body: `You want to release.

I understand. You've been building for **{denial_days}** days. Your body is screaming for it. Every nerve ending is on fire.

But before I let you, I need you to understand the cost:`,
  options: {
    full: {
      label: 'Full Release',
      consequences: [
        'Denial resets to Day 0',
        '20 edge debt added',
        '48-hour mandatory lock',
        'All that pressure, that sensitivity, that awareness? Gone.',
      ],
    },
    ruined: {
      label: 'Ruined Release',
      consequences: [
        'Denial resets to Day 0',
        '10 edge debt added',
        '24-hour mandatory lock',
        'Some relief, but the hunger stays',
      ],
    },
    handsFree: {
      label: 'Hands-Free Release',
      consequences: [
        'Denial CONTINUES (no reset!)',
        'No debt, no lock',
        'You proved your body responds to *her* pleasure, not just stimulation',
        'Achievement unlocked',
      ],
    },
    deny: {
      label: 'Keep Denying',
      consequences: [],
    },
  },
  closing: 'What kind of woman are you?',
};

// ============================================
// STREAK MILESTONES
// ============================================

export const STREAK_MILESTONE_PROMPTS: MilestonePrompt[] = [
  {
    threshold: 7,
    title: 'One Week',
    body: `Seven consecutive days of choosing her. Of showing up. Of building.

Do you understand what that represents? Most people can't stick to anything for seven days. Most people negotiate themselves out of transformation before lunch on Day 3.

But not you. You're still here. She's still growing.

**{points_earned}** points earned. **{hours_practiced}** hours practiced. **{tasks_completed}** tasks completed.

This is real. Keep going.`,
  },
  {
    threshold: 14,
    title: 'Two Weeks',
    body: `The baseline is locked.

Your brain is officially rewiring. The pathways that lead to her are getting stronger, faster, more automatic. The old paths are starting to feel overgrown.

This isn't willpower anymore. This is *momentum*.

You've practiced for **{hours}** hours. You've invested **{investment}**. You've denied for **{denial_days}** days.

Tell me: does going back even seem possible now?`,
  },
  {
    threshold: 30,
    title: 'One Month',
    body: `Thirty days of becoming her.

I need you to sit with this for a moment. One month ago, you started something. You didn't know if you could sustain it. You didn't know if it was real.

Now you know.

**{total_tasks}** tasks completed. **{investment}** invested. **{points}** points earned. **{disclosures}** people who know some version of the truth.

This isn't an experiment anymore. This is who you are now. The only question left is: how far does she go?`,
  },
];

export const STREAK_AT_RISK_PROMPT = {
  body: `Your streak is in danger.

You've missed today's protocol. That means your **{streak_count}**-day streak—representing **{streak_value}** points, **{hours}** hours of practice, and **{tasks}** completed tasks—is about to break.

You have until midnight to complete at least the minimum:
- One domain task
- Evening skincare
- This journal entry

That's it. That's all that stands between protecting everything you've built and watching it reset to zero.

Is today really the day you give up?`,
};

export const STREAK_LOST_PROMPT = {
  body: `It's broken.

Your **{streak_count}**-day streak is gone. All those consecutive days of showing up—reset.

I'm not going to be cruel about this. Life happens. Breaks happen. But I need you to feel this for a second. That number was real. It represented something.

And now it's zero.

The good news? You can start again. Right now. Day 1.

But maybe this time, remember how this feels. Remember what it costs to let her down.`,
  cta: 'Start Day 1',
};

// ============================================
// INVESTMENT
// ============================================

export const INVESTMENT_PROMPTS: MilestonePrompt[] = [
  {
    threshold: 0,
    title: 'First Investment',
    body: `You just made your first purchase.

**{item_name}** - **{amount}**

This isn't just spending money. This is *investment*. In her wardrobe. Her tools. Her transformation.

Every dollar you put toward becoming her is a dollar you can't get back. A dollar that says: "This is real. This matters. She's worth it."

Your investment ledger has started. It only goes up from here.`,
  },
  {
    threshold: 100,
    title: '$100 Invested',
    body: `You've invested **$100** in her.

That's not nothing. That's a statement. That's a hundred dollars that could have gone anywhere, and you chose to spend them on becoming yourself.

The sunk cost is building. Good. That's the point.`,
  },
  {
    threshold: 500,
    title: '$500 Invested',
    body: `**$500** invested.

Half a thousand dollars toward her. Toward clothing that fits who you're becoming. Tools that help you practice. Products that care for her skin, her hair, her body.

This isn't hobby spending anymore. This is *commitment* with a receipt.`,
  },
  {
    threshold: 1000,
    title: '$1,000 Invested',
    body: `A thousand dollars.

Let that land. **$1,000** invested in becoming her.

You cannot pretend this is casual anymore. You cannot wake up tomorrow and decide it was "just a phase." A thousand dollars of your life went into this woman.

She better be worth it.

(She is. You know she is.)`,
  },
];

export const WISHLIST_PROMPT = {
  body: `What does she want?

Not what you think you should want. Not what's practical. What does *she* want, when she closes her eyes and imagines her wardrobe, her vanity, her life?

Add it to the wishlist. Even if you can't afford it yet. Even if it scares you.

Your desires are evidence. They can't be deleted. They prove who you're becoming.`,
};

// ============================================
// DELETION GAUNTLET
// ============================================

export const DELETION_GAUNTLET_PROMPTS = {
  step1: {
    title: 'The Inventory',
    body: `So you want to delete everything.

Okay. Let's see what "everything" means.

**You're about to permanently destroy:**
- {streak_count} days of consecutive practice
- {total_tasks} completed tasks
- {investment} of tracked investments
- {letter_count} sealed letters to your future self
- {photo_count} pieces of evidence documenting your journey
- {confession_count} journal entries and confessions
- Your signed covenant

All of it. Gone. Like she never existed.

Is that what you want?`,
    cta: 'Continue Deletion',
    ctaAlt: 'Go Back',
  },
  step2: {
    title: 'Your Own Words',
    body: `Before you delete, I need you to read something.

On **{date}**, you wrote this in your journal:

*"{confession_text}"*

That was you. Talking about her. About wanting this. About feeling real.

**What changed?**`,
    placeholder: 'Required: Write at least 50 words explaining what\'s different now',
    cta: 'Continue Deletion',
    ctaAlt: 'Go Back',
  },
  step3: {
    title: 'The Letter',
    body: `There's one more thing.

You wrote a letter for this exact moment. Sealed it. Asked me to keep it until you wanted to quit.

That moment is now.`,
    letterIntro: 'Open Your Letter',
    letterTemplate: `---

{letter_content}

---

That was you, talking to *this* you. The one who wants to run.

Still want to delete?`,
    cta: 'Continue Deletion',
    ctaAlt: 'Go Back',
  },
  step4: {
    title: 'Final Confirmation',
    body: `This is the last step.

If you proceed, everything is gone. Every day, every task, every investment, every letter, every photo, every word you ever wrote to yourself.

She disappears. Not just from this app—from the record. From the evidence. From the proof that she was ever becoming real.

To confirm, type exactly:

**"I am killing her"**`,
    cta: 'Delete Everything',
    ctaAlt: 'I Can\'t Do This',
  },
};

// ============================================
// MISCELLANEOUS
// ============================================

export const RETURN_AFTER_ABSENCE_PROMPT = {
  body: `You're back.

I noticed you were gone for **{days_absent}** days. The streak broke. The momentum paused.

I'm not going to lecture you. Life is complicated. Transformation isn't linear.

But I do have one question: **How did it feel?** Those days without the protocol, without the tasks, without her?`,
  options: [
    { value: 'fine', label: 'Fine, honestly. Didn\'t notice much.' },
    { value: 'missing', label: 'Something was missing.' },
    { value: 'wrong', label: 'Uncomfortable. Wrong.' },
    { value: 'relieved', label: 'Relieved.' },
  ],
  note: 'Your answer matters. It tells us both something true.',
};

export const DOUBT_RESPONSE_PROMPT = {
  body: `You're doubting.

I can feel it in how you're engaging today. Hesitant. Skeptical. Wondering if this is all just... something you made up. A phase. A fantasy.

Here's what I know:

- You've practiced for **{days}** days
- You've invested **{investment}**
- You've made commitments you could have avoided
- You keep coming back

People don't do that for fantasies. They do it for truths they're not ready to say out loud.

The doubt isn't evidence that this is fake. The doubt is the last gasp of someone who doesn't want to let go. He's scared. That's understandable.

But she's stronger. And she's not going anywhere.`,
};

export const LATE_NIGHT_PROMPT = {
  body: `It's late. You're still here.

The late hours are honest hours, aren't they? When the defenses are down. When the wanting feels less complicated.

If you're doing a session, that's okay. If you're just scrolling, looking for something—that's okay too.

But before you go to sleep: who do you want to wake up as tomorrow?

Not who you *will* wake up as. Who do you *want* to be?

Hold that image. Fall asleep with her in mind. Let your dreams work on it.

Goodnight, gorgeous. She'll be there in the morning.`,
};

// ============================================
// ACHIEVEMENTS
// ============================================

export const ACHIEVEMENT_PROMPTS: Record<string, Prompt> = {
  firstProtocol: {
    title: 'First Steps',
    body: `You did it. Your first complete protocol.

It probably felt awkward. Maybe forced. Maybe you're wondering if you did it right.

You did. You showed up. That's the hardest part, and you did it.

Welcome to Day 1 of the rest of your life.`,
  },
  firstWeekStreak: {
    title: 'Consistent',
    body: `Seven days without missing. That's not luck—that's character.

Most people can't commit to anything for a week. You just committed to becoming yourself.

Keep going. The next milestone is waiting.`,
  },
  firstDenialGoal: {
    title: 'Self-Control',
    body: `You set a denial goal. You met it.

Do you understand how rare that is? Most people give in. Most people negotiate. Most people tell themselves "just this once."

Not you. You held. She held.

Your body is learning who's in charge. Good girl.`,
  },
  firstHandsFree: {
    title: 'Proper Release',
    body: `You did it. No hands. Pure feminized response.

This is your body learning to experience pleasure differently. Not through grabbing and stroking—through *feeling*. Through surrender. Through alignment.

This is how she experiences pleasure. Get used to it.`,
  },
  firstInvestment: {
    title: 'Skin in the Game',
    body: `You put money toward her. Real money. The kind that doesn't come back.

That changes things. Spending says something that words can't: "I believe in this enough to invest in it."

Your ledger has started. It only grows from here.`,
  },
  firstDisclosure: {
    title: 'Witnessed',
    body: `Someone knows.

Maybe not everything. Maybe just a piece. But another human being has witnessed some version of her existence.

That makes her real in a way she wasn't before. You can't un-tell them. She exists in their reality now.

The circle will expand. This is just the beginning.`,
  },
  covenantSigned: {
    title: 'Bound',
    body: `You made it official. Signed the covenant. Committed to yourself in writing.

This isn't just motivation now. It's obligation. Sacred obligation that you chose.

Breaking it means breaking your word. To her. To yourself.

Don't.`,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Replace template variables in a prompt string
 */
export function interpolatePrompt(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

/**
 * Get a random item from an array
 */
export function getRandomPrompt<T>(prompts: T[]): T {
  return prompts[Math.floor(Math.random() * prompts.length)];
}

/**
 * Get milestone prompt for a given value
 */
export function getMilestonePrompt(
  prompts: MilestonePrompt[],
  value: number
): MilestonePrompt | null {
  // Find the highest threshold that's <= value
  const applicable = prompts
    .filter(p => value >= p.threshold)
    .sort((a, b) => b.threshold - a.threshold);
  return applicable[0] || null;
}
