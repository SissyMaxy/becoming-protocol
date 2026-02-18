/**
 * Haptic Pattern Orchestrator
 *
 * Coordinates Lovense toy patterns with session phases and arousal states.
 * Provides intelligent, adaptive haptic sequences during edge sessions.
 */

import type { EdgeSessionPhase } from '../types/edge-session';
import type {
  LovensePattern,
  PatternStep,
} from '../types/lovense';
import { BUILTIN_PATTERNS } from '../types/lovense';
import {
  smartVibrate,
  smartStop,
  playPattern,
  stopPattern,
} from './lovense';

// ============================================
// TYPES
// ============================================

export interface OrchestratorConfig {
  enabled: boolean;
  autoPhasePatterns: boolean;      // Auto-select patterns based on phase
  arousalAdaptive: boolean;        // Adjust intensity based on arousal
  denialDayScaling: boolean;       // Scale intensity with denial days
  edgeReactive: boolean;           // React to edge events
  transitionSmoothing: boolean;    // Smooth transitions between phases
  maxIntensity: number;            // Cap intensity (0-20)
  minIntensity: number;            // Floor intensity
  intensityMultiplier: number;     // Global intensity adjustment (0.5-1.5)
}

export interface OrchestratorState {
  isActive: boolean;
  currentPhase: EdgeSessionPhase | null;
  currentPattern: string | null;
  currentIntensity: number;
  arousalLevel: number;
  denialDay: number;
  edgeCount: number;
  phaseStartTime: number | null;
  lastTransition: number | null;
  queuedPattern: string | null;
}

export interface PhasePatternConfig {
  patterns: string[];           // Pattern names for this phase
  baseIntensity: number;        // Base intensity for phase
  intensityRange: [number, number]; // Min/max for phase
  duration: number | null;      // Suggested phase duration (ms), null = indefinite
  transitionStyle: 'immediate' | 'fade' | 'pulse';
  loopPatterns: boolean;
  arousalBoost: boolean;        // Boost intensity with arousal
  edgeBoost: boolean;           // Boost intensity with edge count
}

export type PatternCallback = (event: PatternEvent) => void;

export interface PatternEvent {
  type: 'phase_change' | 'pattern_start' | 'pattern_end' | 'intensity_change' | 'edge_reaction';
  phase?: EdgeSessionPhase;
  pattern?: string;
  intensity?: number;
  timestamp: number;
}

// ============================================
// PHASE PATTERN CONFIGURATIONS
// ============================================

const PHASE_PATTERNS: Record<EdgeSessionPhase, PhasePatternConfig> = {
  entry: {
    patterns: [],
    baseIntensity: 0,
    intensityRange: [0, 0],
    duration: null,
    transitionStyle: 'immediate',
    loopPatterns: false,
    arousalBoost: false,
    edgeBoost: false,
  },
  warmup: {
    patterns: ['gentle_wave', 'constant_low', 'flutter_gentle'],
    baseIntensity: 5,
    intensityRange: [3, 8],
    duration: 120000, // 2 minutes
    transitionStyle: 'fade',
    loopPatterns: true,
    arousalBoost: false,
    edgeBoost: false,
  },
  building: {
    patterns: ['building', 'staircase', 'gentle_wave'],
    baseIntensity: 10,
    intensityRange: [6, 14],
    duration: null,
    transitionStyle: 'fade',
    loopPatterns: true,
    arousalBoost: true,
    edgeBoost: false,
  },
  plateau: {
    patterns: ['constant_medium', 'heartbeat', 'gentle_wave'],
    baseIntensity: 12,
    intensityRange: [8, 15],
    duration: null,
    transitionStyle: 'fade',
    loopPatterns: true,
    arousalBoost: true,
    edgeBoost: true,
  },
  edge: {
    patterns: ['edge_tease', 'denial_pulse', 'random_tease'],
    baseIntensity: 16,
    intensityRange: [12, 20],
    duration: 30000, // 30 seconds
    transitionStyle: 'pulse',
    loopPatterns: true,
    arousalBoost: true,
    edgeBoost: true,
  },
  recovery: {
    patterns: ['constant_low', 'flutter_gentle'],
    baseIntensity: 4,
    intensityRange: [2, 6],
    duration: 60000, // 1 minute
    transitionStyle: 'fade',
    loopPatterns: false,
    arousalBoost: false,
    edgeBoost: false,
  },
  auction: {
    patterns: ['constant_medium', 'heartbeat'],
    baseIntensity: 10,
    intensityRange: [8, 14],
    duration: null,
    transitionStyle: 'immediate',
    loopPatterns: true,
    arousalBoost: true,
    edgeBoost: false,
  },
  completion: {
    patterns: ['gentle_wave', 'flutter_gentle'],
    baseIntensity: 6,
    intensityRange: [3, 8],
    duration: 30000,
    transitionStyle: 'fade',
    loopPatterns: false,
    arousalBoost: false,
    edgeBoost: false,
  },
  abandoned: {
    patterns: [],
    baseIntensity: 0,
    intensityRange: [0, 0],
    duration: null,
    transitionStyle: 'immediate',
    loopPatterns: false,
    arousalBoost: false,
    edgeBoost: false,
  },
};

