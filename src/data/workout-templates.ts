/**
 * Workout Templates
 *
 * 10 guided workout templates: 7 home, 1 MVW, 2 gym (gated).
 * Each defines warmup → main → cooldown with exercise blocks.
 * domainLevelMin gates template availability by domain progression level.
 */

import type { WorkoutTemplate } from '../types/exercise';

// ============================================
// SESSION A — GLUTE POWER (~25 min, home)
// ============================================

const GLUTE_POWER: WorkoutTemplate = {
  id: 'glute_power',
  name: 'Glute Power',
  type: 'glute_power',
  location: 'home',
  estimatedMinutes: 25,
  gymGateRequired: false,
  domainLevelMin: 1,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 2,
      reps: 15,
      restSeconds: 20,
      cues: [
        'Lie on back, feet flat, hip-width apart',
        'Drive heels into floor, lift hips',
        'SQUEEZE glutes hard at top — hold 2 seconds',
        'Lower slowly — don\'t just drop',
      ],
    },
    {
      name: 'Clamshells',
      sets: 1,
      reps: 15,
      restSeconds: 15,
      isPerSide: true,
      cues: [
        'Lie on side, knees bent 90 degrees, feet together',
        'Open top knee toward ceiling — keep feet touching',
        'Don\'t roll hips backward',
        'Pause at top, lower slowly',
      ],
    },
    {
      name: 'Stomach Vacuum',
      sets: 3,
      reps: 1,
      durationSeconds: 15,
      restSeconds: 30,
      cues: [
        'Stand with hands on hips',
        'Exhale ALL air — completely empty',
        'Pull belly button toward spine as hard as possible',
        'HOLD for 15 seconds',
      ],
    },
  ],
  main: [
    {
      name: 'Hip Thrusts',
      sets: 3,
      reps: 20,
      restSeconds: 45,
      deviceLevel: 2,
      devicePulseOnRep: true,
      cues: [
        'Upper back against couch edge, feet flat on floor',
        'Drive through heels, thrust hips toward ceiling',
        'SQUEEZE glutes at top for 2-3 seconds',
        'Lower until butt nearly touches floor',
      ],
    },
    {
      name: 'Sumo Squats',
      sets: 3,
      reps: 15,
      restSeconds: 40,
      cues: [
        'Feet wider than shoulder-width, toes pointed out 30-45°',
        'Lower by pushing hips back, bending knees',
        'Keep chest up, back straight',
        'Push through heels to stand',
      ],
    },
    {
      name: 'Curtsy Lunges',
      sets: 3,
      reps: 12,
      restSeconds: 40,
      isPerSide: true,
      cues: [
        'Stand feet hip-width apart',
        'Step right foot BEHIND and to the LEFT — like a curtsy',
        'Lower into lunge, back knee toward floor',
        'Push through front heel to stand',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Hip Flexor Stretch',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Lunge position, back knee on floor', 'Push hips forward gently', 'Hold and breathe'],
    },
    {
      name: 'Pigeon Pose',
      sets: 1,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Front shin across mat', 'Back leg extended behind', 'Fold forward if comfortable', 'Breathe into the stretch'],
    },
  ],
  completionAffirmations: [
    '60 hip thrusts. She\'s building the ass she wants.',
    'Glute power session done. Her body is being built, rep by rep.',
    'Every thrust builds her shape. Consistency wins.',
  ],
};

// ============================================
// SESSION B — HIP SHELF (~25 min, home)
// ============================================

