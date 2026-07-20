// Home workout templates — pure data shared by workout-prescriber and tests.
//
// Every exercise here must be doable in a living room: bodyweight, a couch
// edge, a wall, a towel. No cables, machines, barbells or benches — the
// prescribe-only-what-she-owns rule. A resistance band or foam roller may be
// suggested in notes but always with a no-equipment alternative.
//
// glute_sculpt mirrors the Day 1 Glute Activation program she actually runs
// (2026-07-18): warmup activation, couch hip thrusts as the centerpiece,
// stretch cooldown, ~25 min.

export type WorkoutPhase = 'warmup' | 'main' | 'cooldown';

export interface TemplateExercise {
  name: string;
  sets: number;
  reps: string | number;
  notes?: string;
  phase?: WorkoutPhase;
}

export interface WorkoutTemplateDef {
  name: string;
  focus: string;
  exercises: TemplateExercise[];
  duration: number;
}

export const WORKOUT_TEMPLATES: Record<string, WorkoutTemplateDef> = {
  glute_sculpt: {
    name: 'Glute Activation',
    focus: 'Build round, feminine glutes',
    duration: 25,
    exercises: [
      { phase: 'warmup', name: 'Glute bridges', sets: 2, reps: 15, notes: 'Heels drive into floor, hips up, squeeze 2s at top. Glutes, NOT lower back.' },
      { phase: 'warmup', name: 'Clamshells', sets: 1, reps: '15 each side', notes: 'On your side, knees bent 90°, feet together. Open like a clamshell — side of hip.' },
      { phase: 'warmup', name: 'Stomach vacuum', sets: 3, reps: '15s hold', notes: 'Exhale everything, belly button to spine. Rest 30s between.' },
      { phase: 'main', name: 'Hip thrusts', sets: 3, reps: 20, notes: 'Upper back on couch edge, drive hips to ceiling, squeeze 2-3s at top. The most important exercise in the program.' },
      { phase: 'main', name: 'Sumo squats', sets: 3, reps: 15, notes: 'Feet wide, toes out. Hips back, chest up, push through heels.' },
      { phase: 'main', name: 'Curtsy lunges', sets: 3, reps: '12 each side', notes: 'Step back and across. Push through front heel.' },
      { phase: 'main', name: 'Fire hydrants', sets: 3, reps: '15 each side', notes: 'All fours, lift knee out to hip height. Outer glute.' },
      { phase: 'cooldown', name: 'Hip flexor stretch', sets: 1, reps: '30s each side' },
      { phase: 'cooldown', name: 'Pigeon pose', sets: 1, reps: '45s each side' },
      { phase: 'cooldown', name: 'Cat-cow', sets: 1, reps: '5 slow cycles' },
    ],
  },
  hip_widening: {
    name: 'Hip Widening',
    focus: 'Lateral hip development for feminine silhouette',
    duration: 30,
    exercises: [
      { phase: 'warmup', name: 'Glute bridges', sets: 2, reps: 12, notes: 'Wake the hips up before side work.' },
      { phase: 'warmup', name: 'Hip circles', sets: 1, reps: '10 each direction', notes: 'Standing, hands on hips, big slow circles.' },
      { phase: 'main', name: 'Side-lying hip abductions', sets: 4, reps: '20 each side', notes: 'Slow up, slower down. Top of the outer hip.' },
      { phase: 'main', name: 'Clamshells', sets: 3, reps: '15 each side', notes: 'Band above knees if you have one; strict form without.' },
      { phase: 'main', name: 'Standing hip abduction', sets: 3, reps: '15 each side', notes: 'Hold a wall, lift leg straight out to the side, no lean.' },
      { phase: 'main', name: 'Curtsy lunges', sets: 3, reps: '12 each side', notes: 'Push through front heel.' },
      { phase: 'main', name: 'Side steps in half-squat', sets: 3, reps: '20 steps each way', notes: 'Stay low the whole time. Band optional.' },
      { phase: 'cooldown', name: 'Figure-4 stretch', sets: 1, reps: '45s each side' },
      { phase: 'cooldown', name: 'Butterfly stretch', sets: 1, reps: '60s' },
    ],
  },
  waist_slimming: {
    name: 'Waist Cinch',
    focus: 'Core tightening + oblique work for smaller waist',
    duration: 25,
    exercises: [
      { phase: 'warmup', name: 'Cat-cow', sets: 1, reps: '8 slow cycles', notes: 'Wake the spine up.' },
      { phase: 'warmup', name: 'Stomach vacuum', sets: 2, reps: '15s hold', notes: 'Exhale everything, belly button to spine.' },
      { phase: 'main', name: 'Vacuum holds', sets: 5, reps: '30s hold', notes: 'The waist-trainer exercise. Breathe shallow, keep the pull.' },
      { phase: 'main', name: 'Plank', sets: 3, reps: '45s', notes: 'Straight line, squeeze glutes, no sagging hips.' },
      { phase: 'main', name: 'Side plank', sets: 3, reps: '30s each side', notes: 'Hips high — the top oblique does the work.' },
      { phase: 'main', name: 'Dead bugs', sets: 3, reps: 12, notes: 'Slow, controlled, lower back glued to floor.' },
      { phase: 'main', name: 'Bird dogs', sets: 3, reps: '10 each side', notes: 'Reach long, no hip rotation.' },
      { phase: 'cooldown', name: 'Cobra stretch', sets: 1, reps: '30s' },
      { phase: 'cooldown', name: 'Spinal twist', sets: 1, reps: '45s each side' },
    ],
  },
  posture_feminine: {
    name: 'Feminine Posture',
    focus: 'Open chest, relaxed shoulders, hip tilt',
    duration: 25,
    exercises: [
      { name: 'Wall angels', sets: 3, reps: 12, notes: 'Back flat to wall, arms slide slow, full range.' },
      { name: 'Thoracic extension', sets: 3, reps: '60s', notes: 'Over a couch armrest or rolled towel under upper back.' },
      { name: 'Towel pull-aparts', sets: 3, reps: 15, notes: 'Pull a towel taut at chest height, squeeze shoulder blades. Band if you have one.' },
      { name: 'Hip flexor stretch', sets: 3, reps: '45s each side', notes: 'Tucked pelvis, tall chest.' },
      { name: 'Cat-cow', sets: 3, reps: 10, notes: 'Emphasize the pelvic tilt both ways.' },
      { name: 'Chin tucks', sets: 3, reps: 15, notes: 'Hold 5s each. Long neck.' },
    ],
  },
  flexibility: {
    name: 'Flexibility Flow',
    focus: 'Full body flexibility for feminine movement',
    duration: 20,
    exercises: [
      { name: 'Forward fold', sets: 1, reps: '90s hold', notes: 'Soft knees, let gravity do it.' },
      { name: 'Pigeon pose', sets: 1, reps: '90s each side' },
      { name: 'Frog stretch', sets: 1, reps: '90s', notes: 'Ease in — this one opens the hips over weeks, not minutes.' },
      { name: 'Butterfly stretch', sets: 1, reps: '90s' },
      { name: 'Quad stretch', sets: 1, reps: '60s each side' },
      { name: 'Shoulder opener', sets: 1, reps: '60s each arm' },
      { name: 'Spinal twist', sets: 1, reps: '60s each side' },
    ],
  },
  yoga_flow: {
    name: 'Feminine Yoga',
    focus: 'Graceful movement, body awareness, feminine energy',
    duration: 30,
    exercises: [
      { name: 'Sun salutation A', sets: 5, reps: 1, notes: 'Flow with breath.' },
      { name: 'Warrior II', sets: 1, reps: '60s each side' },
      { name: 'Triangle pose', sets: 1, reps: '45s each side' },
      { name: 'Tree pose', sets: 1, reps: '45s each side' },
      { name: 'Goddess pose', sets: 1, reps: '60s', notes: 'Feel powerful.' },
      { name: 'Seated forward fold', sets: 1, reps: '90s' },
      { name: 'Savasana', sets: 1, reps: '3 min', notes: 'Eyes closed.' },
    ],
  },
  dance_cardio: {
    name: 'Dance Cardio',
    focus: 'Feminine movement patterns, hip isolation, confidence',
    duration: 25,
    exercises: [
      { phase: 'warmup', name: 'Hip circles', sets: 2, reps: '20 each direction', notes: 'Big and slow, loosen everything.' },
      { phase: 'main', name: 'Body rolls', sets: 3, reps: 10, notes: 'Slow, sensual, chest to hips.' },
      { phase: 'main', name: 'Freestyle dance', sets: 1, reps: '10 min', notes: 'A playlist you love. Nobody watching.' },
      { phase: 'main', name: 'Walking practice', sets: 1, reps: '5 min', notes: 'Heel-toe, hips move, shoulders quiet.' },
      { phase: 'cooldown', name: 'Forward fold', sets: 1, reps: '60s' },
    ],
  },
  recovery_stretch: {
    name: 'Recovery Day',
    focus: 'Gentle movement on low-recovery days',
    duration: 25,
    exercises: [
      { name: 'Self-massage / foam roll', sets: 1, reps: '10 min', notes: 'Roller if you have one, hands and a tennis ball work.' },
      { name: 'Gentle stretching', sets: 1, reps: '10 min', notes: 'No strain, just movement.' },
      { name: 'Deep breathing', sets: 1, reps: '5 min', notes: 'Belly breaths, slow exhale.' },
    ],
  },
};
