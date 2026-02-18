/**
 * Hypno Player Phase Orchestrator
 *
 * Manages hypno session phases with synchronized audio, haptics,
 * affirmations, and conditioning triggers.
 */

import { getOrchestrator, type HapticOrchestrator } from './haptic-orchestrator';
import { executeSystemTriggers } from './system-triggers';
import { logBambiSession } from './bambi/state-engine';

// ============================================
// TYPES
// ============================================

export type HypnoPhase =
  | 'intro'           // Welcome, relaxation cues
  | 'induction'       // Deepening, trance entry
  | 'deepening'       // Further relaxation
  | 'content'         // Main conditioning content
  | 'reinforcement'   // Anchor/trigger reinforcement
  | 'emergence'       // Gentle awakening
  | 'completion';     // Session end

export type HypnoContentType =
  | 'feminization'    // Feminine identity
  | 'sissy_training'  // Sissy lifestyle
  | 'submission'      // Obedience/service
  | 'body_acceptance' // Body comfort
  | 'arousal_denial'  // Edge/denial conditioning
  | 'identity'        // Name/identity
  | 'voice'           // Voice feminization
  | 'behavior'        // Mannerisms
  | 'relaxation'      // Pure relaxation
  | 'sleep';          // Sleep programming

export interface HypnoSession {
  id: string;
  title: string;
  contentType: HypnoContentType;
  totalDuration: number; // seconds
  phases: HypnoPhaseConfig[];
  audioUrl?: string;
  transcriptUrl?: string;
  triggers?: HypnoTrigger[];
  anchorReinforcements?: string[];
}

export interface HypnoPhaseConfig {
  phase: HypnoPhase;
  startTime: number; // seconds from start
  endTime: number;
  intensity: number; // 0-10
  hapticPattern?: string;
  affirmations?: string[];
  visualOverlay?: HypnoVisualOverlay;
}

export interface HypnoTrigger {
  triggerWord: string;
  response: string;
  timestamps: number[]; // When trigger appears in audio
  reinforcementCount: number;
}

export interface HypnoVisualOverlay {
  type: 'spiral' | 'pulse' | 'text' | 'color_shift' | 'none';
  intensity: number;
  color?: string;
  text?: string;
}

export interface HypnoOrchestratorState {
  sessionId: string;
  isPlaying: boolean;
  currentTime: number;
  currentPhase: HypnoPhase;
  currentPhaseIndex: number;
  phaseProgress: number; // 0-1
  totalProgress: number; // 0-1
  currentAffirmation?: string;
  currentVisual?: HypnoVisualOverlay;
  triggersActivated: number;
  tranceDepth: number; // 0-10 estimated
}

export interface HypnoOrchestratorConfig {
  hapticEnabled: boolean;
  affirmationsEnabled: boolean;
  visualsEnabled: boolean;
  autoAdvance: boolean;
  loopMode: boolean;
  baseIntensity: number;
  arousalMultiplier: number;
  denialDayBonus: boolean;
}

// ============================================
// ORCHESTRATOR CLASS
// ============================================

class HypnoPlayerOrchestrator {
  private state: HypnoOrchestratorState | null = null;
  private config: HypnoOrchestratorConfig;
  private session: HypnoSession | null = null;
  private hapticOrchestrator: HapticOrchestrator | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: HypnoCallbacks = {};

