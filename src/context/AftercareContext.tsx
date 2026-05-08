/**
 * AftercareContext — app-level provider for the aftercare overlay.
 *
 * Any surface (Settings, gaslight branch's safeword exit, session-close
 * hooks, future cron-driven nudges) can call `useAftercare().begin(...)`
 * to enter aftercare. The provider mounts the AftercareOverlay
 * full-bleed when an active session exists.
 *
 * The overlay covers Today, chat, settings — covers all chrome — by
 * design. Aftercare is the OFF switch.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import {
  enterAftercare,
  type AftercareEntryTrigger,
  type AftercareIntensity,
  type AftercareSequenceItem,
} from '../lib/aftercare'
import { AftercareOverlay } from '../components/aftercare/AftercareOverlay'

interface ActiveSession {
  sessionId: string
  sequence: AftercareSequenceItem[]
}

interface AftercareContextType {
  /** True iff the aftercare overlay is currently displayed */
  isActive: boolean
  /** Start an aftercare session. Returns ok=false if the edge fn fails;
   *  if ok=true, the overlay mounts immediately. */
  begin: (args: { trigger: AftercareEntryTrigger; intensity?: AftercareIntensity }) => Promise<{ ok: boolean; error?: string }>
}

const AftercareContext = createContext<AftercareContextType | null>(null)

export function AftercareProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [pending, setPending] = useState(false)

  const begin = useCallback(async (args: { trigger: AftercareEntryTrigger; intensity?: AftercareIntensity }) => {
    if (!user?.id) return { ok: false, error: 'no_user' }
    if (active || pending) return { ok: false, error: 'already_active' }
    setPending(true)
    try {
      const result = await enterAftercare({
        userId: user.id,
        trigger: args.trigger,
        intensity: args.intensity,
      })
      if (!result.ok || !result.session_id || !result.sequence || result.sequence.length === 0) {
        return { ok: false, error: result.error || 'enter_failed' }
      }
      setActive({ sessionId: result.session_id, sequence: result.sequence })
      return { ok: true }
    } finally {
      setPending(false)
    }
  }, [user?.id, active, pending])

  const handleComplete = useCallback(() => {
    setActive(null)
  }, [])

  const value: AftercareContextType = {
    isActive: active !== null,
    begin,
  }

  return (
    <AftercareContext.Provider value={value}>
      {children}
      {active && (
        <AftercareOverlay
          sessionId={active.sessionId}
          sequence={active.sequence}
          onComplete={handleComplete}
        />
      )}
    </AftercareContext.Provider>
  )
}

export function useAftercare(): AftercareContextType {
  const ctx = useContext(AftercareContext)
  if (!ctx) {
    throw new Error('useAftercare must be used within an AftercareProvider')
  }
  return ctx
}

// Optional-access variant for surfaces that may render outside the
// provider (e.g. unauth screens). Returns null instead of throwing.
export function useAftercareOptional(): AftercareContextType | null {
  return useContext(AftercareContext)
}