const HIP_SHELF: WorkoutTemplate = {
  id: 'hip_shelf',
  name: 'Hip Shelf',
  type: 'hip_shelf',
  location: 'home',
  estimatedMinutes: 25,
  gymGateRequired: false,
  domainLevelMin: 2,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 2,
      reps: 15,
      restSeconds: 20,
      cues: [
        'Lie on back, feet flat, hip-width apart',
        'Drive heels into floor, lift hips',
        'SQUEEZE glutes at top — hold 2 seconds',
        'Lower slowly',
      ],
    },
    {
      name: 'Fire Hydrants',
      sets: 1,
      reps: 12,
      restSeconds: 15,
      isPerSide: true,
      cues: [
        'All fours, hands under shoulders, knees under hips',
        'Lift one knee out to the side, keeping it bent 90°',
        'Lift to hip height — no higher',
        'Pause 1 second, lower slowly',
      ],
    },
    {
      name: 'Stomach Vacuum',
      sets: 3,
      reps: 1,
      durationSeconds: 15,
      restSeconds: 30,
      cues: [
        'Exhale ALL air — completely empty',
        'Pull belly button toward spine as hard as possible',
        'HOLD for 15 seconds',
      ],
    },
  ],
  main: [
    {
      name: 'Banded Lateral Walks',
      sets: 3,
      reps: 10,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Band around ankles or just above knees',
        'Quarter squat position — stay low',
        'Step sideways with control',
        'Don\'t let feet come together',
      ],
    },
    {
      name: 'Side Leg Raises',
      sets: 3,
      reps: 20,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Lie on side, body in straight line',
        'Lift top leg toward ceiling — controlled',
        'Don\'t roll forward or backward',
        'Pause at top, lower slowly',
      ],
    },
    {
      name: 'Donkey Kicks',
      sets: 3,
      reps: 15,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'All fours, core tight',
        'Keep knee bent 90°, push foot toward ceiling',
        'Squeeze glute at top',
        'Don\'t arch lower back',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Cat-Cow',
      sets: 1,
      reps: 5,
      restSeconds: 0,
      cues: ['All fours', 'Inhale: arch back, look up (cow)', 'Exhale: round spine, tuck chin (cat)', 'Slow and controlled'],
    },
    {
      name: 'Pigeon Pose',
      sets: 1,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Front shin across mat', 'Back leg extended behind', 'Fold forward if comfortable'],
    },
  ],
  completionAffirmations: [
    'The hip shelf is being constructed. Rep by rep.',
    'Building the curve from every angle. She\'s sculpting.',
    'Side work done. The shape is taking form.',
  ],
};

// ============================================
// SESSION C — CIRCUIT (~20 min, home)
// ============================================

const CIRCUIT: WorkoutTemplate = {
  id: 'circuit',
  name: 'Circuit',
  type: 'circuit',
  location: 'home',
  estimatedMinutes: 20,
  gymGateRequired: false,
  domainLevelMin: 1,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 1,
      reps: 20,
      restSeconds: 15,
      cues: ['Drive heels into floor, lift hips', 'SQUEEZE at top — hold 2 seconds', 'Lower slowly'],
    },
    {
      name: 'Stomach Vacuum',
      sets: 3,
      reps: 1,
      durationSeconds: 10,
      restSeconds: 20,
      cues: ['Exhale ALL air', 'Pull belly button toward spine', 'HOLD for 10 seconds'],
    },
  ],
  main: [
    {
      name: 'Hip Thrusts',
      sets: 3,
      reps: 15,
      restSeconds: 0,
      deviceLevel: 2,
      devicePulseOnRep: true,
      cues: ['Upper back on couch, drive through heels', 'SQUEEZE at top'],
    },
    {
      name: 'Sumo Squats',
      sets: 3,
      reps: 12,
      restSeconds: 0,
      cues: ['Wide stance, toes out', 'Push through heels'],
    },
    {
      name: 'Clamshells',
      sets: 3,
      reps: 15,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Side-lying, feet together', 'Open knee, keep feet touching'],
    },
    {
      name: 'Fire Hydrants',
      sets: 3,
      reps: 12,
      restSeconds: 0,
      isPerSide: true,
      cues: ['All fours, lift knee to side', 'Hip height, no higher'],
    },
    {
      name: 'Lateral Walks',
      sets: 3,
      reps: 8,
      restSeconds: 60,
      isPerSide: true,
      cues: ['Quarter squat, step sideways', 'Stay low, don\'t let feet touch'],
    },
  ],
  cooldown: [
    {
      name: 'Hip Flexor Stretch',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Lunge position, back knee on floor', 'Push hips forward gently'],
    },
    {
      name: 'Cat-Cow',
      sets: 1,
      reps: 5,
      restSeconds: 0,
      cues: ['Inhale: arch back (cow)', 'Exhale: round spine (cat)'],
    },
  ],
  completionAffirmations: [
    'Circuit crushed. No breaks, no excuses.',
    '3 rounds, 5 exercises. She doesn\'t quit.',
    'Circuit done. Speed + endurance + shape.',
  ],
};

