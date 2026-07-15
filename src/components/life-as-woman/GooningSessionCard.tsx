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
import type { GooningSession } from '../../lib/life-as-woman/types'
import { logGooningEdge, isSafewordActive } from '../../lib/life-as-woman/client'
import { supabase } from '../../lib/supabase'

interface Props {
  session: GooningSession
  userId: string
  onChanged: () => void
}

export function GooningSessionCard({ session, userId, onChanged }: Props) {
  const [segIdx, setSegIdx] = useState(0)
  const [safewordGated, setSafewordGated] = useState(false)
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
    else handleComplete()
  }

  const handleComplete = async () => {
    await supabase.from('gooning_sessions').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', session.id)
    onChanged()
  }

  const handleAbort = async () => {
    await supabase.from('gooning_sessions').update({
      status: 'aborted', completed_at: new Date().toISOString(),
    }).eq('id', session.id)
    onChanged()
  }

  return (
    <div style={{
      background: '#1a0a14',
      border: '1px solid #4a1a2a',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#e8a4c0', fontSize: 15, fontWeight: 600 }}>{session.title}</div>
        <div style={{ color: '#8a4a6a', fontSize: 11 }}>
          {session.duration_minutes} min · {session.edge_target_count} edges · {session.outcome}
        </div>
      </div>

      {session.status === 'drafted' || session.status === 'rendered' ? (
        <button onClick={handleBegin} disabled={safewordGated} style={btn('#6a2040', '#fff', safewordGated)}>
          <Play size={14} /> Begin session
        </button>
      ) : (
        <>
          <div style={{ color: '#c0a4b0', fontSize: 13, marginBottom: 4 }}>
            Segment {segIdx + 1} / {segments.length} · <strong>{seg?.label}</strong>
            {seg?.edge_target_index ? ` · edge #${seg.edge_target_index}` : ''}
          </div>
          <div style={{
            background: '#0a0408',
            borderRadius: 8,
            padding: 12,
            color: '#f0d0e0',
            whiteSpace: 'pre-wrap',
            maxHeight: 240,
            overflowY: 'auto',
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 12,
          }}>
            {seg?.text || '(empty)'}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {seg?.edge_target_index && (
              <button onClick={handleEdgeLogged} style={btn('#8a3060', '#fff')}>
                <Zap size={14} /> I edged
              </button>
            )}
            <button onClick={handleNext} style={btn('#2a1a24', '#c0a4b0')}>
              <SkipForward size={14} /> Next
            </button>
            <button onClick={handleAbort} style={btn('#3a1a1a', '#e89090')}>
              <X size={14} /> Stop
            </button>
          </div>
        </>
      )}

      {safewordGated && (
        <div style={{ color: '#e89090', fontSize: 12, marginTop: 8 }}>
          Pause — session held for 60 seconds after a safeword.
        </div>
      )}
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
