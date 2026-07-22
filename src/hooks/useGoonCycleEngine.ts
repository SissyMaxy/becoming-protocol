/**
 * useGoonCycleEngine — the micro-cycle state machine, extracted from the
 * orphaned GooningSession.tsx and made headless.
 *
 * It runs the build → peak → denial → tease loop (every 3rd cycle → reward),
 * rotates affirmations, counts denials/cycles, and emits an intensity curve —
 * but owns NO device or audio side effects. The consumer wires the callbacks
 * (onIntensityChange → device, onDenialCycle → edge log, etc.). This lets the
 * live-measurement GoonSessionView spine mount it (WS2) and lets the cockwarming
 * session reuse it in "hold" mode (WS3).
 *
 * New input the orphan never had: `bioTrend` from useSessionBiometrics. The pure
 * adaptation helpers steepen the build ramp when HR isn't climbing and cut the
 * peak hold short when HR spikes — the first live biometric adaptation in a
 * session.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type BioTrend = 'rising' | 'stable' | 'falling' | null;

export type GoonCyclePhase = 'idle' | 'building' | 'peak' | 'denial' | 'tease' | 'reward';

export interface GoonCycleCallbacks {
  /** Normalized 0-100 intensity for the current step (map to device as you like). */
  onIntensityChange?: (level: number) => void;
  /** Fired at the start of each denial phase — one auto-edge per cycle. */
  onDenialCycle?: () => void;
  onPhaseChange?: (phase: GoonCyclePhase) => void;
  onAffirmation?: (text: string) => void;
}

export interface GoonCycleOptions extends GoonCycleCallbacks {
  active: boolean;
  paused?: boolean;
  /** Hidden intensity multiplier (0.5–1.5) from the session's conditioning calc. */
  intensityMultiplier?: number;
  bioTrend?: BioTrend;
  /**
   * "hold" mode (cockwarming, WS3): sustained low intensity, no denial/tease
   * churn. The engine parks in a gentle building/peak oscillation instead of
   * running the denial loop.
   */
  mode?: 'goon' | 'hold';
  affirmations?: string[];
}

export interface GoonCycleState {
  phase: GoonCyclePhase;
  intensity: number;
  peakIntensity: number;
  cyclesCompleted: number;
  denials: number;
  currentAffirmation: string;
}

const DEFAULT_AFFIRMATIONS = [
  'Let go completely...',
  'Deeper and deeper...',
  'Feel the pleasure building...',
  "You're doing so well...",
  "Just feel... don't think...",
  'Surrender to the sensation...',
  'Good... very good...',
  'Let it wash over you...',
  'You deserve this pleasure...',
  'Edge for me...',
  'Not yet... hold it...',
  'Feel it building...',
  'So close... so good...',
  'Stay on the edge...',
  'Perfect... just like that...',
];

// Base phase timing/targets (ms + 0-100 target before multiplier).
const PHASE_BASE = {
  building: { duration: 30000, target: 60 },
  peak: { duration: 15000, target: 90 },
  denial: { duration: 5000, target: 0 },
  tease: { duration: 20000, target: 40 },
  reward: { duration: 10000, target: 100 },
} as const;

// ─── Pure adaptation helpers (unit-tested) ──────────────────────────────────

