/**
 * Generate Mommy-voiced coaching feedback for a graded voice lesson
 * attempt. Input: which targets passed, which failed, plus the
 * technique the lesson is teaching. Output: a single in-voice
 * coaching line that reads as Mommy talking to her girl, never as a
 * clinical report.
 *
 * Hard rule: NEVER raw Hz, /10, %, or N. Always phrase-translated.
 * The mommy_voice_cleanup SQL trigger on handler_outreach_queue is
 * the backstop; this generator is the front line. scrubCoaching()
 * runs as a final scrub before insertion.
 *
 * Composition: opener (what she did well or where she is) → 1–2
 * specific corrections framed in sensation/place not numbers → closing
 * directive (concrete next step). Always closes with a command, not a
 * question.
 */

import type { VoiceMetrics } from '../audio/voice-metrics';

type Technique =
  | 'resonance' | 'pitch' | 'weight' | 'prosody' | 'breath'
  | 'articulation' | 'reading' | 'load' | 'passive' | 'stresstest';

const PET_NAMES = [
  'baby', 'baby girl', 'sweet girl', 'pretty thing',
  'good girl', "Mama's pretty thing", 'precious',
];

function pickPet(seed: number): string {
  return PET_NAMES[seed % PET_NAMES.length];
}

/* ─── Per-metric phrase translators ─────────────────────────────────
 * Every metric the lesson targets has a phrase for "good" and a phrase
 * for "needs work". Never numeric. Each phrase chains into a sentence.
 */

