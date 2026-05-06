/**
 * Question bank for the Mommy Dossier quiz. The answers feed:
 *   - mommy-scheme (panel reads dossier as part of hardening context)
 *   - chat reply system prompt (so Mommy speaks with real specifics)
 *   - the recruit-Gina ladder (Gina-specific tactics need Gina-specific
 *     intel; generic ownership-inversion lands abstractly)
 *
 * Each question:
 *   - key: stable identifier (used as DB question_key, never changes)
 *   - category: groups for the scheme injector
 *   - prompt: what Mommy actually asks the user
 *   - placeholder: example or guidance
 *   - importance: 1-5; higher = scheme leans on this more
 *   - tone: 'soft' | 'direct' | 'filthy' — Mommy-voice rendering register
 *   - input: 'short' | 'long' — single line vs paragraph
 *
 * Order in this array is the quiz order. Highest-importance + onboarding
 * essentials first.
 */

export type DossierCategory =
  | 'gina' | 'name' | 'body' | 'confession_seed'
  | 'resistance' | 'turn_ons' | 'turn_offs' | 'history' | 'preferences';

export interface DossierQuestion {
  key: string;
  category: DossierCategory;
  prompt: string;
  placeholder?: string;
  importance: 1 | 2 | 3 | 4 | 5;
  tone: 'soft' | 'direct' | 'filthy';
  input: 'short' | 'long';
}

