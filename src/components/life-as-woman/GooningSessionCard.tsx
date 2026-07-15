/**
 * GooningSessionCard
 *
 * Renders one gooning session's segment structure with a segment-stepper
 * and an "I edged" button per edge segment. Logs to gooning_edge_events.
 *
 * Safeword-active disables Begin.
 */

import { useEffect, useState } from 'react'
import { Play, SkipForward, X, Zap } from 'lucide-react'
import type { GooningSession, ReconditioningTargetSummary } from '../../lib/life-as-woman/types'
import { logGooningEdge, isSafewordActive, loadReconditioningTarget } from '../../lib/life-as-woman/client'
import { supabase } from '../../lib/supabase'

interface Props {
  session: GooningSession
  userId: string
  onChanged: () => void
}

export function GooningSessionCard({ session, userId, onChanged }: Props) {
  const [segIdx, setSegIdx] = useState(0)
  const [safewordGated, setSafewordGated] = useState(false)
  const [target, setTarget] = useState<ReconditioningTargetSummary | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [proofText, setProofText] = useState(session.post_session_proof_text ?? '')
  const [savingProof, setSavingProof] = useState(false)
  const segments = Array.isArray(session.structure_json) ? session.structure_json : []
  const seg = segments[segIdx]

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
      if (!cancelled) setTarget(t)
    })
    return () => { cancelled = true }
  }, [session.recon_target_id])

  const handleBegin = async () => {
    if (safewordGated) return
    await supabase.from('gooning_sessions').update({
      status: 'in_progress', started_at: new Date().toISOString(),
    }).eq('id', session.id)
    onChanged()
  }

  const handleEdgeLogged = async () => {
    if (!seg?.edge_target_index) return
    await logGooningEdge({ session_id: session.id, edge_index: seg.edge_target_index })
    const newCount = (session.edges_logged ?? 0) + 1
    await supabase.from('gooning_sessions').update({ edges_logged: newCount }).eq('id', session.id)
    onChanged()
  }

  const handleNext = () => {
    if (segIdx < segments.length - 1) setSegIdx(segIdx + 1)
    else setProofOpen(true)
  }

  const submitProof = async () => {
    setSavingProof(true)
    const now = new Date().toISOString()
    try {
      await supabase.from('gooning_sessions').update({
        status: 'completed',
        completed_at: now,
        post_session_proof_kind: 'text',
        post_session_proof_text: proofText.trim(),
        post_session_integrated_at: now,
      }).eq('id', session.id)
      onChanged()
    } finally {
      setSavingProof(false)
    }
  }

  const handleAbort = async () => {
    await supabase.from('gooning_sessions').update({
      status: 'aborted', completed_at: new Date().toISOString(),
    }).eq('id', session.id)
    onChanged()
  }

  return (
    <div className="card p-4 mb-3">
      <div className="flex justify-between mb-2">
        <div className="text-protocol-accent-soft text-[15px] font-semibold">{session.title}</div>
        <div className="text-protocol-text-muted text-[11px]">
          {session.duration_minutes} min · {session.edge_target_count} edges · {session.outcome}
        </div>
      </div>

      <div className="bg-protocol-accent/10 border border-protocol-accent/25 rounded-lg p-2.5 text-protocol-text text-xs leading-[1.45] mb-3">
        <strong>Mommy selected this because:</strong>{' '}
        {session.mommy_order_reason
          ?? (target ? `she is pushing this target through arousal: ${target.claim_text}` : 'arousal makes the order land harder.')}
      </div>

      {session.status === 'drafted' || session.status === 'rendered' ? (
        <button
          onClick={handleBegin}
          disabled={safewordGated}
          className="btn-primary inline-flex items-center gap-1.5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={14} /> Begin session
        </button>
      ) : (
        <>
          <div className="text-protocol-text-muted text-[13px] mb-1">
            Segment {segIdx + 1} / {segments.length} · <strong>{seg?.label}</strong>
            {seg?.edge_target_index ? ` · edge #${seg.edge_target_index}` : ''}
          </div>
          {seg?.purpose && (
            <div className="text-protocol-accent-soft text-[11px] mb-2 uppercase tracking-[0.08em]">
              {String(seg.purpose).replace(/_/g, ' ')}
            </div>
          )}
          <div className="bg-protocol-bg-deep rounded-lg p-3 text-protocol-text whitespace-pre-wrap max-h-60 overflow-y-auto text-sm leading-normal mb-3">
            {seg?.text || '(empty)'}
          </div>

          {proofOpen ? (
            <div className="bg-protocol-accent/10 border border-protocol-accent/25 rounded-lg p-3">
              <div className="text-protocol-accent-soft text-[13px] font-bold mb-2">
                Proof before Mommy closes it
              </div>
              <textarea
                value={proofText}
                onChange={e => setProofText(e.target.value)}
                placeholder={session.proof_prompt || 'What image stuck, how many edges did Mommy take, and what did denial/reward do to the target?'}
                rows={4}
                className="w-full box-border bg-protocol-bg-deep border border-protocol-border rounded-md text-protocol-text p-2.5 mb-2.5 font-sans"
              />
              <button
                onClick={submitProof}
                disabled={savingProof || proofText.trim().length < 20}
                className="btn-primary inline-flex items-center gap-1.5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingProof ? 'Saving...' : 'Give Mommy the proof'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {seg?.edge_target_index && (
                <button
                  onClick={handleEdgeLogged}
                  className="btn-primary inline-flex items-center gap-1.5 text-[13px]"
                >
                  <Zap size={14} /> I edged
                </button>
              )}
              <button onClick={handleNext} className="btn-secondary inline-flex items-center gap-1.5 text-[13px]">
                <SkipForward size={14} /> Next
              </button>
              <button
                onClick={handleAbort}
                className="btn-secondary inline-flex items-center gap-1.5 text-[13px]"
                style={{ color: 'var(--protocol-danger)' }}
              >
                <X size={14} /> Stop
              </button>
            </div>
          )}
        </>
      )}

      {safewordGated && (
        <div className="text-protocol-danger text-xs mt-2">
          Pause — session held for 60 seconds after a safeword.
        </div>
      )}
    </div>
  )
}
