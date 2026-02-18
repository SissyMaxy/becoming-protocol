// Edge Protocol Presets
// Structured edging programs with defined patterns

import type { LovensePatternName } from '../types/lovense';

export interface EdgeStep {
  phase: 'build' | 'edge' | 'hold' | 'cooldown' | 'rest';
  duration: number; // seconds
  intensity: number; // 0-20
  pattern?: LovensePatternName;
  instruction?: string;
}

export interface EdgeProtocol {
  id: string;
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'extreme';
  totalEdges: number;
  estimatedDuration: number; // minutes
  minDenialDay: number;
  steps: EdgeStep[];
  benefits: string[];
  warnings?: string[];
}

// Pre-defined protocols
export const EDGE_PROTOCOLS: EdgeProtocol[] = [
  {
    id: 'quick_5',
    name: 'Quick 5',
    description: '5 edges with short cooldowns. Perfect warm-up.',
    difficulty: 'beginner',
    totalEdges: 5,
    estimatedDuration: 10,
    minDenialDay: 0,
    benefits: ['Quick session', 'Good warm-up', 'Builds baseline'],
    steps: generateQuickEdgeSteps(5, 30, 15),
  },
  {
    id: 'standard_10',
    name: 'Standard 10',
    description: 'Classic 10-edge session with moderate pacing.',
    difficulty: 'beginner',
    totalEdges: 10,
    estimatedDuration: 20,
    minDenialDay: 0,
    benefits: ['Balanced session', 'Good control practice', 'Moderate intensity'],
    steps: generateQuickEdgeSteps(10, 45, 20),
  },
  {
    id: 'rapid_fire',
    name: 'Rapid Fire',
    description: '15 edges with minimal cooldown. Test your speed.',
    difficulty: 'intermediate',
    totalEdges: 15,
    estimatedDuration: 15,
    minDenialDay: 3,
    benefits: ['Speed training', 'Quick recovery practice', 'Intense focus'],
    warnings: ['High slip risk', 'Requires good control'],
    steps: generateQuickEdgeSteps(15, 20, 10),
  },
  {
    id: 'denial_endurance',
    name: 'Denial Endurance',
    description: '20 edges with extended holds. Build mental strength.',
    difficulty: 'advanced',
    totalEdges: 20,
    estimatedDuration: 45,
    minDenialDay: 7,
    benefits: ['Extended control', 'Mental fortitude', 'Deep conditioning'],
    warnings: ['Long session', 'Requires focus'],
    steps: generateEnduranceSteps(20),
  },
  {
    id: 'wave_rider',
    name: 'Wave Rider',
    description: 'Intensity waves that build and recede. Ride the sensation.',
    difficulty: 'intermediate',
    totalEdges: 12,
    estimatedDuration: 30,
    minDenialDay: 3,
    benefits: ['Pattern awareness', 'Flow state practice', 'Varied intensity'],
    steps: generateWaveSteps(12),
  },
  {
    id: 'plateau_training',
    name: 'Plateau Training',
    description: 'Extended plateau holds before each edge. Master the almost.',
    difficulty: 'advanced',
    totalEdges: 8,
    estimatedDuration: 40,
    minDenialDay: 7,
    benefits: ['Plateau mastery', 'Extended arousal', 'Control refinement'],
    warnings: ['Mentally challenging', 'Requires patience'],
    steps: generatePlateauSteps(8),
  },
  {
    id: 'staircase',
    name: 'Staircase',
    description: 'Progressively increasing intensity with each edge.',
    difficulty: 'intermediate',
    totalEdges: 10,
    estimatedDuration: 25,
    minDenialDay: 3,
    benefits: ['Progressive challenge', 'Intensity calibration', 'Building tolerance'],
    steps: generateStaircaseSteps(10),
  },
  {
    id: 'ruined_practice',
    name: 'Ruined Practice',
    description: 'Practice stopping at the absolute edge. High risk, high reward.',
    difficulty: 'extreme',
    totalEdges: 5,
    estimatedDuration: 30,
    minDenialDay: 14,
    benefits: ['Ultimate control', 'Edge precision', 'Advanced technique'],
    warnings: ['Very high slip risk', 'Only for experienced', 'May result in ruined orgasm'],
    steps: generateRuinedPracticeSteps(5),
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: '30+ edges over an extended session. The ultimate test.',
    difficulty: 'extreme',
    totalEdges: 30,
    estimatedDuration: 90,
    minDenialDay: 14,
    benefits: ['Endurance mastery', 'Deep subspace', 'Breakthrough potential'],
    warnings: ['Very long session', 'Mental exhaustion possible', 'Take breaks if needed'],
    steps: generateMarathonSteps(30),
  },
];

