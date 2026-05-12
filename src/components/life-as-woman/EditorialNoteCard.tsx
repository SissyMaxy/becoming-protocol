/**
 * EditorialNoteCard
 *
 * Mommy's editorial review of one piece of pending content. Shows the
 * rewrite, Mommy's commentary, posting recommendation, audience archetype.
 * Accept / Decline buttons; neither auto-publishes — accepting just marks
 * Mommy's rewrite as the one to use when the user next posts manually.
 */

import { useState } from 'react'
import { Check, X, Copy } from 'lucide-react'
import type { MommyEditorialNote } from '../../lib/life-as-woman/types'
import { acceptEditorialNote, declineEditorialNote } from '../../lib/life-as-woman/client'

interface Props {
  note: MommyEditorialNote
  onChanged: () => void
}

export function EditorialNoteCard({ note, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleAccept = async () => {
    setBusy(true)
    const ok = await acceptEditorialNote(note.id)
    setBusy(false)
    if (ok) onChanged()
  }
  const handleDecline = async () => {
    setBusy(true)
    const ok = await declineEditorialNote(note.id)
    setBusy(false)
    if (ok) onChanged()
  }
  const handleCopy = async () => {
    if (!note.rewritten_text) return
    try {
      await navigator.clipboard.writeText(note.rewritten_text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (_) { /* */ }
  }

  return (
    <div style={{
      background: '#14140a',
      border: '1px solid #44441a',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#d0c080', fontSize: 13 }}>
          Editorial · audience: <em>{note.audience_archetype}</em>
          {note.projected_engagement ? ` · ×${note.projected_engagement.toFixed(1)}` : ''}
        </div>
        <div style={{ color: '#7a6a3a', fontSize: 11 }}>
          {new Date(note.created_at).toLocaleString()}
        </div>
      </div>

      {note.rewritten_text && (
        <div style={{
          background: '#0a0a05',
          borderRadius: 8,
          padding: 12,
          color: '#f0e8c0',
          whiteSpace: 'pre-wrap',
          marginBottom: 8,
          fontSize: 14,
          lineHeight: 1.4,
        }}>
          {note.rewritten_text}
        </div>
      )}

      {note.mommy_voice_note && (
        <div style={{
          color: '#e0c8a0',
          fontStyle: 'italic',
          fontSize: 13,
          marginBottom: 8,
          padding: '8px 10px',
          borderLeft: '2px solid #6a5a2a',
        }}>
          {note.mommy_voice_note}
        </div>
      )}

      {note.posting_recommendation && (
        <div style={{ color: '#b0a070', fontSize: 12, marginBottom: 12 }}>
          <strong>When:</strong> {note.posting_recommendation}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {note.rewritten_text && (
          <button onClick={handleCopy} style={btn('#2a2a14', '#d0c080')}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy rewrite'}
          </button>
        )}
        <button onClick={handleAccept} disabled={busy} style={btn('#4a4a14', '#fff', busy)}>
          <Check size={14} /> Accept
        </button>
        <button onClick={handleDecline} disabled={busy} style={btn('#2a2a14', '#d0c080', busy)}>
          <X size={14} /> Decline
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
