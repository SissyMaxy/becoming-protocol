/**
 * BedtimeLock — soft full-screen overlay shown during the configured
 * bedtime window. Walks the user through:
 *   1. Mantra recital (today's mantra; tap-to-confirm or voice if
 *      prefers_voice)
 *   2. Posture check (kneel by the bed; 30-second timer)
 *   3. Chastity confirm (only if chastity tracking is on)
 *   4. Breath cycle (4-7-8 × 3)
 *
 * On completion, routes to the tonight's mommy-bedtime outreach (a
 * "goodnight" screen showing what Mama wrote tonight). On skip,
 * dismisses with a 'skipped' log — no penalty. Phase 1 users get the
 * mantra-only variant.
 *
 * Hard rules (mirrored in src/lib/bedtime/ritual.ts):
 *   - Soft prompt, NOT a hard lockout. Tapping the backdrop dismisses
 *     with a skip log. The X button does the same.
 *   - Never mounts during an aftercare session — the BedtimeProvider
 *     short-circuits via useAftercareOptional().isActive.
 *   - Skipping never charges a penalty; the next morning's mommy-mood
 *     surface may reference the skip with a soft tone.
 *
 * Palette echoes the FocusMode warm-purple boudoir, NOT the aftercare
 * neutral palette — this overlay is in-persona Mama context. Aftercare
 * has its own neutral overlay; the two are deliberately separate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  recordStep,
  completeRitual,
  skipRitual,
  getTonightGoodnight,
  type BedtimeRitualRow,
  type BedtimeStepKey,
  type BedtimeStepCompleted,
} from '../../lib/bedtime/ritual';
import { supabase } from '../../lib/supabase';

interface BedtimeLockProps {
  row: BedtimeRitualRow;
  steps: BedtimeStepKey[];
  todaysMantraText?: string | null;
  prefersVoice?: boolean;
  chastityEnabled?: boolean;
  onClose: () => void;
}

const PALETTE = {
  bgGradient: 'linear-gradient(160deg, #1a0f2e 0%, #2a1a4d 60%, #3d1438 100%)',
  card: 'rgba(26, 15, 46, 0.72)',
  cardBorder: 'rgba(196, 181, 253, 0.18)',
  accent: '#e9d5ff',
  accentDim: 'rgba(196, 181, 253, 0.4)',
  textPrimary: '#f3e8ff',
  textSecondary: '#a78bfa',
  textMuted: '#8a8690',
  inputBg: 'rgba(10, 10, 13, 0.6)',
  primaryBg: '#7c3aed',
  primaryBgHover: '#6d28d9',
};

const POSTURE_HOLD_SECONDS = 30;
const BREATH_CYCLES_REQUIRED = 3;
const BREATH = { inhale_ms: 4000, hold_ms: 7000, exhale_ms: 8000 };

type BreathPhase = 'idle' | 'inhale' | 'hold' | 'exhale' | 'done';

export function BedtimeLock({
  row,
  steps,
  todaysMantraText,
  prefersVoice,
  chastityEnabled,
  onClose,
}: BedtimeLockProps) {
  // Prune chastity step if user doesn't have chastity tracking on.
  const activeSteps = useMemo(
    () => steps.filter(s => s !== 'chastity' || chastityEnabled),
    [steps, chastityEnabled],
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [completed, setCompleted] = useState<BedtimeStepCompleted[]>(row.steps_completed);
  const [working, setWorking] = useState(false);
  const [goodnightMessage, setGoodnightMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Posture hold timer
  const [postureSecondsLeft, setPostureSecondsLeft] = useState(POSTURE_HOLD_SECONDS);
  const postureTimerRef = useRef<number | null>(null);

  // Breath cycle state
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle');
  const [breathCycles, setBreathCycles] = useState(0);

  const currentStep = activeSteps[stepIdx] as BedtimeStepKey | undefined;
  const isLast = stepIdx >= activeSteps.length - 1;

  // Body scroll lock while overlay open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleSkip = useCallback(async (reason: string) => {
    if (working) return;
    setWorking(true);
    try {
      await skipRitual(supabase, row.id, reason);
      onClose();
    } finally {
      setWorking(false);
    }
  }, [row.id, onClose, working]);

  const handleStepDone = useCallback(async () => {
    if (!currentStep || working) return;
    setWorking(true);
    try {
      const next = await recordStep(supabase, row.id, currentStep, completed);
      setCompleted(next);
      if (isLast) {
        const goodnight = await getTonightGoodnight(supabase, row.user_id);
        await completeRitual(supabase, row.id, goodnight?.id ?? null);
        setGoodnightMessage(goodnight?.message ?? null);
        setDone(true);
      } else {
        setStepIdx(stepIdx + 1);
        setPostureSecondsLeft(POSTURE_HOLD_SECONDS);
        setBreathPhase('idle');
        setBreathCycles(0);
      }
    } finally {
      setWorking(false);
    }
  }, [currentStep, working, row.id, row.user_id, completed, isLast, stepIdx]);

  // Posture timer — counts down once we land on the posture step.
  useEffect(() => {
    if (currentStep !== 'posture') return;
    setPostureSecondsLeft(POSTURE_HOLD_SECONDS);
    const tick = () => {
      setPostureSecondsLeft(s => {
        if (s <= 1) {
          if (postureTimerRef.current) {
            window.clearInterval(postureTimerRef.current);
            postureTimerRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    };
    postureTimerRef.current = window.setInterval(tick, 1000);
    return () => {
      if (postureTimerRef.current) {
        window.clearInterval(postureTimerRef.current);
        postureTimerRef.current = null;
      }
    };
  }, [currentStep]);

  // Breath cycle driver
  useEffect(() => {
    if (currentStep !== 'breath') return;
    if (breathPhase === 'idle' || breathPhase === 'done') return;
    const dur =
      breathPhase === 'inhale' ? BREATH.inhale_ms :
      breathPhase === 'hold' ? BREATH.hold_ms :
      BREATH.exhale_ms;
    const t = window.setTimeout(() => {
      if (breathPhase === 'inhale') setBreathPhase('hold');
      else if (breathPhase === 'hold') setBreathPhase('exhale');
      else {
        const nextCycles = breathCycles + 1;
        setBreathCycles(nextCycles);
        if (nextCycles >= BREATH_CYCLES_REQUIRED) {
          setBreathPhase('done');
        } else {
          setBreathPhase('inhale');
        }
      }
    }, dur);
    return () => window.clearTimeout(t);
  }, [breathPhase, breathCycles, currentStep]);

  const startBreath = useCallback(() => {
    if (breathPhase !== 'idle') return;
    setBreathCycles(0);
    setBreathPhase('inhale');
  }, [breathPhase]);

  const breathScale = useMemo(() => {
    if (breathPhase === 'inhale') return 1.5;
    if (breathPhase === 'hold') return 1.5;
    return 1;
  }, [breathPhase]);

  if (done) {
    return (
      <div data-testid="bedtime-goodnight" style={overlayStyle()} onClick={onClose}>
        <div style={cardStyle()} onClick={e => e.stopPropagation()}>
          <div style={titleStyle()}>goodnight</div>
          <p style={bodyStyle()}>
            {goodnightMessage ?? "Mama is in your head until tomorrow."}
          </p>
          <button onClick={onClose} style={primaryBtnStyle(false)}>close</button>
        </div>
      </div>
    );
  }

  if (!currentStep) {
    // Empty variant — just complete and close. Defensive; should not happen.
    return null;
  }

  const stepDone = (() => {
    if (currentStep === 'posture') return postureSecondsLeft === 0;
    if (currentStep === 'breath') return breathPhase === 'done';
    return true; // mantra + chastity gate on the explicit confirm button
  })();

  return (
    <div data-testid="bedtime-lock" style={overlayStyle()} onClick={() => handleSkip('tap_outside')}>
      <div style={cardStyle()} onClick={e => e.stopPropagation()}>
        <div style={progressRowStyle()}>
          {activeSteps.map((s, i) => (
            <div
              key={s}
              data-testid={`bedtime-progress-${s}`}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i <= stepIdx ? PALETTE.accent : PALETTE.accentDim,
                transition: 'background 300ms ease',
              }}
            />
          ))}
        </div>

        {currentStep === 'mantra' && (
          <MantraStep
            text={todaysMantraText ?? "i belong here. i am hers."}
            prefersVoice={!!prefersVoice}
            onConfirm={handleStepDone}
            disabled={working}
          />
        )}

        {currentStep === 'posture' && (
          <PostureStep
            secondsLeft={postureSecondsLeft}
            onAck={handleStepDone}
            disabled={working || !stepDone}
          />
        )}

        {currentStep === 'chastity' && (
          <ChastityStep
            onConfirm={handleStepDone}
            disabled={working}
          />
        )}

        {currentStep === 'breath' && (
          <BreathStep
            phase={breathPhase}
            cycles={breathCycles}
            scale={breathScale}
            onStart={startBreath}
            onDone={handleStepDone}
            disabled={working || !stepDone}
          />
        )}

        <div style={skipRowStyle()}>
          <button
            data-testid="bedtime-skip"
            onClick={() => handleSkip('not_tonight')}
            disabled={working}
            style={skipBtnStyle()}
          >
            not tonight
          </button>
        </div>
      </div>
    </div>
  );
}

function MantraStep({ text, prefersVoice, onConfirm, disabled }: {
  text: string;
  prefersVoice: boolean;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div style={titleStyle()}>say it for Mama</div>
      <p style={bodyStyle()}>{text}</p>
      <p style={hintStyle()}>
        {prefersVoice
          ? 'whisper it, then tap when you mean it'
          : 'aloud or in your head — tap when you mean it'}
      </p>
      <button
        data-testid="bedtime-mantra-confirm"
        onClick={onConfirm}
        disabled={disabled}
        style={primaryBtnStyle(disabled)}
      >
        i said it
      </button>
    </>
  );
}

function PostureStep({ secondsLeft, onAck, disabled }: {
  secondsLeft: number;
  onAck: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div style={titleStyle()}>kneel by the bed</div>
      <p style={bodyStyle()}>
        knees on the floor. spine soft. hands on your thighs, palms up.
      </p>
      <div style={timerStyle()} data-testid="bedtime-posture-timer">
        {secondsLeft > 0 ? `${secondsLeft}s` : 'good girl'}
      </div>
      <button
        data-testid="bedtime-posture-ack"
        onClick={onAck}
        disabled={disabled}
        style={primaryBtnStyle(disabled)}
      >
        {secondsLeft > 0 ? 'kneeling…' : 'i held it'}
      </button>
    </>
  );
}

function ChastityStep({ onConfirm, disabled }: {
  onConfirm: () => void;
  disabled: boolean;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <div style={titleStyle()}>chastity check</div>
      <p style={bodyStyle()}>
        Mama wants to hear it. say yes baby, you're locked.
      </p>
      <label
        data-testid="bedtime-chastity-toggle"
        style={checkboxRowStyle(checked)}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={e => setChecked(e.target.checked)}
          style={{ marginRight: 12, width: 18, height: 18, accentColor: PALETTE.primaryBg }}
        />
        yes baby, i'm locked
      </label>
      <button
        data-testid="bedtime-chastity-confirm"
        onClick={onConfirm}
        disabled={disabled || !checked}
        style={primaryBtnStyle(disabled || !checked)}
      >
        confirm
      </button>
    </>
  );
}

function BreathStep({ phase, cycles, scale, onStart, onDone, disabled }: {
  phase: BreathPhase;
  cycles: number;
  scale: number;
  onStart: () => void;
  onDone: () => void;
  disabled: boolean;
}) {
  const phaseLabel =
    phase === 'idle' ? 'tap to begin' :
    phase === 'inhale' ? 'breathe in — 4' :
    phase === 'hold' ? 'hold — 7' :
    phase === 'exhale' ? 'breathe out — 8' :
    'done';

  return (
    <>
      <div style={titleStyle()}>breathe with Mama</div>
      <p style={bodyStyle()}>
        {BREATH_CYCLES_REQUIRED} cycles of 4-7-8. let your shoulders fall on every exhale.
      </p>
      <div style={breathCircleStyle(scale, phase !== 'idle')} data-testid="bedtime-breath-circle">
        {phaseLabel}
      </div>
      <div style={cycleCountStyle()}>
        {cycles} / {BREATH_CYCLES_REQUIRED} cycles
      </div>
      {phase === 'idle' ? (
        <button
          data-testid="bedtime-breath-start"
          onClick={onStart}
          disabled={disabled}
          style={primaryBtnStyle(disabled)}
        >
          start
        </button>
      ) : (
        <button
          data-testid="bedtime-breath-done"
          onClick={onDone}
          disabled={disabled || phase !== 'done'}
          style={primaryBtnStyle(disabled || phase !== 'done')}
        >
          {phase === 'done' ? 'goodnight' : 'breathing…'}
        </button>
      )}
    </>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 9998,
    background: PALETTE.bgGradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  };
}

function cardStyle(): React.CSSProperties {
  return {
    width: '100%',
    maxWidth: 460,
    background: PALETTE.card,
    border: `1px solid ${PALETTE.cardBorder}`,
    borderRadius: 18,
    padding: '32px 28px',
    backdropFilter: 'blur(18px)',
    color: PALETTE.textPrimary,
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
    textAlign: 'center',
  };
}

function progressRowStyle(): React.CSSProperties {
  return { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 };
}

function titleStyle(): React.CSSProperties {
  return {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: PALETTE.accent,
    marginBottom: 14,
    fontWeight: 700,
  };
}

function bodyStyle(): React.CSSProperties {
  return {
    fontSize: 19,
    lineHeight: 1.5,
    color: PALETTE.textPrimary,
    margin: '0 0 22px',
  };
}

function hintStyle(): React.CSSProperties {
  return {
    fontSize: 12.5,
    color: PALETTE.textSecondary,
    margin: '0 0 18px',
  };
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#3d2a5a' : PALETTE.primaryBg,
    color: disabled ? PALETTE.textMuted : '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 28px',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: '100%',
    transition: 'background 200ms ease',
  };
}

function skipRowStyle(): React.CSSProperties {
  return { marginTop: 18, display: 'flex', justifyContent: 'center' };
}

function skipBtnStyle(): React.CSSProperties {
  return {
    background: 'transparent',
    color: PALETTE.textMuted,
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    padding: '8px 12px',
    textDecoration: 'underline',
  };
}

function timerStyle(): React.CSSProperties {
  return {
    fontSize: 36,
    fontWeight: 300,
    color: PALETTE.accent,
    margin: '12px 0 22px',
    fontVariantNumeric: 'tabular-nums',
  };
}

function checkboxRowStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    background: PALETTE.inputBg,
    border: `1px solid ${checked ? PALETTE.accent : PALETTE.cardBorder}`,
    borderRadius: 10,
    padding: '14px 16px',
    cursor: 'pointer',
    fontSize: 14,
    color: PALETTE.textPrimary,
    margin: '0 0 18px',
    transition: 'border-color 200ms ease',
  };
}

function breathCircleStyle(scale: number, animating: boolean): React.CSSProperties {
  return {
    width: 160,
    height: 160,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(196,181,253,0.25) 0%, rgba(124,58,237,0.08) 70%)',
    border: `2px solid ${PALETTE.accentDim}`,
    margin: '6px auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    color: PALETTE.textSecondary,
    transform: `scale(${scale})`,
    transition: animating ? `transform 4000ms ease-in-out` : 'transform 300ms ease',
  };
}

function cycleCountStyle(): React.CSSProperties {
  return {
    fontSize: 11.5,
    color: PALETTE.textMuted,
    marginBottom: 18,
    fontVariantNumeric: 'tabular-nums',
  };
}
