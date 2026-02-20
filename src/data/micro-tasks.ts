/**
 * Micro-task library — identity-reinforcing interrupt definitions.
 */

import type { MicroTask } from '../types/micro-tasks';

export const MICRO_TASKS: MicroTask[] = [
  // Posture
  { type: 'posture', instruction: 'Posture check. Shoulders back. Pelvic tilt. Hold 10 seconds.', durationSeconds: 10, points: 2 },
  { type: 'posture', instruction: 'Uncross your legs. Knees together. Feet flat. Her sitting position.', durationSeconds: 5, points: 2 },
  { type: 'posture', instruction: 'Stand up. Hip-width. Weight on balls of feet. One hip popped. 15 seconds.', durationSeconds: 15, points: 3 },

  // Scent
  { type: 'scent', instruction: 'Hand cream. Both hands. 15 seconds.', durationSeconds: 15, points: 2 },
  { type: 'scent', instruction: 'Lip balm. 5 seconds.', durationSeconds: 5, points: 2 },
  { type: 'scent', instruction: "Smell your wrist. That's her.", durationSeconds: 3, points: 2 },
  { type: 'scent', instruction: 'Reapply hand cream. Inhale. That scent is her baseline now.', durationSeconds: 15, points: 2 },

  // Voice
  { type: 'voice', instruction: '"Good afternoon" in her voice. Play it back.', durationSeconds: 15, points: 3 },
  { type: 'voice', instruction: 'Hum at practice pitch for 10 seconds.', durationSeconds: 10, points: 2 },
  { type: 'voice', instruction: 'Next sentence you say: 10% softer. Notice their response.', durationSeconds: 5, points: 3 },

  // Anchor
  { type: 'anchor', instruction: 'Look at your ring. Remember who wears it.', durationSeconds: 5, points: 2 },
  { type: 'anchor', instruction: "Feel the underwear against your skin. She's underneath everything.", durationSeconds: 5, points: 2 },

  // Awareness
  { type: 'awareness', instruction: 'What does she smell like right now? Notice.', durationSeconds: 5, points: 2 },
  { type: 'awareness', instruction: "Three things you're wearing right now that are hers. Name them.", durationSeconds: 10, points: 3 },

  // Gait
  { type: 'gait', instruction: 'Walk to bathroom and back. Feminine gait. Shorter steps. Hip sway. 30 seconds.', durationSeconds: 30, points: 3 },
  { type: 'gait', instruction: 'Stand. Walk to kitchen. Pour water. Walk back. All as her.', durationSeconds: 60, points: 5 },
];

/** Select a micro-task avoiding same type as the last one in the schedule. */
export function selectMicroTask(schedule: { task: MicroTask }[]): MicroTask {
  const lastType = schedule.length > 0 ? schedule[schedule.length - 1].task.type : null;
  const eligible = lastType
    ? MICRO_TASKS.filter(t => t.type !== lastType)
    : MICRO_TASKS;
  return eligible[Math.floor(Math.random() * eligible.length)];
}