/** Clamp a target to the device's 0-100 range. */
export function clampIntensity(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Scale a base target by the hidden multiplier, clamped to 0-100. */
export function scaleTarget(baseTarget: number, multiplier: number): number {
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return clampIntensity(baseTarget * m);
}

/**
 * Build-ramp adaptation: if HR isn't climbing (stable/falling), steepen the
 * ramp — shorten it — to push her toward peak faster. Rising/unknown → base.
 */
export function adaptRampDurationMs(baseMs: number, bioTrend: BioTrend): number {
  if (bioTrend === 'falling') return Math.round(baseMs * 0.6);
  if (bioTrend === 'stable') return Math.round(baseMs * 0.8);
  return baseMs;
}

/**
 * Peak-hold adaptation: if HR spikes (rising) at peak, cut the hold short →
 * earlier denial/tease (protect + tease). Falling → allow a longer hold.
 */
export function adaptPeakHoldMs(baseMs: number, bioTrend: BioTrend): number {
  if (bioTrend === 'rising') return Math.round(baseMs * 0.5);
  if (bioTrend === 'falling') return Math.round(baseMs * 1.2);
  return baseMs;
}

/** Rotate to a different affirmation index (never repeats immediately). */
export function nextAffirmationIndex(current: number, len: number, rand: number): number {
  if (len <= 1) return 0;
  const r = Math.floor(rand * (len - 1));
  return r >= current ? r + 1 : r;
}

// ─── The hook ───────────────────────────────────────────────────────────────

export function useGoonCycleEngine(opts: GoonCycleOptions): GoonCycleState {
  const {
    active,
    paused = false,
    intensityMultiplier = 1,
    bioTrend = null,
    mode = 'goon',
    affirmations = DEFAULT_AFFIRMATIONS,
    onIntensityChange,
    onDenialCycle,
    onPhaseChange,
    onAffirmation,
  } = opts;

  const [phase, setPhase] = useState<GoonCyclePhase>('idle');
  const [intensity, setIntensity] = useState(0);
  const [peakIntensity, setPeakIntensity] = useState(0);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [denials, setDenials] = useState(0);
  const [currentAffirmation, setCurrentAffirmation] = useState('');

  // Live mirrors so the async loop reads current values, not captured ones.
  const runningRef = useRef(false);
  const pausedRef = useRef(paused);
  const bioTrendRef = useRef<BioTrend>(bioTrend);
  const multiplierRef = useRef(intensityMultiplier);
  const affirmIdxRef = useRef(0);
  const affirmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { bioTrendRef.current = bioTrend; }, [bioTrend]);
  useEffect(() => { multiplierRef.current = intensityMultiplier; }, [intensityMultiplier]);

  // Stable refs for callbacks so the effect doesn't restart on every render.
  const cbRef = useRef<GoonCycleCallbacks>({});
  useEffect(() => {
    cbRef.current = { onIntensityChange, onDenialCycle, onPhaseChange, onAffirmation };
  }, [onIntensityChange, onDenialCycle, onPhaseChange, onAffirmation]);

  const emitPhase = useCallback((p: GoonCyclePhase) => {
    setPhase(p);
    cbRef.current.onPhaseChange?.(p);
  }, []);

  const emitIntensity = useCallback((v: number) => {
    const c = clampIntensity(v);
    setIntensity(c);
    setPeakIntensity((prev) => (c > prev ? c : prev));
    cbRef.current.onIntensityChange?.(c);
  }, []);

  useEffect(() => {
    if (!active) {
      runningRef.current = false;
      return;
    }
    runningRef.current = true;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const alive = () => runningRef.current && active;
    const waitWhilePaused = async () => {
      while (pausedRef.current && alive()) await sleep(200);
    };

    const ramp = async (from: number, to: number, durationMs: number) => {
      const steps = 20;
      const stepMs = durationMs / steps;
      for (let i = 0; i <= steps; i++) {
        if (!alive()) return;
        await waitWhilePaused();
        emitIntensity(from + ((to - from) / steps) * i);
        await sleep(stepMs);
      }
    };
    const hold = async (level: number, durationMs: number) => {
      if (!alive()) return;
      emitIntensity(level);
      await sleep(durationMs);
    };
    const tease = async (durationMs: number) => {
      const end = Date.now() + durationMs;
      while (Date.now() < end && alive()) {
        await waitWhilePaused();
        emitIntensity(clampIntensity(Math.random() * 40 + 15));
        await sleep(500 + Math.random() * 1500);
        if (!alive()) break;
        emitIntensity(0);
        await sleep(500 + Math.random() * 2000);
      }
    };

    // cyclesCompleted increment via a local counter mirrored into state.
    let cycleCounter = 0;
    const cyclesCompletedNext = () => {
      cycleCounter += 1;
      setCyclesCompleted(cycleCounter);
      return cycleCounter;
    };

    const runCycle = async () => {
      while (alive()) {
        const mult = multiplierRef.current;
        const trend = bioTrendRef.current;

        // Building
        emitPhase('building');
        await ramp(0, scaleTarget(PHASE_BASE.building.target, mult), adaptRampDurationMs(PHASE_BASE.building.duration, trend));
        if (!alive()) break;

        // Peak
        emitPhase('peak');
        await hold(scaleTarget(PHASE_BASE.peak.target, mult), adaptPeakHoldMs(PHASE_BASE.peak.duration, bioTrendRef.current));
        if (!alive()) break;

        if (mode === 'hold') {
          // Cockwarming: no denial churn — settle back to a warm sustained hold.
          emitPhase('building');
          await hold(scaleTarget(PHASE_BASE.tease.target, mult), PHASE_BASE.tease.duration);
          setCyclesCompleted((c) => c + 1);
          continue;
        }

        // Denial (one auto-edge per cycle)
        emitPhase('denial');
        setDenials((d) => d + 1);
        cbRef.current.onDenialCycle?.();
        await ramp(scaleTarget(PHASE_BASE.peak.target, mult), 0, 1000);
        await sleep(PHASE_BASE.denial.duration);
        if (!alive()) break;

        // Tease
        emitPhase('tease');
        await tease(PHASE_BASE.tease.duration);
        if (!alive()) break;

        const newCount = cyclesCompletedNext();
        // Reward every 3rd cycle
        if (newCount % 3 === 0) {
          emitPhase('reward');
          await ramp(0, scaleTarget(PHASE_BASE.reward.target, mult), 3000);
          await hold(scaleTarget(PHASE_BASE.reward.target, mult), PHASE_BASE.reward.duration);
        }
      }
    };

    // Affirmation rotation.
    const rotate = () => {
      affirmIdxRef.current = nextAffirmationIndex(affirmIdxRef.current, affirmations.length, Math.random());
      const text = affirmations[affirmIdxRef.current] ?? '';
      setCurrentAffirmation(text);
      cbRef.current.onAffirmation?.(text);
    };
    rotate();
    affirmTimerRef.current = setInterval(() => { if (!pausedRef.current) rotate(); }, 5000);

    runCycle();

    return () => {
      runningRef.current = false;
      if (affirmTimerRef.current) clearInterval(affirmTimerRef.current);
    };
    // Restart the loop only when active/mode/affirmations identity changes.
    // paused/bioTrend/multiplier are read live via refs.
  }, [active, mode, affirmations, emitPhase, emitIntensity]);

  return { phase, intensity, peakIntensity, cyclesCompleted, denials, currentAffirmation };
}
