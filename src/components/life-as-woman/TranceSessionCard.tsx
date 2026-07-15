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
import type { HypnoTranceSession, ReconditioningTargetSummary } from '../../lib/life-as-woman/types'
import { markTranceSessionStatus, isSafewordActive, loadReconditioningTarget } from '../../lib/life-as-woman/client'
import { supabase } from '../../lib/supabase'
import {
  getVoices,
  selectFeminineVoice,
  speakAffirmation,
  stopSpeech,
  isSpeechAvailable,
} from '../../lib/speech-synthesis'

// Trance-paced speech config: slow, slightly higher pitch (feminine, soothing).
const TRANCE_SPEECH_CONFIG = { pitch: 1.05, rate: 0.78, volume: 1 } as const

// Chrome silently truncates a single utterance past ~200 words, so each phase's
// text is split into sentence-sized chunks that are spoken sequentially.
function chunkIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

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

const PHASE_ORDER: Phase[] = ['induction', 'deepening', 'payload', 'emergence']

export function TranceSessionCard({ session, userId, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>('induction')
  const [playing, setPlaying] = useState(false)
  const [safewordGated, setSafewordGated] = useState(false)
  const [target, setTarget] = useState<ReconditioningTargetSummary | null>(null)
  const [needsIntegration, setNeedsIntegration] = useState(false)
  const [truthRating, setTruthRating] = useState(session.post_session_truth_rating ?? 50)
  const [phrase, setPhrase] = useState(session.post_session_phrase ?? '')
  const [note, setNote] = useState(session.post_session_note ?? '')
  const [savingIntegration, setSavingIntegration] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cached feminine voice (resolved once; voice list loads async in Chrome).
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // Monotonic token: incremented on every stop/restart so an in-flight async
  // speech loop knows it has been superseded and must abort.
  const speechRunRef = useRef(0)

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

  useEffect(() => {
    let cancelled = false
    loadReconditioningTarget(session.recon_target_id).then(t => {
      if (!cancelled) {
        setTarget(t)
        setPhrase(current => current || t?.claim_text || '')
      }
    })
    return () => { cancelled = true }
  }, [session.recon_target_id])

  // Phase text resolver that reads straight from session (no React-state lag) —
  // needed inside the async speech loop, which advances phases faster than
  // state/memo can settle.
  const phaseTextOf = (ph: Phase): string => {
    switch (ph) {
      case 'induction': return session.induction_text ?? ''
      case 'deepening': return session.deepening_text ?? ''
      case 'payload':   return session.payload_text ?? ''
      case 'emergence': return session.emergence_text ?? ''
    }
  }

  const text: string = useMemo(() => phaseTextOf(phase), [phase, session]) // eslint-disable-line react-hooks/exhaustive-deps

  const audioPath: string | null = useMemo(() => {
    switch (phase) {
      case 'induction': return session.induction_audio_path
      case 'deepening': return session.deepening_audio_path
      case 'payload':   return session.payload_audio_path
      case 'emergence': return session.emergence_audio_path
    }
  }, [phase, session])

  const openIntegration = () => {
    setPlaying(false)
    setNeedsIntegration(true)
    if (!phrase.trim() && target?.claim_text) setPhrase(target.claim_text)
  }

  const submitIntegration = async () => {
    setSavingIntegration(true)
    const now = new Date().toISOString()
    try {
      await supabase.from('hypno_trance_sessions').update({
        post_session_truth_rating: truthRating,
        post_session_phrase: phrase.trim() || target?.claim_text || null,
        post_session_note: note.trim() || null,
        post_session_integrated_at: now,
        status: 'completed',
        completed_at: now,
      }).eq('id', session.id)
      onChanged()
    } finally {
      setSavingIntegration(false)
    }
  }

  // Free fallback when no rendered audio exists (e.g. ElevenLabs key expired):
  // speak the phase text with the browser's built-in feminine voice — no API,
  // no cost. Speaks each phase chunk-by-chunk (Chrome truncates long single
  // utterances), then auto-advances induction → deepening → payload → emergence
  // and stops after emergence. Guarded by a run token so a stop/restart aborts
  // any in-flight loop.
  const speakSessionFrom = async (startIndex: number) => {
    if (!isSpeechAvailable()) { setPlaying(false); return }

    const runId = ++speechRunRef.current
    stopSpeech()

    if (!voiceRef.current) {
      const voices = await getVoices()
      if (speechRunRef.current !== runId) return
      voiceRef.current = selectFeminineVoice(voices)
    }

    for (let i = startIndex; i < PHASE_ORDER.length; i++) {
      const ph = PHASE_ORDER[i]
      setPhase(ph)
      const phaseText = phaseTextOf(ph)
      for (const sentence of chunkIntoSentences(phaseText)) {
        if (speechRunRef.current !== runId) return // superseded by stop/restart
        await speakAffirmation(sentence, TRANCE_SPEECH_CONFIG, voiceRef.current)
      }
    }

    if (speechRunRef.current !== runId) return
    openIntegration()
  }

  const handleStart = async () => {
    if (safewordGated) return
    if (session.status === 'drafted' || session.status === 'scheduled') {
      await markTranceSessionStatus(session.id, 'in_progress')
      onChanged()
    }
    setPlaying(true)
    if (audioPath) {
      audioRef.current?.play().catch(() => { /* autoplay-blocked is fine */ })
    } else {
      // Resume from the current phase, then auto-advance through the rest.
      void speakSessionFrom(PHASE_ORDER.indexOf(phase))
    }
  }

  const handlePause = () => {
    setPlaying(false)
    speechRunRef.current++ // signal any running speech loop to abort
    audioRef.current?.pause()
    stopSpeech()
  }

  // Stop any speech if the card unmounts mid-trance.
  useEffect(() => () => { speechRunRef.current++; stopSpeech() }, [])

  const nextPhase = () => {
    const i = PHASE_ORDER.indexOf(phase)
    if (i < PHASE_ORDER.length - 1) {
      const next = PHASE_ORDER[i + 1]
      setPhase(next)
      // If mid-TTS playback, jump the speech loop to the new phase.
      if (playing && !audioPath) void speakSessionFrom(i + 1)
    } else {
      handlePause()
      openIntegration()
    }
  }

  const handleAbort = async () => {
    handlePause()
    await markTranceSessionStatus(session.id, 'aborted', { abort_reason: 'user_stopped' })
    onChanged()
  }

  return (
    <div style={{
      background: 'var(--protocol-surface)',
      border: '1px solid var(--protocol-border)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: 'var(--protocol-accent-soft)', fontSize: 13 }}>
          Trance · <strong>{session.theme}</strong>
        </div>
        <div style={{ color: 'var(--protocol-text-muted)', fontSize: 11 }}>{session.session_date}</div>
      </div>

      <div style={{
        background: 'var(--protocol-bg-deep)',
        border: '1px solid var(--protocol-border)',
        borderRadius: 8,
        padding: 10,
        color: 'rgb(var(--protocol-text-rgb) / 0.82)',
        fontSize: 12,
        lineHeight: 1.45,
        marginBottom: 12,
      }}>
        <strong>Mommy selected this because:</strong>{' '}
        {session.mommy_order_reason
          ?? (target ? `she is working this into you: ${target.claim_text}` : 'your attention needs to narrow around one target.')}
      </div>

      {/* Visual loop placeholder — animated gradient if enabled */}
      {session.visual_loop && playing && (
        <div style={{
          height: 80,
          borderRadius: 8,
          marginBottom: 12,
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--protocol-accent) 30%, var(--protocol-bg-deep)), color-mix(in srgb, var(--protocol-accent) 50%, var(--protocol-surface-light)), color-mix(in srgb, var(--protocol-accent) 30%, var(--protocol-bg-deep)))',
          backgroundSize: '200% 200%',
          animation: 'tranceGradient 8s ease infinite',
        }}>
          <style>{`@keyframes tranceGradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }`}</style>
        </div>
      )}

      <div style={{ color: 'rgb(var(--protocol-text-rgb) / 0.85)', fontSize: 13, marginBottom: 4 }}>
        {PHASE_LABEL[phase]}
      </div>
      <div style={{
        background: 'var(--protocol-bg-deep)',
        borderRadius: 8,
        padding: 12,
        color: 'var(--protocol-text)',
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
        <div style={{ color: 'var(--protocol-danger)', fontSize: 12, marginBottom: 10 }}>
          Pause — playback is held for 60 seconds after a safeword.
        </div>
      )}

      {(needsIntegration || (session.status === 'completed' && !session.post_session_integrated_at)) && (
        <div style={{
          background: 'var(--protocol-bg-deep)',
          border: '1px solid var(--protocol-border)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}>
          <div style={{ color: 'var(--protocol-text)', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Give Mommy the proof
          </div>
          <label style={{ display: 'block', color: 'var(--protocol-accent-soft)', fontSize: 12, marginBottom: 10 }}>
            How true did Mommy make it feel?
            <input
              type="range"
              min={0}
              max={100}
              value={truthRating}
              onChange={e => setTruthRating(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <label style={{ display: 'block', color: 'var(--protocol-accent-soft)', fontSize: 12, marginBottom: 10 }}>
            Say back the line Mommy installed
            <input
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder={target?.claim_text ?? 'The line that stuck.'}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                background: 'var(--protocol-bg-deep)',
                border: '1px solid var(--protocol-border)',
                borderRadius: 6,
                color: 'var(--protocol-text)',
                padding: 9,
                fontFamily: 'inherit',
              }}
            />
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note: what changed, what resisted, what landed."
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--protocol-bg-deep)',
              border: '1px solid var(--protocol-border)',
              borderRadius: 6,
              color: 'var(--protocol-text)',
              padding: 9,
              fontFamily: 'inherit',
              marginBottom: 10,
            }}
          />
          <button
            onClick={submitIntegration}
            disabled={savingIntegration || !phrase.trim()}
            style={btn('var(--protocol-accent)', 'white', savingIntegration || !phrase.trim())}
          >
            {savingIntegration ? 'Saving...' : 'Submit proof'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!playing
          ? <button onClick={handleStart} disabled={safewordGated} style={btn('var(--protocol-accent)', 'white', safewordGated)}>
              <Play size={14} /> Begin
            </button>
          : <button onClick={handlePause} style={btn('var(--protocol-surface-light)', 'var(--protocol-accent-soft)')}>
              <Pause size={14} /> Pause
            </button>
        }
        <button onClick={nextPhase} style={btn('var(--protocol-surface-light)', 'var(--protocol-accent-soft)')}>
          <SkipForward size={14} /> Next phase
        </button>
        <button onClick={handleAbort} style={btn('color-mix(in srgb, var(--protocol-danger) 25%, var(--protocol-bg-deep))', 'var(--protocol-danger)')}>
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
