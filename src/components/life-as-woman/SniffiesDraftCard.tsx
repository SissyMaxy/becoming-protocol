/**
 * SniffiesDraftCard
 *
 * Renders one Mommy-drafted Sniffies message and the user-click-to-send
 * gate. Mommy NEVER sends; the user reviews clear-headed, then copies the
 * draft into Sniffies herself and clicks "I sent it" here. The Send button
 * is disabled while the user is mid-intense-scene (60s cooldown).
 *
 * Safety contracts:
 *   - No automatic send. The card surfaces the text + a "Copy to clipboard"
 *     button + a "Mark as sent" button. The user's hand has to touch both.
 *   - 60-second scene cooldown: if isInIntenseScene returns true, the
 *     buttons are disabled with a one-line explanation.
 *   - Safeword-active disables the buttons immediately.
 */

import { useEffect, useState } from 'react'
import { Copy, Send, X, Clock } from 'lucide-react'
import type { SniffiesDraft } from '../../lib/life-as-woman/types'
import {
  markSniffiesDraftSent, discardSniffiesDraft,
  isInIntenseScene, isSafewordActive,
} from '../../lib/life-as-woman/client'

interface Props {
  draft: SniffiesDraft
  userId: string
  contactName?: string
  onChanged: () => void
}

export function SniffiesDraftCard({ draft, userId, contactName, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sceneGated, setSceneGated] = useState(false)
  const [safewordGated, setSafewordGated] = useState(false)
  const [reasoning, setReasoning] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const [scene, sword] = await Promise.all([
        isInIntenseScene(userId),
        isSafewordActive(userId, 60),
      ])
      if (cancelled) return
      setSceneGated(scene)
      setSafewordGated(sword)
    }
    check()
    const id = window.setInterval(check, 10_000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [userId])

  const disabled = busy || sceneGated || safewordGated

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft.text_for_user)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (_) { /* clipboard denied */ }
  }

  const handleSent = async () => {
    if (disabled) return
    setBusy(true)
    const ok = await markSniffiesDraftSent(draft.id)
    setBusy(false)
    if (ok) onChanged()
  }

  const handleDiscard = async () => {
    setBusy(true)
    const ok = await discardSniffiesDraft(draft.id, reasoning ? 'user-discarded' : undefined)
    setBusy(false)
    if (ok) onChanged()
  }

  return (
    <div style={{
      background: '#1a0f1a',
      border: '1px solid #3a2a3a',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ color: '#c7a4c0', fontSize: 13 }}>
          <strong>{contactName ?? 'Anon'}</strong> · intent: <em>{draft.intent}</em>
        </div>
        <div style={{ color: '#8a6a8a', fontSize: 11 }}>
          {new Date(draft.created_at).toLocaleString()}
        </div>
      </div>

      <div style={{
        background: '#0d070d',
        borderRadius: 8,
        padding: 12,
        color: '#f0d8ea',
        fontFamily: 'ui-sans-serif, system-ui',
        whiteSpace: 'pre-wrap',
        marginBottom: 8,
        fontSize: 15,
        lineHeight: 1.4,
      }}>
        {draft.text_for_user}
      </div>

      {draft.mommy_voice_note && (
        <div style={{
          color: '#d8a6d0',
          fontStyle: 'italic',
          fontSize: 13,
          marginBottom: 12,
          padding: '8px 10px',
          borderLeft: '2px solid #6a3a6a',
        }}>
          {draft.mommy_voice_note}
        </div>
      )}

      {(sceneGated || safewordGated) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#e89090', fontSize: 12, marginBottom: 10,
        }}>
          <Clock size={14} />
          {safewordGated
            ? 'Pause — sending is held for 60 seconds after a safeword.'
            : 'Pause — you\'re mid-scene. Send buttons re-open in a moment.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleCopy}
          disabled={busy}
          style={btnStyle('#2a1a2a', '#c7a4c0')}
        >
          <Copy size={14} /> {copied ? 'Copied' : 'Copy text'}
        </button>

        <button
          onClick={handleSent}
          disabled={disabled}
          style={btnStyle(disabled ? '#1a0f1a' : '#6a2a6a', disabled ? '#5a4a5a' : '#fff', disabled)}
          title="Click after you've sent the message in Sniffies"
        >
          <Send size={14} /> I sent it
        </button>

        <button
          onClick={() => setReasoning(true)}
          disabled={busy}
          style={btnStyle('#2a1a2a', '#c7a4c0')}
        >
          <X size={14} /> Discard
        </button>

        {reasoning && (
          <button
            onClick={handleDiscard}
            style={btnStyle('#5a2020', '#fff')}
          >
            Confirm discard
          </button>
        )}
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string, disabled?: boolean): React.CSSProperties {
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