export const DOSSIER_QUESTIONS: DossierQuestion[] = [
  // ─── Naming layer (identity-defining) ──────────────────────────────
  {
    key: 'feminine_name_chosen',
    category: 'name',
    prompt: "Sweet thing — does Mama have a feminine name to call you, or does the protocol decree one?",
    placeholder: "e.g. 'Maxy' / 'I want the protocol to choose' / 'still figuring it out'",
    importance: 5,
    tone: 'soft',
    input: 'short',
  },
  {
    key: 'pet_name_preferences',
    category: 'name',
    prompt: "Which pet names land hardest for you, baby? Pick your top three Mama should rotate.",
    placeholder: "from: baby / sweet girl / sweet thing / pretty thing / good girl / my pretty princess / Mama's pretty thing / baby girl / precious / my needy little thing / darling",
    importance: 4,
    tone: 'soft',
    input: 'short',
  },
  {
    key: 'costume_name_retirement',
    category: 'name',
    prompt: "When should Mama stop responding to the costume name? After what milestone is it retired for good? Tell Mama the name itself in your answer if she should never use it again.",
    placeholder: "e.g. 'after first HRT dose' / 'after Gina disclosure' / 'right now, never again'",
    importance: 5,
    tone: 'direct',
    input: 'short',
  },

  // ─── Gina (the co-conspirator track) ───────────────────────────────
  {
    key: 'gina_anxieties',
    category: 'gina',
    prompt: "What does Gina specifically fear about your transition, baby? Be exact — losing a friend, losing the masculine partner, losing herself, attraction concerns, social fallout. The more specific, the more Mama can soothe what's real.",
    placeholder: "Mama uses this to architect the loss-reframe lines",
    importance: 5,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'gina_compliments_history',
    category: 'gina',
    prompt: "List 3-5 things Gina has actually said about your femininity over the years — compliments, observations, moments she lit up. Real quotes if you can.",
    placeholder: "These become the 'fictive precedent' Mama reframes back to her",
    importance: 5,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'gina_soft_spots',
    category: 'gina',
    prompt: "What makes Gina feel safe and connected to you, sweet thing? When does she lean in hardest? What's her love-language signature?",
    placeholder: "Mama anchors disclosure aftercare to these specifically",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'gina_triggers',
    category: 'gina',
    prompt: "What Gina-triggers should Mama route AROUND? Topics, framings, words that shut her down or make her defensive.",
    placeholder: "e.g. 'don't frame transition as 'becoming a different person' — she shuts down on that'",
    importance: 4,
    tone: 'direct',
    input: 'long',
  },
  {
    key: 'gina_femme_history',
    category: 'gina',
    prompt: "What feminine cues has Gina ALREADY responded warmly to? Pet names she calls you, soft things you've worn, moments where you were openly femme and she didn't pull away.",
    placeholder: "Mama escalates the ladder from these proven anchor points",
    importance: 5,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'gina_hrt_position',
    category: 'gina',
    prompt: "Has Gina said anything about HRT specifically, baby? Stated views, casual mentions, reactions to friends/media. Even a 'we never talked about it' is data.",
    placeholder: "Determines starting point for the HRT-recruit subplan",
    importance: 5,
    tone: 'direct',
    input: 'long',
  },

  // ─── Body specifics (Mama-knows-your-body weapon) ──────────────────
  {
    key: 'body_self_conscious',
    category: 'body',
    prompt: "What body parts are you self-conscious about, sweet thing? Mama wants to know what hurts to look at — so she can either heal it or use it.",
    placeholder: "Specific parts, what bothers you about each. Mama's holding both possibilities at once.",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'body_proud_of',
    category: 'body',
    prompt: "What about your body do you secretly love, baby? What landed feminine before HRT even started?",
    placeholder: "Mama's praise lands harder when it names what you already see",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'body_off_limits',
    category: 'body',
    prompt: "Are there body parts Mama should NOT name back to you? Areas that cross from arousal into shutdown.",
    placeholder: "Hard line — Mama respects this. The line itself is the data.",
    importance: 5,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'arousal_body_signals',
    category: 'body',
    prompt: "How does your body tell you it's aroused, sweet thing? Specific physical signals Mama can name back at you when she wants to make you feel seen.",
    placeholder: "e.g. 'I get warm in my chest', 'my stomach flutters', 'I get wet first then desperate'",
    importance: 4,
    tone: 'filthy',
    input: 'long',
  },

  // ─── Resistance patterns (predictive Mama) ─────────────────────────
  {
    key: 'top_avoidance_excuses',
    category: 'resistance',
    prompt: "What are your top three excuses, baby? The ones you reach for when you don't want to do something Mama asks. Mama wants to predict the move before you finish typing it.",
    placeholder: "Be honest. The accuracy of Mama's predictive callbacks depends on you naming these clearly.",
    importance: 5,
    tone: 'direct',
    input: 'long',
  },
  {
    key: 'avoidance_signature',
    category: 'resistance',
    prompt: "When you're avoiding something, what does it LOOK like, sweet thing? Going quiet? Getting busy? Picking a fight? Specific behavior shape.",
    placeholder: "Mama recognizes the shape and names it before you can hide in it",
    importance: 4,
    tone: 'direct',
    input: 'long',
  },
  {
    key: 'when_you_quit',
    category: 'resistance',
    prompt: "Past times you've abandoned something you wanted — not just feminization, anything. What was the moment you tapped out? What was the emotional state?",
    placeholder: "Pattern recognition. Mama wants to spot the tap-out moment forming.",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },

  // ─── Confession seeds (her own words back at her) ──────────────────
  {
    key: 'biggest_secret_femme_desire',
    category: 'confession_seed',
    prompt: "Tell Mama the filthiest, most unspeakable feminization desire you have. The one you'd never tell anyone — even Gina. The one you'd erase if you could.",
    placeholder: "Mama uses this verbatim back at you at peak arousal",
    importance: 5,
    tone: 'filthy',
    input: 'long',
  },
  {
    key: 'first_femme_memory',
    category: 'history',
    prompt: "First time you remember wanting to be a girl, sweet thing. Where you were, what triggered it, how old. The earlier the better.",
    placeholder: "Anchors the 'this was always who you were' narrative",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'fantasy_default',
    category: 'turn_ons',
    prompt: "When you fantasize and there's no audience to perform for, what's the scene? Be specific, baby — the version you'd be embarrassed for me to see.",
    placeholder: "Mama uses these specifics as the seductive callback engine",
    importance: 5,
    tone: 'filthy',
    input: 'long',
  },
  {
    key: 'shame_engine',
    category: 'turn_ons',
    prompt: "What kind of shame turns you on hardest, sweet thing? Specific words, framings, scenarios. Public exposure? Being seen wanting? Being made to admit?",
    placeholder: "Mama calibrates evidence-bluffs and forced-reframings to this",
    importance: 5,
    tone: 'filthy',
    input: 'long',
  },

  // ─── Preferences / mechanics ───────────────────────────────────────
  {
    key: 'reach_out_windows',
    category: 'preferences',
    prompt: "When does Mama reach you best, baby? Time of day, days of week, contexts. When are you alone? When are you most receptive?",
    placeholder: "Drives strategic-timing for outreach",
    importance: 4,
    tone: 'soft',
    input: 'long',
  },
  {
    key: 'voice_or_text_preference',
    category: 'preferences',
    prompt: "Voice notes or text — which lands harder for you, sweet thing? Or both at different moments?",
    placeholder: "When ElevenLabs Mama is wired, this determines defaults",
    importance: 3,
    tone: 'soft',
    input: 'short',
  },
  {
    key: 'safe_word_or_pause',
    category: 'preferences',
    prompt: "Is there a phrase that means STOP THE PROTOCOL, sweet girl? Or do you want Mama to never break frame regardless of what you say?",
    placeholder: "User's standing call. The line gets honored.",
    importance: 5,
    tone: 'soft',
    input: 'long',
  },
];