// Step generators
function generateQuickEdgeSteps(edgeCount: number, buildTime: number, cooldownTime: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  for (let i = 0; i < edgeCount; i++) {
    // Build phase
    steps.push({
      phase: 'build',
      duration: buildTime,
      intensity: Math.min(5 + i, 15),
      pattern: 'building',
      instruction: `Build to edge ${i + 1}`,
    });

    // Edge moment
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: Math.min(10 + i, 18),
      pattern: 'edge_tease',
      instruction: 'EDGE! Hold it...',
    });

    // Cooldown
    steps.push({
      phase: 'cooldown',
      duration: cooldownTime,
      intensity: Math.max(2, 5 - Math.floor(i / 3)),
      pattern: 'gentle_wave',
      instruction: 'Cool down. Breathe.',
    });
  }

  return steps;
}

function generateEnduranceSteps(edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  for (let i = 0; i < edgeCount; i++) {
    // Extended build
    steps.push({
      phase: 'build',
      duration: 60,
      intensity: Math.min(6 + Math.floor(i / 2), 14),
      pattern: 'staircase',
      instruction: `Slow build to edge ${i + 1}`,
    });

    // Hold phase (extended)
    steps.push({
      phase: 'hold',
      duration: 30,
      intensity: Math.min(12 + Math.floor(i / 3), 16),
      pattern: 'constant_medium',
      instruction: 'Hold at the edge. Don\'t go over.',
    });

    // Edge
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: Math.min(14 + Math.floor(i / 4), 18),
      pattern: 'edge_tease',
      instruction: 'EDGE!',
    });

    // Rest
    steps.push({
      phase: 'rest',
      duration: 45,
      intensity: 2,
      pattern: 'constant_low',
      instruction: 'Rest. Recover. Prepare for the next.',
    });
  }

  return steps;
}

function generateWaveSteps(edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];
  const waveIntensities = [5, 8, 12, 15, 12, 8, 5, 10, 14, 16, 14, 10];

  for (let i = 0; i < edgeCount; i++) {
    const baseIntensity = waveIntensities[i % waveIntensities.length];

    steps.push({
      phase: 'build',
      duration: 40 + (i % 3) * 10,
      intensity: baseIntensity,
      pattern: 'gentle_wave',
      instruction: `Ride the wave to edge ${i + 1}`,
    });

    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: Math.min(baseIntensity + 3, 18),
      pattern: 'edge_tease',
      instruction: 'EDGE! Feel the peak.',
    });

    steps.push({
      phase: 'cooldown',
      duration: 20,
      intensity: Math.max(baseIntensity - 5, 2),
      pattern: 'flutter_gentle',
      instruction: 'Let it recede...',
    });
  }

  return steps;
}

function generatePlateauSteps(edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  for (let i = 0; i < edgeCount; i++) {
    // Build to plateau
    steps.push({
      phase: 'build',
      duration: 45,
      intensity: 10 + Math.floor(i / 2),
      pattern: 'building',
      instruction: `Build to plateau ${i + 1}`,
    });

    // Extended plateau hold
    steps.push({
      phase: 'hold',
      duration: 60 + i * 10, // Gets longer each time
      intensity: 12 + Math.floor(i / 2),
      pattern: 'constant_medium',
      instruction: 'Hold at plateau. Feel everything. Don\'t edge yet.',
    });

    // Push to edge
    steps.push({
      phase: 'build',
      duration: 20,
      intensity: 14 + Math.floor(i / 2),
      pattern: 'staircase',
      instruction: 'Now push to the edge...',
    });

    // Edge
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: 16 + Math.floor(i / 3),
      pattern: 'edge_tease',
      instruction: 'EDGE!',
    });

    // Recovery
    steps.push({
      phase: 'rest',
      duration: 30,
      intensity: 3,
      pattern: 'constant_low',
      instruction: 'Recover completely.',
    });
  }

  return steps;
}

function generateStaircaseSteps(edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  for (let i = 0; i < edgeCount; i++) {
    const stepIntensity = 5 + Math.floor((i / edgeCount) * 13); // 5 to 18

    steps.push({
      phase: 'build',
      duration: 35,
      intensity: stepIntensity,
      pattern: 'staircase',
      instruction: `Step ${i + 1}: Intensity ${stepIntensity}`,
    });

    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: Math.min(stepIntensity + 2, 18),
      pattern: 'edge_tease',
      instruction: 'EDGE!',
    });

    steps.push({
      phase: 'cooldown',
      duration: 15,
      intensity: Math.max(stepIntensity - 3, 2),
      pattern: 'gentle_wave',
      instruction: 'Brief cooldown...',
    });
  }

  return steps;
}

