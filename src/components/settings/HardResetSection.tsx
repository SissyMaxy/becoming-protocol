// Hard Reset / Emergency Wipe section.
// Distinct from "Clear All Data" — this nukes every personal/kink artifact,
// resets settings to defaults, deletes storage objects, and signs the user out.
// Auth account is preserved so the user can sign back in to start over.

import { useEffect, useState } from 'react'
import { AlertTriangle, Bomb, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBambiMode } from '../../context/BambiModeContext'
import {
  HARD_RESET_PHRASE,
  HARD_RESET_TARGET_BUCKETS,
  formatCooldown,
  getHardResetCooldownSeconds,
  phraseMatches,
  triggerHardReset,
} from '../../lib/hard-reset/client'

const WHAT_GETS_DELETED = [
  'Every conversation, decree, outreach, and Mommy memory',
  'All photos and recordings (verification, vault, voice samples)',
  'Identity, wardrobe, body, and prescription history',
  'Slip log, denial log, chastity sessions, aftercare notes',
  'Calendar credentials and any external sync',
  'Every setting reset to default — onboarding restarts',
]

const WHAT_SURVIVES = [
  'Your auth account (you can sign back in)',
  'A single audit log row recording the wipe',
]

export function HardResetSection() {
  const { signOut } = useAuth()
  const { isBambiMode } = useBambiMode()

  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [pin, setPin] = useState('')
  const [pinRequired, setPinRequired] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    void getHardResetCooldownSeconds().then(s => {
      if (mounted) setCooldown(s)
    })
    return () => {
      mounted = false
    }
  }, [])

  const phraseOk = phraseMatches(phrase)

  async function onConfirm() {
    if (!phraseOk) return
    setProcessing(true)
    setError(null)

    const result = await triggerHardReset({
      phrase,
      pin: pinRequired ? pin : undefined,
      via: 'settings_button',
    })

    if (result.ok) {
      // Sign out and route to landing. signOut is sufficient — Auth context
      // will redirect to the auth screen.
      await signOut()
      return
    }

    if (result.status === 429 && result.cooldown_seconds_remaining) {
      setCooldown(result.cooldown_seconds_remaining)
      setError(`Cooldown: try again in ${formatCooldown(result.cooldown_seconds_remaining)}.`)
    } else if (result.error === 'invalid_phrase') {
      setError(`That's not the phrase. Type "${HARD_RESET_PHRASE}" exactly.`)
    } else if (result.error === 'invalid_pin') {
      setError('PIN incorrect.')
      setPinRequired(true)
    } else if (result.partial) {
      setError(`Partial wipe — see audit row ${result.audit_id ?? ''}. ${result.error ?? ''}`)
    } else {
      setError(result.error ?? 'Hard reset failed.')
    }

    setProcessing(false)
  }

  const cooldownActive = cooldown !== null && cooldown > 0

  return (
    <div className="mt-6">
      <h3
        className={`text-sm font-medium mb-3 ${
          isBambiMode ? 'text-red-700' : 'text-red-400/80'
        }`}
      >
        Emergency Wipe
      </h3>

      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={cooldownActive}
        className={`w-full p-4 rounded-lg border flex items-center gap-3 text-left transition-all ${
          cooldownActive
            ? 'opacity-50 cursor-not-allowed'
            : isBambiMode
            ? 'bg-white border-red-300 hover:border-red-500'
            : 'bg-protocol-surface border-red-500/30 hover:border-red-500/60'
        }`}
      >
        <Bomb className="w-5 h-5 text-red-500" />
        <div className="flex-1">
          <div
            className={`text-sm font-semibold ${
              isBambiMode ? 'text-red-700' : 'text-red-300'
            }`}
          >
            Hard reset all my data
          </div>
          <div
            className={`text-xs mt-0.5 ${
              isBambiMode ? 'text-red-500' : 'text-red-400/70'
            }`}
          >
            {cooldownActive
              ? `Available in ${formatCooldown(cooldown!)}`
              : 'Wipes everything personal. Auth account survives so you can sign back in.'}
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className={`w-full max-w-md rounded-xl p-6 ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface border border-red-500/30'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-7 h-7 text-red-500" />
              <h3
                className={`text-lg font-semibold ${
                  isBambiMode ? 'text-red-700' : 'text-red-300'
                }`}
              >
                This wipes everything personal.
              </h3>
            </div>

            <div
              className={`text-xs mb-3 ${
                isBambiMode ? 'text-gray-600' : 'text-gray-300'
              }`}
            >
              <div className="font-medium mb-1">Deleted immediately:</div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                {WHAT_GETS_DELETED.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mt-3 font-medium mb-1">Survives:</div>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                {WHAT_SURVIVES.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] opacity-70">
                Storage buckets cleared:{' '}
                {HARD_RESET_TARGET_BUCKETS.join(', ')}.
              </div>
              <div className="mt-2 text-[11px] opacity-70">
                Cooldown: 24 hours after a successful reset before another can run.
              </div>
            </div>

            <label
              className={`block text-xs mb-1 ${
                isBambiMode ? 'text-gray-700' : 'text-gray-300'
              }`}
            >
              Type <code className="font-mono">"{HARD_RESET_PHRASE}"</code> to confirm.
            </label>
            <input
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder={HARD_RESET_PHRASE}
              className={`w-full px-3 py-2 rounded-lg text-sm border mb-3 ${
                isBambiMode
                  ? 'bg-white border-red-300 text-red-700'
                  : 'bg-red-950/30 border-red-800/50 text-red-200'
              }`}
            />

            {pinRequired && (
              <>
                <label
                  className={`block text-xs mb-1 ${
                    isBambiMode ? 'text-gray-700' : 'text-gray-300'
                  }`}
                >
                  Stealth PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg text-sm border mb-3 ${
                    isBambiMode
                      ? 'bg-white border-red-300 text-red-700'
                      : 'bg-red-950/30 border-red-800/50 text-red-200'
                  }`}
                />
              </>
            )}

            {error && (
              <div className="text-xs text-red-400 mb-3 break-words">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setPhrase('')
                  setPin('')
                  setError(null)
                }}
                disabled={processing}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
                  isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-white/10 text-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!phraseOk || processing || cooldownActive}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Wiping…
                  </>
                ) : (
                  'Wipe everything'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
