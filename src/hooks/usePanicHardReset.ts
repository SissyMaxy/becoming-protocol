// Panic gesture: 5-second long-press in the top-right 80x80 corner.
// Triggers the hard reset flow with `via: 'panic_gesture'`. Phrase is skipped
// per spec; PIN is still required if the user has stealth_pin_hash set
// (the edge function enforces that — this hook just fires the request).
//
// Designed for "I'm being walked in on" — minimum cognitive load, maximum
// destruction. The user's signOut still gets called by the modal-less flow
// because triggerHardReset returns; that's caller's responsibility.

import { useEffect, useRef } from 'react'
import { triggerHardReset } from '../lib/hard-reset/client'

const PANIC_HOLD_MS = 5000
const CORNER_PX = 80

export interface UsePanicHardResetOptions {
  enabled: boolean
  /** Called immediately when the gesture finishes — before the request returns. */
  onTriggered?: () => void
  /** Called with the result, regardless of success. */
  onResult?: (ok: boolean, error?: string) => void
  /** PIN to send. Caller is responsible for prompting (or for shipping a stored value). */
  getPin?: () => string | undefined
}

export function usePanicHardReset(opts: UsePanicHardResetOptions) {
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)

  useEffect(() => {
    if (!opts.enabled) return

    function isInCorner(x: number, y: number): boolean {
      const w = window.innerWidth
      return x >= w - CORNER_PX && x <= w && y >= 0 && y <= CORNER_PX
    }

    function clear() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      startedAtRef.current = 0
    }

    async function fire() {
      clear()
      opts.onTriggered?.()
      try {
        const result = await triggerHardReset({
          via: 'panic_gesture',
          pin: opts.getPin?.(),
        })
        opts.onResult?.(result.ok, result.error)
      } catch (e) {
        opts.onResult?.(false, e instanceof Error ? e.message : 'panic_failed')
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (!isInCorner(e.clientX, e.clientY)) return
      startedAtRef.current = Date.now()
      timerRef.current = window.setTimeout(fire, PANIC_HOLD_MS)
    }

    function onPointerUp() {
      clear()
    }

    function onPointerMove(e: PointerEvent) {
      // If the pointer leaves the corner, abort.
      if (!startedAtRef.current) return
      if (!isInCorner(e.clientX, e.clientY)) clear()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('pointermove', onPointerMove)

    return () => {
      clear()
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [opts])
}