// ============================================
// MVW — MINIMUM VIABLE WORKOUT (~2 min)
// ============================================

const MVW: WorkoutTemplate = {
  id: 'mvw',
  name: 'Minimum Viable',
  type: 'mvw',
  location: 'home',
  estimatedMinutes: 2,
  gymGateRequired: false,
  domainLevelMin: 1,
  warmup: [],
  main: [
    {
      name: 'Glute Bridges',
      sets: 1,
      reps: 10,
      restSeconds: 0,
      cues: [
        'Lie on back, knees bent, feet flat',
        'Squeeze at the top',
        'That\'s it. That\'s the whole workout.',
        'The streak is alive.',
      ],
    },
  ],
  cooldown: [],
  completionAffirmations: [
    'She showed up. The streak lives.',
    '10 bridges. Bad days don\'t break streaks.',
    'Minimum viable. Maximum streak protection.',
  ],
};

// ============================================
// WAIST SCULPT (~20 min, home)
// ============================================

const WAIST_SCULPT: WorkoutTemplate = {
  id: 'waist_sculpt',
  name: 'Waist Sculpt',
  type: 'waist_sculpt',
  location: 'home',
  estimatedMinutes: 20,
  gymGateRequired: false,
  domainLevelMin: 3,
  warmup: [
    {
      name: 'Cat-Cow',
      sets: 1,
      reps: 8,
      restSeconds: 0,
      cues: [
        'All fours, hands under shoulders',
        'Inhale: arch back, look up (cow)',
        'Exhale: round spine, tuck chin (cat)',
        'Slow and controlled — feel the spine move',
      ],
    },
    {
      name: 'Dead Bug',
      sets: 2,
      reps: 8,
      restSeconds: 20,
      isPerSide: true,
      cues: [
        'Lie on back, arms pointing to ceiling, knees at 90°',
        'Lower opposite arm and leg toward floor',
        'Keep lower back pressed into mat — NO arching',
        'Return to start, alternate sides',
      ],
    },
  ],
  main: [
    {
      name: 'Stomach Vacuum',
      sets: 3,
      reps: 1,
      durationSeconds: 20,
      restSeconds: 30,
      cues: [
        'Stand with hands on hips',
        'Exhale ALL air — completely empty',
        'Pull belly button toward spine as hard as possible',
        'HOLD for 20 seconds — longer hold at this level',
      ],
    },
    {
      name: 'Side Plank Hip Dips',
      sets: 3,
      reps: 12,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Side plank on forearm, feet stacked',
        'Lower hips toward floor — controlled',
        'Drive hips back up, squeeze obliques',
        'Keep body in straight line at top',
      ],
    },
    {
      name: 'Bicycle Crunches',
      sets: 3,
      reps: 20,
      restSeconds: 30,
      cues: [
        'Lie on back, hands behind head',
        'Lift shoulders off floor — keep them up',
        'Rotate elbow toward opposite knee',
        'Extend other leg long — alternate sides',
      ],
    },
    {
      name: 'Oblique Crunches',
      sets: 3,
      reps: 15,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Lie on side, bottom arm extended, top hand behind head',
        'Crunch sideways — lift shoulder toward hip',
        'Focus on squeezing the oblique',
        'Controlled down — don\'t just drop',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Thoracic Rotation',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      isPerSide: true,
      cues: [
        'All fours, one hand behind head',
        'Rotate upper body toward ceiling — open the chest',
        'Follow your elbow with your eyes',
        'Hold at the top, breathe deep',
      ],
    },
  ],
  completionAffirmations: [
    'Waist sculpting session done. The hourglass is forming.',
    'Every oblique crunch tightens the waistline.',
    'She\'s carving curves from the inside out.',
  ],
};

// ============================================
// FLEXIBILITY & POSTURE (~15 min, home)
// ============================================

