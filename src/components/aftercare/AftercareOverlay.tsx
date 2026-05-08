/**
 * AftercareOverlay — full-bleed comfort layer.
 *
 * Sits over Today, chat, settings — covers all chrome. Each affirmation
 * displays for its `min_dwell_seconds`; the user can pause but cannot
 * skip past dwell. The "I'm done" exit gate is REAL — minimum 60s in
 * aftercare regardless of entry trigger or sequence length.
 *
 * NOT persona-voiced. NO kink content. NO distortion. NO telemetry.
 * Pulls neutral palette from ./theme.ts (sage/cream/warm grey, not
 * burgundy/rose).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  exitAftercare,
  AFTERCARE_MIN_DWELL_MS,
  BREATH_CADENCE_4_7_8,
  type AftercareSequenceItem,
} from '../../lib/aftercare'
import { AFTERCARE_THEME } from './theme'

interface AftercareOverlayProps {
  sessionId: string
  sequence: AftercareSequenceItem[]
  onComplete: () => void
}

type BreathPhase = 'idle' | 'inhale' | 'hold' | 'exhale'

export function AftercareOverlay({ sessionId, sequence, onComplete }: AftercareOverlayProps) {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  // Per-step dwell tracker. Counts UP from 0 to min_dwell_seconds for
  // the current item; resets when the user advances. Independent of
  // the global 60s exit gate below.
  const [stepDwell, setStepDwell] = useState(0)
  // Global timer — wallclock seconds since the overlay mounted. Drives
  // the exit-button enable. NOT pausable; pausing the affirmation
  // dwell does not pause the exit gate.
  const [globalElapsed, setGlobalElapsed] = useState(0)
  const enteredAtRef = useRef<number>(Date.now())

  // Breath visualization state
  const [breathPhase, setBreathPhase] = useState<BreathPhase>('idle')
  const [cyclesCompleted, setCyclesCompleted] = useState(0)
  const breathStartRef = useRef<number | null>(null)

  const current = sequence[step]
  const isLast = step >= sequence.length - 1

  // Per-step dwell timer
  useEffect(() => {
    if (paused) return
    const interval = setInterval(() => {
      setStepDwell(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [step, paused])

  // Global elapsed timer (always runs, ignores pause)
  useEffect(() => {
    const interval = setInterval(() => {
      setGlobalElapsed(Math.floor((Date.now() - enteredAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Body scroll lock while overlay open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const dwellComplete = current ? stepDwell >= current.min_dwell_seconds : true
  const exitGateOpen = globalElapsed >= AFTERCARE_MIN_DWELL_MS / 1000

  const handleNext = useCallback(() => {
    if (!dwellComplete) return
    if (isLast) return
    setStep(prev => prev + 1)
    setStepDwell(0)
  }, [dwellComplete, isLast])

  const handlePauseToggle = useCallback(() => setPaused(p => !p), [])

  const handleExit = useCallback(async () => {
    if (!exitGateOpen) return
    await exitAftercare({ sessionId, breathCyclesCompleted: cyclesCompleted })
    onComplete()
  }, [exitGateOpen, sessionId, cyclesCompleted, onComplete])

  // Breath cycle driver
  useEffect(() => {
    if (breathPhase === 'idle') return
    const phaseDuration =
      breathPhase === 'inhale' ? BREATH_CADENCE_4_7_8.inhale_ms :
      breathPhase === 'hold' ? BREATH_CADENCE_4_7_8.hold_ms :
      BREATH_CADENCE_4_7_8.exhale_ms
    const t = setTimeout(() => {
      if (breathPhase === 'inhale') setBreathPhase('hold')
      else if (breathPhase === 'hold') setBreathPhase('exhale')
      else {
        setCyclesCompleted(c => Math.min(c + 1, 10))
        setBreathPhase('inhale')
      }
    }, phaseDuration)
    return () => clearTimeout(t)
  }, [breathPhase])

  const startBreath = useCallback(() => {
    if (breathPhase !== 'idle') return
    breathStartRef.current = Date.now()
    setBreathPhase('inhale')
  }, [breathPhase])

  const stopBreath = useCallback(() => {
    setBreathPhase('idle')
  }, [])

  const exitGateRemainingSec = Math.max(0, Math.ceil(AFTERCARE_MIN_DWELL_MS / 1000) - globalElapsed)
  const stepRemainingSec = current ? Math.max(0, current.min_dwell_seconds - stepDwell) : 0

  const breathScale = useMemo(() => {
    if (breathPhase === 'idle') return 1
    if (breathPhase === 'inhale') return 1.5
    if (breathPhase === 'hold') return 1.5
    return 1
  }, [breathPhase])

  if (!current) {
    return null
  }

  return (
    <div
      data-testid="aftercare-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: AFTERCARE_THEME.bgGradient,
        color: AFTERCARE_THEME.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '48px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Top: progress dots — neutral, no labels */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {sequence.map((_, i) => (
          <div
            key={i}
            data-testid={`aftercare-progress-${i}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i <= step ? AFTERCARE_THEME.accent : AFTERCARE_THEME.disabled,
              transition: 'background 400ms ease',
            }}
          />
        ))}
      </div>

      {/* Center: affirmation card + optional breath circle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, maxWidth: 560, width: '100%' }}>
        {breathPhase !== 'idle' && (
          <div
            data-testid="aftercare-breath-circle"
            style={{
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: AFTERCARE_THEME.breathCircleFill,
              border: `2px solid ${AFTERCARE_THEME.breathCircleStroke}`,
              transform: `scale(${breathScale})`,
              transition: `transform ${
                breathPhase === 'inhale' ? BREATH_CADENCE_4_7_8.inhale_ms :
                breathPhase === 'hold' ? 200 :
                BREATH_CADENCE_4_7_8.exhale_ms
              }ms ease-in-out`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              color: AFTERCARE_THEME.textSecondary,
            }}
          >
            {breathPhase === 'inhale' ? 'breathe in' :
             breathPhase === 'hold' ? 'hold' :
             'breathe out'}
          </div>
        )}

        <div
          data-testid="aftercare-affirmation"
          style={{
            background: AFTERCARE_THEME.cardBg,
            backdropFilter: AFTERCARE_THEME.cardBlur,
            border: `1px solid ${AFTERCARE_THEME.cardBorder}`,
            borderRadius: 16,
            padding: '40px 32px',
            textAlign: 'center',
            fontSize: 22,
            lineHeight: 1.5,
            fontWeight: 400,
            color: AFTERCARE_THEME.textPrimary,
            width: '100%',
          }}
        >
          {current.text}
        </div>

        {/* Dwell hint — quiet, no number */}
        <div style={{ fontSize: 13, color: AFTERCARE_THEME.textSecondary, minHeight: 18 }}>
          {paused
            ? 'paused'
            : !dwellComplete
              ? `take a moment${stepRemainingSec > 3 ? '' : '...'}`
              : isLast
                ? ''
                : 'when you are ready'}
        </div>
      </div>

      {/* Bottom: controls */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', maxWidth: 480 }}>
        {/* Breath toggle */}
        <button
          data-testid="aftercare-breath-toggle"
          onClick={breathPhase === 'idle' ? startBreath : stopBreath}
          style={{
            background: 'transparent',
            border: `1px solid ${AFTERCARE_THEME.accentDim}`,
            color: AFTERCARE_THEME.accent,
            padding: '10px 24px',
            borderRadius: 999,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {breathPhase === 'idle' ? 'breathe with me' : `breathing — ${cyclesCompleted} ${cyclesCompleted === 1 ? 'cycle' : 'cycles'}`}
        </button>

        <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'center' }}>
          <button
            data-testid="aftercare-pause"
            onClick={handlePauseToggle}
            style={{
              background: 'transparent',
              border: `1px solid ${AFTERCARE_THEME.accentDim}`,
              color: AFTERCARE_THEME.textSecondary,
              padding: '12px 20px',
              borderRadius: 12,
              fontSize: 15,
              cursor: 'pointer',
              minWidth: 100,
            }}
          >
            {paused ? 'resume' : 'pause'}
          </button>

          {!isLast && (
            <button
              data-testid="aftercare-next"
              onClick={handleNext}
              disabled={!dwellComplete}
              style={{
                background: dwellComplete ? AFTERCARE_THEME.accent : AFTERCARE_THEME.disabled,
                border: 'none',
                color: dwellComplete ? '#ffffff' : AFTERCARE_THEME.disabledText,
                padding: '12px 32px',
                borderRadius: 12,
                fontSize: 15,
                cursor: dwellComplete ? 'pointer' : 'not-allowed',
                minWidth: 140,
                transition: 'background 300ms ease',
              }}
            >
              next
            </button>
          )}

          {isLast && (
            <button
              data-testid="aftercare-exit"
              onClick={handleExit}
              disabled={!exitGateOpen}
              style={{
                background: exitGateOpen ? AFTERCARE_THEME.accent : AFTERCARE_THEME.disabled,
                border: 'none',
                color: exitGateOpen ? '#ffffff' : AFTERCARE_THEME.disabledText,
                padding: '12px 32px',
                borderRadius: 12,
                fontSize: 15,
                cursor: exitGateOpen ? 'pointer' : 'not-allowed',
                minWidth: 140,
                transition: 'background 300ms ease',
              }}
            >
              {exitGateOpen
                ? "i'm done"
                : `stay here a little longer — ${exitGateRemainingSec}s`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