// ============================================
// ORCHESTRATOR CLASS
// ============================================

class HapticOrchestrator {
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private callbacks: PatternCallback[] = [];
  private phaseTimer: NodeJS.Timeout | null = null;
  private patternTimer: NodeJS.Timeout | null = null;
  private transitionTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      enabled: true,
      autoPhasePatterns: true,
      arousalAdaptive: true,
      denialDayScaling: true,
      edgeReactive: true,
      transitionSmoothing: true,
      maxIntensity: 20,
      minIntensity: 0,
      intensityMultiplier: 1.0,
      ...config,
    };

    this.state = {
      isActive: false,
      currentPhase: null,
      currentPattern: null,
      currentIntensity: 0,
      arousalLevel: 1,
      denialDay: 0,
      edgeCount: 0,
      phaseStartTime: null,
      lastTransition: null,
      queuedPattern: null,
    };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  start(initialPhase: EdgeSessionPhase = 'warmup'): void {
    if (this.state.isActive) return;

    this.state.isActive = true;
    this.transitionToPhase(initialPhase);
    this.emit({ type: 'phase_change', phase: initialPhase, timestamp: Date.now() });
  }

  stop(): void {
    this.clearAllTimers();
    stopPattern();
    smartStop('pattern');

    this.state.isActive = false;
    this.state.currentPhase = null;
    this.state.currentPattern = null;
    this.state.currentIntensity = 0;
  }

  pause(): void {
    this.clearAllTimers();
    stopPattern();
    smartStop('pattern');
  }

  resume(): void {
    if (this.state.currentPhase) {
      this.playPhasePattern(this.state.currentPhase);
    }
  }

  // ============================================
  // PHASE MANAGEMENT
  // ============================================

  transitionToPhase(phase: EdgeSessionPhase): void {
    if (!this.state.isActive) return;

    const prevPhase = this.state.currentPhase;
    const phaseConfig = PHASE_PATTERNS[phase];

    this.state.currentPhase = phase;
    this.state.phaseStartTime = Date.now();
    this.state.lastTransition = Date.now();

    // Handle transition
    if (this.config.transitionSmoothing && prevPhase) {
      this.smoothTransition(prevPhase, phase);
    } else {
      this.playPhasePattern(phase);
    }

    // Set phase timer if duration specified
    if (phaseConfig.duration) {
      this.clearPhaseTimer();
      this.phaseTimer = setTimeout(() => {
        this.onPhaseDurationComplete(phase);
      }, phaseConfig.duration);
    }

    this.emit({ type: 'phase_change', phase, timestamp: Date.now() });
  }

  private smoothTransition(_fromPhase: EdgeSessionPhase, toPhase: EdgeSessionPhase): void {
    const toConfig = PHASE_PATTERNS[toPhase];

    // Fade down from current intensity
    const fadeDownDuration = 1000;
    const fadeUpDuration = 1500;

    // Start fade down
    this.fadeIntensity(this.state.currentIntensity, toConfig.baseIntensity * 0.5, fadeDownDuration, () => {
      // Then fade up to new phase
      this.fadeIntensity(toConfig.baseIntensity * 0.5, toConfig.baseIntensity, fadeUpDuration, () => {
        // Finally start the new phase pattern
        this.playPhasePattern(toPhase);
      });
    });
  }

  private fadeIntensity(from: number, to: number, duration: number, onComplete: () => void): void {
    const steps = 10;
    const stepDuration = duration / steps;
    const stepSize = (to - from) / steps;
    let currentStep = 0;

    const doStep = () => {
      if (currentStep >= steps) {
        onComplete();
        return;
      }

      const intensity = from + (stepSize * currentStep);
      this.setIntensity(Math.round(intensity));
      currentStep++;

      this.transitionTimer = setTimeout(doStep, stepDuration);
    };

    doStep();
  }

  private onPhaseDurationComplete(phase: EdgeSessionPhase): void {
    // Auto-advance based on phase
    const nextPhases: Partial<Record<EdgeSessionPhase, EdgeSessionPhase>> = {
      warmup: 'building',
      recovery: 'building',
      completion: 'completion', // Stay in completion
    };

    const nextPhase = nextPhases[phase];
    if (nextPhase && nextPhase !== phase) {
      this.transitionToPhase(nextPhase);
    }
  }

  // ============================================
  // PATTERN PLAYBACK
  // ============================================

  private playPhasePattern(phase: EdgeSessionPhase): void {
    const phaseConfig = PHASE_PATTERNS[phase];

    if (phaseConfig.patterns.length === 0) {
      stopPattern();
      smartStop('pattern');
      return;
    }

    // Select pattern based on config
    const patternName = this.selectPatternForPhase(phase);
    this.playPatternByName(patternName, phaseConfig.loopPatterns);
  }

  private selectPatternForPhase(phase: EdgeSessionPhase): string {
    const phaseConfig = PHASE_PATTERNS[phase];
    const patterns = phaseConfig.patterns;

    // Weight selection based on state
    if (this.state.arousalLevel >= 7 && phase === 'edge') {
      // High arousal during edge - use more intense patterns
      const intensePatterns = patterns.filter(p =>
        p.includes('denial') || p.includes('tease') || p.includes('random')
      );
      if (intensePatterns.length > 0) {
        return intensePatterns[Math.floor(Math.random() * intensePatterns.length)];
      }
    }

    if (this.state.edgeCount >= 5 && phaseConfig.edgeBoost) {
      // Many edges - use building/staircase patterns
      const buildingPatterns = patterns.filter(p =>
        p.includes('building') || p.includes('staircase')
      );
      if (buildingPatterns.length > 0) {
        return buildingPatterns[Math.floor(Math.random() * buildingPatterns.length)];
      }
    }

    // Default random selection
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  private playPatternByName(patternName: string, loop: boolean): void {
    const pattern = BUILTIN_PATTERNS.find(p => p.id === patternName);
    if (!pattern) {
      console.warn(`Pattern not found: ${patternName}`);
      return;
    }

    // Apply intensity modifications
    const modifiedPattern = this.modifyPatternIntensity(pattern);

    this.state.currentPattern = patternName;

    playPattern(modifiedPattern, {
      loop,
      onStepChange: (_step, intensity) => {
        this.state.currentIntensity = intensity;
        this.emit({ type: 'intensity_change', intensity, timestamp: Date.now() });
      },
      onComplete: () => {
        this.emit({ type: 'pattern_end', pattern: patternName, timestamp: Date.now() });
        if (loop && this.state.isActive && this.state.currentPhase) {
          // Select next pattern in rotation
          const nextPattern = this.selectPatternForPhase(this.state.currentPhase);
          setTimeout(() => {
            if (this.state.isActive) {
              this.playPatternByName(nextPattern, true);
            }
          }, 500);
        }
      },
    });

    this.emit({ type: 'pattern_start', pattern: patternName, timestamp: Date.now() });
  }

  private modifyPatternIntensity(pattern: LovensePattern): LovensePattern {
    const phase = this.state.currentPhase;
    if (!phase) return pattern;

    const phaseConfig = PHASE_PATTERNS[phase];
    let multiplier = this.config.intensityMultiplier;

    // Arousal boost
    if (this.config.arousalAdaptive && phaseConfig.arousalBoost) {
      const arousalBoost = 1 + (this.state.arousalLevel - 5) * 0.05; // 5% per arousal above 5
      multiplier *= Math.max(0.8, Math.min(1.3, arousalBoost));
    }

    // Denial day scaling
    if (this.config.denialDayScaling && this.state.denialDay > 0) {
      const denialBoost = 1 + Math.min(this.state.denialDay, 14) * 0.02; // 2% per day, max 28%
      multiplier *= denialBoost;
    }

    // Edge boost
    if (phaseConfig.edgeBoost && this.state.edgeCount > 0) {
      const edgeBoost = 1 + this.state.edgeCount * 0.03; // 3% per edge
      multiplier *= Math.min(1.4, edgeBoost);
    }

    // Apply to pattern steps
    const modifiedSteps: PatternStep[] = pattern.steps.map(step => {
      let newIntensity = Math.round(step.intensity * multiplier);
      newIntensity = Math.max(this.config.minIntensity, newIntensity);
      newIntensity = Math.min(this.config.maxIntensity, newIntensity);
      newIntensity = Math.max(phaseConfig.intensityRange[0], newIntensity);
      newIntensity = Math.min(phaseConfig.intensityRange[1], newIntensity);
      return { ...step, intensity: newIntensity };
    });

    return { ...pattern, steps: modifiedSteps };
  }

  // ============================================
  // INTENSITY CONTROL
  // ============================================

  setIntensity(intensity: number): void {
    const clamped = Math.max(this.config.minIntensity, Math.min(this.config.maxIntensity, intensity));
    this.state.currentIntensity = clamped;
    smartVibrate(clamped, 0, 'pattern');
  }

  adjustIntensity(delta: number): void {
    this.setIntensity(this.state.currentIntensity + delta);
  }

  // ============================================
  // STATE UPDATES
  // ============================================

  updateArousal(level: number): void {
    this.state.arousalLevel = level;

    // If adaptive, adjust current intensity
    if (this.config.arousalAdaptive && this.state.isActive && this.state.currentPhase) {
      const phaseConfig = PHASE_PATTERNS[this.state.currentPhase];
      if (phaseConfig.arousalBoost) {
        // Recalculate intensity based on new arousal
        const baseIntensity = phaseConfig.baseIntensity;
        const arousalBoost = 1 + (level - 5) * 0.08;
        const newIntensity = Math.round(baseIntensity * arousalBoost * this.config.intensityMultiplier);
        this.setIntensity(Math.min(phaseConfig.intensityRange[1], newIntensity));
      }
    }
  }

  updateDenialDay(day: number): void {
    this.state.denialDay = day;
  }

  recordEdge(): void {
    this.state.edgeCount++;

    if (this.config.edgeReactive && this.state.isActive) {
      // React to edge with a pulse
      this.edgeReaction();
    }

    this.emit({ type: 'edge_reaction', timestamp: Date.now() });
  }

  private edgeReaction(): void {
    // Intense pulse on edge
    const currentIntensity = this.state.currentIntensity;

    // Spike to max briefly
    smartVibrate(20, 0, 'edge_session');

    setTimeout(() => {
      // Drop to zero (denial)
      smartStop('edge_session');

      setTimeout(() => {
        // Gradually return to current intensity
        this.fadeIntensity(0, currentIntensity, 2000, () => {
          // Resume normal pattern
          if (this.state.currentPhase) {
            this.playPhasePattern(this.state.currentPhase);
          }
        });
      }, 1500);
    }, 500);
  }

  // ============================================
  // SPECIAL PATTERNS
  // ============================================

  playRewardBurst(duration: number = 5000): void {
    stopPattern();

    // High intensity reward burst
    smartVibrate(18, 0, 'edge_session');

    setTimeout(() => {
      smartVibrate(20, 0, 'edge_session');

      setTimeout(() => {
        smartVibrate(16, 0, 'edge_session');

        setTimeout(() => {
          smartStop('edge_session');

          // Resume phase pattern
          if (this.state.currentPhase) {
            setTimeout(() => this.playPhasePattern(this.state.currentPhase!), 500);
          }
        }, duration - 2000);
      }, 1000);
    }, 1000);
  }

  playCommitmentAccepted(): void {
    // Celebratory pattern for accepting commitment
    const celebration: PatternStep[] = [
      { intensity: 15, duration: 300 },
      { intensity: 5, duration: 200 },
      { intensity: 18, duration: 300 },
      { intensity: 8, duration: 200 },
      { intensity: 20, duration: 500 },
      { intensity: 12, duration: 300 },
      { intensity: 20, duration: 400 },
      { intensity: 0, duration: 500 },
    ];

    const pattern: LovensePattern = {
      id: 'commitment_accepted',
      name: 'Commitment Accepted',
      steps: celebration,
      totalDuration: 2700,
    };

    stopPattern();
    playPattern(pattern, {
      onComplete: () => {
        if (this.state.currentPhase) {
          this.playPhasePattern(this.state.currentPhase);
        }
      },
    });
  }

  playDenialTease(durationMs: number = 10000): void {
    // Cruel tease that builds but never delivers
    const teaseSteps: PatternStep[] = [];
    const numCycles = Math.floor(durationMs / 3000);

    for (let i = 0; i < numCycles; i++) {
      // Build up
      teaseSteps.push({ intensity: 5 + i * 2, duration: 500 });
      teaseSteps.push({ intensity: 10 + i * 2, duration: 500 });
      teaseSteps.push({ intensity: 14 + i, duration: 500 });
      teaseSteps.push({ intensity: 18, duration: 300 });
      // Cruel stop
      teaseSteps.push({ intensity: 0, duration: 1200 });
    }

    const pattern: LovensePattern = {
      id: 'denial_tease_custom',
      name: 'Denial Tease',
      steps: teaseSteps,
      totalDuration: durationMs,
    };

    stopPattern();
    playPattern(pattern, {
      onComplete: () => {
        if (this.state.currentPhase) {
          this.playPhasePattern(this.state.currentPhase);
        }
      },
    });
  }

  // ============================================
  // CALLBACKS
  // ============================================

  onEvent(callback: PatternCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private emit(event: PatternEvent): void {
    this.callbacks.forEach(cb => cb(event));
  }

  // ============================================
  // UTILITIES
  // ============================================

  private clearAllTimers(): void {
    this.clearPhaseTimer();
    this.clearPatternTimer();
    this.clearTransitionTimer();
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private clearPatternTimer(): void {
    if (this.patternTimer) {
      clearTimeout(this.patternTimer);
      this.patternTimer = null;
    }
  }

  private clearTransitionTimer(): void {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  getCurrentPhase(): EdgeSessionPhase | null {
    return this.state.currentPhase;
  }

  getCurrentIntensity(): number {
    return this.state.currentIntensity;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let orchestratorInstance: HapticOrchestrator | null = null;

export function getOrchestrator(config?: Partial<OrchestratorConfig>): HapticOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new HapticOrchestrator(config);
  } else if (config) {
    orchestratorInstance.updateConfig(config);
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
    orchestratorInstance = null;
  }
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

export {
  HapticOrchestrator,
  PHASE_PATTERNS,
};