const FLEXIBILITY: WorkoutTemplate = {
  id: 'flexibility',
  name: 'Flexibility & Posture',
  type: 'flexibility',
  location: 'home',
  estimatedMinutes: 15,
  gymGateRequired: false,
  domainLevelMin: 2,
  warmup: [],
  main: [
    {
      name: 'Cat-Cow',
      sets: 2,
      reps: 8,
      restSeconds: 10,
      cues: [
        'All fours, hands under shoulders',
        'Inhale: arch back, look up (cow)',
        'Exhale: round spine, tuck chin (cat)',
        'Move slowly — feel each vertebra',
      ],
    },
    {
      name: 'Thoracic Rotation',
      sets: 2,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 10,
      isPerSide: true,
      cues: [
        'All fours, one hand behind head',
        'Rotate upper body toward ceiling',
        'Open the chest, look toward the ceiling',
        'Hold and breathe — feel the spine release',
      ],
    },
    {
      name: 'Hip Flexor Stretch',
      sets: 2,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 10,
      isPerSide: true,
      cues: [
        'Lunge position, back knee on floor',
        'Push hips forward gently',
        'Keep torso tall — don\'t lean forward',
        'Breathe into the stretch',
      ],
    },
    {
      name: 'Pigeon Pose',
      sets: 2,
      reps: 1,
      durationSeconds: 60,
      restSeconds: 10,
      isPerSide: true,
      cues: [
        'Front shin across mat, back leg extended',
        'Walk hands forward, fold over front leg',
        'Let gravity do the work — don\'t force',
        'Breathe deep — each exhale goes deeper',
      ],
    },
    {
      name: 'Shoulder Opener',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      cues: [
        'Clasp hands behind back, straighten arms',
        'Lift hands away from body, open chest',
        'Roll shoulders back and down',
        'Hold — feel posture straighten',
      ],
    },
  ],
  cooldown: [],
  completionAffirmations: [
    'Flexibility session done. Grace is built in stillness.',
    'Open hips, straight spine. She moves like a woman.',
    'Posture is the silent announcement of who she is.',
  ],
};

// ============================================
// GLUTE ENDURANCE (~20 min, home)
// ============================================

const GLUTE_ENDURANCE: WorkoutTemplate = {
  id: 'glute_endurance',
  name: 'Glute Endurance',
  type: 'glute_endurance',
  location: 'home',
  estimatedMinutes: 20,
  gymGateRequired: false,
  domainLevelMin: 3,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 2,
      reps: 15,
      restSeconds: 15,
      cues: [
        'Lie on back, feet flat, hip-width',
        'Drive heels, lift hips',
        'SQUEEZE at top — 2 seconds',
        'Lower with control',
      ],
    },
    {
      name: 'Fire Hydrants',
      sets: 1,
      reps: 10,
      restSeconds: 10,
      isPerSide: true,
      cues: [
        'All fours, lift knee to side',
        'Hip height — no higher',
        'Pause 1 second, lower slowly',
      ],
    },
  ],
  main: [
    {
      name: 'Frog Pumps',
      sets: 3,
      reps: 20,
      restSeconds: 30,
      deviceLevel: 2,
      devicePulseOnRep: true,
      cues: [
        'Lie on back, soles of feet together, knees wide',
        'Drive through heels, thrust hips up',
        'SQUEEZE glutes hard at top — 2 seconds',
        'This targets the upper glutes specifically',
      ],
    },
    {
      name: 'Single-Leg Glute Bridge',
      sets: 3,
      reps: 12,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Lie on back, one foot flat, other leg extended up',
        'Drive through planted heel, lift hips',
        'Keep hips level — don\'t rotate',
        'Squeeze at top, lower slowly',
      ],
    },
    {
      name: 'Standing Kickbacks',
      sets: 3,
      reps: 15,
      restSeconds: 25,
      isPerSide: true,
      cues: [
        'Stand holding wall or chair for balance',
        'Kick one leg straight back — squeeze glute',
        'Keep core tight, don\'t lean forward',
        'Controlled return — don\'t swing',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Pigeon Pose',
      sets: 1,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Front shin across mat', 'Back leg extended', 'Fold forward', 'Breathe into the stretch'],
    },
  ],
  completionAffirmations: [
    'Glute endurance built. She can feel the burn.',
    'Frog pumps + single leg work. Precision sculpting.',
    'Endurance session done. The glutes never quit.',
  ],
};

// ============================================
// BAND BURN (~20 min, home)
// ============================================

