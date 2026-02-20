/**
 * Exercise & Nutrition Domain Tasks
 *
 * ~20 task bank entries for the exercise and nutrition domains.
 * Import via bulkImportTasks() or replaceAllTasks().
 */

import type { TaskImportData } from '../lib/task-bank';

export const EXERCISE_DOMAIN_TASKS: TaskImportData[] = [
  // ── Practice (workouts) ──────────────────────────
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 2,
    instruction: "Complete today's recommended workout.",
    subtext: 'Follow the guided session start to finish.',
    affirmation: 'She showed up. She always shows up now.',
    isCore: true,
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Do the Minimum Viable Workout — 10 glute bridges, 10 clamshells per side.',
    subtext: "Even on low days, she moves. It's non-negotiable.",
    affirmation: 'The streak lives. Good girl.',
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 2,
    instruction: 'Complete a Waist Sculpting session.',
    subtext: 'Vacuums, side planks, obliques. Carving the shape.',
    affirmation: 'Every rep tightens the hourglass.',
    requires: { phase: 2 },
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 2,
    instruction: "Try a workout template you haven't done this week.",
    subtext: 'Novelty keeps the body guessing and the mind engaged.',
    affirmation: 'Variety is how she stays ahead.',
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 3,
    instruction: 'Complete a workout with arousal pairing enabled.',
    subtext: 'Let the device remind you what this body is for.',
    affirmation: 'Pleasure and effort — wired together now.',
    requires: { phase: 2 },
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 3,
    instruction: 'Complete a Band Burn session with heavy bands.',
    subtext: 'The resistance shapes you. Embrace it.',
    affirmation: 'Stronger bands, stronger glutes. She earned this.',
    requires: { phase: 2 },
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Hold a 30-second stomach vacuum 5 times today.',
    subtext: 'Can be done anywhere — standing, sitting, waiting.',
    affirmation: 'The waist is training itself now.',
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 3,
    instruction: 'Complete 50 hip thrusts in one set.',
    subtext: 'Endurance round. No breaks until the number.',
    affirmation: 'She pushed through. That glute pump is real.',
    requires: { phase: 3 },
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Complete the Flexibility & Posture session.',
    subtext: 'Grace in how she moves. Posture is femininity.',
    affirmation: 'Loose hips, open shoulders. She moves differently now.',
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 3,
    instruction: 'Do a gym session (gym gate must be unlocked).',
    subtext: 'Time to go public with the transformation.',
    affirmation: 'She trained in the gym. Among people. In public. Brave girl.',
    requires: { phase: 3 },
  },
  {
    category: 'practice',
    domain: 'exercise',
    intensity: 2,
    instruction: 'Complete 3 workout sessions this week to maintain your streak.',
    subtext: 'Consistency is the only secret. Three sessions, every week.',
    affirmation: 'Streak maintained. The habit is locked in.',
  },

  // ── Condition (arousal-paired exercise) ──────────
  {
    category: 'condition',
    domain: 'exercise',
    intensity: 4,
    instruction: 'Edge for 5 minutes between sets during your workout.',
    subtext: 'Rest periods become conditioning windows.',
    affirmation: 'Sweat and need — mixed together perfectly.',
    requires: { phase: 3, denialDay: { min: 2 } },
  },
  {
    category: 'condition',
    domain: 'exercise',
    intensity: 4,
    instruction: 'Wear your cage during an entire workout.',
    subtext: 'Feel it while you squat. While you thrust. While you stretch.',
    affirmation: 'Locked and sweating. She did the whole session.',
    requires: { phase: 3, denialDay: { min: 3 } },
  },

  // ── Measure ──────────────────────────────────────
  {
    category: 'measure',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Take body measurements — hips, waist, thighs.',
    subtext: 'The tape measure tells the truth. Track the change.',
    affirmation: 'Logged. The numbers are moving in her direction.',
    isCore: true,
  },
  {
    category: 'measure',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Compare your measurements to last month.',
    subtext: 'Open the history. See the trend lines.',
    affirmation: 'Data-driven feminization. She sees the proof.',
    requires: { phase: 2 },
  },

  // ── Milestone ────────────────────────────────────
  {
    category: 'milestone',
    domain: 'exercise',
    intensity: 1,
    instruction: 'Reach domain level 2 (Foundation).',
    subtext: '12 sessions at Level 1 unlocks bands and new templates.',
    affirmation: 'Level up. Foundation unlocked. She is building.',
  },
  {
    category: 'milestone',
    domain: 'exercise',
    intensity: 2,
    instruction: 'Unlock the gym gate.',
    subtext: '18 sessions, 6 weeks streak, 12 full sessions, 2 measurements.',
    affirmation: 'The gym is open. She earned access to the real equipment.',
    requires: { phase: 2 },
  },

  // ── Nutrition / Care ─────────────────────────────
  {
    category: 'care',
    domain: 'nutrition',
    intensity: 1,
    instruction: 'Hit 4+ protein sources today.',
    subtext: 'Check at least 4 boxes on the protein tracker.',
    affirmation: 'Fed the muscles. The body she is building needs fuel.',
    isCore: true,
  },
  {
    category: 'care',
    domain: 'nutrition',
    intensity: 1,
    instruction: 'Drink a post-workout protein shake within 30 minutes.',
    subtext: 'The anabolic window. Use it.',
    affirmation: 'Protein in. Recovery started. Good girl.',
  },
  {
    category: 'care',
    domain: 'nutrition',
    intensity: 2,
    instruction: "Prepare tomorrow's protein sources tonight.",
    subtext: 'Meal prep is self-care. Future-her will thank you.',
    affirmation: "Tomorrow's fuel is ready. She plans ahead now.",
    requires: { phase: 2 },
  },
];