  constructor(config?: Partial<HypnoOrchestratorConfig>) {
    this.config = {
      hapticEnabled: true,
      affirmationsEnabled: true,
      visualsEnabled: true,
      autoAdvance: true,
      loopMode: false,
      baseIntensity: 1,
      arousalMultiplier: 1,
      denialDayBonus: true,
      ...config,
    };
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  async loadSession(session: HypnoSession): Promise<void> {
    this.session = session;
    this.state = {
      sessionId: session.id,
      isPlaying: false,
      currentTime: 0,
      currentPhase: 'intro',
      currentPhaseIndex: 0,
      phaseProgress: 0,
      totalProgress: 0,
      triggersActivated: 0,
      tranceDepth: 0,
    };

    // Initialize haptic orchestrator if enabled
    if (this.config.hapticEnabled) {
      this.hapticOrchestrator = getOrchestrator({
        enabled: true,
        autoPhasePatterns: true,
      });
    }

    this.callbacks.onSessionLoaded?.(session);
  }

  async start(): Promise<void> {
    if (!this.state || !this.session) return;

    this.state.isPlaying = true;

    // Start haptics if enabled
    if (this.hapticOrchestrator) {
      await this.hapticOrchestrator.start();
    }

    // Start update loop
    this.startUpdateLoop();

    // Fire start event
    this.callbacks.onStart?.();
  }

  async pause(): Promise<void> {
    if (!this.state) return;

    this.state.isPlaying = false;
    this.stopUpdateLoop();

    if (this.hapticOrchestrator) {
      this.hapticOrchestrator.stop();
    }

    this.callbacks.onPause?.();
  }

  async resume(): Promise<void> {
    if (!this.state) return;

    this.state.isPlaying = true;
    this.startUpdateLoop();

    if (this.hapticOrchestrator) {
      await this.hapticOrchestrator.start();
    }

    this.callbacks.onResume?.();
  }

  async stop(): Promise<void> {
    this.stopUpdateLoop();

    if (this.hapticOrchestrator) {
      this.hapticOrchestrator.stop();
    }

    // Fire completion trigger
    if (this.session?.contentType === 'sleep') {
      await executeSystemTriggers('sleep_hypno_completed', {
        sessionId: this.state?.sessionId,
        contentType: this.session.contentType,
        triggersActivated: this.state?.triggersActivated || 0,
      });
    } else {
      await executeSystemTriggers('hypno_completed', {
        sessionId: this.state?.sessionId,
        contentType: this.session?.contentType,
        triggersActivated: this.state?.triggersActivated || 0,
      });
    }

    // Log to Bambi state engine for trance tracking (fire-and-forget)
    if (this.state && this.session) {
      const tranceDepth = Math.round(this.state.tranceDepth);

      logBambiSession({
        userId: this.state.sessionId, // Session tracks per-session, userId set by caller
        sessionType: 'hypno_listen',
        entryMethod: 'audio_file',
        contentRef: this.session.audioUrl || this.session.title,
        depthEstimate: tranceDepth,
        triggersUsed: this.session.triggers?.map(t => t.triggerWord) || [],
        triggersRespondedTo: this.session.triggers
          ?.filter(t => t.reinforcementCount > 0)
          .map(t => t.triggerWord) || [],
      }).catch(err => {
        console.warn('[HypnoOrchestrator] Bambi session logging failed:', err);
      });
    }

    this.state = null;
    this.session = null;

    this.callbacks.onComplete?.();
  }

  // ============================================
  // PLAYBACK CONTROL
  // ============================================

  seek(time: number): void {
    if (!this.state || !this.session) return;

    this.state.currentTime = Math.max(0, Math.min(time, this.session.totalDuration));
    this.updatePhase();
    this.callbacks.onSeek?.(time);
  }

  setTime(time: number): void {
    if (!this.state) return;
    this.state.currentTime = time;
    this.updatePhase();
  }

  // ============================================
  // UPDATE LOOP
  // ============================================

  private startUpdateLoop(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      this.tick();
    }, 100); // 10 updates per second
  }

  private stopUpdateLoop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private tick(): void {
    if (!this.state || !this.session || !this.state.isPlaying) return;

    // Advance time
    this.state.currentTime += 0.1;

    // Update progress
    this.state.totalProgress = this.state.currentTime / this.session.totalDuration;

    // Check for phase transition
    this.updatePhase();

    // Check for triggers
    this.checkTriggers();

    // Update trance depth estimation
    this.updateTrancedepth();

    // Check for completion
    if (this.state.currentTime >= this.session.totalDuration) {
      if (this.config.loopMode) {
        this.state.currentTime = 0;
        this.state.currentPhaseIndex = 0;
        this.callbacks.onLoop?.();
      } else {
        this.stop();
      }
    }

    // Fire update callback
    this.callbacks.onUpdate?.(this.state);
  }

  private updatePhase(): void {
    if (!this.state || !this.session) return;

    const currentTime = this.state.currentTime;
    let newPhaseIndex = this.state.currentPhaseIndex;

    // Find the current phase based on time
    for (let i = 0; i < this.session.phases.length; i++) {
      const phase = this.session.phases[i];
      if (currentTime >= phase.startTime && currentTime < phase.endTime) {
        newPhaseIndex = i;
        break;
      }
    }

    // Check if phase changed
    if (newPhaseIndex !== this.state.currentPhaseIndex) {
      const newPhase = this.session.phases[newPhaseIndex];
      const oldPhase = this.session.phases[this.state.currentPhaseIndex];

      this.state.currentPhaseIndex = newPhaseIndex;
      this.state.currentPhase = newPhase.phase;

      // Transition haptics
      if (this.hapticOrchestrator && newPhase.hapticPattern) {
        this.transitionHaptics(newPhase);
      }

      // Update visual overlay
      if (this.config.visualsEnabled && newPhase.visualOverlay) {
        this.state.currentVisual = newPhase.visualOverlay;
        this.callbacks.onVisualChange?.(newPhase.visualOverlay);
      }

      // Fire phase change callback
      this.callbacks.onPhaseChange?.(newPhase, oldPhase);
    }

    // Update phase progress
    const currentPhaseConfig = this.session.phases[this.state.currentPhaseIndex];
    const phaseDuration = currentPhaseConfig.endTime - currentPhaseConfig.startTime;
    const phaseElapsed = currentTime - currentPhaseConfig.startTime;
    this.state.phaseProgress = Math.min(1, phaseElapsed / phaseDuration);

    // Show affirmation if available
    if (this.config.affirmationsEnabled) {
      this.updateAffirmation();
    }
  }

  private async transitionHaptics(phase: HypnoPhaseConfig): Promise<void> {
    if (!this.hapticOrchestrator) return;

    // Map hypno phases to edge session phases for haptic orchestrator
    const phaseMapping: Record<HypnoPhase, string> = {
      intro: 'warmup',
      induction: 'building',
      deepening: 'plateau',
      content: 'edge',
      reinforcement: 'edge',
      emergence: 'recovery',
      completion: 'completion',
    };

    const edgePhase = phaseMapping[phase.phase] || 'plateau';
    await this.hapticOrchestrator.transitionToPhase(edgePhase as any);
  }

  private updateAffirmation(): void {
    if (!this.state || !this.session) return;

    const currentPhaseConfig = this.session.phases[this.state.currentPhaseIndex];
    if (!currentPhaseConfig.affirmations || currentPhaseConfig.affirmations.length === 0) {
      this.state.currentAffirmation = undefined;
      return;
    }

    // Cycle through affirmations based on time
    const phaseDuration = currentPhaseConfig.endTime - currentPhaseConfig.startTime;
    const affirmationDuration = phaseDuration / currentPhaseConfig.affirmations.length;
    const phaseElapsed = this.state.currentTime - currentPhaseConfig.startTime;
    const affirmationIndex = Math.floor(phaseElapsed / affirmationDuration) % currentPhaseConfig.affirmations.length;

    const newAffirmation = currentPhaseConfig.affirmations[affirmationIndex];
    if (newAffirmation !== this.state.currentAffirmation) {
      this.state.currentAffirmation = newAffirmation;
      this.callbacks.onAffirmation?.(newAffirmation);
    }
  }

  private checkTriggers(): void {
    if (!this.state || !this.session?.triggers) return;

    const currentTime = this.state.currentTime;
    const tolerance = 0.5; // Half second tolerance

    for (const trigger of this.session.triggers) {
      for (const timestamp of trigger.timestamps) {
        if (Math.abs(currentTime - timestamp) < tolerance) {
          this.state.triggersActivated++;
          this.callbacks.onTriggerActivated?.(trigger);
        }
      }
    }
  }

  private updateTrancedepth(): void {
    if (!this.state || !this.session) return;

    // Estimate trance depth based on phase and time
    const phaseDepths: Record<HypnoPhase, number> = {
      intro: 2,
      induction: 4,
      deepening: 7,
      content: 8,
      reinforcement: 9,
      emergence: 5,
      completion: 2,
    };

    const baseDepth = phaseDepths[this.state.currentPhase] || 5;
    const progressBonus = this.state.phaseProgress * 1.5;

    this.state.tranceDepth = Math.min(10, baseDepth + progressBonus);
  }

  // ============================================
  // CALLBACKS
  // ============================================

  setCallbacks(callbacks: HypnoCallbacks): void {
    this.callbacks = callbacks;
  }

  // ============================================
  // GETTERS
  // ============================================

  getState(): HypnoOrchestratorState | null {
    return this.state;
  }

  getSession(): HypnoSession | null {
    return this.session;
  }

  isPlaying(): boolean {
    return this.state?.isPlaying ?? false;
  }
}