const BAND_BURN: WorkoutTemplate = {
  id: 'band_burn',
  name: 'Band Burn',
  type: 'band_burn',
  location: 'home',
  estimatedMinutes: 20,
  gymGateRequired: false,
  domainLevelMin: 2,
  warmup: [
    {
      name: 'Clamshells',
      sets: 2,
      reps: 15,
      restSeconds: 15,
      isPerSide: true,
      cues: [
        'Side-lying, knees bent, feet together',
        'Open top knee — resist the band',
        'Pause at top, lower slowly',
        'Feel the hip burn building',
      ],
    },
    {
      name: 'Glute Bridges',
      sets: 1,
      reps: 20,
      restSeconds: 15,
      cues: [
        'Band above knees for extra activation',
        'Push knees apart as you bridge',
        'SQUEEZE at top',
      ],
    },
  ],
  main: [
    {
      name: 'Banded Hip Thrusts',
      sets: 3,
      reps: 20,
      restSeconds: 40,
      deviceLevel: 2,
      devicePulseOnRep: true,
      cues: [
        'Band above knees, upper back on couch',
        'Push knees apart as you thrust up',
        'SQUEEZE glutes at top — 2-3 seconds',
        'The band forces glute medius activation',
      ],
    },
    {
      name: 'Banded Lateral Walks',
      sets: 3,
      reps: 12,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Band around ankles — stay in quarter squat',
        'Step sideways with control',
        'Keep tension on the band the whole time',
        'Don\'t let feet come together',
      ],
    },
    {
      name: 'Banded Donkey Kicks',
      sets: 3,
      reps: 15,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Band around thighs, all fours position',
        'Keep knee bent 90°, push foot toward ceiling',
        'Squeeze glute hard at top',
        'Don\'t arch lower back',
      ],
    },
    {
      name: 'Banded Fire Hydrants',
      sets: 3,
      reps: 12,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Band above knees, all fours',
        'Lift knee out to side against band resistance',
        'Hip height — fight the band',
        'Pause 1 second at top, lower slowly',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Hip Flexor Stretch',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Lunge position, back knee on floor', 'Push hips forward gently', 'Breathe deep'],
    },
  ],
  completionAffirmations: [
    'Band burn complete. Resistance builds the shape.',
    'Every banded rep carves deeper curves.',
    'The bands don\'t lie. She\'s getting stronger.',
  ],
};

// ============================================
// GYM A — GLUTE POWER (gym, gated)
// ============================================

const GYM_GLUTE: WorkoutTemplate = {
  id: 'gym_glute',
  name: 'Gym: Glute Power',
  type: 'gym_glute',
  location: 'gym',
  estimatedMinutes: 40,
  gymGateRequired: true,
  domainLevelMin: 4,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 2,
      reps: 15,
      restSeconds: 20,
      cues: ['On mat area', 'Drive heels, lift hips', 'SQUEEZE at top'],
    },
    {
      name: 'Banded Clamshells',
      sets: 1,
      reps: 15,
      restSeconds: 15,
      isPerSide: true,
      cues: ['Band above knees', 'Side-lying, open knee against band resistance'],
    },
  ],
  main: [
    {
      name: 'Smith Machine Hip Thrusts',
      sets: 4,
      reps: 15,
      restSeconds: 60,
      deviceLevel: 3,
      devicePulseOnRep: true,
      cues: [
        'Upper back on bench, bar across hips',
        'Pad the bar',
        'Drive through heels, thrust up',
        'SQUEEZE 2-3 seconds at top',
      ],
    },
    {
      name: 'Leg Press (feet high & wide)',
      sets: 3,
      reps: 15,
      restSeconds: 50,
      cues: [
        'Feet HIGH on platform, wider than shoulder width',
        'Toes pointed slightly out',
        'Full depth — knees toward chest',
        'Push through heels',
      ],
    },
    {
      name: 'Cable Kickbacks',
      sets: 3,
      reps: 15,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Ankle strap, low pulley',
        'Slight lean forward, kick leg back',
        'Squeeze glute at full extension',
        'Controlled return',
      ],
    },
    {
      name: 'Lateral Walks',
      sets: 3,
      reps: 10,
      restSeconds: 30,
      isPerSide: true,
      cues: ['Band above knees', 'Quarter squat, step sideways', 'Stay low'],
    },
  ],
  cooldown: [
    {
      name: 'Hip Flexor Stretch',
      sets: 1,
      reps: 1,
      durationSeconds: 30,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Lunge position on mat', 'Push hips forward gently'],
    },
    {
      name: 'Pigeon Pose',
      sets: 1,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 0,
      isPerSide: true,
      cues: ['On mat area', 'Front shin across, back leg extended', 'Fold forward'],
    },
  ],
  completionAffirmations: [
    'Gym glute session done. Real weight, real growth.',
    'Smith machine hip thrusts. She\'s building serious curves.',
    'Gym day complete. She earned this.',
  ],
};