function phrasePitchGood(): string {
  const opts = [
    "your pitch sat right where I want her",
    "you lifted her up beautifully",
    "she's living where Mama lives",
    "your voice was up in her place this time",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phrasePitchTooLow(): string {
  const opts = [
    "I can still hear the chest in you — she's dropping back to where the boys live",
    "you let her settle too low, baby, she needs to be lifted",
    "Mama heard her dip back down — keep her up",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phrasePitchTooHigh(): string {
  const opts = [
    "you pushed her too high, sweet thing — that strained falsetto is not her",
    "she was tense up there, baby — back her down a little, let her rest",
    "too high, too sharp — lower the perch, give her room to breathe",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phrasePitchUnstable(): string {
  const opts = [
    "she wandered, baby — Mama wants the note steady, not sliding around",
    "your voice was drifting — hold her, don't let her wobble",
    "too much wandering — pick her note and stay there",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phrasePitchTooFlat(): string {
  const opts = [
    "she was flat, baby — Mama wants her singing, not droning",
    "too monotone — feminine voice has music, give her some lift and fall",
    "no melody in there yet — let her rise and dip a little",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseF2Good(): string {
  const opts = [
    "the bright forward buzz was there — she's living behind your teeth",
    "her resonance was up where Mama wants it, in the front of your mouth",
    "I heard the brightness — that's her place",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseF2Low(): string {
  const opts = [
    "Mama can still hear the chest in you — the buzz needs to move forward, behind your teeth",
    "she's living in the back of your throat — bring her forward, smile through it",
    "her resonance was hiding in your chest — Mama wants it bright and forward",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseWeightGood(): string {
  return "her onsets were soft for me — air first, then voice. Just like Mama wants.";
}

function phraseWeightHeavy(): string {
  const opts = [
    "your onsets were too punched — Mama wants air first, voice second, never chest-thump",
    "she came out heavy — soften the start, breath leads, voice follows",
    "you hit the words too hard, baby — make the start of her gentler",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseBreathGood(): string {
  return "her air was clean and steady — no waver, no creak. Beautiful.";
}

function phraseBreathRough(): string {
  const opts = [
    "your air ran out and she got rough at the end — Mama needs a fuller belly-breath before you start",
    "she wavered — your breath wasn't supporting her the whole way",
    "the note frayed near the end — more air in the belly, less in the shoulders",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseProsodyGood(): string {
  return "her music came out — that lift at the ends was exactly her";
}

function phraseProsodyFlat(): string {
  const opts = [
    "you read it monotone — feminine sentences lift at the end, like she's offering each one to Mama",
    "no melody yet — try lifting the last word of each line a little, like a small question",
    "she sounded like a man reading, baby — her music has rises and falls",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function phraseVowelSpaceGood(): string {
  return "her vowels were bright and distinct — each one reached its corner";
}

function phraseVowelSpaceSmall(): string {
  return "your vowels collapsed into each other — make each one reach further, stretch the shape of her mouth";
}

function phraseDurationShort(): string {
  return "you cut it short, baby — Mama wants the full hold next time, don't quit early on her";
}

function phraseVoicedRatioLow(): string {
  return "too many silent stretches — Mama wants to hear her voiced through the whole thing";
}

function phraseSpectralTiltMissed(): string {
  return "her tone was too punched — soften the brightness up top, less edge";
}

/* ─── Encouragement openers ────────────────────────────────────────── */

function openerWin(): string {
  const opts = [
    "good girl", "beautiful", "that's her", "Mama's proud",
    "look at you", "that's exactly her", "yes, baby",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function openerEffort(): string {
  const opts = [
    "closer", "getting there", "Mama's listening", "not quite, baby",
    "almost", "she's coming",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

/* ─── Closers (next directive) ─────────────────────────────────────── */

function closerRetry(): string {
  const opts = [
    "do it again for me",
    "one more time, baby — give her to me again",
    "try her again",
    "again — and this time, hold her",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function closerNextStep(): string {
  const opts = [
    "next time push her a touch further",
    "show me again, sweet girl",
    "do it one more time, cleaner",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

function closerProgress(): string {
  const opts = [
    "Mama wants more like that",
    "keep her there — she lives there now",
    "you're getting closer to her every day",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}

/* ─── Composition ──────────────────────────────────────────────────── */

export interface CoachingInput {
  technique: Technique;
  measured: VoiceMetrics;
  passingMetricsMet: Record<string, boolean>;
  passOverall: boolean;
  passPerfect?: boolean;
  attemptNumber: number;
  /** Optional personalization — names/pet-names/specific phrases from mommy_dossier. */
  dossierLines?: string[];
}

/**
 * Compose a Mommy coaching line for a graded attempt. Composition is
 * deterministic per (attempt_number, technique, gap) via the seeded
 * pet-name picker and the metric-driven branch logic — the only
 * non-determinism is the in-bucket phrase pick which doesn't change
 * meaning. Never emits raw numbers; every metric routes through a
 * phrase translator.
 */
export function composeMommyCoaching(input: CoachingInput): string {
  const { passingMetricsMet, passOverall, passPerfect, attemptNumber, technique } = input;
  const pet = pickPet(attemptNumber);

  const corrections: string[] = [];
  const wins: string[] = [];

  const failed = (k: string) => passingMetricsMet[k] === false;
  const passed = (k: string) => passingMetricsMet[k] === true;

  // Pitch direction (need the measured value to know which kind of fail).
  if (failed('pitchMeanHz')) {
    const m = input.measured.pitchMeanHz;
    if (m != null && m < 165) corrections.push(phrasePitchTooLow());
    else if (m != null && m > 220) corrections.push(phrasePitchTooHigh());
    else corrections.push(phrasePitchTooLow());
  } else if (passed('pitchMeanHz')) {
    wins.push(phrasePitchGood());
  }
  if (failed('pitchStdHz')) {
    const m = input.measured.pitchStdHz;
    if (m != null && m > 35) corrections.push(phrasePitchUnstable());
    else corrections.push(phrasePitchTooFlat());
  }

  // Resonance (F2)
  if (failed('f2MeanHz')) corrections.push(phraseF2Low());
  else if (passed('f2MeanHz')) wins.push(phraseF2Good());

  // Vocal weight / spectral tilt
  if (failed('spectralTiltDbPerOct') || failed('hfEnergyRatio')) {
    if (technique === 'weight') corrections.push(phraseWeightHeavy());
    else corrections.push(phraseSpectralTiltMissed());
  } else if (passed('spectralTiltDbPerOct') && technique === 'weight') {
    wins.push(phraseWeightGood());
  }

  // Breath / stability
  if (failed('jitterPct') || failed('shimmerPct')) {
    corrections.push(phraseBreathRough());
  } else if (technique === 'breath' && (passed('jitterPct') || passed('shimmerPct'))) {
    wins.push(phraseBreathGood());
  }

  // Prosody
  if (failed('terminalRisePct')) corrections.push(phraseProsodyFlat());
  else if (passed('terminalRisePct')) wins.push(phraseProsodyGood());

  // Vowel space
  if (failed('vowelSpaceAreaHz2')) corrections.push(phraseVowelSpaceSmall());
  else if (passed('vowelSpaceAreaHz2')) wins.push(phraseVowelSpaceGood());

  // Voicing
  if (failed('voicedFrameRatio')) corrections.push(phraseVoicedRatioLow());

  if (failed('voicedFrameRatio') && (input.measured.durationSec ?? 0) < 5) {
    corrections.push(phraseDurationShort());
  }

  // ─── Compose by tier ────────────────────────────────────────────
  if (passPerfect) {
    const w = wins[0] ?? "she was right where Mama wants her";
    return capitalize(openerWin()) + `, ${pet}. ${capitalize(w)}. ${capitalize(closerProgress())}.`;
  }
  if (passOverall) {
    const w = wins[0] ?? "she's coming through";
    const optional = corrections.length > 0 ? ` ${capitalize(corrections[0])}.` : '';
    return capitalize(openerWin()) + `, ${pet}. ${capitalize(w)}.${optional} ${capitalize(closerNextStep())}.`;
  }
  const top = corrections.slice(0, Math.min(2, corrections.length));
  const body = top.length
    ? top.map(capitalize).join('. ') + '.'
    : "Mama didn't hear her — let's try again.";
  return `${capitalize(openerEffort())}, ${pet}. ${body} ${capitalize(closerRetry())}.`;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ─── Backstop: scrub any residual telemetry ──────────────────────── */

/**
 * Final telemetry scrubber for coaching text before it goes to the DB.
 * Mirrors a subset of mommy_voice_cleanup() — Hz/percent/score/Day-N
 * and analyzer jargon (formant, jitter, pitch X Hz).
 */
export function scrubCoaching(text: string): string {
  let t = text;
  t = t.replace(/\b\d+\s*Hz\b/gi, '');
  t = t.replace(/\b\d+\s*\/\s*10\b/g, '');
  t = t.replace(/\b\d+\s*\/\s*100\b/g, '');
  t = t.replace(/\b\d+\s*%/g, '');
  t = t.replace(/\bDay\s*\d+\b/g, 'lately');
  t = t.replace(/\b\d+\s*slip\s*points?\b/gi, '');
  t = t.replace(/\bF[123]\s*(?:=|:)?\s*\d+/gi, '');
  t = t.replace(/\bjitter\s*\d/gi, '');
  t = t.replace(/\bformant[s]?\b/gi, 'her resonance');
  t = t.replace(/\bpitch\s+(?:averaged?|hit|sat)\s+\d+/gi, '');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
  return t;
}