// ============================================
// CALLBACKS INTERFACE
// ============================================

export interface HypnoCallbacks {
  onSessionLoaded?: (session: HypnoSession) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  onLoop?: () => void;
  onSeek?: (time: number) => void;
  onUpdate?: (state: HypnoOrchestratorState) => void;
  onPhaseChange?: (newPhase: HypnoPhaseConfig, oldPhase: HypnoPhaseConfig) => void;
  onVisualChange?: (visual: HypnoVisualOverlay) => void;
  onAffirmation?: (affirmation: string) => void;
  onTriggerActivated?: (trigger: HypnoTrigger) => void;
}

// ============================================
// SINGLETON ACCESS
// ============================================

let orchestratorInstance: HypnoPlayerOrchestrator | null = null;

export function getHypnoOrchestrator(config?: Partial<HypnoOrchestratorConfig>): HypnoPlayerOrchestrator {
  if (!orchestratorInstance || config) {
    orchestratorInstance = new HypnoPlayerOrchestrator(config);
  }
  return orchestratorInstance;
}

// ============================================
// PRESET SESSIONS
// ============================================

export const PRESET_SESSIONS: Record<string, Partial<HypnoSession>> = {
  morning_affirmation: {
    title: 'Morning Affirmation',
    contentType: 'identity',
    totalDuration: 600, // 10 minutes
    phases: [
      { phase: 'intro', startTime: 0, endTime: 60, intensity: 3, affirmations: ['Good morning, beautiful'] },
      { phase: 'induction', startTime: 60, endTime: 180, intensity: 5, affirmations: ['Relax and let go'] },
      { phase: 'content', startTime: 180, endTime: 480, intensity: 7, affirmations: [
        'I am feminine and beautiful',
        'My true self is emerging',
        'I embrace who I am becoming',
      ]},
      { phase: 'emergence', startTime: 480, endTime: 540, intensity: 4 },
      { phase: 'completion', startTime: 540, endTime: 600, intensity: 2 },
    ],
  },
  deep_feminization: {
    title: 'Deep Feminization',
    contentType: 'feminization',
    totalDuration: 1800, // 30 minutes
    phases: [
      { phase: 'intro', startTime: 0, endTime: 120, intensity: 3 },
      { phase: 'induction', startTime: 120, endTime: 360, intensity: 5 },
      { phase: 'deepening', startTime: 360, endTime: 600, intensity: 7 },
      { phase: 'content', startTime: 600, endTime: 1320, intensity: 9, affirmations: [
        'My feminine essence grows stronger',
        'I love who I am becoming',
        'Femininity is my natural state',
        'I surrender to my true self',
      ]},
      { phase: 'reinforcement', startTime: 1320, endTime: 1500, intensity: 8 },
      { phase: 'emergence', startTime: 1500, endTime: 1680, intensity: 5 },
      { phase: 'completion', startTime: 1680, endTime: 1800, intensity: 2 },
    ],
  },
  sleep_programming: {
    title: 'Sleep Programming',
    contentType: 'sleep',
    totalDuration: 3600, // 60 minutes (loops overnight)
    phases: [
      { phase: 'intro', startTime: 0, endTime: 300, intensity: 2 },
      { phase: 'induction', startTime: 300, endTime: 900, intensity: 4 },
      { phase: 'deepening', startTime: 900, endTime: 1500, intensity: 6 },
      { phase: 'content', startTime: 1500, endTime: 3000, intensity: 5, affirmations: [
        'As you sleep, your mind opens',
        'Your subconscious accepts',
        'These changes are permanent',
      ]},
      { phase: 'reinforcement', startTime: 3000, endTime: 3300, intensity: 4 },
      { phase: 'completion', startTime: 3300, endTime: 3600, intensity: 2 },
    ],
  },
  sissy_training: {
    title: 'Sissy Training',
    contentType: 'sissy_training',
    totalDuration: 1200, // 20 minutes
    phases: [
      { phase: 'intro', startTime: 0, endTime: 90, intensity: 4 },
      { phase: 'induction', startTime: 90, endTime: 240, intensity: 6 },
      { phase: 'content', startTime: 240, endTime: 900, intensity: 8, affirmations: [
        'Good girl',
        'You love being a sissy',
        'This is who you really are',
        'Accept your sissy nature',
      ]},
      { phase: 'reinforcement', startTime: 900, endTime: 1080, intensity: 7 },
      { phase: 'emergence', startTime: 1080, endTime: 1140, intensity: 4 },
      { phase: 'completion', startTime: 1140, endTime: 1200, intensity: 2 },
    ],
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

export function createCustomSession(
  title: string,
  contentType: HypnoContentType,
  durationMinutes: number,
  affirmations: string[]
): HypnoSession {
  const totalDuration = durationMinutes * 60;

  return {
    id: `custom_${Date.now()}`,
    title,
    contentType,
    totalDuration,
    phases: [
      { phase: 'intro', startTime: 0, endTime: totalDuration * 0.1, intensity: 3 },
      { phase: 'induction', startTime: totalDuration * 0.1, endTime: totalDuration * 0.2, intensity: 5 },
      { phase: 'deepening', startTime: totalDuration * 0.2, endTime: totalDuration * 0.3, intensity: 7 },
      { phase: 'content', startTime: totalDuration * 0.3, endTime: totalDuration * 0.75, intensity: 8, affirmations },
      { phase: 'reinforcement', startTime: totalDuration * 0.75, endTime: totalDuration * 0.85, intensity: 7 },
      { phase: 'emergence', startTime: totalDuration * 0.85, endTime: totalDuration * 0.95, intensity: 4 },
      { phase: 'completion', startTime: totalDuration * 0.95, endTime: totalDuration, intensity: 2 },
    ],
  };
}

export function getPhaseColor(phase: HypnoPhase): string {
  const colors: Record<HypnoPhase, string> = {
    intro: '#6b7280',
    induction: '#3b82f6',
    deepening: '#8b5cf6',
    content: '#ec4899',
    reinforcement: '#f472b6',
    emergence: '#06b6d4',
    completion: '#10b981',
  };
  return colors[phase] || '#6b7280';
}

export function getPhaseLabel(phase: HypnoPhase): string {
  const labels: Record<HypnoPhase, string> = {
    intro: 'Introduction',
    induction: 'Induction',
    deepening: 'Deepening',
    content: 'Content',
    reinforcement: 'Reinforcement',
    emergence: 'Emergence',
    completion: 'Completion',
  };
  return labels[phase] || phase;
}