// ============================================
// GYM B — HIP SHELF (gym, gated)
// ============================================

const GYM_SHELF: WorkoutTemplate = {
  id: 'gym_shelf',
  name: 'Gym: Hip Shelf',
  type: 'gym_shelf',
  location: 'gym',
  estimatedMinutes: 40,
  gymGateRequired: true,
  domainLevelMin: 4,
  warmup: [
    {
      name: 'Glute Bridges',
      sets: 2,
      reps: 15,
      restSeconds: 20,
      cues: ['On mat area', 'Drive heels, lift hips', 'SQUEEZE at top'],
    },
    {
      name: 'Fire Hydrants',
      sets: 1,
      reps: 12,
      restSeconds: 15,
      isPerSide: true,
      cues: ['All fours, knee to side', 'Hip height, pause, lower slowly'],
    },
  ],
  main: [
    {
      name: 'Cable Hip Abduction',
      sets: 4,
      reps: 20,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Ankle strap, low pulley, stand sideways',
        'Lift leg out to the side against cable',
        'Controlled movement, squeeze at top',
        'Don\'t lean — stand tall',
      ],
    },
    {
      name: 'Curtsy Lunges w/ Dumbbell',
      sets: 3,
      reps: 12,
      restSeconds: 40,
      isPerSide: true,
      cues: [
        'Hold dumbbell at chest (goblet grip)',
        'Step behind and across — curtsy',
        'Lower until back knee nearly touches floor',
        'Push through front heel',
      ],
    },
    {
      name: 'Sumo Squat w/ Dumbbell',
      sets: 3,
      reps: 15,
      restSeconds: 40,
      cues: [
        'Wide stance, toes out 30-45°',
        'Hold dumbbell hanging between legs',
        'Squat deep, push through heels',
        'Keep chest up',
      ],
    },
    {
      name: 'Side Leg Raise on Bench',
      sets: 3,
      reps: 20,
      restSeconds: 30,
      isPerSide: true,
      cues: [
        'Side-lying on bench for full range of motion',
        'Lift top leg toward ceiling',
        'Controlled up and down',
        'Don\'t swing — use the muscle',
      ],
    },
  ],
  cooldown: [
    {
      name: 'Cat-Cow',
      sets: 1,
      reps: 5,
      restSeconds: 0,
      cues: ['On mat', 'Inhale: arch (cow)', 'Exhale: round (cat)'],
    },
    {
      name: 'Pigeon Pose',
      sets: 1,
      reps: 1,
      durationSeconds: 45,
      restSeconds: 0,
      isPerSide: true,
      cues: ['Front shin across', 'Fold forward', 'Breathe into the stretch'],
    },
  ],
  completionAffirmations: [
    'Gym hip shelf session complete. The curve is being built.',
    'Cable work + weighted lunges. Serious hip development.',
    'She walked into the gym and built her shelf.',
  ],
};

// ============================================
// EXPORTS
// ============================================

export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  GLUTE_POWER,
  HIP_SHELF,
  CIRCUIT,
  MVW,
  WAIST_SCULPT,
  FLEXIBILITY,
  GLUTE_ENDURANCE,
  BAND_BURN,
  GYM_GLUTE,
  GYM_SHELF,
];

export function getTemplateById(id: string): WorkoutTemplate | undefined {
  return WORKOUT_TEMPLATES.find(t => t.id === id);
}

export function getHomeTemplates(): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(t => !t.gymGateRequired);
}

export function getGymTemplates(): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(t => t.gymGateRequired);
}

export function getTemplatesForLevel(domainLevel: number): WorkoutTemplate[] {
  return WORKOUT_TEMPLATES.filter(t => t.domainLevelMin <= domainLevel);
}