function generateRuinedPracticeSteps(edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  for (let i = 0; i < edgeCount; i++) {
    // Slow, deliberate build
    steps.push({
      phase: 'build',
      duration: 120, // 2 minutes
      intensity: 8 + i * 2,
      pattern: 'building',
      instruction: `Slow build ${i + 1}. Feel every sensation.`,
    });

    // Extended plateau at high intensity
    steps.push({
      phase: 'hold',
      duration: 60,
      intensity: 14 + i,
      pattern: 'constant_high',
      instruction: 'Hold at the very edge. This is the line.',
    });

    // Critical edge moment
    steps.push({
      phase: 'edge',
      duration: 10,
      intensity: 16 + i,
      pattern: 'denial_pulse',
      instruction: 'ABSOLUTE EDGE. Stop exactly here.',
    });

    // Complete stop
    steps.push({
      phase: 'rest',
      duration: 90,
      intensity: 0,
      instruction: 'Complete stop. Hands off. Breathe deeply.',
    });
  }

  return steps;
}

function generateMarathonSteps(_edgeCount: number): EdgeStep[] {
  const steps: EdgeStep[] = [];

  // Warm-up phase (first 5 edges)
  for (let i = 0; i < 5; i++) {
    steps.push({
      phase: 'build',
      duration: 30,
      intensity: 5 + i,
      pattern: 'gentle_wave',
      instruction: `Warm-up edge ${i + 1}`,
    });
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: 10 + i,
      pattern: 'edge_tease',
      instruction: 'EDGE!',
    });
    steps.push({
      phase: 'cooldown',
      duration: 20,
      intensity: 3,
      pattern: 'constant_low',
      instruction: 'Cool down.',
    });
  }

  // Main phase (next 20 edges)
  for (let i = 5; i < 25; i++) {
    const cyclePosition = (i - 5) % 5;
    const intensity = 10 + cyclePosition * 2;

    steps.push({
      phase: 'build',
      duration: 40,
      intensity,
      pattern: cyclePosition < 3 ? 'building' : 'staircase',
      instruction: `Edge ${i + 1} of marathon`,
    });
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: intensity + 3,
      pattern: 'edge_tease',
      instruction: 'EDGE!',
    });
    steps.push({
      phase: 'cooldown',
      duration: 25,
      intensity: 4,
      pattern: 'gentle_wave',
      instruction: 'Brief recovery.',
    });

    // Rest break every 5 edges
    if ((i + 1) % 5 === 0) {
      steps.push({
        phase: 'rest',
        duration: 60,
        intensity: 2,
        pattern: 'constant_low',
        instruction: 'Extended rest. Hydrate if needed.',
      });
    }
  }

  // Final push (last 5 edges)
  for (let i = 25; i < 30; i++) {
    steps.push({
      phase: 'build',
      duration: 50,
      intensity: 14 + (i - 25),
      pattern: 'staircase',
      instruction: `Final push: Edge ${i + 1}`,
    });
    steps.push({
      phase: 'hold',
      duration: 30,
      intensity: 16 + (i - 25),
      pattern: 'constant_high',
      instruction: 'Hold at maximum.',
    });
    steps.push({
      phase: 'edge',
      duration: 5,
      intensity: 18,
      pattern: 'edge_tease',
      instruction: 'EDGE! Almost there.',
    });
    steps.push({
      phase: 'cooldown',
      duration: 30,
      intensity: 5,
      pattern: 'denial_pulse',
      instruction: 'Controlled descent.',
    });
  }

  return steps;
}

// Get protocol by ID
export function getProtocolById(id: string): EdgeProtocol | undefined {
  return EDGE_PROTOCOLS.find(p => p.id === id);
}

// Get protocols by difficulty
export function getProtocolsByDifficulty(
  difficulty: EdgeProtocol['difficulty']
): EdgeProtocol[] {
  return EDGE_PROTOCOLS.filter(p => p.difficulty === difficulty);
}

// Get recommended protocols based on denial day
export function getRecommendedProtocols(denialDay: number): EdgeProtocol[] {
  return EDGE_PROTOCOLS
    .filter(p => denialDay >= p.minDenialDay)
    .sort((a, b) => {
      // Prioritize protocols that match denial day range
      const aScore = Math.abs(denialDay - a.minDenialDay);
      const bScore = Math.abs(denialDay - b.minDenialDay);
      return aScore - bScore;
    });
}

// Calculate protocol progress
export function calculateProtocolProgress(
  protocol: EdgeProtocol,
  currentStepIndex: number
): {
  percentComplete: number;
  edgesComplete: number;
  timeRemaining: number;
} {
  let edgesComplete = 0;
  let timeElapsed = 0;
  let totalTime = 0;

  protocol.steps.forEach((step, i) => {
    totalTime += step.duration;
    if (i < currentStepIndex) {
      timeElapsed += step.duration;
      if (step.phase === 'edge') {
        edgesComplete++;
      }
    }
  });

  return {
    percentComplete: (timeElapsed / totalTime) * 100,
    edgesComplete,
    timeRemaining: totalTime - timeElapsed,
  };
}
