/**
 * TranceSessionCard
 *
 * Today's 20-min trance session. Phased playback: induction → deepening →
 * payload → emergence. If audio paths are populated, plays the audio;
 * otherwise renders the text for self-read. Visual loop (gradient /
 * candle / spiral) is optional based on settings.
 *
 * Safeword-active disables the Play button.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, SkipForward, X } from 'lucide-react'
import type { HypnoTranceSession } from '../../lib/life-as-woman/types'
import { markTranceSessionStatus, isSafewordActive } from '../../lib/life-as-woman/client'

interface Props {
  session: HypnoTranceSession
  userId: string
  onChanged: () => void
}

type Phase = 'induction' | 'deepening' | 'payload' | 'emergence'
const PHASE_LABEL: Record<Phase, string> = {
  induction: 'Settle (3 min)',
  deepening: 'Descend (5 min)',
  payload: 'Conditioning (10 min)',
  emergence: 'Return (2 min)',
}

export function TranceSessionCard({ session, userId, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>('induction')
  const [playing, setPlaying] = useState(false)
  const [safewordGated, setSafewordGated] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const sw = await isSafewordActive(userId, 60)
      if (!cancelled) setSafewordGated(sw)
    }
    check()
    const id = window.setInterval(check, 10_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [userId])

  const text: string = useMemo(() => {
    switch (phase) {
      case 'induction': return session.induction_text ?? ''
      case 'deepening': return session.deepening_text ?? ''
      case 'payload':   return session.payload_text ?? ''
      case 'emergence': return session.emergence_text ?? ''
    }
  }, [phase, session])

  const audioPath: string | null = useMemo(() => {
    switch (phase) {
      case 'induction': return session.induction_audio_path
      case 'deepening': return session.deepening_audio_path
      case 'payload':   return session.payload_audio_path
      case 'emergence': return session.emergence_audio_path
    }
  }, [phase, session])

  const handleStart = async () => {
    if (safewordGated) return
    if (session.status === 'drafted' || session.status === 'scheduled') {
      await markTranceSessionStatus(session.id, 'in_progress')
      onChanged()
    }
    setPlaying(true)
    audioRef.current?.play().catch(() => { /* autoplay-blocked is fine */ })
  }

  const handlePause = () => {
    setPlaying(false)
    audioRef.current?.pause()
  }

  const phases: Phase[] = ['induction', 'deepening', 'payload', 'emergence']
  const nextPhase = () => {
    const i = phases.indexOf(phase)
    if (i < phases.length - 1) setPhase(phases[i + 1])
    else {
      handlePause()
      markTranceSessionStatus(session.id, 'completed').then(onChanged)
    }
  }

  const handleAbort = async () => {
    handlePause()
    await markTranceSessionStatus(session.id, 'aborted', { abort_reason: 'user_stopped' })
    onChanged()
  }

  return (
    <div style={{
      background: '#0a0a1a',
      border: '1px solid #2a2a44',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#a0a0d0', fontSize: 13 }}>
          Trance · <strong>{session.theme}</strong>
        </div>
        <div style={{ color: '#6a6a8a', fontSize: 11 }}>{session.session_date}</div>
      </div>

      {/* Visual loop placeholder — animated gradient if enabled */}
      {session.visual_loop && playing && (
        <div style={{
          height: 80,
          borderRadius: 8,
          marginBottom: 12,
          background: 'linear-gradient(135deg, #2a1a4a, #4a2a6a, #2a1a4a)',
          backgroundSize: '200% 200%',
          animation: 'tranceGradient 8s ease infinite',
        }}>
          <style>{`@keyframes tranceGradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }`}</style>
        </div>
      )}

      <div style={{ color: '#c0c0e0', fontSize: 13, marginBottom: 4 }}>
        {PHASE_LABEL[phase]}
      </div>
      <div style={{
        background: '#050518',
        borderRadius: 8,
        padding: 12,
        color: '#d8d8f0',
        whiteSpace: 'pre-wrap',
        maxHeight: 240,
        overflowY: 'auto',
        fontSize: 14,
        lineHeight: 1.5,
        marginBottom: 12,
      }}>
        {text || '(empty — audio-only segment)'}
      </div>

      {audioPath && (
        <audio
          ref={audioRef}
          src={audioPath}
          onEnded={nextPhase}
          preload="none"
        />
      )}

      {safewordGated && (
        <div style={{ color: '#e89090', fontSize: 12, marginBottom: 10 }}>
          Pause — playback is held for 60 seconds after a safeword.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!playing
          ? <button onClick={handleStart} disabled={safewordGated} style={btn('#2a2a6a', '#fff', safewordGated)}>
              <Play size={14} /> Begin
            </button>
          : <button onClick={handlePause} style={btn('#1a1a3a', '#a0a0d0')}>
              <Pause size={14} /> Pause
            </button>
        }
        <button onClick={nextPhase} style={btn('#1a1a3a', '#a0a0d0')}>
          <SkipForward size={14} /> Next phase
        </button>
        <button onClick={handleAbort} style={btn('#3a1a1a', '#e89090')}>
          <X size={14} /> Stop
        </button>
      </div>
    </div>
  )
}

function btn(bg: string, color: string, disabled?: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}
